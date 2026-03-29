// Repository for user identity and session data.
// Async functions use Supabase with in-memory cache fallback.
// Identity providers cache stays in-memory for sync/fallback access.

import { db } from '../db/client';

export type UserRecord = {
    id: string;
    email: string;
    name: string;
    locale: string;
    createdAt: Date;
};

export type RefreshSession = {
    userId: string;
    orgClaims: string[];
    expiresAt: Date;
};

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

// Sync user cache — populated on reads/writes so findUserByIdSync works
const usersCache = new Map<string, UserRecord>();
// Identity provider cache: "providerType:providerSubject" → userId
const identityProvidersCache = new Map<string, string>();
// Refresh tokens (transient — never persisted)
const refreshTokens = new Map<string, RefreshSession>();

// ---------------------------------------------------------------------------
// Internal helper: map DB row to UserRecord
// ---------------------------------------------------------------------------

function rowToUser(row: any): UserRecord {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        locale: row.locale ?? 'nl',
        createdAt: new Date(row.created_at),
    };
}

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

export async function findUserById(id: string): Promise<UserRecord | null> {
    // Check cache first
    if (usersCache.has(id)) return usersCache.get(id)!;
    const { data, error } = await db.from('users').select('*').eq('id', id).single();
    if (error || !data) return null;
    const user = rowToUser(data);
    usersCache.set(id, user);
    return user;
}

/** Synchronous lookup — for use in non-async contexts (e.g. JWT middleware). */
export function findUserByIdSync(id: string): UserRecord | null {
    return usersCache.get(id) ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    // Check cache first
    const cached = Array.from(usersCache.values()).find(u => u.email === normalized);
    if (cached) return cached;
    const { data, error } = await db.from('users').select('*').eq('email', normalized).single();
    if (error || !data) return null;
    const user = rowToUser(data);
    usersCache.set(user.id, user);
    return user;
}

export async function findUserByProvider(providerType: string, providerSubject: string): Promise<string | null> {
    const key = `${providerType}:${providerSubject.toLowerCase()}`;
    // Check cache first
    if (identityProvidersCache.has(key)) return identityProvidersCache.get(key)!;

    const { data, error } = await db
        .from('user_identities')
        .select('user_id')
        .eq('provider_type', providerType)
        .eq('provider_subject', providerSubject.toLowerCase())
        .single();
    if (error || !data) return null;
    identityProvidersCache.set(key, data.user_id);
    return data.user_id;
}

export async function createUser(user: UserRecord, identityKey: string, extraKeys?: string[]): Promise<UserRecord> {
    // Cache immediately so sync accessors and subsequent lookups work
    usersCache.set(user.id, user);

    // identityKey format: "providerType:providerSubject"
    const [providerType, ...subjectParts] = identityKey.split(':');
    const providerSubject = subjectParts.join(':');

    // Cache identity provider immediately
    identityProvidersCache.set(identityKey, user.id);
    if (extraKeys) {
        for (const k of extraKeys) {
            identityProvidersCache.set(k, user.id);
        }
    }

    // Persist to Supabase (fire-and-forget — don't throw if unavailable)
    db.from('users').insert({
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'supplier',
        created_at: user.createdAt.toISOString(),
    }).then(() => {
        // Insert primary identity
        return db.from('user_identities').insert({
            user_id: user.id,
            provider_type: providerType,
            provider_subject: providerSubject,
        });
    }).then(() => {
        // Extra identity keys
        if (extraKeys) {
            for (const k of extraKeys) {
                const [ept, ...eps] = k.split(':');
                db.from('user_identities').insert({
                    user_id: user.id,
                    provider_type: ept,
                    provider_subject: eps.join(':'),
                }).then(() => {});
            }
        }
    }).catch(() => {});

    return user;
}

export async function updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord | null> {
    const existing = usersCache.get(id);
    const updated = existing ? { ...existing, ...patch } : null;
    if (updated) usersCache.set(id, updated);

    const dbPatch: Record<string, unknown> = {};
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.name !== undefined) dbPatch.name = patch.name;

    if (Object.keys(dbPatch).length > 0) {
        const { data, error } = await db.from('users').update(dbPatch).eq('id', id).select().single();
        if (!error && data) {
            const user = rowToUser(data);
            usersCache.set(id, user);
            return user;
        }
    }

    return updated ?? existing ?? null;
}

export async function removeUserAndIdentities(userId: string): Promise<void> {
    usersCache.delete(userId);
    // Remove from identityProvidersCache
    for (const [key, uid] of Array.from(identityProvidersCache.entries())) {
        if (uid === userId) identityProvidersCache.delete(key);
    }
    await db.from('user_identities').delete().eq('user_id', userId).then(() => {});
    await db.from('users').delete().eq('id', userId).then(() => {});
}

export async function setIdentityProvider(key: string, userId: string): Promise<void> {
    identityProvidersCache.set(key, userId);
    const [providerType, ...subjectParts] = key.split(':');
    const providerSubject = subjectParts.join(':');
    db.from('user_identities').upsert(
        { user_id: userId, provider_type: providerType, provider_subject: providerSubject },
        { onConflict: 'provider_type,provider_subject' }
    ).then(() => {}).catch(() => {});
}

export async function hasIdentityProvider(key: string): Promise<boolean> {
    if (identityProvidersCache.has(key)) return true;
    const [providerType, ...subjectParts] = key.split(':');
    const providerSubject = subjectParts.join(':');
    const { data } = await db
        .from('user_identities')
        .select('user_id')
        .eq('provider_type', providerType)
        .eq('provider_subject', providerSubject)
        .single();
    return !!data;
}

// ---------------------------------------------------------------------------
// Refresh token store (kept in-memory — transient sessions)
// ---------------------------------------------------------------------------

export async function addRefreshToken(token: string, session: RefreshSession): Promise<void> {
    refreshTokens.set(token, session);
}

export async function removeRefreshToken(token: string): Promise<void> {
    refreshTokens.delete(token);
}

export async function getRefreshSession(token: string): Promise<RefreshSession | null> {
    return refreshTokens.get(token) ?? null;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearUsersStoreForTests(): void {
    usersCache.clear();
    identityProvidersCache.clear();
    refreshTokens.clear();
}

export function _seedUserForTests(user: UserRecord, identityKey: string): void {
    usersCache.set(user.id, user);
    identityProvidersCache.set(identityKey, user.id);
}
