-- Phase 1.2.8: Unify RLS Policies across all modules

-- Thread Access
DROP POLICY IF EXISTS thread_access_policy ON threads;
CREATE POLICY thread_access_policy ON threads
    FOR ALL
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = threads.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR EXISTS (
            SELECT 1 FROM thread_participants 
            WHERE thread_id = id 
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        )
    );

-- Message Access (Cascades from thread_participants, but let's be explicit and optimized)
DROP POLICY IF EXISTS message_access_policy ON messages;
CREATE POLICY message_access_policy ON messages
    FOR ALL
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM thread_participants 
            WHERE thread_id = messages.thread_id 
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
        )
    );

-- RoS Items Access (1.2.4 Staff Check)
DROP POLICY IF EXISTS ros_items_supplier_select ON run_sheet_items;
CREATE POLICY ros_items_supplier_access ON run_sheet_items
    FOR SELECT
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = run_sheet_items.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR (
            visibility_scope = 'all_published' -- or 'draft' etc
            AND EXISTS (
                SELECT 1 FROM wedding_supplier_assignments wsa
                WHERE wsa.wedding_id = run_sheet_items.wedding_id
                AND has_supplier_access(run_sheet_items.wedding_id, wsa.supplier_org_id)
                AND wsa.status = 'active'
            )
        )
    );

-- RoS Versions Access
DROP POLICY IF EXISTS ros_versions_select ON run_sheet_versions;
CREATE POLICY ros_versions_access ON run_sheet_versions
    FOR SELECT
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = run_sheet_versions.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR EXISTS (
            SELECT 1 FROM wedding_supplier_assignments wsa
            WHERE wsa.wedding_id = run_sheet_versions.wedding_id
            AND has_supplier_access(run_sheet_versions.wedding_id, wsa.supplier_org_id)
            AND wsa.status = 'active'
        )
    );

-- Change Requests (1.2.4 Staff Check)
DROP POLICY IF EXISTS change_request_staff_access ON run_sheet_change_requests;
CREATE POLICY change_request_access ON run_sheet_change_requests
    FOR ALL
    USING (
        (SELECT current_setting('app.is_platform_admin', true) = 'true')
        OR has_supplier_access((SELECT wedding_id FROM run_sheet_versions WHERE id = run_sheet_version_id), supplier_org_id)
        OR EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = (SELECT wedding_id FROM run_sheet_versions WHERE id = run_sheet_version_id)
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
    );
