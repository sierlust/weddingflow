import { Pool } from 'pg';
import { AuthService } from './auth.service';
import { BillingService } from './billing.service';
import { CalendarService, ChatService, DocumentService } from './collaboration.service';
import { DashboardService } from './dashboard.service';
import { InvitationService } from './invitation.service';
import * as InvitationsRepo from '../repositories/invitations.repo';
import * as ChatRepo from '../repositories/chat.repo';
import * as DocumentsRepo from '../repositories/documents.repo';
import * as AppointmentsRepo from '../repositories/appointments.repo';
import * as RosRepo from '../repositories/ros.repo';
import { MailService } from './mail.service';
import { NotificationService } from './notification.service';
import { ROSService } from './ros.service';
import { UploadService } from './upload.service';
import { AuditService } from './audit.service';

// ---------------------------------------------------------------------------
// Private: PostgreSQL key-value state store
// ---------------------------------------------------------------------------

const DEFAULT_STATE_KEY = 'main';

let _pool: Pool | null = null;
let _enabled = false;

async function dbInit(): Promise<void> {
  if (_pool) return;
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    console.warn('[state-db] DATABASE_URL not configured; using in-memory runtime state only.');
    _enabled = false;
    return;
  }
  _pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS app_runtime_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  _enabled = true;
}

async function dbLoad(stateKey = DEFAULT_STATE_KEY): Promise<unknown | null> {
  if (!_enabled || !_pool) return null;
  const result = await _pool.query(
    `SELECT payload FROM app_runtime_state WHERE state_key = $1 LIMIT 1`,
    [stateKey]
  );
  return result.rows[0]?.payload ?? null;
}

async function dbSave(payload: unknown, stateKey = DEFAULT_STATE_KEY): Promise<void> {
  if (!_enabled || !_pool) return;
  await _pool.query(
    `
    INSERT INTO app_runtime_state (state_key, payload, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (state_key)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
    `,
    [stateKey, JSON.stringify(payload)]
  );
}

async function dbClose(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  _enabled = false;
}

// ---------------------------------------------------------------------------
// Private: encode/decode helpers (Map, Set, Date ↔ JSON)
// ---------------------------------------------------------------------------

type Encoded =
  | null
  | string
  | number
  | boolean
  | Encoded[]
  | { [key: string]: Encoded };

function encodeValue(value: any): Encoded {
  if (value instanceof Date) {
    return { __type: 'Date', value: value.toISOString() };
  }
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()).map(([k, v]) => [encodeValue(k), encodeValue(v)]),
    };
  }
  if (value instanceof Set) {
    return {
      __type: 'Set',
      values: Array.from(value.values()).map((entry) => encodeValue(entry)),
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeValue(entry));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, Encoded> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = encodeValue(entry);
    }
    return out;
  }
  return value ?? null;
}

function decodeValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((entry) => decodeValue(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (value.__type === 'Date') {
    return new Date(value.value);
  }
  if (value.__type === 'Map') {
    return new Map((value.entries || []).map(([k, v]: [any, any]) => [decodeValue(k), decodeValue(v)]));
  }
  if (value.__type === 'Set') {
    return new Set((value.values || []).map((entry: any) => decodeValue(entry)));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = decodeValue(entry);
  }
  return out;
}

function asAny<T>(value: T): any {
  return value as any;
}

// ---------------------------------------------------------------------------
// Public: RuntimePersistenceService
// ---------------------------------------------------------------------------

/**
 * Runtime snapshot persistence for local development.
 * Stores in-memory service state in PostgreSQL so restarts keep data.
 */
export class RuntimePersistenceService {
  private static readonly STATE_KEY = 'main';
  private static initialized = false;
  private static saveTimer: NodeJS.Timeout | null = null;
  private static saveChain: Promise<void> = Promise.resolve();

  static async init(): Promise<void> {
    await dbInit();
    this.initialized = true;

    if (!_enabled) {
      return;
    }

    const payload = await dbLoad(this.STATE_KEY);
    if (!payload) {
      return;
    }

    const decoded = decodeValue(payload);
    this.applyRuntimeState(decoded);
    console.log('[runtime-persistence] Restored runtime state from PostgreSQL.');
  }

  static queueSave(reason = 'mutation'): void {
    if (!this.initialized || !_enabled) {
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      void this.persistNow(reason);
    }, 250);
  }

  static async flush(): Promise<void> {
    if (!this.initialized || !_enabled) {
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.persistNow('flush');
    }
    await this.saveChain;
  }

  static async close(): Promise<void> {
    await this.flush();
    await dbClose();
  }

  private static async persistNow(reason: string): Promise<void> {
    this.saveTimer = null;
    this.saveChain = this.saveChain
      .then(async () => {
        const runtimeState = this.collectRuntimeState();
        const encoded = encodeValue(runtimeState);
        await dbSave(encoded, this.STATE_KEY);
        console.log(`[runtime-persistence] Saved state (${reason}).`);
      })
      .catch((err) => {
        console.error('[runtime-persistence] Save failed:', err);
      });
    await this.saveChain;
  }

  private static collectRuntimeState() {
    return {
      dashboard: {
        data: asAny(DashboardService).data,
      },
      auth: {
        refreshTokens: asAny(AuthService).refreshTokens,
        users: asAny(AuthService).users,
        identityProviders: asAny(AuthService).identityProviders,
        rateWindows: asAny(AuthService).rateWindows,
        initialized: asAny(AuthService).initialized,
      },
      invitation: {
        invitations: asAny(InvitationService).invitations,
        checklist: asAny(InvitationService).checklist,
        assignments: asAny(InvitationService).assignments,
        checklistShown: asAny(InvitationService).checklistShown,
      },
      chat: {
        threads: asAny(ChatService).threads,
        threadParticipants: asAny(ChatService).threadParticipants,
        messages: asAny(ChatService).messages,
        pinnedByWedding: asAny(ChatService).pinnedByWedding,
      },
      documents: {
        documents: asAny(DocumentService).documents,
      },
      calendar: {
        appointments: asAny(CalendarService).appointments,
        subscriptionsByKey: asAny(CalendarService).subscriptionsByKey,
        subscriptionsByToken: asAny(CalendarService).subscriptionsByToken,
      },
      notification: {
        tokensByUser: asAny(NotificationService).tokensByUser,
        tokenOwner: asAny(NotificationService).tokenOwner,
        preferencesByUser: asAny(NotificationService).preferencesByUser,
        preferenceCache: asAny(NotificationService).preferenceCache,
        weddingMuteOverrides: asAny(NotificationService).weddingMuteOverrides,
        dispatchLog: asAny(NotificationService).dispatchLog,
        pushProviders: asAny(NotificationService).pushProviders,
      },
      ros: {
        runSheetsByWedding: asAny(ROSService).runSheetsByWedding,
        runSheetItemsByWedding: asAny(ROSService).runSheetItemsByWedding,
        runSheetVersionsByWedding: asAny(ROSService).runSheetVersionsByWedding,
        acknowledgements: asAny(ROSService).acknowledgements,
        changeRequests: asAny(ROSService).changeRequests,
      },
      upload: {
        uploads: asAny(UploadService).uploads,
        completedUploads: asAny(UploadService).completedUploads,
      },
      billing: {
        plans: asAny(BillingService).plans,
        planBySlug: asAny(BillingService).planBySlug,
        subscriptionsByOrg: asAny(BillingService).subscriptionsByOrg,
        subscriptionByStripeId: asAny(BillingService).subscriptionByStripeId,
        usageByOrgMetric: asAny(BillingService).usageByOrgMetric,
        entitlementsByOrg: asAny(BillingService).entitlementsByOrg,
        invoicesByOrg: asAny(BillingService).invoicesByOrg,
        initialized: asAny(BillingService).initialized,
      },
      audit: {
        events: asAny(AuditService).events,
      },
      mail: {
        sentMail: asAny(MailService).sentMail,
        unsubscribedByEmail: asAny(MailService).unsubscribedByEmail,
      },
    };
  }

  private static applyRuntimeState(state: any) {
    if (!state || typeof state !== 'object') {
      return;
    }

    // Helper: populate a Map from either a Map or a plain object (after JSON round-trip)
    function restoreMap(target: Map<string, any>, src: any): void {
      if (!src) return;
      const entries: [string, any][] = src instanceof Map
        ? Array.from(src.entries())
        : Object.entries(src);
      entries.forEach(([k, v]) => target.set(k, v));
    }

    if (state.dashboard?.data) {
      asAny(DashboardService).data = state.dashboard.data;
    }

    if (state.auth) {
      if (state.auth.refreshTokens) asAny(AuthService).refreshTokens = state.auth.refreshTokens;
      if (state.auth.users) asAny(AuthService).users = state.auth.users;
      if (state.auth.identityProviders) asAny(AuthService).identityProviders = state.auth.identityProviders;
      if (state.auth.rateWindows) asAny(AuthService).rateWindows = state.auth.rateWindows;
      if (typeof state.auth.initialized === 'boolean') asAny(AuthService).initialized = state.auth.initialized;
    }

    if (state.invitation) {
      // InvitationService.invitations / checklist / checklistShown are getter-only
      // properties that delegate to InvitationsRepo. Restore data directly into the
      // underlying repo Maps/Set so the getter still works after a restart.
      if (state.invitation.invitations) {
        const map = InvitationsRepo.getInvitationsMap();
        map.clear();
        const src = state.invitation.invitations;
        if (src instanceof Map) {
          src.forEach((v: any, k: string) => map.set(k, v));
        } else if (src && typeof src === 'object') {
          Object.entries(src).forEach(([k, v]) => map.set(k, v as any));
        }
      }
      if (state.invitation.checklist) {
        const map = InvitationsRepo.getChecklistMap();
        map.clear();
        const src = state.invitation.checklist;
        if (src instanceof Map) {
          src.forEach((v: any, k: string) => map.set(k, v instanceof Map ? v : new Map(Object.entries(v || {}))));
        } else if (src && typeof src === 'object') {
          Object.entries(src).forEach(([k, v]) => map.set(k, v instanceof Map ? v : new Map(Object.entries(v as any || {}))));
        }
      }
      if (state.invitation.assignments) asAny(InvitationService).assignments = state.invitation.assignments;
      if (state.invitation.checklistShown) {
        const set = InvitationsRepo.getChecklistShownSet();
        set.clear();
        const src = state.invitation.checklistShown;
        if (src instanceof Set) {
          src.forEach((v: string) => set.add(v));
        } else if (Array.isArray(src)) {
          src.forEach((v: string) => set.add(v));
        }
      }
    }

    if (state.chat) {
      // ChatService.threads / threadParticipants / messages / pinnedByWedding are
      // getter-only properties delegating to ChatRepo. Restore into the repo Maps.
      if (state.chat.threads) {
        const map = ChatRepo.getThreadsMap();
        map.clear();
        restoreMap(map, state.chat.threads);
      }
      if (state.chat.threadParticipants) {
        const map = ChatRepo.getThreadParticipantsMap();
        map.clear();
        const src = state.chat.threadParticipants;
        const entries = src instanceof Map ? Array.from(src.entries()) : Object.entries(src || {});
        entries.forEach(([k, v]: [string, any]) => {
          map.set(k, v instanceof Set ? v : new Set(Array.isArray(v) ? v : Object.keys(v || {})));
        });
      }
      if (state.chat.messages) {
        const map = ChatRepo.getMessagesMap();
        map.clear();
        restoreMap(map, state.chat.messages);
      }
      if (state.chat.pinnedByWedding) {
        const map = ChatRepo.getPinnedByWeddingMap();
        map.clear();
        const src = state.chat.pinnedByWedding;
        const entries = src instanceof Map ? Array.from(src.entries()) : Object.entries(src || {});
        entries.forEach(([k, v]: [string, any]) => {
          map.set(k, v instanceof Set ? v : new Set(Array.isArray(v) ? v : Object.keys(v || {})));
        });
      }
    }

    if (state.documents?.documents) {
      // DocumentService.documents is getter-only — restore into DocumentsRepo
      const map = DocumentsRepo.getDocumentsMap();
      map.clear();
      restoreMap(map, state.documents.documents);
    }

    if (state.calendar) {
      // CalendarService.appointments / subscriptionsByKey / subscriptionsByToken
      // are getter-only — restore into AppointmentsRepo.
      if (state.calendar.appointments) {
        const map = AppointmentsRepo.getAppointmentsMap();
        map.clear();
        restoreMap(map, state.calendar.appointments);
      }
      if (state.calendar.subscriptionsByKey) {
        const map = AppointmentsRepo.getSubscriptionsByKeyMap();
        map.clear();
        restoreMap(map, state.calendar.subscriptionsByKey);
      }
      if (state.calendar.subscriptionsByToken) {
        const map = AppointmentsRepo.getSubscriptionsByTokenMap();
        map.clear();
        restoreMap(map, state.calendar.subscriptionsByToken);
      }
    }

    if (state.notification) {
      if (state.notification.tokensByUser) asAny(NotificationService).tokensByUser = state.notification.tokensByUser;
      if (state.notification.tokenOwner) asAny(NotificationService).tokenOwner = state.notification.tokenOwner;
      if (state.notification.preferencesByUser) {
        asAny(NotificationService).preferencesByUser = state.notification.preferencesByUser;
      }
      if (state.notification.preferenceCache) asAny(NotificationService).preferenceCache = state.notification.preferenceCache;
      if (state.notification.weddingMuteOverrides) {
        asAny(NotificationService).weddingMuteOverrides = state.notification.weddingMuteOverrides;
      }
      if (state.notification.dispatchLog) asAny(NotificationService).dispatchLog = state.notification.dispatchLog;
      if (state.notification.pushProviders) asAny(NotificationService).pushProviders = state.notification.pushProviders;
    }

    if (state.ros) {
      // ROSService properties are getter-only delegating to RosRepo — restore into repo Maps.
      if (state.ros.runSheetsByWedding) {
        const map = RosRepo.getRunSheetsByWeddingMap();
        map.clear();
        restoreMap(map, state.ros.runSheetsByWedding);
      }
      if (state.ros.runSheetItemsByWedding) {
        const map = RosRepo.getRunSheetItemsByWeddingMap();
        map.clear();
        const src = state.ros.runSheetItemsByWedding;
        const entries: [string, any][] = src instanceof Map ? Array.from(src.entries()) : Object.entries(src || {});
        entries.forEach(([k, v]) => {
          const inner = new Map<string, any>();
          restoreMap(inner, v);
          map.set(k, inner);
        });
      }
      if (state.ros.runSheetVersionsByWedding) {
        const map = RosRepo.getRunSheetVersionsByWeddingMap();
        map.clear();
        restoreMap(map, state.ros.runSheetVersionsByWedding);
      }
      if (state.ros.acknowledgements) {
        const map = RosRepo.getAcknowledgementsMap();
        map.clear();
        restoreMap(map, state.ros.acknowledgements);
      }
      if (state.ros.changeRequests) {
        const map = RosRepo.getChangeRequestsMap();
        map.clear();
        restoreMap(map, state.ros.changeRequests);
      }
    }

    if (state.upload) {
      if (state.upload.uploads) asAny(UploadService).uploads = state.upload.uploads;
      if (state.upload.completedUploads) asAny(UploadService).completedUploads = state.upload.completedUploads;
    }

    if (state.billing) {
      if (state.billing.plans) asAny(BillingService).plans = state.billing.plans;
      if (state.billing.planBySlug) asAny(BillingService).planBySlug = state.billing.planBySlug;
      if (state.billing.subscriptionsByOrg) asAny(BillingService).subscriptionsByOrg = state.billing.subscriptionsByOrg;
      if (state.billing.subscriptionByStripeId) asAny(BillingService).subscriptionByStripeId = state.billing.subscriptionByStripeId;
      if (state.billing.usageByOrgMetric) asAny(BillingService).usageByOrgMetric = state.billing.usageByOrgMetric;
      if (state.billing.entitlementsByOrg) asAny(BillingService).entitlementsByOrg = state.billing.entitlementsByOrg;
      if (state.billing.invoicesByOrg) asAny(BillingService).invoicesByOrg = state.billing.invoicesByOrg;
      if (typeof state.billing.initialized === 'boolean') asAny(BillingService).initialized = state.billing.initialized;
    }

    if (state.audit?.events) {
      asAny(AuditService).events = state.audit.events;
    }

    if (state.mail) {
      if (state.mail.sentMail) asAny(MailService).sentMail = state.mail.sentMail;
      if (state.mail.unsubscribedByEmail) asAny(MailService).unsubscribedByEmail = state.mail.unsubscribedByEmail;
    }
  }
}
