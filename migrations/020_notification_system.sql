-- Phase 7.2.1 & 7.2.2: Notification System Schema

CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL, -- 'android', 'ios', 'web'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'message_received', 'task_assigned', etc.
    channel TEXT NOT NULL, -- 'push', 'email'
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_type, channel)
);

CREATE TABLE wedding_mute_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    muted_until TIMESTAMPTZ, -- NULL for indefinite mute
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wedding_id)
);

-- RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_mute_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_tokens_self_policy ON device_tokens
    FOR ALL USING (user_id = (SELECT current_setting('app.current_user_id', true)::UUID));

CREATE POLICY notification_prefs_self_policy ON notification_preferences
    FOR ALL USING (user_id = (SELECT current_setting('app.current_user_id', true)::UUID));

CREATE POLICY mute_overrides_self_policy ON wedding_mute_overrides
    FOR ALL USING (user_id = (SELECT current_setting('app.current_user_id', true)::UUID));

-- Indexes
CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX idx_notification_prefs_user_id ON notification_preferences(user_id);
