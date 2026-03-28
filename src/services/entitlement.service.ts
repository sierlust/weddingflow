import { BillingService, type UsageMetric } from './billing.service';

/**
 * Phase 6.3 Hard Limit Enforcement Service
 */
export enum LimitErrorCode {
  WEDDINGS = 'LIMIT_EXCEEDED_WEDDINGS',
  SEATS = 'LIMIT_EXCEEDED_SEATS',
  STORAGE = 'LIMIT_EXCEEDED_STORAGE',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_LAPSE_BLOCK',
}

export class EntitlementError extends Error {
  code: LimitErrorCode;
  status: number;
  details: {
    metric?: UsageMetric;
    limit?: number;
    current?: number;
    proposed?: number;
    gracePeriodEndsAt?: string;
  };

  constructor(
    code: LimitErrorCode,
    message: string,
    details: {
      metric?: UsageMetric;
      limit?: number;
      current?: number;
      proposed?: number;
      gracePeriodEndsAt?: string;
    } = {},
    status = 403
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ActorContext = {
  role?: string;
  isPlatformAdmin?: boolean;
};

export class EntitlementService {
  /**
   * 6.3.1 Resource-creation limit check
   * 6.3.2 Typed error codes
   * 6.3.4 Grace period logic (7 days)
   */
  static async validateAction(
    orgId: string,
    metric: UsageMetric,
    proposedIncrement: number,
    actor: ActorContext = {}
  ) {
    const normalizedIncrement = Number.isFinite(proposedIncrement) ? Math.max(0, proposedIncrement) : 0;
    const role = String(actor.role || '');
    const isCoupleOwner = role === 'owner' || role === 'couple_owner';
    const isPlatformAdmin = Boolean(actor.isPlatformAdmin);

    // Couples are never blocked by supplier subscription limits.
    if (isCoupleOwner || isPlatformAdmin) {
      return { allowed: true, warnings: [] as string[] };
    }

    let subscription = BillingService.getSubscriptionForOrg(orgId);
    if (!subscription) {
      await BillingService.getEntitlements(orgId);
      subscription = BillingService.getSubscriptionForOrg(orgId);
    }
    if (!subscription) {
      throw new EntitlementError(
        LimitErrorCode.SUBSCRIPTION_REQUIRED,
        'No active subscription found for supplier organization.'
      );
    }

    const graceCheck = this.ensureWithinGracePeriod(subscription.status, subscription.current_period_end);
    const entitlements = await BillingService.getEntitlements(orgId);
    const usage = BillingService.getUsageCounters(orgId);
    const current = usage[metric];
    const limit = entitlements.limits[metric];

    if (current + normalizedIncrement > limit) {
      const codeMap: Record<UsageMetric, LimitErrorCode> = {
        active_weddings: LimitErrorCode.WEDDINGS,
        seats: LimitErrorCode.SEATS,
        storage_bytes: LimitErrorCode.STORAGE,
      };
      throw new EntitlementError(codeMap[metric], 'Plan limit reached.', {
        metric,
        limit,
        current,
        proposed: normalizedIncrement,
      });
    }

    return {
      allowed: true,
      warnings: graceCheck.warning ? [graceCheck.warning] : [],
      gracePeriodEndsAt: graceCheck.gracePeriodEndsAt || null,
      limit,
      current,
    };
  }

  /**
   * 6.3.4 / 6.3.5 Read-only after grace period for supplier writes
   */
  static ensureWriteAllowed(orgId: string, actor: ActorContext = {}) {
    const role = String(actor.role || '');
    const isCoupleOwner = role === 'owner' || role === 'couple_owner';
    const isPlatformAdmin = Boolean(actor.isPlatformAdmin);
    if (isCoupleOwner || isPlatformAdmin) {
      return { allowed: true, warnings: [] as string[] };
    }

    let subscription = BillingService.getSubscriptionForOrg(orgId);
    if (!subscription) {
      BillingService.getEntitlements(orgId);
      subscription = BillingService.getSubscriptionForOrg(orgId);
    }
    if (!subscription) {
      throw new EntitlementError(
        LimitErrorCode.SUBSCRIPTION_REQUIRED,
        'No active subscription found for supplier organization.'
      );
    }

    const graceCheck = this.ensureWithinGracePeriod(subscription.status, subscription.current_period_end);
    return {
      allowed: true,
      warnings: graceCheck.warning ? [graceCheck.warning] : [],
      gracePeriodEndsAt: graceCheck.gracePeriodEndsAt || null,
    };
  }

  static consumeUsage(orgId: string, metric: UsageMetric, increment: number) {
    if (!Number.isFinite(increment) || increment <= 0) {
      return BillingService.getUsageCounters(orgId)[metric];
    }
    return BillingService.incrementUsage(orgId, metric, increment);
  }

  private static ensureWithinGracePeriod(status: string, periodEndIso: string) {
    if (status !== 'past_due' && status !== 'unpaid') {
      return { warning: null as string | null, gracePeriodEndsAt: null as string | null };
    }

    const lapseDate = new Date(periodEndIso);
    const gracePeriodEndsAt = new Date(lapseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (Date.now() > gracePeriodEndsAt.getTime()) {
      throw new EntitlementError(
        LimitErrorCode.SUBSCRIPTION_REQUIRED,
        'Subscription grace period ended. Supplier org is now read-only.',
        { gracePeriodEndsAt: gracePeriodEndsAt.toISOString() }
      );
    }

    return {
      warning: `Subscription in grace period until ${gracePeriodEndsAt.toISOString()}.`,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }
}
