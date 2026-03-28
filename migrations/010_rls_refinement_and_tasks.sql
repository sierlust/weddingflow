-- Phase 1.2 & 3.1.3: Tasks table and RLS Refinements

-- 3.1.3 Create Tasks Table
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'blocked');

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    supplier_org_id UUID REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'todo',
    due_at TIMESTAMPTZ,
    assigned_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Refine Document Schema for Requirement 1.2.5
ALTER TABLE documents ADD COLUMN IF NOT EXISTS shared_with_supplier_org_ids UUID[] DEFAULT '{}';

-- Fix Helper Function (1.2.7)
CREATE OR REPLACE FUNCTION current_user_supplier_org_ids() 
RETURNS SETOF UUID AS $$
    SELECT supplier_org_id 
    FROM supplier_org_members 
    WHERE user_id = (SELECT current_setting('app.current_user_id', true)::UUID);
$$ LANGUAGE sql STABLE;

-- Helper to check if user is assigned staff to a wedding
CREATE OR REPLACE FUNCTION is_wedding_staff_assigned(target_wedding_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM wedding_supplier_staff_assignments
        WHERE wedding_id = target_wedding_id
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
    );
$$ LANGUAGE sql STABLE;

-- Centralized Supplier Access Check (1.2.3 & 1.2.4)
-- Logic: (Is Org Member AND Wedding Assigned) AND (If is Staff -> Must be Wedding Staff Assigned)
CREATE OR REPLACE FUNCTION has_supplier_access(target_wedding_id UUID, target_supplier_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Check if user is admin in that org
    SELECT role = 'admin' INTO is_admin FROM supplier_org_members 
    WHERE supplier_org_id = target_supplier_org_id 
    AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID);

    -- If admin, just check wedding assignment
    IF is_admin THEN
        RETURN EXISTS (
            SELECT 1 FROM wedding_supplier_assignments
            WHERE wedding_id = target_wedding_id
            AND supplier_org_id = target_supplier_org_id
            AND status = 'active'
        );
    END IF;

    -- If staff, must be specifically assigned to this wedding
    RETURN EXISTS (
        SELECT 1 FROM wedding_supplier_staff_assignments
        WHERE wedding_id = target_wedding_id
        AND supplier_org_id = target_supplier_org_id
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- DROP OLD POLICIES to avoid duplicates or conflicts
-- (In a real migration these would be RENAME/REPLACE)
DROP POLICY IF EXISTS supplier_select_weddings ON weddings;

-- REFINED POLICIES (1.2.8 Optimization)

-- Weddings
CREATE POLICY supplier_access_weddings ON weddings
    FOR SELECT
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM wedding_supplier_assignments wsa
            WHERE wsa.wedding_id = id
            AND has_supplier_access(id, wsa.supplier_org_id)
        )
    );

-- Tasks (New)
CREATE POLICY co_all_access_tasks ON tasks
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM wedding_members 
        WHERE wedding_id = tasks.wedding_id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        AND role = 'owner'
    ));

CREATE POLICY supplier_access_tasks ON tasks
    FOR ALL
    USING (
        supplier_org_id IS NOT NULL 
        AND has_supplier_access(wedding_id, supplier_org_id)
    );

-- Documents (1.2.5 Refined)
DROP POLICY IF EXISTS document_access_policy ON documents;
CREATE POLICY document_access_policy ON documents
    FOR SELECT
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR uploaded_by_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = documents.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR (
            visibility_scope = 'all_assigned_suppliers'
            AND EXISTS (
                SELECT 1 FROM wedding_supplier_assignments wsa
                WHERE wsa.wedding_id = documents.wedding_id
                AND has_supplier_access(documents.wedding_id, wsa.supplier_org_id)
            )
        )
        OR (
            visibility_scope = 'selected_suppliers'
            AND EXISTS (
                SELECT 1 FROM UNNEST(shared_with_supplier_org_ids) as target_org_id
                WHERE has_supplier_access(documents.wedding_id, target_org_id)
            )
        )
    );

-- Appointments (Refined)
DROP POLICY IF EXISTS appointment_access_policy ON appointments;
CREATE POLICY appointment_access_policy ON appointments
    FOR SELECT
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = appointments.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR (
            visibility_scope = 'all_assigned_suppliers'
            AND EXISTS (
                SELECT 1 FROM wedding_supplier_assignments wsa
                WHERE wsa.wedding_id = appointments.wedding_id
                AND has_supplier_access(appointments.wedding_id, wsa.supplier_org_id)
            )
        )
        OR EXISTS (
            SELECT 1 FROM appointment_participants ap
            WHERE ap.appointment_id = id
            AND (
                ap.user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
                OR (ap.supplier_org_id IS NOT NULL AND has_supplier_access(wedding_id, ap.supplier_org_id))
            )
        )
    );

-- Indexes for performance (1.2.8)
CREATE INDEX idx_tasks_wedding_id ON tasks(wedding_id);
CREATE INDEX idx_tasks_supplier_org_id ON tasks(supplier_org_id);
CREATE INDEX idx_documents_shared_orgs ON documents USING GIN (shared_with_supplier_org_ids);
