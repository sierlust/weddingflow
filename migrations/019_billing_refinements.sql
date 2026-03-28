-- Phase 6.2.1: Add entitlements and period tracking
ALTER TABLE plans ADD COLUMN IF NOT EXISTS entitlements JSONB DEFAULT '{}'; -- Feature flags e.g. {"advanced_analytics": true}

ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;
ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ;

-- 6.2.6 Local source of truth: index for enrollment checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
