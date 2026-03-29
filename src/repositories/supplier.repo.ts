// Repository for supplier directory profiles.
// Async functions use Supabase; in-memory Map kept for sync access by SupplierDirectoryService.

import { db } from '../db/client';

export type SupplierBudgetTier = '€' | '€€' | '€€€' | '€€€€' | '€€€€€';

export type SupplierRecord = {
    id: string;
    supplierOrgId: string;
    name: string;
    location: string;
    category: string;
    budgetTier: SupplierBudgetTier;
    rating: number;
    reviewsCount: number;
    photoUrl: string;
    description: string;
    services: string[];
    email: string;
    website?: string;
    instagram?: string;
    tiktok?: string;
};

// ---------------------------------------------------------------------------
// In-memory store (kept for sync access by SupplierDirectoryService)
// ---------------------------------------------------------------------------

const profiles = new Map<string, SupplierRecord>();

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function rowToSupplier(row: any): SupplierRecord {
    return {
        id: row.user_id,
        supplierOrgId: row.user_id,
        name: row.name ?? '',
        location: row.location ?? '',
        category: row.category ?? '',
        budgetTier: '€€' as SupplierBudgetTier,
        rating: 0,
        reviewsCount: 0,
        photoUrl: '',
        description: row.bio ?? '',
        services: [],
        email: '',
        website: row.website ?? undefined,
        instagram: row.instagram ?? undefined,
        tiktok: undefined,
    };
}

// ---------------------------------------------------------------------------
// Sync accessor (for SupplierDirectoryService which uses the Map directly)
// ---------------------------------------------------------------------------

export function getInMemoryMap(): Map<string, SupplierRecord> { return profiles; }

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function findProfileById(id: string): Promise<SupplierRecord | null> {
    if (profiles.has(id)) return profiles.get(id)!;
    const { data, error } = await db.from('supplier_profiles').select('*').eq('user_id', id).single();
    if (error || !data) return null;
    const record = rowToSupplier(data);
    profiles.set(record.id, record);
    return record;
}

export async function findProfileByOrgId(supplierOrgId: string): Promise<SupplierRecord | null> {
    const cached = Array.from(profiles.values()).find(p => p.supplierOrgId === supplierOrgId);
    if (cached) return cached;
    const { data, error } = await db.from('supplier_profiles').select('*').eq('user_id', supplierOrgId).single();
    if (error || !data) return null;
    const record = rowToSupplier(data);
    profiles.set(record.id, record);
    return record;
}

export async function findProfileByEmail(email: string): Promise<SupplierRecord | null> {
    const normalized = email.trim().toLowerCase();
    // supplier_profiles doesn't have email — look up user by email first
    const { data: userData } = await db.from('users').select('id').eq('email', normalized).single();
    if (!userData) return null;
    return findProfileById(userData.id);
}

export async function findAllProfiles(): Promise<SupplierRecord[]> {
    const { data, error } = await db.from('supplier_profiles').select('*');
    if (error) throw new Error(error.message);
    const records = (data ?? []).map(rowToSupplier);
    for (const r of records) profiles.set(r.id, r);
    return records;
}

export async function upsertProfile(record: SupplierRecord): Promise<SupplierRecord> {
    await db.from('supplier_profiles').upsert({
        user_id: record.id,
        name: record.name,
        category: record.category,
        location: record.location,
        website: record.website ?? null,
        instagram: record.instagram ?? null,
        bio: record.description,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    profiles.set(record.id, record);
    return record;
}

export async function seedProfiles(records: SupplierRecord[]): Promise<void> {
    for (const record of records) {
        profiles.set(record.id, { ...record });
        // Fire-and-forget upsert
        db.from('supplier_profiles').upsert({
            user_id: record.id,
            name: record.name,
            category: record.category,
            location: record.location,
            website: record.website ?? null,
            instagram: record.instagram ?? null,
            bio: record.description,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }).then(() => {});
    }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearSupplierStoreForTests(): void {
    profiles.clear();
}
