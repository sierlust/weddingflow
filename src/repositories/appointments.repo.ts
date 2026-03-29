// Repository for calendar appointments and iCal subscriptions.
// Async functions use Supabase; sync Map accessors kept for CalendarService.

import { db } from '../db/client';

export type AppointmentRecord = {
    id: string;
    weddingId: string;
    title: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    locationOrLink: string | null;
    notes: {
        value: string;
        scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
    };
    attachments: string[];
    reminderSettings: { minutesBefore: number; channel: 'email' | 'push' }[];
    visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
    participants: { userId?: string; supplierOrgId?: string }[];
    createdAt: Date;
};

export type IcalSubscription = {
    token: string;
    weddingId: string;
    userId: string;
    supplierOrgIds: string[];
    isOwner: boolean;
    isPlatformAdmin: boolean;
    revokedAt: Date | null;
};

// ---------------------------------------------------------------------------
// In-memory stores (kept for sync access by CalendarService)
// ---------------------------------------------------------------------------

const appointments = new Map<string, AppointmentRecord>();
const subscriptionsByKey = new Map<string, string>(); // `${weddingId}:${userId}` -> token
const subscriptionsByToken = new Map<string, IcalSubscription>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToAppointment(row: any): AppointmentRecord {
    return {
        id: row.id,
        weddingId: row.wedding_id,
        title: row.title,
        startAt: new Date(row.start_at),
        endAt: new Date(row.end_at),
        timezone: row.timezone ?? 'Europe/Amsterdam',
        locationOrLink: row.location_or_link ?? null,
        notes: { value: row.notes ?? '', scope: (row.visibility_scope ?? 'couple_only') as any },
        attachments: [],
        reminderSettings: [],
        visibilityScope: row.visibility_scope ?? 'couple_only',
        participants: [],
        createdAt: new Date(row.created_at),
    };
}

function rowToIcalSubscription(row: any): IcalSubscription {
    return {
        token: row.token,
        weddingId: row.wedding_id,
        userId: row.user_id,
        supplierOrgIds: [],
        isOwner: false,
        isPlatformAdmin: false,
        revokedAt: null,
    };
}

// ---------------------------------------------------------------------------
// Sync Map accessors (for CalendarService which is synchronous internally)
// ---------------------------------------------------------------------------

export function getAppointmentsMap(): Map<string, AppointmentRecord> { return appointments; }
export function getSubscriptionsByKeyMap(): Map<string, string> { return subscriptionsByKey; }
export function getSubscriptionsByTokenMap(): Map<string, IcalSubscription> { return subscriptionsByToken; }

// ---------------------------------------------------------------------------
// Appointments CRUD
// ---------------------------------------------------------------------------

export async function findAppointmentById(id: string): Promise<AppointmentRecord | null> {
    if (appointments.has(id)) return appointments.get(id)!;
    const { data, error } = await db.from('appointments').select('*').eq('id', id).single();
    if (error || !data) return null;
    const appt = rowToAppointment(data);
    appointments.set(appt.id, appt);
    return appt;
}

export async function findAppointmentsByWedding(weddingId: string): Promise<AppointmentRecord[]> {
    const { data, error } = await db.from('appointments').select('*').eq('wedding_id', weddingId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToAppointment);
    for (const a of results) appointments.set(a.id, a);
    return results;
}

export async function createAppointment(appointment: AppointmentRecord): Promise<AppointmentRecord> {
    const { data, error } = await db.from('appointments').insert({
        id: appointment.id,
        wedding_id: appointment.weddingId,
        title: appointment.title,
        start_at: appointment.startAt.toISOString(),
        end_at: appointment.endAt.toISOString(),
        timezone: appointment.timezone,
        location_or_link: appointment.locationOrLink ?? null,
        notes: appointment.notes?.value ?? null,
        visibility_scope: appointment.visibilityScope,
        created_by: null,
        created_at: appointment.createdAt.toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToAppointment(data);
    appointments.set(result.id, result);
    return result;
}

export async function updateAppointment(id: string, patch: Partial<AppointmentRecord>): Promise<AppointmentRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.startAt !== undefined) dbPatch.start_at = patch.startAt instanceof Date ? patch.startAt.toISOString() : patch.startAt;
    if (patch.endAt !== undefined) dbPatch.end_at = patch.endAt instanceof Date ? patch.endAt.toISOString() : patch.endAt;
    if (patch.locationOrLink !== undefined) dbPatch.location_or_link = patch.locationOrLink;
    if (patch.visibilityScope !== undefined) dbPatch.visibility_scope = patch.visibilityScope;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes?.value ?? null;

    const { data, error } = await db.from('appointments').update(dbPatch).eq('id', id).select().single();
    if (error || !data) return null;
    const updated = rowToAppointment(data);
    const existing = appointments.get(id);
    if (existing) {
        const merged = { ...existing, ...updated };
        appointments.set(id, merged);
        return merged;
    }
    appointments.set(id, updated);
    return updated;
}

export async function removeAppointment(id: string): Promise<AppointmentRecord | null> {
    const existing = appointments.get(id) ?? await findAppointmentById(id);
    if (!existing) return null;
    const { error } = await db.from('appointments').delete().eq('id', id);
    if (error) throw new Error(error.message);
    appointments.delete(id);
    return existing;
}

export function getAppointmentSync(id: string): AppointmentRecord | null {
    return appointments.get(id) ?? null;
}

export function setAppointmentSync(appointment: AppointmentRecord): void {
    appointments.set(appointment.id, appointment);
    // Fire-and-forget
    db.from('appointments').upsert({
        id: appointment.id,
        wedding_id: appointment.weddingId,
        title: appointment.title,
        start_at: appointment.startAt.toISOString(),
        end_at: appointment.endAt.toISOString(),
        timezone: appointment.timezone,
        location_or_link: appointment.locationOrLink ?? null,
        notes: appointment.notes?.value ?? null,
        visibility_scope: appointment.visibilityScope,
        created_at: appointment.createdAt.toISOString(),
    }, { onConflict: 'id' }).then(() => {});
}

// ---------------------------------------------------------------------------
// iCal subscription store
// ---------------------------------------------------------------------------

export async function findIcalToken(weddingId: string, userId: string): Promise<string | null> {
    const key = `${weddingId}:${userId}`;
    if (subscriptionsByKey.has(key)) return subscriptionsByKey.get(key)!;
    const { data, error } = await db
        .from('ical_tokens')
        .select('token')
        .eq('wedding_id', weddingId)
        .eq('user_id', userId)
        .single();
    if (error || !data) return null;
    subscriptionsByKey.set(key, data.token);
    return data.token;
}

export async function findIcalSubscription(token: string): Promise<IcalSubscription | null> {
    if (subscriptionsByToken.has(token)) return subscriptionsByToken.get(token)!;
    const { data, error } = await db.from('ical_tokens').select('*').eq('token', token).single();
    if (error || !data) return null;
    const sub = rowToIcalSubscription(data);
    subscriptionsByToken.set(token, sub);
    return sub;
}

export async function createIcalToken(
    weddingId: string,
    userId: string,
    token: string,
    subscription: IcalSubscription
): Promise<string> {
    await db.from('ical_tokens').insert({
        token,
        user_id: userId,
        wedding_id: weddingId,
        created_at: new Date().toISOString(),
    });
    const key = `${weddingId}:${userId}`;
    subscriptionsByKey.set(key, token);
    subscriptionsByToken.set(token, subscription);
    return token;
}

export async function updateIcalSubscription(token: string, patch: Partial<IcalSubscription>): Promise<IcalSubscription | null> {
    const existing = subscriptionsByToken.get(token);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    subscriptionsByToken.set(token, updated);
    return updated;
}

export async function revokeIcalSubscription(token: string): Promise<void> {
    const subscription = subscriptionsByToken.get(token);
    if (subscription) {
        subscription.revokedAt = new Date();
        subscriptionsByToken.set(token, subscription);
        subscriptionsByKey.delete(`${subscription.weddingId}:${subscription.userId}`);
    }
    await db.from('ical_tokens').delete().eq('token', token);
}

export async function findActiveSubscriptionsByWeddingAndOrg(weddingId: string, supplierOrgId: string): Promise<IcalSubscription[]> {
    return Array.from(subscriptionsByToken.values()).filter(
        sub =>
            sub.weddingId === weddingId &&
            sub.supplierOrgIds.includes(supplierOrgId) &&
            !sub.isOwner &&
            !sub.isPlatformAdmin &&
            !sub.revokedAt
    );
}

export function getAllSubscriptionsByToken(): Map<string, IcalSubscription> {
    return subscriptionsByToken;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearAppointmentsStoreForTests(): void {
    appointments.clear();
    subscriptionsByKey.clear();
    subscriptionsByToken.clear();
}
