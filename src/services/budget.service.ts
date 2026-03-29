import * as BudgetRepo from '../repositories/budget.repo';

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
    static async getEntries(weddingId: string): Promise<BudgetEntry[]> {
        return BudgetRepo.findEntriesByWedding(weddingId);
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
        return BudgetRepo.createEntry(entry);
    }

    static async deleteEntry(entryId: string): Promise<void> {
        const removed = await BudgetRepo.removeEntry(entryId);
        if (!removed) throw Object.assign(new Error('Boeking niet gevonden'), { status: 404 });
    }

    static clearStateForTests(): void {
        BudgetRepo._clearBudgetStoreForTests();
    }
}
