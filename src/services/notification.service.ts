import { EventCatalog, type NotificationEventType } from './event-catalog.service';
import { MailService } from './mail.service';

type DevicePlatform = 'android' | 'ios' | 'web';
type Channel = 'push' | 'email';

type DeviceTokenRecord = {
  token: string;
  platform: DevicePlatform;
  updated_at: string;
  last_error_code: string | null;
};

type DispatchResult = {
  sent: number;
  skippedMuted: boolean;
  skippedPreference: boolean;
  removedTokens: number;
  retried: number;
};

type CachedPreference = {
  value: boolean;
  cachedAt: number;
};

type NotificationEventInput = {
  userId: string;
  weddingId: string | null;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
  email?: string;
};

/**
 * Phase 7.2 Push Notification Dispatch Service
 */
export class NotificationService {
  private static readonly PREFERENCE_CACHE_TTL_MS = 60_000;
  private static tokensByUser = new Map<string, Map<string, DeviceTokenRecord>>();
  private static tokenOwner = new Map<string, string>();
  private static preferencesByUser = new Map<string, Record<string, unknown>>();
  private static preferenceCache = new Map<string, CachedPreference>();
  private static weddingMuteOverrides = new Map<string, string | null>();
  private static dispatchLog: Array<{
    userId: string;
    eventType: NotificationEventType;
    channel: Channel;
    token?: string;
    payload?: { title: string; body: string };
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
  }> = [];
  private static pushSender: ((token: string, platform: DevicePlatform, content: any) => Promise<void>) | null = null;
  private static pushProviders = {
    fcm: {
      enabled: true,
      platforms: ['android', 'web', 'ios'] as DevicePlatform[],
    },
    apns: {
      enabled: true,
      platforms: ['ios'] as DevicePlatform[],
    },
  };

  /**
   * 7.2.1 Configure FCM/APNs providers
   */
  static configurePushProviders(config: {
    fcmEnabled?: boolean;
    apnsEnabled?: boolean;
    iosViaFcm?: boolean;
  }) {
    if (typeof config.fcmEnabled === 'boolean') {
      this.pushProviders.fcm.enabled = config.fcmEnabled;
    }
    if (typeof config.apnsEnabled === 'boolean') {
      this.pushProviders.apns.enabled = config.apnsEnabled;
    }
    if (typeof config.iosViaFcm === 'boolean') {
      this.pushProviders.fcm.platforms = config.iosViaFcm
        ? ['android', 'web', 'ios']
        : ['android', 'web'];
    }
    return {
      fcm: { ...this.pushProviders.fcm },
      apns: { ...this.pushProviders.apns },
    };
  }

  /**
   * 7.2.3 Event bus entrypoint using shared event catalog (email + push)
   */
  static async dispatchEvent(event: NotificationEventInput) {
    const catalogEntry = EventCatalog[event.eventType];
    if (!catalogEntry) {
      throw new Error(`Unsupported notification event type: ${event.eventType}`);
    }

    const pushResult = await this.notify(event.userId, event.weddingId, event.eventType, event.payload);

    let emailResult: any = { skipped: true, reason: 'no_email' };
    if (event.email && catalogEntry.defaultEmailEnabled) {
      emailResult = await MailService.send(event.email, catalogEntry.emailTemplate, event.payload);
    }

    return {
      eventType: event.eventType,
      push: pushResult,
      email: emailResult,
    };
  }

  /**
   * 7.2.3 dispatch + mapping
   * 7.2.4 minimal payload rule
   * 7.2.5 preference + mute checks
   * 7.2.6 retry and stale token cleanup
   * 7.2.7 payload size safety
   */
  static async notify(
    userId: string,
    weddingId: string | null,
    eventType: NotificationEventType,
    payload: Record<string, unknown>
  ): Promise<DispatchResult> {
    const isMuted = await this.isWeddingMuted(userId, weddingId);
    if (isMuted) {
      this.dispatchLog.push({
        userId,
        eventType,
        channel: 'push',
        status: 'skipped',
        reason: 'wedding_muted',
      });
      return { sent: 0, skippedMuted: true, skippedPreference: false, removedTokens: 0, retried: 0 };
    }

    const isEnabled = await this.isPreferenceEnabled(userId, eventType, 'push');
    if (!isEnabled) {
      this.dispatchLog.push({
        userId,
        eventType,
        channel: 'push',
        status: 'skipped',
        reason: 'push_opt_out',
      });
      return { sent: 0, skippedMuted: false, skippedPreference: true, removedTokens: 0, retried: 0 };
    }

    const pushContent = this.getMinimalPayload(eventType, payload);
    const tokens = await this.getDeviceTokens(userId);
    let sent = 0;
    let removed = 0;
    let retried = 0;

    for (const tokenRecord of tokens) {
      try {
        const retryCount = await this.sendWithRetry(tokenRecord.token, tokenRecord.platform, pushContent);
        retried += retryCount;
        sent += 1;
        this.dispatchLog.push({
          userId,
          eventType,
          channel: 'push',
          token: tokenRecord.token,
          payload: pushContent,
          status: 'sent',
        });
      } catch (err: any) {
        const code = String(err?.code || 'UNKNOWN');
        if (code === 'UNREGISTERED') {
          await this.removeDeviceToken(tokenRecord.token);
          removed += 1;
        }
        this.dispatchLog.push({
          userId,
          eventType,
          channel: 'push',
          token: tokenRecord.token,
          status: 'failed',
          reason: code,
        });
      }
    }

    return {
      sent,
      skippedMuted: false,
      skippedPreference: false,
      removedTokens: removed,
      retried,
    };
  }

  /**
   * 7.2.2 Token registration with refresh/invalidation semantics
   */
  static async registerToken(userId: string, token: string, platform: string) {
    const normalizedUser = String(userId || '').trim();
    const normalizedToken = String(token || '').trim();
    const normalizedPlatform = this.normalizePlatform(platform);
    if (!normalizedUser || !normalizedToken) {
      throw new Error('userId and token are required');
    }

    const previousOwner = this.tokenOwner.get(normalizedToken);
    if (previousOwner && previousOwner !== normalizedUser) {
      const ownerTokens = this.tokensByUser.get(previousOwner);
      ownerTokens?.delete(normalizedToken);
      if (ownerTokens && ownerTokens.size === 0) {
        this.tokensByUser.delete(previousOwner);
      }
    }

    const userTokens = this.tokensByUser.get(normalizedUser) || new Map<string, DeviceTokenRecord>();
    userTokens.set(normalizedToken, {
      token: normalizedToken,
      platform: normalizedPlatform,
      updated_at: new Date().toISOString(),
      last_error_code: null,
    });
    this.tokensByUser.set(normalizedUser, userTokens);
    this.tokenOwner.set(normalizedToken, normalizedUser);
    return {
      userId: normalizedUser,
      token: normalizedToken,
      platform: normalizedPlatform,
      totalTokens: userTokens.size,
    };
  }

  static async invalidateToken(token: string) {
    await this.removeDeviceToken(token);
  }

  static async setWeddingMuteOverride(userId: string, weddingId: string, mutedUntil: Date | null) {
    const key = `${userId}:${weddingId}`;
    this.weddingMuteOverrides.set(key, mutedUntil ? mutedUntil.toISOString() : null);
    return { userId, weddingId, mutedUntil: mutedUntil ? mutedUntil.toISOString() : null };
  }

  /**
   * Compatibility helper used by existing controller + audit logging
   */
  static async updatePreferences(userId: string, patch: Record<string, unknown>) {
    const existing = this.preferencesByUser.get(userId) || {};
    const updated = {
      ...existing,
      ...patch,
    };
    this.preferencesByUser.set(userId, updated);
    this.clearPreferenceCacheForUser(userId);
    return {
      before: existing,
      after: updated,
    };
  }

  static getPreferencesForTests(userId: string) {
    return this.preferencesByUser.get(userId) || {};
  }

  static getDeviceTokensForTests(userId: string): DeviceTokenRecord[] {
    const userTokens = this.tokensByUser.get(userId);
    return userTokens ? Array.from(userTokens.values()).map((entry) => ({ ...entry })) : [];
  }

  static getDispatchLogForTests() {
    return this.dispatchLog.map((entry) => ({ ...entry, payload: entry.payload ? { ...entry.payload } : undefined }));
  }

  static setPushSenderForTests(
    sender: ((token: string, platform: DevicePlatform, content: any) => Promise<void>) | null
  ) {
    this.pushSender = sender;
  }

  static clearStateForTests() {
    this.tokensByUser.clear();
    this.tokenOwner.clear();
    this.preferencesByUser.clear();
    this.preferenceCache.clear();
    this.weddingMuteOverrides.clear();
    this.dispatchLog = [];
    this.pushSender = null;
    this.pushProviders = {
      fcm: { enabled: true, platforms: ['android', 'web', 'ios'] },
      apns: { enabled: true, platforms: ['ios'] },
    };
  }

  private static getMinimalPayload(eventType: NotificationEventType, payload: Record<string, unknown>) {
    const catalogEntry = EventCatalog[eventType];
    const weddingName = this.sanitizeWeddingName(String(payload.weddingName || 'this wedding'));
    const body = `New ${catalogEntry.pushLabel} in ${weddingName}`;
    const content = {
      title: 'Wedding Management App',
      body,
    };

    // 7.2.7 iOS payload <= 4KB safety
    let encoded = Buffer.byteLength(JSON.stringify(content), 'utf8');
    if (encoded > 4096) {
      const overflow = encoded - 4096 + 3;
      const shortened = weddingName.slice(0, Math.max(8, weddingName.length - overflow));
      content.body = `New ${catalogEntry.pushLabel} in ${shortened}`;
      encoded = Buffer.byteLength(JSON.stringify(content), 'utf8');
      if (encoded > 4096) {
        content.body = `New ${catalogEntry.pushLabel} update`;
      }
    }
    return content;
  }

  private static sanitizeWeddingName(name: string) {
    const stripped = name
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
      .replace(/\+?\d[\d\s()-]{7,}\d/g, '[redacted]')
      .trim();
    return stripped || 'this wedding';
  }

  private static async sendWithRetry(token: string, platform: DevicePlatform, content: { title: string; body: string }) {
    const transientCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'TEMPORARY_FAILURE']);
    let retries = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.sendPush(token, platform, content);
        return retries;
      } catch (err: any) {
        const code = String(err?.code || 'UNKNOWN');
        if (code === 'UNREGISTERED') {
          throw err;
        }
        if (!transientCodes.has(code) || attempt === 2) {
          throw err;
        }
        retries += 1;
      }
    }
    return retries;
  }

  private static async sendPush(token: string, platform: DevicePlatform, content: { title: string; body: string }) {
    if (!this.canPlatformDispatch(platform)) {
      const err: any = new Error(`No push provider configured for platform ${platform}`);
      err.code = 'PUSH_PROVIDER_UNAVAILABLE';
      throw err;
    }
    if (this.pushSender) {
      return this.pushSender(token, platform, content);
    }
    console.log(`[PUSH/${platform}] ${token.slice(0, 8)}: ${content.body}`);
  }

  private static async isWeddingMuted(userId: string, weddingId: string | null) {
    if (!weddingId) {
      return false;
    }
    const key = `${userId}:${weddingId}`;
    const mutedUntil = this.weddingMuteOverrides.get(key);
    if (mutedUntil === undefined) {
      return false;
    }
    if (mutedUntil === null) {
      return true;
    }
    return new Date(mutedUntil).getTime() > Date.now();
  }

  private static async isPreferenceEnabled(
    userId: string,
    eventType: NotificationEventType,
    channel: Channel
  ): Promise<boolean> {
    const cacheKey = `${userId}:${channel}:${eventType}`;
    const cached = this.preferenceCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.PREFERENCE_CACHE_TTL_MS) {
      return cached.value;
    }

    const userPrefs = this.preferencesByUser.get(userId) || {};
    const prefKey = `${channel}:${eventType}`;
    const explicit = userPrefs[prefKey];
    const defaultValue =
      channel === 'push'
        ? EventCatalog[eventType].defaultPushEnabled
        : EventCatalog[eventType].defaultEmailEnabled;
    const value = typeof explicit === 'boolean' ? explicit : defaultValue;
    this.preferenceCache.set(cacheKey, { value, cachedAt: now });
    return value;
  }

  private static async getDeviceTokens(userId: string) {
    const userTokens = this.tokensByUser.get(userId);
    if (!userTokens) {
      return [];
    }
    return Array.from(userTokens.values()).map((entry) => ({ ...entry }));
  }

  private static async removeDeviceToken(token: string) {
    const owner = this.tokenOwner.get(token);
    if (!owner) {
      return;
    }
    const ownerTokens = this.tokensByUser.get(owner);
    ownerTokens?.delete(token);
    if (ownerTokens && ownerTokens.size === 0) {
      this.tokensByUser.delete(owner);
    }
    this.tokenOwner.delete(token);
  }

  private static clearPreferenceCacheForUser(userId: string) {
    for (const key of Array.from(this.preferenceCache.keys())) {
      if (key.startsWith(`${userId}:`)) {
        this.preferenceCache.delete(key);
      }
    }
  }

  private static normalizePlatform(value: string): DevicePlatform {
    if (value === 'android' || value === 'ios' || value === 'web') {
      return value;
    }
    throw new Error('platform must be one of android, ios, web');
  }

  private static canPlatformDispatch(platform: DevicePlatform) {
    if (platform === 'ios') {
      return (
        (this.pushProviders.apns.enabled && this.pushProviders.apns.platforms.includes('ios')) ||
        (this.pushProviders.fcm.enabled && this.pushProviders.fcm.platforms.includes('ios'))
      );
    }
    return this.pushProviders.fcm.enabled && this.pushProviders.fcm.platforms.includes(platform);
  }
}
