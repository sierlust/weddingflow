import crypto from 'node:crypto';

export type Plan = {
  id: string;
  name: string;
  slug: string;
  active_weddings_limit: number;
  seats_limit: number;
  storage_gb_limit: number;
  price_cents: number;
  currency: string;
  entitlements: Record<string, boolean>;
};

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'unpaid' | 'canceled';

export type Subscription = {
  id: string;
  supplier_org_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  stripe_subscription_id: string;
  renewal_date: string;
  current_period_start: string;
  current_period_end: string;
  pending_plan_id: string | null;
  pending_change_effective_at: string | null;
};

export type UsageMetric = 'active_weddings' | 'seats' | 'storage_bytes';

export type UsageCounter = {
  supplier_org_id: string;
  metric: UsageMetric;
  period_start: string;
  period_end: string;
  value: number;
};

export type BillingEntitlements = {
  supplier_org_id: string;
  plan_id: string;
  plan_slug: string;
  features: Record<string, boolean>;
  limits: {
    active_weddings: number;
    seats: number;
    storage_bytes: number;
  };
  updated_at: string;
};

type BillingInvoice = {
  id: string;
  amount_cents: number;
  currency: string;
  status: 'paid' | 'open' | 'void';
  created_at: string;
};

type StripeEvent = {
  type: string;
  data?: {
    object?: any;
  };
};

/**
 * Phase 6.2 Stripe Billing Service
 */
export class BillingService {
  private static plans = new Map<string, Plan>();
  private static planBySlug = new Map<string, string>();
  private static subscriptionsByOrg = new Map<string, Subscription>();
  private static subscriptionByStripeId = new Map<string, string>();
  private static usageByOrgMetric = new Map<string, UsageCounter>();
  private static entitlementsByOrg = new Map<string, BillingEntitlements>();
  private static invoicesByOrg = new Map<string, BillingInvoice[]>();
  private static initialized = false;

  /**
   * 6.2.2 Webhook Handling
   * Requirement 6.2.6: Validate Stripe-Signature header
   */
  static async handleWebhook(payload: string | object, signature: string | undefined) {
    this.ensureInitialized();
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    this.validateWebhookSignature(payloadString, signature || '');
    const event = JSON.parse(payloadString) as StripeEvent;

    switch (event.type) {
      case 'customer.subscription.updated':
        await this.syncSubscription(event.data?.object || {});
        break;
      case 'customer.subscription.deleted':
        await this.cancelSubscription(event.data?.object || {});
        break;
      default:
        break;
    }

    return { received: true, type: event.type };
  }

  /**
   * 6.2.3 Upgrade / 6.2.4 Downgrade
   */
  static async updatePlan(
    orgId: string,
    planRef: string,
    immediate = true,
    options: { confirmDowngradeNow?: boolean } = {}
  ) {
    this.ensureInitialized();
    const targetPlan = this.resolvePlan(planRef);
    const subscription = this.getOrCreateSubscription(orgId);
    const currentPlan = this.getPlanByIdOrThrow(subscription.plan_id);
    const isUpgrade = targetPlan.price_cents > currentPlan.price_cents;
    const isDowngrade = targetPlan.price_cents < currentPlan.price_cents;

    if (isUpgrade) {
      subscription.plan_id = targetPlan.id;
      subscription.pending_plan_id = null;
      subscription.pending_change_effective_at = null;
      this.syncEntitlementsForOrg(orgId);
      return {
        success: true,
        planId: targetPlan.id,
        effectiveDate: 'now',
        prorationBehavior: 'always_invoice',
        stripeUpdate: {
          proration_behavior: 'always_invoice',
          effective: 'immediate',
        },
      };
    }

    if (isDowngrade && immediate && !options.confirmDowngradeNow) {
      throw new Error('Downgrade now requires explicit confirmation.');
    }

    if (!immediate && isDowngrade) {
      subscription.pending_plan_id = targetPlan.id;
      subscription.pending_change_effective_at = subscription.renewal_date;
      this.syncEntitlementsForOrg(orgId);
      return {
        success: true,
        planId: targetPlan.id,
        effectiveDate: 'renewal',
        scheduledFor: subscription.renewal_date,
        prorationBehavior: 'none',
      };
    }

    subscription.plan_id = targetPlan.id;
    subscription.pending_plan_id = null;
    subscription.pending_change_effective_at = null;
    this.syncEntitlementsForOrg(orgId);
    return {
      success: true,
      planId: targetPlan.id,
      effectiveDate: 'now',
      prorationBehavior: isDowngrade ? 'none' : 'always_invoice',
    };
  }

  /**
   * 6.2.6 Local source of truth for entitlements
   */
  static async getEntitlements(orgId: string): Promise<BillingEntitlements> {
    this.ensureInitialized();
    return this.syncEntitlementsForOrg(orgId);
  }

  static getSubscriptionForOrg(orgId: string): Subscription | null {
    this.ensureInitialized();
    const subscription = this.subscriptionsByOrg.get(orgId);
    return subscription ? { ...subscription } : null;
  }

  static getUsageCounters(orgId: string): Record<UsageMetric, number> {
    this.ensureInitialized();
    return {
      active_weddings: this.getUsageCounter(orgId, 'active_weddings').value,
      seats: this.getUsageCounter(orgId, 'seats').value,
      storage_bytes: this.getUsageCounter(orgId, 'storage_bytes').value,
    };
  }

  static setUsageCounter(orgId: string, metric: UsageMetric, value: number) {
    const counter = this.getUsageCounter(orgId, metric);
    counter.value = Math.max(0, Math.floor(value));
    this.usageByOrgMetric.set(this.usageKey(orgId, metric), counter);
  }

  static incrementUsage(orgId: string, metric: UsageMetric, delta: number) {
    const counter = this.getUsageCounter(orgId, metric);
    counter.value = Math.max(0, Math.floor(counter.value + delta));
    this.usageByOrgMetric.set(this.usageKey(orgId, metric), counter);
    return counter.value;
  }

  static setSubscriptionForTests(data: Partial<Subscription> & { supplier_org_id: string; plan_id: string }) {
    this.ensureInitialized();
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const currentPeriodEnd = new Date(now.getTime() + 23 * 24 * 60 * 60 * 1000).toISOString();

    const existing = this.subscriptionsByOrg.get(data.supplier_org_id);
    const subscription: Subscription = {
      id: existing?.id || crypto.randomUUID(),
      supplier_org_id: data.supplier_org_id,
      plan_id: data.plan_id,
      status: data.status || 'active',
      stripe_subscription_id:
        data.stripe_subscription_id || existing?.stripe_subscription_id || `sub_${crypto.randomUUID().slice(0, 8)}`,
      renewal_date: data.renewal_date || existing?.renewal_date || currentPeriodEnd,
      current_period_start: data.current_period_start || existing?.current_period_start || currentPeriodStart,
      current_period_end: data.current_period_end || existing?.current_period_end || currentPeriodEnd,
      pending_plan_id: data.pending_plan_id ?? existing?.pending_plan_id ?? null,
      pending_change_effective_at: data.pending_change_effective_at ?? existing?.pending_change_effective_at ?? null,
    };
    this.subscriptionsByOrg.set(subscription.supplier_org_id, subscription);
    this.subscriptionByStripeId.set(subscription.stripe_subscription_id, subscription.supplier_org_id);
    this.syncEntitlementsForOrg(subscription.supplier_org_id);
    return { ...subscription };
  }

  static setPlanForTests(plan: Plan) {
    this.ensureInitialized();
    this.plans.set(plan.id, { ...plan, entitlements: { ...plan.entitlements } });
    this.planBySlug.set(plan.slug, plan.id);
  }

  static setInvoicesForTests(orgId: string, invoices: BillingInvoice[]) {
    this.ensureInitialized();
    this.invoicesByOrg.set(
      orgId,
      invoices.map((invoice) => ({ ...invoice }))
    );
  }

  static getBillingOverview(orgId: string) {
    this.ensureInitialized();
    const subscription = this.getOrCreateSubscription(orgId);
    const plan = this.getPlanByIdOrThrow(subscription.plan_id);
    return {
      subscription: { ...subscription },
      plan: { ...plan, entitlements: { ...plan.entitlements } },
      usage: this.getUsageCounters(orgId),
      upcomingInvoice: this.estimateUpcomingInvoice(orgId),
      invoices: (this.invoicesByOrg.get(orgId) || []).map((invoice) => ({ ...invoice })),
      paymentMethod: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
    };
  }

  static processScheduledChanges(referenceTime: Date = new Date()) {
    let applied = 0;
    for (const [orgId, subscription] of this.subscriptionsByOrg.entries()) {
      if (!subscription.pending_plan_id || !subscription.pending_change_effective_at) {
        continue;
      }
      if (new Date(subscription.pending_change_effective_at).getTime() <= referenceTime.getTime()) {
        subscription.plan_id = subscription.pending_plan_id;
        subscription.pending_plan_id = null;
        subscription.pending_change_effective_at = null;
        this.subscriptionsByOrg.set(orgId, subscription);
        this.syncEntitlementsForOrg(orgId);
        applied += 1;
      }
    }
    return { applied };
  }

  static clearStateForTests() {
    this.plans.clear();
    this.planBySlug.clear();
    this.subscriptionsByOrg.clear();
    this.subscriptionByStripeId.clear();
    this.usageByOrgMetric.clear();
    this.entitlementsByOrg.clear();
    this.invoicesByOrg.clear();
    this.initialized = false;
    this.ensureInitialized();
  }

  private static async syncSubscription(stripeSubscription: any) {
    const stripeId = String(stripeSubscription.id || '');
    const orgIdFromMap = stripeId ? this.subscriptionByStripeId.get(stripeId) : null;
    const orgIdFromMetadata =
      typeof stripeSubscription.metadata?.supplier_org_id === 'string'
        ? stripeSubscription.metadata.supplier_org_id
        : null;
    const orgId = orgIdFromMap || orgIdFromMetadata;
    if (!orgId) {
      throw new Error('Unable to resolve supplier org for Stripe subscription update.');
    }

    const existing = this.getOrCreateSubscription(orgId);
    const nextPlanRef =
      typeof stripeSubscription.metadata?.plan_id === 'string'
        ? stripeSubscription.metadata.plan_id
        : existing.plan_id;
    const plan = this.resolvePlan(nextPlanRef);

    existing.plan_id = plan.id;
    existing.status = this.normalizeStatus(stripeSubscription.status || existing.status);
    existing.current_period_start = this.coerceStripeDate(stripeSubscription.current_period_start, existing.current_period_start);
    existing.current_period_end = this.coerceStripeDate(stripeSubscription.current_period_end, existing.current_period_end);
    existing.renewal_date = existing.current_period_end;
    existing.stripe_subscription_id = stripeId || existing.stripe_subscription_id;
    this.subscriptionsByOrg.set(orgId, existing);
    this.subscriptionByStripeId.set(existing.stripe_subscription_id, orgId);
    this.syncEntitlementsForOrg(orgId);
  }

  private static async cancelSubscription(stripeSubscription: any) {
    const stripeId = String(stripeSubscription.id || '');
    const orgId = stripeId ? this.subscriptionByStripeId.get(stripeId) : null;
    if (!orgId) {
      return;
    }
    const existing = this.getOrCreateSubscription(orgId);
    existing.status = 'canceled';
    existing.pending_plan_id = null;
    existing.pending_change_effective_at = null;
    existing.current_period_end = this.coerceStripeDate(stripeSubscription.current_period_end, existing.current_period_end);
    existing.renewal_date = existing.current_period_end;
    this.subscriptionsByOrg.set(orgId, existing);
    this.syncEntitlementsForOrg(orgId);
  }

  private static validateWebhookSignature(payload: string, signatureHeader: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_local_test_secret';
    const pairs = signatureHeader
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split('='))
      .reduce<Record<string, string[]>>((acc, [key, value]) => {
        if (!key || !value) {
          return acc;
        }
        const existing = acc[key] || [];
        existing.push(value);
        acc[key] = existing;
        return acc;
      }, {});

    const timestamp = pairs.t?.[0];
    const candidates = pairs.v1 || [];
    if (!timestamp || candidates.length === 0) {
      throw new Error('Missing Stripe signature header values.');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    const hasMatch = candidates.some((candidate) => this.safeHexCompare(candidate, expected));
    if (!hasMatch) {
      throw new Error('Invalid Stripe signature.');
    }
  }

  private static safeHexCompare(a: string, b: string) {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  }

  private static ensureInitialized() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const basic: Plan = {
      id: 'plan-basic',
      name: 'Basic',
      slug: 'basic',
      active_weddings_limit: 3,
      seats_limit: 5,
      storage_gb_limit: 5,
      price_cents: 4900,
      currency: 'EUR',
      entitlements: {
        advanced_analytics: false,
        priority_support: false,
      },
    };
    const pro: Plan = {
      id: 'plan-pro',
      name: 'Pro',
      slug: 'pro',
      active_weddings_limit: 10,
      seats_limit: 25,
      storage_gb_limit: 50,
      price_cents: 14900,
      currency: 'EUR',
      entitlements: {
        advanced_analytics: true,
        priority_support: true,
      },
    };
    const enterprise: Plan = {
      id: 'plan-enterprise',
      name: 'Enterprise',
      slug: 'enterprise',
      active_weddings_limit: 1000,
      seats_limit: 1000,
      storage_gb_limit: 1024,
      price_cents: 99900,
      currency: 'EUR',
      entitlements: {
        advanced_analytics: true,
        priority_support: true,
        dedicated_success_manager: true,
      },
    };

    for (const plan of [basic, pro, enterprise]) {
      this.setPlanForTests(plan);
    }
  }

  private static getOrCreateSubscription(orgId: string): Subscription {
    const existing = this.subscriptionsByOrg.get(orgId);
    if (existing) {
      return existing;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const created: Subscription = {
      id: crypto.randomUUID(),
      supplier_org_id: orgId,
      plan_id: 'plan-basic',
      status: 'active',
      stripe_subscription_id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      renewal_date: end.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      pending_plan_id: null,
      pending_change_effective_at: null,
    };
    this.subscriptionsByOrg.set(orgId, created);
    this.subscriptionByStripeId.set(created.stripe_subscription_id, orgId);
    this.syncEntitlementsForOrg(orgId);
    return created;
  }

  private static resolvePlan(planRef: string): Plan {
    const direct = this.plans.get(planRef);
    if (direct) {
      return direct;
    }
    const planId = this.planBySlug.get(planRef);
    if (planId) {
      return this.getPlanByIdOrThrow(planId);
    }
    throw new Error(`Plan not found: ${planRef}`);
  }

  private static getPlanByIdOrThrow(planId: string): Plan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Unknown plan id: ${planId}`);
    }
    return plan;
  }

  private static usageKey(orgId: string, metric: UsageMetric): string {
    return `${orgId}:${metric}`;
  }

  private static getUsageCounter(orgId: string, metric: UsageMetric): UsageCounter {
    const key = this.usageKey(orgId, metric);
    const existing = this.usageByOrgMetric.get(key);
    if (existing) {
      return existing;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const created: UsageCounter = {
      supplier_org_id: orgId,
      metric,
      value: 0,
      period_start: now.toISOString(),
      period_end: end.toISOString(),
    };
    this.usageByOrgMetric.set(key, created);
    return created;
  }

  private static syncEntitlementsForOrg(orgId: string): BillingEntitlements {
    const subscription = this.getOrCreateSubscription(orgId);
    const activePlan = this.getPlanByIdOrThrow(subscription.plan_id);
    const entitlements: BillingEntitlements = {
      supplier_org_id: orgId,
      plan_id: activePlan.id,
      plan_slug: activePlan.slug,
      features: { ...activePlan.entitlements },
      limits: {
        active_weddings: activePlan.active_weddings_limit,
        seats: activePlan.seats_limit,
        storage_bytes: activePlan.storage_gb_limit * 1024 ** 3,
      },
      updated_at: new Date().toISOString(),
    };
    this.entitlementsByOrg.set(orgId, entitlements);
    return entitlements;
  }

  private static normalizeStatus(value: string): SubscriptionStatus {
    if (value === 'trialing' || value === 'past_due' || value === 'unpaid' || value === 'canceled') {
      return value;
    }
    return 'active';
  }

  private static coerceStripeDate(value: unknown, fallbackIso: string): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return fallbackIso;
  }

  private static estimateUpcomingInvoice(orgId: string): BillingInvoice {
    const subscription = this.getOrCreateSubscription(orgId);
    const plan = this.getPlanByIdOrThrow(subscription.plan_id);
    return {
      id: `upcoming-${subscription.id}`,
      amount_cents: plan.price_cents,
      currency: plan.currency,
      status: 'open',
      created_at: new Date().toISOString(),
    };
  }
}
