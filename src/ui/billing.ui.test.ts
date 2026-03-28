import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BillingUIManager } from './billing.ui';

describe('BillingUIManager', () => {
  test('gates billing screen to supplier admins', () => {
    const blocked = BillingUIManager.buildBillingScreenModel({
      viewerRole: 'supplier',
      plan: {
        id: 'plan-basic',
        name: 'Basic',
        price_cents: 4900,
        currency: 'EUR',
        seats_limit: 5,
        active_weddings_limit: 3,
        storage_gb_limit: 5,
      },
      usage: { seats: 1, active_weddings: 1, storage_bytes: 100 },
      paymentMethod: {},
      upcomingInvoice: {},
      invoices: [],
    });
    assert.equal(blocked.forbidden, true);
  });

  test('builds billing screen model with usage, payment and invoices', () => {
    const screen = BillingUIManager.buildBillingScreenModel({
      viewerRole: 'supplier_admin',
      plan: {
        id: 'plan-pro',
        name: 'Pro',
        price_cents: 14900,
        currency: 'EUR',
        seats_limit: 25,
        active_weddings_limit: 10,
        storage_gb_limit: 50,
      },
      usage: { seats: 10, active_weddings: 3, storage_bytes: 2 * 1024 ** 3 },
      paymentMethod: { brand: 'visa', last4: '4242' },
      upcomingInvoice: { amount_cents: 14900 },
      invoices: [
        { id: 'inv-1', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'inv-2', created_at: '2026-02-01T00:00:00.000Z' },
      ],
    });

    assert.equal(screen.forbidden, false);
    assert.equal(screen.currentPlan.name, 'Pro');
    assert.equal(screen.seats.used, 10);
    assert.equal(screen.activeWeddings.limit, 10);
    assert.equal(screen.invoiceHistory[0].id, 'inv-2');
  });
});
