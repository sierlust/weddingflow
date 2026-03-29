// Repository for wedding budget entries.
// Uses in-memory store (falls back when no PostgreSQL is configured).

export type BudgetEntryType = 'expense' | 'income';

export type BudgetEntryRecord = {
    id: string;
    weddingId: string;
    label: string;
    type: BudgetEntryType;
    amount: number;
    category: string;
    createdAt: string;
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const budgetStore = new Map<string, BudgetEntryRecord>();

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function findEntriesByWedding(weddingId: string): Promise<BudgetEntryRecord[]> {
    return Array.from(budgetStore.values())
        .filter(e => e.weddingId === weddingId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findEntryById(id: string): Promise<BudgetEntryRecord | null> {
    return budgetStore.get(id) ?? null;
}

export async function createEntry(entry: BudgetEntryRecord): Promise<BudgetEntryRecord> {
    budgetStore.set(entry.id, { ...entry });
    return { ...entry };
}

export async function removeEntry(id: string): Promise<boolean> {
    return budgetStore.delete(id);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearBudgetStoreForTests(): void {
    budgetStore.clear();
}
