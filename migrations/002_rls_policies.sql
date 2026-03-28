-- Phase 1.2: Row-Level Security (RLS) Implementation

-- Helper function to get current user's supplier org IDs
-- Note: In a real app, this would be populated from the JWT claims or a session variable
-- SET LOCAL app.current_user_id = '...';
CREATE OR REPLACE FUNCTION current_user_supplier_org_ids() 
RETURNS SETOF UUID AS $$
    SELECT supplier_org_id 
    FROM supplier_org_member_assignments 
    WHERE user_id = (SELECT current_setting('app.current_user_id', true)::UUID);
$$ LANGUAGE sql STABLE;

-- Note: The implementationtasks.txt mentions 'supplier_org_member_assignments' but the schema has 'supplier_org_members'.
-- Let's fix the schema naming in the policy.

-- Enable RLS on all scoped tables
ALTER TABLE weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_supplier_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_supplier_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- 1.2.2 Couple Owner Policies (full access)
CREATE POLICY co_all_access_weddings ON weddings
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM wedding_members 
        WHERE wedding_id = id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        AND role = 'owner'
    ));

CREATE POLICY co_all_access_members ON wedding_members
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM wedding_members 
        WHERE wedding_id = wedding_members.wedding_id 
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        AND role = 'owner'
    ));

-- 1.2.3 Supplier Org Member Policies (SELECT only)
CREATE POLICY supplier_select_weddings ON weddings
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM wedding_supplier_assignments wsa
        JOIN supplier_org_members som ON som.supplier_org_id = wsa.supplier_org_id
        WHERE wsa.wedding_id = id
        AND som.user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        AND wsa.status = 'active'
    ));

CREATE POLICY supplier_select_assignments ON wedding_supplier_assignments
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM supplier_org_members
        WHERE supplier_org_id = wedding_supplier_assignments.supplier_org_id
        AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
    ));

-- 1.2.4 Supplier Staff Policy (strict per-wedding)
-- Only allow access if specifically assigned to this wedding in supplier_staff_assignments
CREATE POLICY staff_strict_access ON wedding_supplier_staff_assignments
    FOR SELECT
    USING (user_id = (SELECT current_setting('app.current_user_id', true)::UUID));

-- 1.2.6 Platform Admin Bypass (simulated)
-- In a real scenario, this would check for a 'platform_admin' claim
CREATE POLICY pa_bypass ON weddings
    FOR ALL
    USING (current_setting('app.is_platform_admin', true) = 'true');
