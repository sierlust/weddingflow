// Repository for user identity and session data.
// Users zijn opgeslagen in Supabase Auth (auth.users) — zichtbaar in de Authentication-tab.
// De public `users` tabel bevat alleen profieldata (naam, rol).

import * as crypto from 'crypto';
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

const usersCache = new Map<string, UserRecord>();
// Identity provider cache: "providerType:providerSubject" → userId (alleen voor OAuth)
const identityProvidersCache = new Map<string, string>();
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
    const cached = Array.from(usersCache.values()).find(u => u.email === normalized);
    if (cached) return cached;
    const { data, error } = await db.from('users').select('*').eq('email', normalized).single();
    if (error || !data) return null;
    const user = rowToUser(data);
    usersCache.set(user.id, user);
    return user;
}

/**
 * Zoek een user op via identity provider.
 * - email_password → opzoeken via Supabase Auth (auth.admin.getUserByEmail)
 * - OAuth (google, apple) → opzoeken via user_identities tabel
 */
export async function findUserByProvider(providerType: string, providerSubject: string): Promise<string | null> {
    const key = `${providerType}:${providerSubject.toLowerCase()}`;
    if (identityProvidersCache.has(key)) return identityProvidersCache.get(key)!;

    if (providerType === 'email_password') {
        // Zoek op in de users (profiel) tabel — altijd gesynchroniseerd met auth.users
        const user = await findUserByEmail(providerSubject.toLowerCase());
        if (!user) return null;
        identityProvidersCache.set(key, user.id);
        return user.id;
    }

    // OAuth providers → user_identities tabel
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

/**
 * Verifieer email + wachtwoord via Supabase Auth REST endpoint.
 * We gebruiken een directe fetch (niet de JS client) zodat de password check
 * altijd afgedwongen wordt, ook met de service key.
 * Geeft de userId terug bij succes, anders null.
 */
export async function verifyEmailPassword(email: string, password: string): Promise<string | null> {
    const url = `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY!,
        },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const userId: string | undefined = data.user?.id;
    if (!userId) return null;
    // Warm de cache op als de user nog niet in-memory zit
    if (!usersCache.has(userId)) {
        await findUserById(userId);
    }
    return userId;
}

/**
 * Maak een nieuwe user aan.
 * - email_password: wordt aangemaakt in Supabase Auth (verschijnt in Authentication-tab) + profiel in users-tabel
 * - OAuth: ID wordt zelf gegenereerd + opgeslagen in users + user_identities
 */
export async function createUser(
    user: Omit<UserRecord, 'id'>,
    identityKey: string,
    extraKeys?: string[],
    password?: string
): Promise<UserRecord> {
    const [providerType, ...subjectParts] = identityKey.split(':');
    const providerSubject = subjectParts.join(':');

    let userId: string;

    if (providerType === 'email_password') {
        // Aanmaken via Supabase Auth → verschijnt in de Authentication-tab
        const authPayload: any = {
            email: user.email,
            email_confirm: true,
            user_metadata: { name: user.name },
        };
        if (password) authPayload.password = password;

        const { data: authData, error: authError } = await db.auth.admin.createUser(authPayload);
        if (authError) throw new Error(`Supabase Auth aanmaken mislukt: ${authError.message}`);
        userId = authData.user.id;
    } else {
        // OAuth: eigen UUID genereren
        userId = crypto.randomUUID();
    }

    const fullUser: UserRecord = { ...user, id: userId };

    // Profiel opslaan in public.users tabel
    const { error: profileError } = await db.from('users').insert({
        id: userId,
        email: user.email,
        name: user.name,
        role: 'supplier',
        created_at: user.createdAt.toISOString(),
    });
    if (profileError) {
        if (providerType === 'email_password') {
            await db.auth.admin.deleteUser(userId).catch(() => {});
        }
        throw new Error(`Profiel opslaan mislukt: ${profileError.message}`);
    }

    // OAuth: sla identity op in user_identities
    if (providerType !== 'email_password') {
        const { error: idError } = await db.from('user_identities').insert({
            user_id: userId,
            provider_type: providerType,
            provider_subject: providerSubject,
        });
        if (idError) console.error('user_identities insert mislukt:', idError.message);
    }

    // Cache vullen
    usersCache.set(userId, fullUser);
    identityProvidersCache.set(identityKey, userId);
    if (extraKeys) extraKeys.forEach(k => identityProvidersCache.set(k, userId));

    return fullUser;
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
    for (const [key, uid] of Array.from(identityProvidersCache.entries())) {
        if (uid === userId) identityProvidersCache.delete(key);
    }
    await db.from('user_identities').delete().eq('user_id', userId).catch(() => {});
    await db.from('users').delete().eq('id', userId).catch(() => {});
    await db.auth.admin.deleteUser(userId).catch(() => {});
}

export async function setIdentityProvider(key: string, userId: string): Promise<void> {
    identityProvidersCache.set(key, userId);
    const [providerType, ...subjectParts] = key.split(':');
    if (providerType === 'email_password') return; // Wordt beheerd door Supabase Auth
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
    if (providerType === 'email_password') {
        const user = await findUserByEmail(providerSubject.toLowerCase());
        return !!user;
    }
    const { data } = await db
        .from('user_identities')
        .select('user_id')
        .eq('provider_type', providerType)
        .eq('provider_subject', providerSubject)
        .single();
    return !!data;
}

// ---------------------------------------------------------------------------
// Refresh token store (in-memory + Supabase)
// ---------------------------------------------------------------------------

export async function addRefreshToken(token: string, session: RefreshSession): Promise<void> {
    refreshTokens.set(token, session);
    const { error } = await db.from('refresh_tokens').upsert({
        token,
        user_id: session.userId,
        org_claims: session.orgClaims,
        expires_at: session.expiresAt.toISOString(),
    }, { onConflict: 'token' });
    if (error) console.error('Refresh token opslaan mislukt:', error.message);
}

export async function removeRefreshToken(token: string): Promise<void> {
    refreshTokens.delete(token);
    db.from('refresh_tokens').delete().eq('token', token).then(() => {}).catch(() => {});
}

export async function getRefreshSession(token: string): Promise<RefreshSession | null> {
    if (refreshTokens.has(token)) return refreshTokens.get(token)!;
    const { data, error } = await db
        .from('refresh_tokens')
        .select('*')
        .eq('token', token)
        .single();
    if (error || !data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        db.from('refresh_tokens').delete().eq('token', token).then(() => {}).catch(() => {});
        return null;
    }
    const session: RefreshSession = {
        userId: data.user_id,
        orgClaims: Array.isArray(data.org_claims) ? data.org_claims : [],
        expiresAt: new Date(data.expires_at),
    };
    refreshTokens.set(token, session);
    return session;
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
