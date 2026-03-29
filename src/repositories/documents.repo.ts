// Repository for wedding documents (uploaded files).
// Async functions use Supabase; in-memory Map kept for sync access by DocumentService.

import { db } from '../db/client';

export type DocumentRecord = {
    id: string;
    weddingId: string;
    userId: string;
    filename: string;
    s3Key: string;
    category: string;
    visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
    sharedWithSupplierOrgIds: string[];
    sizeBytes?: number;
    createdAt: Date;
    accessVersion: number;
};

// ---------------------------------------------------------------------------
// In-memory store (kept for sync access by DocumentService)
// ---------------------------------------------------------------------------

const documents = new Map<string, DocumentRecord>();

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function rowToDocument(row: any): DocumentRecord {
    return {
        id: row.id,
        weddingId: row.wedding_id,
        userId: row.uploaded_by ?? '',
        filename: row.name ?? '',
        s3Key: row.url ?? '',
        category: row.category ?? 'general',
        visibilityScope: 'couple_only',
        sharedWithSupplierOrgIds: [],
        sizeBytes: row.size_bytes ?? undefined,
        createdAt: new Date(row.created_at),
        accessVersion: 1,
    };
}

// ---------------------------------------------------------------------------
// Sync accessor (for DocumentService which is internally synchronous)
// ---------------------------------------------------------------------------

export function getDocumentsMap(): Map<string, DocumentRecord> { return documents; }

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function findDocumentById(id: string): Promise<DocumentRecord | null> {
    if (documents.has(id)) return documents.get(id)!;
    const { data, error } = await db.from('documents').select('*').eq('id', id).single();
    if (error || !data) return null;
    const doc = rowToDocument(data);
    documents.set(doc.id, doc);
    return doc;
}

export async function findDocumentsByWedding(weddingId: string, category?: string): Promise<DocumentRecord[]> {
    let query = db.from('documents').select('*').eq('wedding_id', weddingId);
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToDocument);
    for (const d of results) documents.set(d.id, d);
    return results;
}

export async function createDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    const { data, error } = await db.from('documents').insert({
        id: doc.id,
        wedding_id: doc.weddingId,
        uploaded_by: doc.userId,
        name: doc.filename,
        mime_type: null,
        size_bytes: doc.sizeBytes ?? null,
        url: doc.s3Key,
        category: doc.category,
        status: 'active',
        created_at: doc.createdAt.toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToDocument(data);
    // Preserve fields not stored in DB
    result.visibilityScope = doc.visibilityScope;
    result.sharedWithSupplierOrgIds = doc.sharedWithSupplierOrgIds;
    result.accessVersion = doc.accessVersion;
    documents.set(result.id, result);
    return result;
}

export async function updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.filename !== undefined) dbPatch.name = patch.filename;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.sizeBytes !== undefined) dbPatch.size_bytes = patch.sizeBytes;

    const { data, error } = await db.from('documents').update(dbPatch).eq('id', id).select().single();
    if (error || !data) return null;
    const updated = rowToDocument(data);
    const existing = documents.get(id);
    const merged = { ...(existing ?? updated), ...updated };
    // Merge in-memory only fields
    if (existing) {
        merged.visibilityScope = patch.visibilityScope ?? existing.visibilityScope;
        merged.sharedWithSupplierOrgIds = patch.sharedWithSupplierOrgIds ?? existing.sharedWithSupplierOrgIds;
        merged.accessVersion = patch.accessVersion ?? existing.accessVersion;
    }
    documents.set(id, merged);
    return merged;
}

export async function removeDocument(id: string): Promise<DocumentRecord | null> {
    const existing = documents.get(id) ?? await findDocumentById(id);
    if (!existing) return null;
    const { error } = await db.from('documents').delete().eq('id', id);
    if (error) throw new Error(error.message);
    documents.delete(id);
    return existing;
}

export function canSupplierAccessDocument(id: string, supplierOrgId: string): boolean {
    const doc = documents.get(id);
    if (!doc) return false;
    if (doc.visibilityScope === 'all_assigned_suppliers') return true;
    if (doc.visibilityScope === 'selected_suppliers') {
        return (doc.sharedWithSupplierOrgIds || []).includes(supplierOrgId);
    }
    return false;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearDocumentsStoreForTests(): void {
    documents.clear();
}
