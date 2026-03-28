import { BudgetService } from '../services/budget.service';

export class BudgetController {
    static async list(req: any, res: any) {
        const { id: weddingId } = req.params;
        const entries = await BudgetService.getEntries(weddingId);
        return res.json({ entries });
    }

    static async create(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { label, type, amount, category } = req.body ?? {};
        const entry = await BudgetService.addEntry(weddingId, { label, type, amount, category });
        return res.status(201).json(entry);
    }

    static async remove(req: any, res: any) {
        const { entryId } = req.params;
        await BudgetService.deleteEntry(entryId);
        return res.json({ success: true });
    }
}
