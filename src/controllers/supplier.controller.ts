import { SupplierBudgetTier, SupplierDirectoryService } from '../services/supplier-directory.service';

export class SupplierController {
  static async list(req: any, res: any) {
    const category = typeof req.query?.category === 'string' ? req.query.category : undefined;
    const budgetTierRaw = typeof req.query?.budget === 'string' ? req.query.budget : undefined;
    const budgetTier = (['€', '€€', '€€€', '€€€€', '€€€€€'] as SupplierBudgetTier[]).includes(
      budgetTierRaw as SupplierBudgetTier
    )
      ? (budgetTierRaw as SupplierBudgetTier)
      : undefined;
    const query = typeof req.query?.q === 'string' ? req.query.q : undefined;
    const minRatingRaw = typeof req.query?.min_rating === 'string' ? Number(req.query.min_rating) : undefined;
    const minRating = typeof minRatingRaw === 'number' && Number.isFinite(minRatingRaw) ? minRatingRaw : undefined;

    const [suppliers, categories] = await Promise.all([
      SupplierDirectoryService.list({
        category,
        budgetTier,
        minRating,
        query,
      }),
      SupplierDirectoryService.listCategories(),
    ]);

    return res.json({
      suppliers,
      filters: {
        category: category || '',
        budget: budgetTier || '',
        min_rating: typeof minRating === 'number' ? minRating : null,
        q: query || '',
      },
      meta: {
        categories,
        budgets: SupplierDirectoryService.listBudgetTiers(),
      },
    });
  }

  static async getById(req: any, res: any) {
    const supplierId = String(req.params?.id || '').trim();
    const supplier = await SupplierDirectoryService.getById(supplierId);
    if (!supplier) {
      return res.status(404).json({ error: 'Leverancier niet gevonden' });
    }
    return res.json({ supplier });
  }

  static async getOwnProfile(req: any, res: any) {
    const orgId = String(req.user?.supplier_org_id || '').trim();
    if (!orgId) {
      return res.status(400).json({ error: 'supplier_org_id ontbreekt' });
    }
    const email = String(req.user?.email || '').trim().toLowerCase();
    const supplier = (await SupplierDirectoryService.getByOrgId(orgId))
      || (email ? await SupplierDirectoryService.getByEmail(email) : null);
    if (!supplier) {
      return res.status(404).json({ error: 'Leveranciersprofiel niet gevonden' });
    }
    return res.json({ supplier });
  }

  static async upsertOwnProfile(req: any, res: any) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'couple_owner') {
      return res.status(403).json({ error: 'Alleen leverancier/planner kan dit profiel aanpassen' });
    }
    const orgId = String(req.user?.supplier_org_id || '').trim();
    if (!orgId) {
      return res.status(400).json({ error: 'supplier_org_id ontbreekt' });
    }

    const budgetTierRaw = typeof req.body?.budgetTier === 'string' ? req.body.budgetTier : undefined;
    const budgetTier = (['€', '€€', '€€€', '€€€€', '€€€€€'] as SupplierBudgetTier[]).includes(
      budgetTierRaw as SupplierBudgetTier
    )
      ? (budgetTierRaw as SupplierBudgetTier)
      : undefined;

    const servicesRaw = req.body?.services;
    if (servicesRaw !== undefined && !Array.isArray(servicesRaw)) {
      return res.status(400).json({ error: 'services moet een array zijn' });
    }

    const supplier = await SupplierDirectoryService.upsertProfileByOrgId(orgId, {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      location: typeof req.body?.location === 'string' ? req.body.location : undefined,
      category: typeof req.body?.category === 'string' ? req.body.category : undefined,
      budgetTier,
      photoUrl: typeof req.body?.photoUrl === 'string' ? req.body.photoUrl : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      services: Array.isArray(servicesRaw) ? servicesRaw.map((value: unknown) => String(value || '')) : undefined,
      email: typeof req.body?.email === 'string' ? req.body.email : (req.user?.email || undefined),
      website: typeof req.body?.website === 'string' ? req.body.website : undefined,
      instagram: typeof req.body?.instagram === 'string' ? req.body.instagram : undefined,
      tiktok: typeof req.body?.tiktok === 'string' ? req.body.tiktok : undefined,
    });

    return res.json({ supplier });
  }
}
