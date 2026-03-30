// Repository for weddings, supplier assignments, staff assignments, and dashboard users.
// Async functions use Supabase; sync accessors keep in-memory Maps for synchronous services.

import { db } from '../db/client';

export type WeddingStatus = 'draft' | 'invited' | 'active' | 'completed' | 'canceled';

export type Wedding = {
    id: string;
    title: string;
    wedding_date: string;
    timezone: string;
    status: WeddingStatus;
    location: string;
    coupleNames: string[];
    created_by_user_id?: string;
    notes?: string;
    contact_email?: string;
    category_data?: Record<string, string>;
    /** Globale bruiloftsvariabelen — gedeeld door alle leveranciers */
    wedding_info?: Record<string, string>;
};

export type Assignment = {
    weddingId: string;
    supplierOrgId: string;
    status: 'invited' | 'active' | 'removed';
    category: string;
};

export type StaffAssignment = {
    weddingId: string;
    supplierOrgId: string;
    userId: string;
};

export type DashboardUser = {
    id: string;
    name: string;
};

// ---------------------------------------------------------------------------
// In-memory stores (kept for sync access by DashboardService / tests)
// ---------------------------------------------------------------------------

const weddingsStore = new Map<string, Wedding>();
export const weddingsArray: Wedding[] = [];

const assignmentsStore: Assignment[] = [];
const staffAssignmentsStore: StaffAssignment[] = [];
const usersStore: DashboardUser[] = [];

let seeded = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToWedding(row: any): Wedding {
    return {
        id: row.id,
        title: row.title,
        wedding_date: row.wedding_date,
        timezone: row.timezone ?? 'Europe/Amsterdam',
        status: row.status,
        location: row.location ?? '',
        coupleNames: row.couple_names ?? [],
        created_by_user_id: row.owner_id,
        notes: row.notes,
        contact_email: row.contact_email,
        category_data: row.category_data,
        wedding_info: row.wedding_info ?? {},
    };
}

function rowToAssignment(row: any): Assignment {
    return {
        weddingId: row.wedding_id,
        supplierOrgId: row.supplier_org_id,
        status: row.status,
        category: row.category ?? '',
    };
}

function rowToStaffAssignment(row: any): StaffAssignment {
    return {
        weddingId: row.wedding_id,
        supplierOrgId: row.supplier_org_id ?? '',
        userId: row.user_id,
    };
}

export function _initWeddingsSeedOnce(
    weddings: Wedding[],
    assignments: Assignment[],
    staff: StaffAssignment[],
    users: DashboardUser[]
): void {
    if (seeded) return;
    seeded = true;
    for (const w of weddings) {
        weddingsStore.set(w.id, w);
        weddingsArray.push(w);
    }
    assignmentsStore.push(...assignments);
    staffAssignmentsStore.push(...staff);
    usersStore.push(...users);
}

// ---------------------------------------------------------------------------
// Weddings
// ---------------------------------------------------------------------------

export async function findWeddingById(id: string): Promise<Wedding | null> {
    if (weddingsStore.has(id)) return weddingsStore.get(id)!;
    const { data, error } = await db.from('weddings').select('*').eq('id', id).single();
    if (error || !data) return null;
    const wedding = rowToWedding(data);
    weddingsStore.set(id, wedding);
    return wedding;
}

export async function findAllWeddings(): Promise<Wedding[]> {
    const { data, error } = await db.from('weddings').select('*');
    if (error) throw new Error(error.message);
    const weddings = (data ?? []).map(rowToWedding);
    // Sync store
    for (const w of weddings) {
        if (!weddingsStore.has(w.id)) {
            weddingsStore.set(w.id, w);
            weddingsArray.push(w);
        }
    }
    return weddings;
}

export async function createWedding(wedding: Wedding): Promise<Wedding> {
    const { data, error } = await db.from('weddings').insert({
        id: wedding.id,
        title: wedding.title,
        wedding_date: wedding.wedding_date,
        location: wedding.location,
        status: wedding.status,
        owner_id: wedding.created_by_user_id,
        couple_names: wedding.coupleNames,
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToWedding(data);
    weddingsStore.set(result.id, result);
    if (!weddingsArray.some(w => w.id === result.id)) {
        weddingsArray.push(result);
    }
    return result;
}

/** Sync version for use by DashboardService (which is synchronous). */
export function insertWeddingSync(wedding: Wedding): void {
    weddingsStore.set(wedding.id, wedding);
    if (!weddingsArray.includes(wedding)) {
        weddingsArray.push(wedding);
    }
    // Fire-and-forget to Supabase
    db.from('weddings').upsert({
        id: wedding.id,
        title: wedding.title,
        wedding_date: wedding.wedding_date,
        location: wedding.location,
        status: wedding.status,
        owner_id: wedding.created_by_user_id,
        couple_names: wedding.coupleNames,
    }, { onConflict: 'id' }).then(() => {});
}

export async function updateWedding(id: string, patch: Partial<Wedding>): Promise<Wedding | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.wedding_date !== undefined) dbPatch.wedding_date = patch.wedding_date;
    if (patch.location !== undefined) dbPatch.location = patch.location;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.coupleNames !== undefined) dbPatch.couple_names = patch.coupleNames;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.contact_email !== undefined) dbPatch.contact_email = patch.contact_email;
    if (patch.category_data !== undefined) dbPatch.category_data = patch.category_data;
    if (patch.wedding_info !== undefined) dbPatch.wedding_info = patch.wedding_info;

    const { data, error } = await db.from('weddings').update(dbPatch).eq('id', id).select().single();
    if (error || !data) return null;
    const updated = rowToWedding(data);
    const existing = weddingsStore.get(id);
    if (existing) Object.assign(existing, updated);
    else weddingsStore.set(id, updated);
    return weddingsStore.get(id)!;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function findAssignmentsByWedding(weddingId: string): Promise<Assignment[]> {
    const { data, error } = await db.from('supplier_assignments').select('*').eq('wedding_id', weddingId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToAssignment);
}

export async function findAssignmentsBySupplier(supplierOrgId: string): Promise<Assignment[]> {
    const { data, error } = await db.from('supplier_assignments').select('*').eq('supplier_org_id', supplierOrgId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToAssignment);
}

export async function findAssignment(weddingId: string, supplierOrgId: string): Promise<Assignment | null> {
    const { data, error } = await db
        .from('supplier_assignments')
        .select('*')
        .eq('wedding_id', weddingId)
        .eq('supplier_org_id', supplierOrgId)
        .single();
    if (error || !data) return null;
    return rowToAssignment(data);
}

export async function createAssignment(assignment: Assignment): Promise<Assignment> {
    const { data, error } = await db.from('supplier_assignments').insert({
        wedding_id: assignment.weddingId,
        supplier_org_id: assignment.supplierOrgId,
        status: assignment.status,
        category: assignment.category,
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToAssignment(data);
    // Sync local store
    const existingIdx = assignmentsStore.findIndex(a => a.weddingId === result.weddingId && a.supplierOrgId === result.supplierOrgId);
    if (existingIdx >= 0) assignmentsStore[existingIdx] = result;
    else assignmentsStore.push(result);
    return result;
}

/** Sync version for DashboardService (synchronous). */
export function insertAssignmentSync(assignment: Assignment): void {
    const existing = assignmentsStore.find(a => a.weddingId === assignment.weddingId && a.supplierOrgId === assignment.supplierOrgId);
    if (existing) {
        Object.assign(existing, assignment);
    } else {
        assignmentsStore.push(assignment);
    }
    // Fire-and-forget
    db.from('supplier_assignments').upsert({
        wedding_id: assignment.weddingId,
        supplier_org_id: assignment.supplierOrgId,
        status: assignment.status,
        category: assignment.category,
    }, { onConflict: 'wedding_id,supplier_org_id' }).then(() => {});
}

/** Sync version for DashboardService (synchronous). */
export function insertStaffAssignmentSync(sa: StaffAssignment): void {
    const exists = staffAssignmentsStore.some(
        s => s.weddingId === sa.weddingId && s.supplierOrgId === sa.supplierOrgId && s.userId === sa.userId
    );
    if (!exists) staffAssignmentsStore.push(sa);
    // Fire-and-forget
    db.from('staff_assignments').upsert({
        wedding_id: sa.weddingId,
        user_id: sa.userId,
        role: sa.supplierOrgId, // map supplierOrgId to role field
    }, { onConflict: 'wedding_id,user_id' }).then(() => {});
}

/** Sync version for DashboardService (synchronous). */
export function insertDashboardUserSync(user: DashboardUser): void {
    if (!usersStore.some(u => u.id === user.id)) {
        usersStore.push(user);
    }
}

export async function updateAssignment(weddingId: string, supplierOrgId: string, patch: Partial<Assignment>): Promise<Assignment | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.category !== undefined) dbPatch.category = patch.category;

    const { data, error } = await db
        .from('supplier_assignments')
        .update(dbPatch)
        .eq('wedding_id', weddingId)
        .eq('supplier_org_id', supplierOrgId)
        .select()
        .single();
    if (error || !data) return null;
    const updated = rowToAssignment(data);
    const existing = assignmentsStore.find(a => a.weddingId === weddingId && a.supplierOrgId === supplierOrgId);
    if (existing) Object.assign(existing, updated);
    return updated;
}

export async function getAllAssignments(): Promise<Assignment[]> {
    const { data, error } = await db.from('supplier_assignments').select('*');
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToAssignment);
}

// ---------------------------------------------------------------------------
// Staff Assignments
// ---------------------------------------------------------------------------

export async function findStaffByWedding(weddingId: string): Promise<StaffAssignment[]> {
    const { data, error } = await db.from('staff_assignments').select('*').eq('wedding_id', weddingId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToStaffAssignment);
}

export async function findStaffByUser(userId: string, supplierOrgId: string): Promise<StaffAssignment[]> {
    const { data, error } = await db
        .from('staff_assignments')
        .select('*')
        .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToStaffAssignment).filter(sa => sa.supplierOrgId === supplierOrgId);
}

export async function findStaffAssignment(weddingId: string, supplierOrgId: string, userId: string): Promise<StaffAssignment | null> {
    const { data, error } = await db
        .from('staff_assignments')
        .select('*')
        .eq('wedding_id', weddingId)
        .eq('user_id', userId)
        .single();
    if (error || !data) return null;
    return rowToStaffAssignment(data);
}

export async function createStaffAssignment(sa: StaffAssignment): Promise<StaffAssignment> {
    const { data, error } = await db.from('staff_assignments').insert({
        wedding_id: sa.weddingId,
        user_id: sa.userId,
        role: sa.supplierOrgId,
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToStaffAssignment(data);
    staffAssignmentsStore.push(result);
    return result;
}

export async function getAllStaffAssignments(): Promise<StaffAssignment[]> {
    const { data, error } = await db.from('staff_assignments').select('*');
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToStaffAssignment);
}

// ---------------------------------------------------------------------------
// Dashboard users (light user list for display purposes)
// ---------------------------------------------------------------------------

export async function findDashboardUserById(id: string): Promise<DashboardUser | null> {
    const cached = usersStore.find(u => u.id === id);
    if (cached) return cached;
    const { data, error } = await db.from('users').select('id, name').eq('id', id).single();
    if (error || !data) return null;
    return { id: data.id, name: data.name };
}

export async function getAllDashboardUsers(): Promise<DashboardUser[]> {
    if (usersStore.length > 0) return [...usersStore];
    const { data, error } = await db.from('users').select('id, name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => ({ id: row.id, name: row.name }));
}

export async function upsertDashboardUser(user: DashboardUser): Promise<DashboardUser> {
    const existing = usersStore.find(u => u.id === user.id);
    if (!existing) {
        usersStore.push(user);
    }
    return existing ?? user;
}

// ---------------------------------------------------------------------------
// Raw access needed by DashboardService aggregate queries
// ---------------------------------------------------------------------------

export function _getRawStore() {
    return {
        weddings: weddingsStore,
        weddingsArray,
        assignments: assignmentsStore,
        staffAssignments: staffAssignmentsStore,
        users: usersStore,
    };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearWeddingsStoreForTests(): void {
    weddingsStore.clear();
    weddingsArray.length = 0;
    assignmentsStore.length = 0;
    staffAssignmentsStore.length = 0;
    usersStore.length = 0;
    seeded = false;
}

export function _setWeddingsDataForTests(
    weddings: Wedding[],
    assignments: Assignment[],
    staff: StaffAssignment[],
    users: DashboardUser[]
): void {
    _clearWeddingsStoreForTests();
    seeded = true;
    for (const w of weddings) {
        weddingsStore.set(w.id, w);
        weddingsArray.push(w);
    }
    assignmentsStore.push(...assignments);
    staffAssignmentsStore.push(...staff);
    usersStore.push(...users);
}
