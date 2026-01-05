-- EasySign Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'recipient', -- 'management' or 'recipient'
    is_external BOOLEAN DEFAULT FALSE,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    original_file_path VARCHAR(1000) NOT NULL,
    signed_file_path VARCHAR(1000),
    file_type VARCHAR(50) NOT NULL, -- 'pdf' or 'word'
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'sent_for_signing', 'pending', 'waiting_confirmation', 'completed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document recipients table
CREATE TABLE IF NOT EXISTS document_recipients (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'draft', 'signed'
    due_date DATE,
    signed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, recipient_id)
);

-- Text fields table (for draft and signed documents)
CREATE TABLE IF NOT EXISTS text_fields (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    page_number INTEGER NOT NULL,
    x_coordinate DECIMAL(10, 2) NOT NULL,
    y_coordinate DECIMAL(10, 2) NOT NULL,
    width DECIMAL(10, 2) NOT NULL,
    height DECIMAL(10, 2) NOT NULL,
    font_size DECIMAL(10, 2) NOT NULL,
    text_content TEXT NOT NULL,
    is_draft BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    page_number INTEGER NOT NULL,
    x_coordinate DECIMAL(10, 2) NOT NULL,
    y_coordinate DECIMAL(10, 2) NOT NULL,
    width DECIMAL(10, 2) NOT NULL,
    height DECIMAL(10, 2) NOT NULL,
    signature_image_path VARCHAR(1000) NOT NULL,
    is_draft BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    document_id INTEGER REFERENCES documents(id),
    action VARCHAR(100) NOT NULL, -- 'uploaded', 'assigned', 'drafted', 'signed', 'downloaded', 'viewed'
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_document_recipients_document_id ON document_recipients(document_id);
CREATE INDEX IF NOT EXISTS idx_document_recipients_recipient_id ON document_recipients(recipient_id);
CREATE INDEX IF NOT EXISTS idx_text_fields_document_recipient ON text_fields(document_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_signatures_document_recipient ON signatures(document_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_document_id ON audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

