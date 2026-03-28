import crypto from 'node:crypto';

export type AuditEvent = {
  id: string;
  wedding_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type AuditInput = {
  weddingId: string | null;
  actorUserId: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt?: Date;
};

type AuditFilters = {
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Phase 6.1 Audit Log Service
 */
export class AuditService {
  private static events: AuditEvent[] = [];
  private static pendingWrites = 0;
  private static drainWaiters: Array<() => void> = [];

  /**
   * 6.1.2 Implement audit logging hook
   * Requirement 6.1.6: non-blocking write path
   */
  static logEvent(data: AuditInput): void {
    this.pendingWrites += 1;
    setTimeout(() => {
      try {
        this.persistEvent(data);
      } catch (err) {
        console.error('Failed to persist audit event:', err);
      } finally {
        this.pendingWrites -= 1;
        if (this.pendingWrites === 0) {
          const waiters = this.drainWaiters.splice(0);
          for (const resolve of waiters) {
            resolve();
          }
        }
      }
    }, 0);
  }

  /**
   * 6.1.3 Get Audit Logs (Paginated & Filterable)
   */
  static async getAuditLogs(
    weddingId: string,
    filters: AuditFilters = {},
    page = 1,
    limit = 50
  ): Promise<{ logs: AuditEvent[]; total: number; page: number; limit: number }> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;
    const offset = (safePage - 1) * safeLimit;

    const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const toDate = filters.dateTo ? new Date(filters.dateTo) : null;
    const hasFrom = !!fromDate && !Number.isNaN(fromDate.getTime());
    const hasTo = !!toDate && !Number.isNaN(toDate.getTime());

    const filtered = this.events
      .filter((event) => event.wedding_id === weddingId)
      .filter((event) => (filters.entityType ? event.entity_type === filters.entityType : true))
      .filter((event) => {
        const createdAt = new Date(event.created_at).getTime();
        if (hasFrom && createdAt < fromDate!.getTime()) {
          return false;
        }
        if (hasTo && createdAt > toDate!.getTime()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      logs: filtered.slice(offset, offset + safeLimit).map((entry) => ({ ...entry })),
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
    };
  }

  static async flushForTests(): Promise<void> {
    if (this.pendingWrites === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  static getEventsForTests(): AuditEvent[] {
    return this.events.map((entry) => ({ ...entry }));
  }

  static clearStateForTests(): void {
    this.events = [];
    this.pendingWrites = 0;
    this.drainWaiters = [];
  }

  private static persistEvent(data: AuditInput): void {
    const entry: AuditEvent = {
      id: crypto.randomUUID(),
      wedding_id: data.weddingId || null,
      actor_user_id: data.actorUserId || null,
      actor_name: data.actorName?.trim() || data.actorUserId || 'System',
      entity_type: data.entityType,
      entity_id: data.entityId,
      action: data.action,
      before_json: data.beforeJson ? this.clone(data.beforeJson) : null,
      after_json: data.afterJson ? this.clone(data.afterJson) : null,
      ip_address: data.ipAddress || null,
      created_at: (data.createdAt || new Date()).toISOString(),
    };
    this.events.push(entry);
  }

  private static clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }
}
