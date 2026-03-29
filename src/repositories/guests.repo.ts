// Repository for wedding guest list (RSVP).
// Uses in-memory store (falls back when no PostgreSQL is configured).

export type GuestStatus = 'pending' | 'accepted' | 'declined' | 'maybe';

export type GuestRecord = {
    id: string;
    weddingId: string;
    name: string;
    email: string;
    address: string;
    plusOnes: number;
    status: GuestStatus;
    rsvpToken: string;
    respondedAt?: string;
    createdAt: string;
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const guestsStore = new Map<string, GuestRecord>();

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function findGuestsByWedding(weddingId: string): Promise<GuestRecord[]> {
    return Array.from(guestsStore.values())
        .filter(g => g.weddingId === weddingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findGuestById(id: string): Promise<GuestRecord | null> {
    return guestsStore.get(id) ?? null;
}

export async function createGuest(guest: GuestRecord): Promise<GuestRecord> {
    guestsStore.set(guest.id, { ...guest });
    return { ...guest };
}

export async function updateGuest(id: string, patch: Partial<GuestRecord>): Promise<GuestRecord | null> {
    const existing = guestsStore.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    guestsStore.set(id, updated);
    return { ...updated };
}

export async function removeGuest(id: string): Promise<boolean> {
    return guestsStore.delete(id);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearGuestsStoreForTests(): void {
    guestsStore.clear();
}
