-- Phase 6.1.6: Enforce append-only behavior for audit logs
-- Revoke all permissions and then grant only what is needed
REVOKE ALL ON audit_events FROM public; -- Or the specific application role
REVOKE UPDATE, DELETE ON audit_events FROM public;

-- Assuming the application role is 'wedding_app_role'
-- GRANT SELECT, INSERT ON audit_events TO wedding_app_role;

-- Ensure RLS allows the actor to insert their own logs
CREATE POLICY audit_insert_policy ON audit_events
    FOR INSERT
    WITH CHECK (true); -- Usually restricted to the actor_user_id matching current_user_id

-- Deny updates/deletes explicitly at RLS level (append-only safety net)
CREATE POLICY audit_no_update_policy ON audit_events
    FOR UPDATE
    USING (false)
    WITH CHECK (false);

CREATE POLICY audit_no_delete_policy ON audit_events
    FOR DELETE
    USING (false);

-- 6.1.5 Tombstone behavior: retain records when artifacts are deleted. 
-- The table already uses REFERENCES ... ON DELETE SET NULL for actor_user_id and wedding_id.
-- entity_id is a UUID (not a foreign key) to ensure tombstone persists after deletion.
