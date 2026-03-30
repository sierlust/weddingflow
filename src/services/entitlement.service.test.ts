import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BillingService } from './billing.service';
import { EntitlementService, EntitlementError, LimitErrorCode } from './entitlement.service';

describe('EntitlementService (6.3)', () => {
  beforeEach(() => {
    BillingService.clearStateForTests();
    BillingService.setPlanForTests({
      id: 'plan-tight',
      name: 'Tight',
      slug: 'tight',
      active_weddings_limit: 1,
      seats_limit: 1,
      storage_gb_limit: 1,
      price_cents: 1000,
      currency: 'EUR',
      entitlements: {},
    });
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-limit-1',
      plan_id: 'plan-tight',
      status: 'active',
    });
  });

  test('returns typed limit errors for weddings, seats and storage', async () => {
    BillingService.setUsageCounter('org-limit-1', 'active_weddings', 1);
    await assert.rejects(
      async () => {
        await EntitlementService.validateAction('org-limit-1', 'active_weddings', 1, { role: 'supplier' });
      },
      (err: any) => err instanceof EntitlementError && err.code === LimitErrorCode.WEDDINGS
    );

    BillingService.setUsageCounter('org-limit-1', 'seats', 1);
    await assert.rejects(
      async () => {
        await EntitlementService.validateAction('org-limit-1', 'seats', 1, { role: 'supplier' });
      },
      (err: any) => err instanceof EntitlementError && err.code === LimitErrorCode.SEATS
    );

    BillingService.setUsageCounter('org-limit-1', 'storage_bytes', 1024 ** 3);
    await assert.rejects(
      async () => {
        await EntitlementService.validateAction('org-limit-1', 'storage_bytes', 1, { role: 'supplier' });
      },
      (err: any) => err instanceof EntitlementError && err.code === LimitErrorCode.STORAGE
    );
  });

  test('enforces 7-day grace period and blocks writes after grace period', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-limit-1',
      plan_id: 'plan-tight',
      status: 'past_due',
      current_period_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const withinGrace = await EntitlementService.validateAction('org-limit-1', 'seats', 0, {
      role: 'supplier',
    });
    assert.equal(withinGrace.allowed, true);
    assert.equal(withinGrace.warnings.length > 0, true);

    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-limit-1',
      plan_id: 'plan-tight',
      status: 'past_due',
      current_period_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await assert.rejects(
      async () => {
        EntitlementService.ensureWriteAllowed('org-limit-1', { role: 'supplier' });
      },
      (err: any) =>
        err instanceof EntitlementError && err.code === LimitErrorCode.SUBSCRIPTION_REQUIRED
    );
  });

  test('never blocks couple owners', async () => {
    BillingService.setUsageCounter('org-limit-1', 'active_weddings', 999);

    const ownerAllowed = await EntitlementService.validateAction('org-limit-1', 'active_weddings', 1, {
      role: 'owner',
    });
    assert.equal(ownerAllowed.allowed, true);
  });
});
