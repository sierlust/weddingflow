-- Phase 4.1.2: Force thread participant uniqueness per thread
CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_participants_unique ON thread_participants(thread_id, user_id);

-- Phase 4.1.3: Cursor-based pagination index
CREATE INDEX IF NOT EXISTS idx_messages_cursor ON messages(thread_id, created_at DESC, id DESC);

-- Phase 4.1.8 & 4.1.9: Revocation Support (Soft delete if needed)
-- (Schema already supports CASCADE on thread deletion)
