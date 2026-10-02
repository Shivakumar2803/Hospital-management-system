require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
const SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid name, email, and 6+ char password required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name.trim(), email.toLowerCase(), hash, 'patient']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/doctors', authenticateToken, async (req, res) => {
  const result = await pool.query("SELECT id, name, specialty FROM users WHERE role = 'doctor'");
  res.json(result.rows);
});

app.get('/api/slots', authenticateToken, async (req, res) => {
  const { doctorId, date } = req.query;
  const result = await pool.query(
    "SELECT appointment_time FROM appointments WHERE doctor_id = $1 AND appointment_date = $2 AND status = 'booked'",
    [doctorId, date]
  );
  const takenSlots = result.rows.map(r => r.appointment_time);
  res.json(SLOTS.map(t => ({ time: t, taken: takenSlots.includes(t) })));
});

app.post('/api/appointments', authenticateToken, requireRole('patient'), async (req, res) => {
  const { doctorId, date, time, reason } = req.body;
  try {
    await pool.query(
      "INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, status) VALUES ($1, $2, $3, $4, $5, 'booked')",
      [req.user.id, doctorId, date, time, reason]
    );
    io.emit('update');
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: 'Slot already taken or invalid request' });
  }
});

app.get('/api/appointments', authenticateToken, async (req, res) => {
  const { id, role } = req.user;
  let query = `
    SELECT a.id, a.appointment_date as date, a.appointment_time as time, a.reason, a.status, 
           p.name as patient, d.name as doctor
    FROM appointments a
    JOIN users p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
  `;
  const params = [];
  
  if (role === 'patient') { query += ' WHERE a.patient_id = $1'; params.push(id); }
  else if (role === 'doctor') { query += ' WHERE a.doctor_id = $1'; params.push(id); }
  
  query += ' ORDER BY a.appointment_date, a.appointment_time';
  
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.patch('/api/appointments/:id', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!['cancelled', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  
  const appointmentId = req.params.id;
  await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, appointmentId]);
  io.emit('update');
  res.json({ ok: true });
});

app.get('/api/patients', authenticateToken, requireRole('admin', 'doctor'), async (req, res) => {
  const { q } = req.query;
  const search = `%${(q || '').toLowerCase()}%`;
  const result = await pool.query(
    "SELECT id, name, email FROM users WHERE role = 'patient' AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1)",
    [search]
  );
  res.json(result.rows);
});

app.get('/api/records/:pid', authenticateToken, async (req, res) => {
  if (req.user.role === 'patient' && req.user.id !== req.params.pid) return res.status(403).json({ error: 'Forbidden' });
  const result = await pool.query('SELECT * FROM records WHERE patient_id = $1 ORDER BY created_at DESC', [req.params.pid]);
  res.json(result.rows);
});

app.post('/api/records/:pid', authenticateToken, requireRole('doctor'), async (req, res) => {
  const { diagnosis, prescription, notes } = req.body;
  
  const doctorResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
  const doctorName = doctorResult.rows[0].name;

  await pool.query(
    'INSERT INTO records (patient_id, doctor_name, diagnosis, prescription, notes) VALUES ($1, $2, $3, $4, $5)',
    [req.params.pid, doctorName, diagnosis, prescription, notes]
  );
  io.emit('update');
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Enterprise HMS running on port ${PORT}`));
