// Repository for Run-of-Show drafts, published versions, acknowledgements, and change requests.
// Async functions use Supabase; sync Map accessors kept for ROSService (synchronous internally).

import { db } from '../db/client';

export type RosItemType = 'ceremony' | 'reception' | 'dinner' | 'party' | 'logistics' | 'other';
export type VisibilityScope = 'all_published' | 'selected_suppliers' | 'couple_only';
export type ChangeRequestStatus = 'submitted' | 'accepted' | 'rejected' | 'included_in_version';
export type ChangeRequestType =
    | 'time_change'
    | 'instruction_change'
    | 'ownership_clarification'
    | 'location_clarification';

export type RunSheetItem = {
    id: string;
    wedding_id: string;
    sort_index: number;
    start_at: string;
    end_at: string;
    title: string;
    item_type: RosItemType;
    location: string | null;
    owner_role: string | null;
    owner_supplier_org_id: string | null;
    owner_supplier_org_ids: string[];
    primary_contact_name: string | null;
    primary_contact_phone: string | null;
    instructions: string;
    private_notes: string;
    visibility_scope: VisibilityScope;
    created_at: string;
};

export type RunSheet = {
    id: string;
    wedding_id: string;
    draft_json: RunSheetItem[];
    updated_at: string;
    updated_by: string;
};

export type RunSheetVersion = {
    id: string;
    wedding_id: string;
    version_number: number;
    published_at: string;
    published_by_user_id: string;
    snapshot_json: RunSheetItem[];
    change_summary: string;
    suppliers_shared_to: string[];
};

export type RunSheetAcknowledgement = {
    run_sheet_version_id: string;
    supplier_org_id: string;
    acknowledged_at: string;
    acknowledged_by_user_id: string;
};

export type RunSheetChangeRequest = {
    id: string;
    wedding_id: string;
    run_sheet_version_id: string;
    item_id: string;
    supplier_org_id: string;
    requester_user_id: string;
    request_type: ChangeRequestType;
    proposed_start_at: string | null;
    proposed_end_at: string | null;
    proposed_instruction: string | null;
    reason: string;
    attachment_ids: string[];
    status: ChangeRequestStatus;
    resolved_at: string | null;
    resolved_by: string | null;
    rejection_reason: string | null;
    included_in_version_number: number | null;
    created_at: string;
};

// ---------------------------------------------------------------------------
// In-memory stores (kept for sync access by ROSService)
// ---------------------------------------------------------------------------

const runSheetsByWedding = new Map<string, RunSheet>();
const runSheetItemsByWedding = new Map<string, Map<string, RunSheetItem>>();
const runSheetVersionsByWedding = new Map<string, RunSheetVersion[]>();
const acknowledgements = new Map<string, RunSheetAcknowledgement>();
const changeRequests = new Map<string, RunSheetChangeRequest>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToVersion(row: any): RunSheetVersion {
    return {
        id: row.id,
        wedding_id: row.wedding_id,
        version_number: row.version_number,
        published_at: row.published_at,
        published_by_user_id: row.published_by ?? '',
        snapshot_json: Array.isArray(row.items) ? row.items : [],
        change_summary: row.change_summary ?? '',
        suppliers_shared_to: [],
    };
}

function rowToChangeRequest(row: any): RunSheetChangeRequest {
    const pv = row.proposed_values ?? {};
    return {
        id: row.id,
        wedding_id: row.wedding_id ?? '',
        run_sheet_version_id: row.version_id,
        item_id: row.item_id,
        supplier_org_id: row.supplier_org_id,
        requester_user_id: row.user_id,
        request_type: row.type as ChangeRequestType,
        proposed_start_at: pv.start_at ?? null,
        proposed_end_at: pv.end_at ?? null,
        proposed_instruction: pv.instruction ?? null,
        reason: row.reason ?? '',
        attachment_ids: [],
        status: row.status as ChangeRequestStatus,
        resolved_at: row.resolved_at ?? null,
        resolved_by: row.resolved_by ?? null,
        rejection_reason: row.rejection_reason ?? null,
        included_in_version_number: null,
        created_at: row.created_at,
    };
}

// ---------------------------------------------------------------------------
// Sync Map accessors (for ROSService which is internally synchronous)
// ---------------------------------------------------------------------------

export function getRunSheetsByWeddingMap(): Map<string, RunSheet> { return runSheetsByWedding; }
export function getRunSheetItemsByWeddingMap(): Map<string, Map<string, RunSheetItem>> { return runSheetItemsByWedding; }
export function getRunSheetVersionsByWeddingMap(): Map<string, RunSheetVersion[]> { return runSheetVersionsByWedding; }
export function getAcknowledgementsMap(): Map<string, RunSheetAcknowledgement> { return acknowledgements; }

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function findDraftByWedding(weddingId: string): Promise<RunSheet | null> {
    if (runSheetsByWedding.has(weddingId)) return runSheetsByWedding.get(weddingId)!;
    const { data, error } = await db.from('ros_drafts').select('*').eq('wedding_id', weddingId).single();
    if (error || !data) return null;
    const runSheet: RunSheet = {
        id: data.wedding_id,
        wedding_id: data.wedding_id,
        draft_json: Array.isArray(data.draft_json) ? data.draft_json : [],
        updated_at: data.updated_at,
        updated_by: data.updated_by ?? '',
    };
    runSheetsByWedding.set(weddingId, runSheet);
    // Rebuild item map
    const itemMap = new Map<string, RunSheetItem>();
    for (const item of runSheet.draft_json) {
        itemMap.set(item.id, item);
    }
    runSheetItemsByWedding.set(weddingId, itemMap);
    return runSheet;
}

export async function upsertDraft(runSheet: RunSheet, itemMap: Map<string, RunSheetItem>): Promise<RunSheet> {
    runSheetsByWedding.set(runSheet.wedding_id, runSheet);
    runSheetItemsByWedding.set(runSheet.wedding_id, itemMap);

    const { error } = await db.from('ros_drafts').upsert({
        wedding_id: runSheet.wedding_id,
        draft_json: runSheet.draft_json,
        updated_by: runSheet.updated_by,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'wedding_id' });
    if (error) throw new Error(error.message);
    return runSheet;
}

export function getItemsByWedding(weddingId: string): Map<string, RunSheetItem> {
    return runSheetItemsByWedding.get(weddingId) ?? new Map();
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function findVersionsByWedding(weddingId: string): Promise<RunSheetVersion[]> {
    const { data, error } = await db
        .from('ros_versions')
        .select('*')
        .eq('wedding_id', weddingId)
        .order('version_number', { ascending: true });
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToVersion);
    runSheetVersionsByWedding.set(weddingId, results);
    return results;
}

export async function findLatestVersion(weddingId: string): Promise<RunSheetVersion | null> {
    const { data, error } = await db
        .from('ros_versions')
        .select('*')
        .eq('wedding_id', weddingId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();
    if (error || !data) return null;
    return rowToVersion(data);
}

export async function createVersion(version: RunSheetVersion): Promise<RunSheetVersion> {
    const { data, error } = await db.from('ros_versions').insert({
        id: version.id,
        wedding_id: version.wedding_id,
        version_number: version.version_number,
        items: version.snapshot_json,
        published_by: version.published_by_user_id,
        change_summary: version.change_summary,
        published_at: version.published_at,
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToVersion(data);
    // Sync in-memory
    const versions = runSheetVersionsByWedding.get(version.wedding_id) ?? [];
    versions.push(result);
    runSheetVersionsByWedding.set(version.wedding_id, versions);
    return result;
}

export async function findVersionById(versionId: string): Promise<RunSheetVersion | null> {
    // Check in-memory first
    for (const versions of runSheetVersionsByWedding.values()) {
        const found = versions.find(v => v.id === versionId);
        if (found) return found;
    }
    const { data, error } = await db.from('ros_versions').select('*').eq('id', versionId).single();
    if (error || !data) return null;
    return rowToVersion(data);
}

// ---------------------------------------------------------------------------
// Acknowledgements
// ---------------------------------------------------------------------------

export async function createAcknowledgement(ack: RunSheetAcknowledgement): Promise<RunSheetAcknowledgement> {
    const key = `${ack.run_sheet_version_id}:${ack.supplier_org_id}`;
    acknowledgements.set(key, ack);
    // Note: no acknowledgements table in schema — store in-memory only
    return ack;
}

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------

export async function findChangeRequestById(id: string): Promise<RunSheetChangeRequest | null> {
    if (changeRequests.has(id)) return changeRequests.get(id)!;
    const { data, error } = await db.from('ros_change_requests').select('*').eq('id', id).single();
    if (error || !data) return null;
    const cr = rowToChangeRequest(data);
    changeRequests.set(cr.id, cr);
    return cr;
}

export async function findChangeRequestsByOrg(supplierOrgId: string): Promise<RunSheetChangeRequest[]> {
    const { data, error } = await db.from('ros_change_requests').select('*').eq('supplier_org_id', supplierOrgId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToChangeRequest);
    for (const r of results) changeRequests.set(r.id, r);
    return results;
}

export async function findChangeRequestsByVersion(versionId: string): Promise<RunSheetChangeRequest[]> {
    const { data, error } = await db.from('ros_change_requests').select('*').eq('version_id', versionId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToChangeRequest);
    for (const r of results) changeRequests.set(r.id, r);
    return results;
}

export async function findChangeRequestsByWedding(weddingId: string): Promise<RunSheetChangeRequest[]> {
    // Join through version to get wedding_id — query by all versions for this wedding
    const cached = Array.from(changeRequests.values()).filter(r => r.wedding_id === weddingId);
    if (cached.length > 0) return cached;
    const { data, error } = await db
        .from('ros_change_requests')
        .select('*, ros_versions!inner(wedding_id)')
        .eq('ros_versions.wedding_id', weddingId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToChangeRequest);
    for (const r of results) changeRequests.set(r.id, r);
    return results;
}

export async function createChangeRequest(request: RunSheetChangeRequest): Promise<RunSheetChangeRequest> {
    const proposedValues: Record<string, unknown> = {};
    if (request.proposed_start_at) proposedValues.start_at = request.proposed_start_at;
    if (request.proposed_end_at) proposedValues.end_at = request.proposed_end_at;
    if (request.proposed_instruction) proposedValues.instruction = request.proposed_instruction;

    const { data, error } = await db.from('ros_change_requests').insert({
        id: request.id,
        version_id: request.run_sheet_version_id,
        item_id: request.item_id,
        supplier_org_id: request.supplier_org_id,
        user_id: request.requester_user_id,
        type: request.request_type,
        reason: request.reason,
        proposed_values: proposedValues,
        status: request.status,
        created_at: request.created_at,
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToChangeRequest(data);
    result.wedding_id = request.wedding_id;
    changeRequests.set(result.id, result);
    return result;
}

export async function updateChangeRequest(id: string, patch: Partial<RunSheetChangeRequest>): Promise<RunSheetChangeRequest | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.resolved_at !== undefined) dbPatch.resolved_at = patch.resolved_at;
    if (patch.resolved_by !== undefined) dbPatch.resolved_by = patch.resolved_by;
    if (patch.rejection_reason !== undefined) dbPatch.rejection_reason = patch.rejection_reason;

    const { data, error } = await db.from('ros_change_requests').update(dbPatch).eq('id', id).select().single();
    if (error || !data) return null;
    const existing = changeRequests.get(id);
    const updated = { ...(existing ?? rowToChangeRequest(data)), ...rowToChangeRequest(data) };
    changeRequests.set(id, updated);
    return updated;
}

export function getChangeRequestsMap(): Map<string, RunSheetChangeRequest> {
    return changeRequests;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearRosStoreForTests(): void {
    runSheetsByWedding.clear();
    runSheetItemsByWedding.clear();
    runSheetVersionsByWedding.clear();
    acknowledgements.clear();
    changeRequests.clear();
}
