const express = require('express'), http = require('http'), crypto = require('crypto');
const fs = require('fs'), path = require('path'), { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
const FILE = path.join(__dirname, 'data.json'), SECRET = process.env.SECRET || 'change-this-secret';
const SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00'];

const hash = (p, s = crypto.randomBytes(8).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const same = (p, h) => hash(p, h.split(':')[0]) === h;
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = u => { const b = Buffer.from(JSON.stringify({ id: u.id, role: u.role })).toString('base64url'); return b + '.' + mac(b); };
const verify = t => { try { const [b, s] = t.split('.'); return mac(b) === s ? JSON.parse(Buffer.from(b, 'base64url')) : null; } catch { return null; } };

let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { users: [], appts: [], records: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
const add = (name, email, pw, role, specialty) => db.users.push({ id: crypto.randomUUID(), name, email, pass: hash(pw), role, specialty });
if (!db.users.length) {
  add('Hospital Admin', 'admin@hospital.com', 'Admin@123', 'admin');
  add('Dr. Anita Rao', 'anita@hospital.com', 'Doctor@123', 'doctor', 'General Medicine');
  add('Dr. Rahul Mehta', 'rahul@hospital.com', 'Doctor@123', 'doctor', 'Cardiology');
  save();
}
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, specialty: u.specialty });
const notify = () => io.emit('update');

app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res, next) => {
  req.user = verify((req.headers.authorization || '').replace('Bearer ', ''));
  next();
});
const need = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });
const staff = need('doctor', 'admin'), any = need('patient', 'doctor', 'admin');

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email and a 6+ character password are required' });
  if (db.users.some(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
  add(name.trim(), email.toLowerCase(), password, 'patient'); save();
  const u = db.users.at(-1); res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = db.users.find(x => x.email === email.toLowerCase());
  if (!u || !same(password, u.pass)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), user: pub(u) });
});
app.get('/api/doctors', any, (req, res) => res.json(db.users.filter(u => u.role === 'doctor').map(pub)));
app.get('/api/slots', any, (req, res) => {
  const { doctorId, date } = req.query;
  const taken = db.appts.filter(a => a.doctorId === doctorId && a.date === date && a.status === 'booked').map(a => a.time);
  res.json(SLOTS.map(t => ({ time: t, taken: taken.includes(t) })));
});
app.post('/api/appointments', need('patient'), (req, res) => {
  const { doctorId, date, time, reason = '' } = req.body || {};
  if (!db.users.some(u => u.id === doctorId && u.role === 'doctor') || !SLOTS.includes(time) || !(date >= new Date().toISOString().slice(0, 10)))
    return res.status(400).json({ error: 'Invalid doctor, date or time' });
  if (db.appts.some(a => a.doctorId === doctorId && a.date === date && a.time === time && a.status === 'booked'))
    return res.status(409).json({ error: 'Slot was just taken. Pick another.' });
  db.appts.push({ id: crypto.randomUUID(), patientId: req.user.id, doctorId, date, time, reason: reason.slice(0, 200), status: 'booked' });
  save(); notify(); res.json({ ok: true });
});
app.get('/api/appointments', any, (req, res) => {
  const { id, role } = req.user, name = i => db.users.find(u => u.id === i)?.name || '';
  const list = db.appts.filter(a => role === 'admin' || a.patientId === id || a.doctorId === id)
    .map(a => ({ ...a, patient: name(a.patientId), doctor: name(a.doctorId) }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(list);
});
app.patch('/api/appointments/:id', any, (req, res) => {
  const a = db.appts.find(x => x.id === req.params.id), { id, role } = req.user, status = req.body.status;
  if (!a || !['cancelled', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid request' });
  const mine = a.patientId === id || a.doctorId === id || role === 'admin';
  if (!mine || (role === 'patient' && status !== 'cancelled')) return res.status(403).json({ error: 'Not allowed' });
  a.status = status; save(); notify(); res.json({ ok: true });
});
app.get('/api/patients', staff, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  res.json(db.users.filter(u => u.role === 'patient' && (u.name + u.email).toLowerCase().includes(q)).map(pub));
});
app.get('/api/records/:pid', any, (req, res) => {
  if (req.user.role === 'patient' && req.user.id !== req.params.pid) return res.status(403).json({ error: 'Not allowed' });
  res.json(db.records.filter(r => r.patientId === req.params.pid).sort((a, b) => b.date.localeCompare(a.date)));
});
app.post('/api/records/:pid', need('doctor'), (req, res) => {
  const { diagnosis, prescription = '', notes = '' } = req.body || {};
  if (!diagnosis) return res.status(400).json({ error: 'Diagnosis is required' });
  db.records.push({ id: crypto.randomUUID(), patientId: req.params.pid, doctor: db.users.find(u => u.id === req.user.id).name,
    date: new Date().toISOString(), diagnosis, prescription, notes });
  save(); notify(); res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log(`Hospital system running at http://localhost:${PORT}`));
