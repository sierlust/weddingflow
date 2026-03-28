-- Phase 2.1.2: TTL Expiration Job
-- This function will be called by a background worker or cron job to 
-- mark invitations as expired if they haven't been accepted in time.

CREATE OR REPLACE FUNCTION expire_invitations() 
RETURNS void AS $$
BEGIN
    UPDATE invitations 
    SET status = 'expired'
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- We can simulate a 'job' using a pg_cron or similar, but for now 
-- we document the function itself.
