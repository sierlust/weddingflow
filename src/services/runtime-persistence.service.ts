import { Pool } from 'pg';
import { AuthService } from './auth.service';
import { BillingService } from './billing.service';
import { CalendarService, ChatService, DocumentService } from './collaboration.service';
import { DashboardService } from './dashboard.service';
import { InvitationService } from './invitation.service';
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
      if (state.invitation.invitations) asAny(InvitationService).invitations = state.invitation.invitations;
      if (state.invitation.checklist) asAny(InvitationService).checklist = state.invitation.checklist;
      if (state.invitation.assignments) asAny(InvitationService).assignments = state.invitation.assignments;
      if (state.invitation.checklistShown) asAny(InvitationService).checklistShown = state.invitation.checklistShown;
    }

    if (state.chat) {
      if (state.chat.threads) asAny(ChatService).threads = state.chat.threads;
      if (state.chat.threadParticipants) asAny(ChatService).threadParticipants = state.chat.threadParticipants;
      if (state.chat.messages) asAny(ChatService).messages = state.chat.messages;
      if (state.chat.pinnedByWedding) asAny(ChatService).pinnedByWedding = state.chat.pinnedByWedding;
    }

    if (state.documents?.documents) {
      asAny(DocumentService).documents = state.documents.documents;
    }

    if (state.calendar) {
      if (state.calendar.appointments) asAny(CalendarService).appointments = state.calendar.appointments;
      if (state.calendar.subscriptionsByKey) asAny(CalendarService).subscriptionsByKey = state.calendar.subscriptionsByKey;
      if (state.calendar.subscriptionsByToken) asAny(CalendarService).subscriptionsByToken = state.calendar.subscriptionsByToken;
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
      if (state.ros.runSheetsByWedding) asAny(ROSService).runSheetsByWedding = state.ros.runSheetsByWedding;
      if (state.ros.runSheetItemsByWedding) asAny(ROSService).runSheetItemsByWedding = state.ros.runSheetItemsByWedding;
      if (state.ros.runSheetVersionsByWedding) asAny(ROSService).runSheetVersionsByWedding = state.ros.runSheetVersionsByWedding;
      if (state.ros.acknowledgements) asAny(ROSService).acknowledgements = state.ros.acknowledgements;
      if (state.ros.changeRequests) asAny(ROSService).changeRequests = state.ros.changeRequests;
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
