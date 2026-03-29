// Repository for supplier invitations and the first-run onboarding checklist.
// Async functions use Supabase; checklist/shown-set stays in-memory (UI state).

import { db } from '../db/client';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export type InvitationRecord = {
    id: string;
    type: string;
    target_email: string;
    target_user_id: string | null;
    issuer_user_id: string;
    wedding_id: string | null;
    supplier_org_id: string | null;
    status: InvitationStatus;
    token_hash: string;
    expires_at: Date;
    accepted_at: Date | null;
    declined_at: Date | null;
    revoked_at: Date | null;
    metadata_json: Record<string, unknown>;
    created_at: Date;
};

// ---------------------------------------------------------------------------
// In-memory stores (kept for sync access by InvitationService + checklist UI)
// ---------------------------------------------------------------------------

const invitations = new Map<string, InvitationRecord>();
const rawTokenByInvitationId = new Map<string, string>();
const checklist = new Map<string, Map<string, boolean>>();
const checklistShown = new Set<string>();

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function rowToInvitation(row: any): InvitationRecord {
    return {
        id: row.id,
        type: row.type,
        target_email: row.invited_email ?? '',
        target_user_id: row.invited_email ?? null, // no separate target_user_id column; leave null
        issuer_user_id: row.invited_by_user_id ?? '',
        wedding_id: row.wedding_id ?? null,
        supplier_org_id: row.supplier_org_id ?? null,
        status: row.status,
        token_hash: row.token ?? '',
        expires_at: row.expires_at ? new Date(row.expires_at) : new Date(0),
        accepted_at: null,
        declined_at: null,
        revoked_at: null,
        metadata_json: row.message ? { message: row.message } : {},
        created_at: new Date(row.created_at),
    };
}

// ---------------------------------------------------------------------------
// Sync accessors (for services that are synchronous)
// ---------------------------------------------------------------------------

/** Returns the underlying Map — for use by InvitationService which is synchronous. */
export function getInvitationsMap(): Map<string, InvitationRecord> {
    return invitations;
}

export function getRawTokenMap(): Map<string, string> {
    return rawTokenByInvitationId;
}

export function getChecklistMap(): Map<string, Map<string, boolean>> {
    return checklist;
}

export function getChecklistShownSet(): Set<string> {
    return checklistShown;
}

// ---------------------------------------------------------------------------
// Invitation CRUD
// ---------------------------------------------------------------------------

export async function findInvitationById(id: string): Promise<InvitationRecord | null> {
    if (invitations.has(id)) return invitations.get(id)!;
    const { data, error } = await db.from('invitations').select('*').eq('id', id).single();
    if (error || !data) return null;
    const inv = rowToInvitation(data);
    invitations.set(inv.id, inv);
    return inv;
}

export async function findInvitationByToken(tokenHash: string): Promise<InvitationRecord | null> {
    const cached = Array.from(invitations.values()).find(inv => inv.token_hash === tokenHash);
    if (cached) return cached;
    const { data, error } = await db.from('invitations').select('*').eq('token', tokenHash).single();
    if (error || !data) return null;
    const inv = rowToInvitation(data);
    invitations.set(inv.id, inv);
    return inv;
}

export async function findAllInvitations(): Promise<InvitationRecord[]> {
    const { data, error } = await db.from('invitations').select('*');
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToInvitation);
    for (const inv of results) invitations.set(inv.id, inv);
    return results;
}

export async function findInvitationsByWedding(weddingId: string): Promise<InvitationRecord[]> {
    const { data, error } = await db.from('invitations').select('*').eq('wedding_id', weddingId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToInvitation);
    for (const inv of results) invitations.set(inv.id, inv);
    return results;
}

export async function findInvitationsByEmail(email: string): Promise<InvitationRecord[]> {
    const normalized = email.trim().toLowerCase();
    const { data, error } = await db.from('invitations').select('*').eq('invited_email', normalized);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToInvitation);
    for (const inv of results) invitations.set(inv.id, inv);
    return results;
}

export async function createInvitation(record: InvitationRecord, rawToken: string): Promise<InvitationRecord> {
    const { data, error } = await db.from('invitations').insert({
        id: record.id,
        wedding_id: record.wedding_id,
        invited_by_user_id: record.issuer_user_id,
        invited_email: record.target_email,
        supplier_org_id: record.supplier_org_id,
        type: record.type,
        status: record.status,
        token: record.token_hash,
        message: (record.metadata_json?.message as string) ?? null,
        expires_at: record.expires_at.toISOString(),
        created_at: record.created_at.toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const inv = rowToInvitation(data);
    invitations.set(inv.id, inv);
    rawTokenByInvitationId.set(inv.id, rawToken);
    return inv;
}

export async function updateInvitation(id: string, patch: Partial<InvitationRecord>): Promise<InvitationRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.target_email !== undefined) dbPatch.invited_email = patch.target_email;
    if (patch.token_hash !== undefined) dbPatch.token = patch.token_hash;
    if (patch.expires_at !== undefined) dbPatch.expires_at = patch.expires_at instanceof Date ? patch.expires_at.toISOString() : patch.expires_at;

    const { data, error } = await db.from('invitations').update(dbPatch).eq('id', id).select().single();
    if (error || !data) return null;
    const updated = rowToInvitation(data);
    invitations.set(id, updated);
    return updated;
}

export async function getRawToken(invitationId: string): Promise<string | null> {
    return rawTokenByInvitationId.get(invitationId) ?? null;
}

export async function removeRawToken(invitationId: string): Promise<void> {
    rawTokenByInvitationId.delete(invitationId);
}

// ---------------------------------------------------------------------------
// Checklist (in-memory UI state — not persisted)
// ---------------------------------------------------------------------------

export async function getChecklistForUser(userId: string): Promise<Map<string, boolean>> {
    return checklist.get(userId) ?? new Map();
}

export async function setChecklistItem(userId: string, itemId: string, completed: boolean): Promise<void> {
    const userChecklist = checklist.get(userId) ?? new Map<string, boolean>();
    userChecklist.set(itemId, completed);
    checklist.set(userId, userChecklist);
}

export async function hasSeenChecklist(userId: string): Promise<boolean> {
    return checklistShown.has(userId);
}

export async function markChecklistShown(userId: string): Promise<void> {
    checklistShown.add(userId);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearInvitationsStoreForTests(): void {
    invitations.clear();
    rawTokenByInvitationId.clear();
    checklist.clear();
    checklistShown.clear();
}
