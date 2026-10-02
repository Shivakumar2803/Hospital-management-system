# CareConnect Hospital Management System

A real-time web application that removes long hospital queues and replaces paper patient files.

## Features
- Patients register, pick a doctor, choose a free time slot and book online. Taken slots disappear instantly for everyone (Socket.IO).
- Doctors and admins see appointments and search patient records at any time.
- Doctors add diagnosis, prescription and notes. Patients can view their own history.
- Role-based access (patient, doctor, admin), hashed passwords (scrypt), signed login tokens.

## Run locally
```
npm install
npm start
```
Open http://localhost:3000

Demo logins: `admin@hospital.com / Admin@123`, `anita@hospital.com / Doctor@123`.
Change these and set a `SECRET` environment variable before real use.

## Structure
- `server.js` - Express API, Socket.IO, JSON file storage (`data.json`)
- `public/index.html` - the full front end

## Next steps
Move storage to PostgreSQL, add email reminders, add doctor availability settings.
