-- Phase 6: Administratie, Audit & Billing Schema

-- 6.1.1 Audit Events (Append-only storage)
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id UUID REFERENCES weddings(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- e.g., 'document', 'ros_item', 'supplier'
    entity_id UUID NOT NULL,
    action TEXT NOT NULL, -- e.g., 'created', 'updated', 'deleted', 'shared'
    before_json JSONB,
    after_json JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.2.1 Billing Entities
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- 'Basic', 'Pro', 'Enterprise'
    slug TEXT UNIQUE NOT NULL,
    active_weddings_limit INTEGER NOT NULL,
    seats_limit INTEGER NOT NULL,
    storage_gb_limit INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'EUR',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL, -- 'active', 'trailing', 'past_due', 'canceled'
    stripe_subscription_id TEXT UNIQUE,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_org_id)
);

CREATE TABLE usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_org_id UUID NOT NULL REFERENCES supplier_orgs(id) ON DELETE CASCADE,
    metric TEXT NOT NULL, -- 'active_weddings', 'seats', 'storage_bytes'
    value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_org_id, metric)
);

-- RLS for Phase 6
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- Audit Policies: Accessible to CO (wedding-scoped) and Platform Admin
CREATE POLICY audit_access_policy ON audit_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wedding_members
            WHERE wedding_id = audit_events.wedding_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'owner'
        )
        OR (SELECT current_setting('app.is_platform_admin', true) = 'true')
    );

-- Billing Policies: Accessible to Supplier Admin only
CREATE POLICY supplier_billing_access ON subscriptions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM supplier_org_members
            WHERE supplier_org_id = subscriptions.supplier_org_id
            AND user_id = (SELECT current_setting('app.current_user_id', true)::UUID)
            AND role = 'admin'
        )
    );

-- Indexes
CREATE INDEX idx_audit_wedding_id ON audit_events(wedding_id);
CREATE INDEX idx_audit_actor_id ON audit_events(actor_user_id);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_subscriptions_org_id ON subscriptions(supplier_org_id);
