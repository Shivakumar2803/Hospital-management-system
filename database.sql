CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('patient', 'doctor', 'admin')),
    specialty VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES users(id),
    doctor_id UUID REFERENCES users(id),
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(10) NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
    CONSTRAINT unique_slot UNIQUE (doctor_id, appointment_date, appointment_time, status)
);

CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES users(id),
    doctor_name VARCHAR(100) NOT NULL,
    diagnosis TEXT NOT NULL,
    prescription TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Data (Passwords are 'Admin@123' and 'Doctor@123' hashed with bcrypt)
INSERT INTO users (name, email, password_hash, role) 
VALUES ('Hospital Admin', 'admin@hospital.com', '$2b$10$wE/.7.26JzZ6vV1e5uR/.O1yqW009wG8l82eU0Pz7QkU17N1H49u6', 'admin');

INSERT INTO users (name, email, password_hash, role, specialty) 
VALUES ('Dr. Anita Rao', 'anita@hospital.com', '$2b$10$5N7vY9l6.39p7j1eZ17G2.j28p9r9wX340Y6R5p8Z89x5928K8/7S', 'doctor', 'General Medicine'),
       ('Dr. Rahul Mehta', 'rahul@hospital.com', '$2b$10$5N7vY9l6.39p7j1eZ17G2.j28p9r9wX340Y6R5p8Z89x5928K8/7S', 'doctor', 'Cardiology');
