/**
 * Phase 6.2 Billing UI Logic
 */
export class BillingUIManager {
  /**
   * 6.2.5 Usage Gauge Logic
   */
  static getUsageStats(currentUsage: any, planLimits: any) {
    const seatsLimit = Number(planLimits.seats_limit || 0);
    const weddingsLimit = Number(planLimits.active_weddings_limit || 0);
    const storageLimitGb = Number(planLimits.storage_gb_limit || 0);

    return {
      seats: {
        used: Number(currentUsage.seats || 0),
        limit: seatsLimit,
        percentage: seatsLimit > 0 ? (Number(currentUsage.seats || 0) / seatsLimit) * 100 : 0,
        isNearLimit: seatsLimit > 0 ? Number(currentUsage.seats || 0) / seatsLimit > 0.8 : false,
      },
      weddings: {
        used: Number(currentUsage.active_weddings || 0),
        limit: weddingsLimit,
        percentage:
          weddingsLimit > 0 ? (Number(currentUsage.active_weddings || 0) / weddingsLimit) * 100 : 0,
        isNearLimit: weddingsLimit > 0 ? Number(currentUsage.active_weddings || 0) / weddingsLimit > 0.8 : false,
      },
      storage: {
        usedGb: Number(currentUsage.storage_bytes || 0) / 1024 ** 3,
        limitGb: storageLimitGb,
        percentage:
          storageLimitGb > 0
            ? (Number(currentUsage.storage_bytes || 0) / (storageLimitGb * 1024 ** 3)) * 100
            : 0,
        isNearLimit:
          storageLimitGb > 0
            ? Number(currentUsage.storage_bytes || 0) / (storageLimitGb * 1024 ** 3) > 0.8
            : false,
      },
    };
  }

  /**
   * 6.2.5 Billing screen model (SA only)
   */
  static buildBillingScreenModel(input: {
    viewerRole: string;
    plan: any;
    usage: { seats: number; active_weddings: number; storage_bytes: number };
    paymentMethod: any;
    upcomingInvoice: any;
    invoices: any[];
  }) {
    const isSupplierAdmin = input.viewerRole === 'admin' || input.viewerRole === 'supplier_admin';
    if (!isSupplierAdmin) {
      return { forbidden: true, message: 'Supplier admin role required.' };
    }

    const usageStats = this.getUsageStats(input.usage, input.plan);
    return {
      forbidden: false,
      currentPlan: {
        id: input.plan.id,
        name: input.plan.name,
        priceCents: input.plan.price_cents,
        currency: input.plan.currency,
      },
      seats: {
        used: usageStats.seats.used,
        limit: usageStats.seats.limit,
      },
      activeWeddings: {
        used: usageStats.weddings.used,
        limit: usageStats.weddings.limit,
      },
      storage: {
        usedGb: Number(usageStats.storage.usedGb.toFixed(2)),
        limitGb: usageStats.storage.limitGb,
      },
      paymentMethod: input.paymentMethod,
      upcomingInvoice: input.upcomingInvoice,
      invoiceHistory: (input.invoices || []).slice().sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
      actions: {
        canUpgrade: true,
        canDowngrade: true,
        upgradeButton: 'Upgrade plan',
        downgradeButton: 'Downgrade plan',
      },
    };
  }

  /**
   * 6.3.3 Hard-limit modal metadata
   */
  static getLimitModalMetadata(errorCode: string, context: { limit: number; current: number }) {
    const metricLabels: Record<string, string> = {
      LIMIT_EXCEEDED_WEDDINGS: 'weddings',
      LIMIT_EXCEEDED_SEATS: 'seats',
      LIMIT_EXCEEDED_STORAGE: 'GB',
    };

    const metric = metricLabels[errorCode] || 'items';
    return {
      title: 'Plan limit reached',
      description: `Your plan allows ${context.limit} ${metric}. You're currently at ${context.current}.`,
      primaryCTA: 'Upgrade plan',
      secondaryCTA: errorCode === 'LIMIT_EXCEEDED_STORAGE' ? 'Manage storage' : 'Manage members',
      tertiaryCTA: 'Cancel',
    };
  }
}
