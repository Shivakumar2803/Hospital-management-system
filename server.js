require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runSetup() {
  try {
    const sql = fs.readFileSync('database.sql', 'utf8');
    await pool.query(sql);
    console.log("Database tables created successfully.");
  } catch (err) {
    console.error("Database setup error:", err.message);
  } finally {
    await pool.end();
  }
}
runSetup();
