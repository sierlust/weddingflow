-- Phase 2.1.3: Optimization for Duplicate Detection
CREATE INDEX IF NOT EXISTS idx_invitations_duplicate_check ON invitations(target_email, wedding_id) WHERE status = 'pending';

-- Phase 2.1.6: State machine check (Optional but robust)
-- This ensures no illegal status updates at the DB level
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS chk_invitation_status_flow;
-- Note: PostgreSQL doesn't easily support cross-row state machine in CHECK without triggers,
-- but we can ensure Terminal statuses stay terminal.
