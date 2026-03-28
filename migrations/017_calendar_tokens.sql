-- Phase 4.4.4: Stable, unique ICS subscription URLs
CREATE TABLE calendar_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wedding_id)
);

CREATE INDEX idx_calendar_access_tokens_token ON calendar_access_tokens(token);
