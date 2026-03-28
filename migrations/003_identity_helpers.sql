-- Phase 1.4: Identity Schema (SSO-Readiness) Summary
-- This was largely covered in 001_initial_schema.sql, but here we add 
-- a trigger to ensure the display email in `users` is synced correctly 
-- or handled as part of the identity resolution.

-- 1.4.3 Link Identity to User via Provider Lookup
-- We already have the user_identity_providers table.
-- Let's add a view to make resolving users easier.

CREATE VIEW v1_identity_resolution AS
    SELECT u.id, u.email, u.name, u.locale, uip.provider_type, uip.provider_subject
    FROM users u
    JOIN user_identity_providers uip ON u.id = uip.user_id;

-- 1.3 Propagate User IDs into DB Session (RLS Prep)
-- This logic usually sits in a middleware, but we can document the 
-- stored procedure to set these values safely.

CREATE OR REPLACE PROCEDURE set_app_context(user_id UUID, is_admin BOOLEAN DEFAULT false)
LANGUAGE plpgsql
AS $$
BEGIN
    EXECUTE format('SET LOCAL app.current_user_id = %L', user_id::text);
    EXECUTE format('SET LOCAL app.is_platform_admin = %L', is_admin::text);
END;
$$;
