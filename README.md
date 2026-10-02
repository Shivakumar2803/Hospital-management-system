# CareConnect Enterprise HMS

A scalable, real-time Hospital Management System designed to eliminate hospital queues and digitize patient records securely.

## Enterprise Upgrades
* **Database:** Migrated from local JSON to PostgreSQL for relational data integrity.
* **Security:** Implemented `bcrypt` for password hashing and `jsonwebtoken` (JWT) for secure API authentication.
* **Real-time Engine:** Powered by Socket.IO to instantly synchronize appointment slot availability across all connected clients.
* **UI/UX:** Fully responsive, modern frontend rebuilt with Tailwind CSS.

## Getting Started

### 1. Environment Setup
Create a `.env` file in the root directory based on `.env.example`:
```env
PORT=3000
JWT_SECRET=your_super_secret_jwt_key_here
DATABASE_URL=postgres://user:password@localhost:5432/careconnect
