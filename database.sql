-- 1. ניקוי שולחן (כדי למנוע התנגשויות)
DROP TABLE IF EXISTS user_documents CASCADE;
DROP TABLE IF EXISTS tests CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. הפעלת התוסף ליצירת UUID (ליתר ביטחון)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. יצירת הטבלאות עם הפונקציה הנכונה
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- שימוש ב-gen_random_uuid
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    last_period_date DATE NOT NULL,
    due_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    weight DECIMAL(5,2),
    water_intake INTEGER,
    mood VARCHAR(50),
    notes TEXT
);

CREATE TABLE tests (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    target_week INTEGER,
    scheduled_date TIMESTAMP,
    is_completed BOOLEAN DEFAULT FALSE
);

CREATE TABLE user_documents (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kick Counter Sessions Table
CREATE TABLE kick_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_date DATE DEFAULT CURRENT_DATE,
    total_kicks INTEGER NOT NULL,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Individual Kicks Table
CREATE TABLE kicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id UUID,
    kick_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES kick_sessions(id) ON DELETE CASCADE
);

-- Weight Tracking Table
CREATE TABLE weight_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    weight DECIMAL(5, 2) NOT NULL,
    recorded_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Contractions Tracking Table
CREATE TABLE contractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    start_time TIMESTAMP NOT NULL,
    duration_seconds INTEGER NOT NULL,
    interval_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Additional indexes
CREATE INDEX idx_kick_sessions_user_id ON kick_sessions(user_id);
CREATE INDEX idx_kicks_user_id ON kicks(user_id);
CREATE INDEX idx_weight_tracking_user_id ON weight_tracking(user_id);
CREATE INDEX idx_contractions_user_id ON contractions(user_id);