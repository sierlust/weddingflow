-- Phase 5: Run-of-Show (RoS) Master Engine Schema

-- 5.1.1 Run Sheets (Draft Container)
CREATE TABLE run_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    draft_json JSONB DEFAULT '[]', -- Current state of items in draft
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    UNIQUE(wedding_id)
);

-- 5.1.2 Run Sheet Items (Stored as individual rows for indexing and RLS)
CREATE TYPE ros_item_type AS ENUM ('ceremony', 'reception', 'dinner', 'party', 'logistics', 'other');

CREATE TABLE run_sheet_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    sort_index INTEGER NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    item_type ros_item_type DEFAULT 'other',
    location TEXT,
    owner_role TEXT, -- e.g., 'Caterer'
    owner_supplier_org_id UUID REFERENCES supplier_orgs(id),
    primary_contact_name TEXT,
    primary_contact_phone TEXT,
    instructions TEXT, -- Rich text
    private_notes TEXT,
    visibility_scope TEXT NOT NULL DEFAULT 'all_published',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.1.3 Run Sheet Versions (Snapshots)
CREATE TABLE run_sheet_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    published_by_user_id UUID NOT NULL REFERENCES users(id),
    snapshot_json JSONB NOT NULL, -- Immutable snapshot of items at time of publish
    change_summary TEXT,
    suppliers_shared_to UUID[], -- Array of supplier org IDs who received this version
    UNIQUE(wedding_id, version_number)
);

-- 5.1.4 Acknowledgements
CREATE TABLE run_sheet_acknowledgements (
    run_sheet_version_id UUID NOT NULL REFERENCES run_sheet_versions(id) ON DELETE CASCADE,
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_by_user_id UUID NOT NULL REFERENCES users(id),
    PRIMARY KEY (run_sheet_version_id, supplier_org_id)
);

-- 5.1.5 Change Requests
CREATE TYPE change_request_status AS ENUM ('submitted', 'accepted', 'rejected', 'included_in_version');
CREATE TYPE change_request_type AS ENUM ('time_change', 'instruction_change', 'ownership_clarification', 'location_clarification');

CREATE TABLE run_sheet_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_sheet_version_id UUID NOT NULL REFERENCES run_sheet_versions(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES run_sheet_items(id) ON DELETE CASCADE,
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    requester_user_id UUID NOT NULL REFERENCES users(id),
    request_type change_request_type NOT NULL,
    proposed_start_at TIMESTAMPTZ,
    proposed_end_at TIMESTAMPTZ,
    proposed_instruction TEXT,
    reason TEXT NOT NULL CHECK (char_length(reason) >= 20 AND char_length(reason) <= 500),
    attachment_ids UUID[],
    status change_request_status DEFAULT 'submitted',
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Extensions for Phase 5
ALTER TABLE run_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_sheet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_sheet_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_sheet_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_sheet_change_requests ENABLE ROW LEVEL SECURITY;

-- RoS Policies
CREATE POLICY ros_draft_co_access ON run_sheets
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM wedding_members 
        WHERE wedding_id = run_sheets.wedding_id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        AND role = 'owner'
    ));

CREATE POLICY ros_items_supplier_select ON run_sheet_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wedding_supplier_assignments
            WHERE wedding_id = run_sheet_items.wedding_id
            AND supplier_org_id IN (SELECT current_user_supplier_org_ids())
            AND status = 'active'
        )
    );

CREATE POLICY ros_versions_select ON run_sheet_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wedding_supplier_assignments
            WHERE wedding_id = run_sheet_versions.wedding_id
            AND supplier_org_id IN (SELECT current_user_supplier_org_ids())
            AND status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = run_sheet_versions.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
    );

CREATE POLICY change_request_staff_access ON run_sheet_change_requests
    FOR ALL
    USING (
        supplier_org_id IN (SELECT current_user_supplier_org_ids())
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = (SELECT wedding_id FROM run_sheet_versions WHERE id = run_sheet_version_id)
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
    );

-- Indexes
CREATE INDEX idx_ros_items_wedding_id ON run_sheet_items(wedding_id);
CREATE INDEX idx_ros_items_owner_org ON run_sheet_items(owner_supplier_org_id);
CREATE INDEX idx_ros_versions_wedding_id ON run_sheet_versions(wedding_id);
CREATE INDEX idx_change_requests_item_id ON run_sheet_change_requests(item_id);
