import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { BillingService } from './billing.service';

function signStripePayload(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_local_test_secret';
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('BillingService (6.2)', () => {
  beforeEach(() => {
    BillingService.clearStateForTests();
  });

  test('syncs local subscription state from customer.subscription.updated webhook', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-bill-1',
      plan_id: 'plan-basic',
      stripe_subscription_id: 'sub_bill_1',
      status: 'active',
    });

    const payload = JSON.stringify({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_bill_1',
          status: 'past_due',
          current_period_start: 1767225600,
          current_period_end: 1769817600,
          metadata: {
            supplier_org_id: 'org-bill-1',
            plan_id: 'plan-pro',
          },
        },
      },
    });

    await BillingService.handleWebhook(payload, signStripePayload(payload));
    const subscription = BillingService.getSubscriptionForOrg('org-bill-1');

    assert.ok(subscription);
    assert.equal(subscription?.status, 'past_due');
    assert.equal(subscription?.plan_id, 'plan-pro');
  });

  test('upgrade applies immediately with proration metadata', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-bill-2',
      plan_id: 'plan-basic',
      status: 'active',
    });

    const result = await BillingService.updatePlan('org-bill-2', 'plan-pro', true);
    const updated = BillingService.getSubscriptionForOrg('org-bill-2');

    assert.equal(result.effectiveDate, 'now');
    assert.equal(result.prorationBehavior, 'always_invoice');
    assert.equal(updated?.plan_id, 'plan-pro');
    assert.equal(updated?.pending_plan_id, null);
  });

  test('downgrade schedules on renewal by default and applies on scheduled change', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-bill-3',
      plan_id: 'plan-pro',
      renewal_date: '2026-03-01T00:00:00.000Z',
      current_period_end: '2026-03-01T00:00:00.000Z',
      status: 'active',
    });

    const result = await BillingService.updatePlan('org-bill-3', 'plan-basic', false);
    assert.equal(result.effectiveDate, 'renewal');

    const pending = BillingService.getSubscriptionForOrg('org-bill-3');
    assert.equal(pending?.pending_plan_id, 'plan-basic');

    const processed = BillingService.processScheduledChanges(new Date('2026-03-01T00:00:01.000Z'));
    assert.equal(processed.applied, 1);

    const updated = BillingService.getSubscriptionForOrg('org-bill-3');
    assert.equal(updated?.plan_id, 'plan-basic');
    assert.equal(updated?.pending_plan_id, null);
  });

  test('rejects downgrade-now when explicit confirmation is missing', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-bill-4',
      plan_id: 'plan-pro',
      status: 'active',
    });

    await assert.rejects(async () => {
      await BillingService.updatePlan('org-bill-4', 'plan-basic', true, {
        confirmDowngradeNow: false,
      });
    });
  });
});
