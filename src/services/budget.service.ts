export interface BudgetEntry {
    id: string;
    weddingId: string;
    label: string;
    type: 'expense' | 'income';
    amount: number;
    category: string;
    createdAt: string;
}

export class BudgetService {
    private static entries: Map<string, BudgetEntry> = new Map();

    static async getEntries(weddingId: string): Promise<BudgetEntry[]> {
        return Array.from(this.entries.values())
            .filter(e => e.weddingId === weddingId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    static async addEntry(weddingId: string, data: {
        label: string;
        type: string;
        amount: number | string;
        category?: string;
    }): Promise<BudgetEntry> {
        if (!data.label?.trim()) throw Object.assign(new Error('Omschrijving is verplicht'), { status: 400 });
        const amount = Number(data.amount);
        if (Number.isNaN(amount) || amount <= 0) throw Object.assign(new Error('Geldig bedrag groter dan 0 is verplicht'), { status: 400 });
        const id = `budget-${Math.random().toString(36).slice(2, 10)}`;
        const entry: BudgetEntry = {
            id,
            weddingId,
            label: data.label.trim(),
            type: data.type === 'income' ? 'income' : 'expense',
            amount: Math.round(amount * 100) / 100,
            category: data.category?.trim() || '',
            createdAt: new Date().toISOString(),
        };
        this.entries.set(id, entry);
        return entry;
    }

    static async deleteEntry(entryId: string): Promise<void> {
        if (!this.entries.has(entryId)) throw Object.assign(new Error('Boeking niet gevonden'), { status: 404 });
        this.entries.delete(entryId);
    }

    static clearStateForTests(): void {
        this.entries.clear();
    }
}
