-- Phase 4: Wedding Workspace & Collaboration Schema Extension

-- 4.1 Chat Module
CREATE TYPE thread_type AS ENUM ('supplier_thread', 'couple_internal', 'all_suppliers');

CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    type thread_type NOT NULL DEFAULT 'supplier_thread',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE thread_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(thread_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    metadata_json JSONB DEFAULT '{}', -- For "structured actions" like tasks/appointments
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 Document Library
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    uploaded_by_id UUID NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    file_type TEXT,
    size_bytes BIGINT,
    s3_key TEXT NOT NULL,
    visibility_scope TEXT NOT NULL DEFAULT 'couple_only', -- 'couple_only', 'all_assigned_suppliers', 'selected_suppliers'
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 Calendar & Appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    location TEXT,
    notes TEXT,
    visibility_scope TEXT NOT NULL DEFAULT 'couple_only',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE appointment_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    supplier_org_id UUID REFERENCES supplier_orgs(id),
    UNIQUE(appointment_id, user_id),
    UNIQUE(appointment_id, supplier_org_id)
);

-- RLS Extensions for Phase 4
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Thread/Message Policies
CREATE POLICY thread_access_policy ON threads
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM thread_participants 
        WHERE thread_id = id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
    ));

CREATE POLICY message_access_policy ON messages
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM thread_participants 
        WHERE thread_id = messages.thread_id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
    ));

-- Document Policies
CREATE POLICY document_access_policy ON documents
    FOR SELECT
    USING (
        visibility_scope = 'all_assigned_suppliers' 
        OR uploaded_by_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = documents.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
    );

-- Appointment Policies
CREATE POLICY appointment_access_policy ON appointments
    FOR SELECT
    USING (
        visibility_scope = 'all_assigned_suppliers'
        OR EXISTS (
            SELECT 1 FROM appointment_participants
            WHERE appointment_id = id
            AND (user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
                 OR supplier_org_id IN (SELECT current_user_supplier_org_ids()))
        )
    );

-- Indexes for Phase 4
CREATE INDEX idx_threads_wedding_id ON threads(wedding_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_documents_wedding_id ON documents(wedding_id);
CREATE INDEX idx_appointments_wedding_id ON appointments(wedding_id);
CREATE INDEX idx_appointments_start_at ON appointments(start_at);
