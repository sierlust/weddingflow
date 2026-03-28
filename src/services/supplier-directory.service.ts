import { Pool } from 'pg';

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

type SupplierFilters = {
  category?: string;
  budgetTier?: SupplierBudgetTier;
  minRating?: number;
  query?: string;
};

export type SupplierProfileUpsertInput = {
  name?: string;
  location?: string;
  category?: string;
  budgetTier?: SupplierBudgetTier;
  photoUrl?: string;
  description?: string;
  services?: string[];
  email?: string;
  website?: string;
  instagram?: string;
  tiktok?: string;
};

const BUDGET_TIERS: SupplierBudgetTier[] = ['€', '€€', '€€€', '€€€€', '€€€€€'];
const BUDGET_TIER_SET = new Set<string>(BUDGET_TIERS);
const CATEGORY_LABEL_MAP: Record<string, string> = {
  bloemist: 'Bloemist',
  taart: 'Taart',
  dj: 'DJ',
  fotograaf: 'Fotograaf',
  videograaf: 'Videograaf',
  catering: 'Catering',
  locatie: 'Locatie',
  weddingplanner: 'Weddingplanner',
  ceremoniemeester: 'Ceremoniemeester',
};

const SUPPLIER_SEED: SupplierRecord[] = [
  {
    id: 'supplier-lumen-photography',
    supplierOrgId: 'org-lumen',
    name: 'Studio Lumen',
    location: 'Amsterdam',
    category: 'Fotograaf',
    budgetTier: '€€€',
    rating: 4.9,
    reviewsCount: 124,
    photoUrl: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
    description: 'Storytelling trouwfotografie met focus op spontane momenten, details en sfeer.',
    services: ['Dagreportage', 'Loveshoot', 'Fine-art album'],
    email: 'studio@lumen.nl',
  },
  {
    id: 'supplier-noa-flowers',
    supplierOrgId: 'org-noa',
    name: 'Bloematelier Noa',
    location: 'Utrecht',
    category: 'Bloemist',
    budgetTier: '€€',
    rating: 4.7,
    reviewsCount: 88,
    photoUrl: 'https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?auto=format&fit=crop&w=1200&q=80',
    description: 'Van bruidsboeket tot ceremonie-opstelling, afgestemd op seizoen en stijl.',
    services: ['Bruidsboeket', 'Ceremonie styling', 'Tafelarrangementen'],
    email: 'hello@noa-bloemen.nl',
  },
  {
    id: 'supplier-villa-veluwe',
    supplierOrgId: 'org-villa',
    name: 'Villa de Veluwe',
    location: 'Hoenderloo',
    category: 'Locatie',
    budgetTier: '€€€€',
    rating: 4.8,
    reviewsCount: 211,
    photoUrl: 'https://images.unsplash.com/photo-1519167758481-83f29c8b7f4e?auto=format&fit=crop&w=1200&q=80',
    description: 'Complete trouwlocatie met buitenruimte, dinerzaal en overnachtingsmogelijkheden.',
    services: ['Ceremonie', 'Diner', 'Feestavond'],
    email: 'events@villaveluwe.nl',
  },
  {
    id: 'supplier-taste-toast',
    supplierOrgId: 'org-taste',
    name: 'Taste & Toast',
    location: 'Rotterdam',
    category: 'Catering',
    budgetTier: '€€€',
    rating: 4.6,
    reviewsCount: 97,
    photoUrl: 'https://images.unsplash.com/photo-1555243896-c709bfa0b564?auto=format&fit=crop&w=1200&q=80',
    description: 'Cateringconcepten op maat met walking dinner, shared dining en late-night snacks.',
    services: ['Proeverij', 'Diner op maat', 'Cocktailbar'],
    email: 'team@taste-toast.nl',
  },
  {
    id: 'supplier-golden-hour-sounds',
    supplierOrgId: 'org-sounds',
    name: 'Golden Hour Sounds',
    location: 'Den Haag',
    category: 'Muziek',
    budgetTier: '€€',
    rating: 4.8,
    reviewsCount: 65,
    photoUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
    description: 'DJ + live acts voor ceremonie, diner en feest met één vast team.',
    services: ['Ceremonie audio', 'DJ set', 'Live sax/violin'],
    email: 'bookings@goldenhour.nl',
  },
  {
    id: 'supplier-atelier-vows',
    supplierOrgId: 'org-vows',
    name: 'Atelier Vows',
    location: 'Eindhoven',
    category: 'Styling',
    budgetTier: '€€€',
    rating: 4.5,
    reviewsCount: 53,
    photoUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    description: 'Totaalconcept voor styling met moodboard, materiaalplan en on-site opbouw.',
    services: ['Moodboard', 'Ceremonie styling', 'Feeststyling'],
    email: 'hello@ateliervows.nl',
  },
  {
    id: 'supplier-frame-films',
    supplierOrgId: 'org-framefilms',
    name: 'Frame Films',
    location: 'Groningen',
    category: 'Videograaf',
    budgetTier: '€€€',
    rating: 4.9,
    reviewsCount: 72,
    photoUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    description: 'Cinematische trouwfilm met highlights en volledige speeches/ceremonie-opnames.',
    services: ['Highlight film', 'Drone shots', 'Long edit'],
    email: 'info@framefilms.nl',
  },
  {
    id: 'supplier-ribbon-rings',
    supplierOrgId: 'org-ribbonrings',
    name: 'Ribbon & Rings',
    location: 'Maastricht',
    category: 'Ceremoniemeester',
    budgetTier: '€€',
    rating: 4.4,
    reviewsCount: 39,
    photoUrl: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80',
    description: 'Persoonlijke coördinatie op de dag zelf met strak draaiboek en rust voor het bruidspaar.',
    services: ['Draaiboek coördinatie', 'Leveranciersbriefing', 'Dagregie'],
    email: 'planning@ribbonrings.nl',
  },
  {
    id: 'supplier-white-aisle',
    supplierOrgId: 'org-whiteaisle',
    name: 'White Aisle Bakery',
    location: 'Leiden',
    category: 'Taart',
    budgetTier: '€€',
    rating: 4.7,
    reviewsCount: 61,
    photoUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80',
    description: 'Bruidstaarten en desserttafels met proeverij en maatwerkdesign.',
    services: ['Bruidstaart', 'Desserttafel', 'Sweet table styling'],
    email: 'orders@whiteaisle.nl',
  },
  {
    id: 'supplier-velvet-lights',
    supplierOrgId: 'org-velvetlights',
    name: 'Velvet Lights',
    location: 'Zwolle',
    category: 'Verlichting',
    budgetTier: '€€€',
    rating: 4.6,
    reviewsCount: 44,
    photoUrl: 'https://images.unsplash.com/photo-1478144592103-25e218a04891?auto=format&fit=crop&w=1200&q=80',
    description: 'Sfeerverlichting voor ceremonie en feest inclusief opbouw en afbouw.',
    services: ['Prikkabelplan', 'Podiumlicht', 'Ambient verlichting'],
    email: 'contact@velvetlights.nl',
  },
  {
    id: 'supplier-promenade-palace',
    supplierOrgId: 'org-promenadepalace',
    name: 'Promenade Palace',
    location: 'Haarlem',
    category: 'Locatie',
    budgetTier: '€€€€€',
    rating: 4.9,
    reviewsCount: 142,
    photoUrl: 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1200&q=80',
    description: 'Exclusieve monumentale trouwlocatie met volledig hospitality-team.',
    services: ['All-in wedding day', 'Private dining', 'Suite overnachting'],
    email: 'reservations@promenadepalace.nl',
  },
  {
    id: 'supplier-urban-vows',
    supplierOrgId: 'org-urbanvows',
    name: 'Urban Vows Hair & Make-up',
    location: 'Amsterdam',
    category: 'Beauty',
    budgetTier: '€',
    rating: 4.5,
    reviewsCount: 77,
    photoUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
    description: 'Hair & make-up team aan huis of op locatie met proefmomenten vooraf.',
    services: ['Proef make-up', 'Bridal look', 'Touch-up service'],
    email: 'book@urbanvows.nl',
  },
];

function normalizeBudgetTier(value: unknown): SupplierBudgetTier | undefined {
  const normalized = String(value || '').trim();
  if (BUDGET_TIER_SET.has(normalized)) {
    return normalized as SupplierBudgetTier;
  }
  return undefined;
}

function normalizeSupplierRow(row: any): SupplierRecord {
  const services = Array.isArray(row.services)
    ? row.services.map((service: unknown) => String(service))
    : [];

  return {
    id: String(row.id),
    supplierOrgId: String(row.supplier_org_id),
    name: String(row.name),
    location: String(row.location),
    category: String(row.category),
    budgetTier: normalizeBudgetTier(row.budget_tier) || '€€',
    rating: Number(row.rating || 0),
    reviewsCount: Number(row.reviews_count || 0),
    photoUrl: String(row.photo_url || ''),
    description: String(row.description || ''),
    services,
    email: String(row.email || ''),
    website: String(row.website || ''),
    instagram: String(row.instagram || ''),
    tiktok: String(row.tiktok || ''),
  };
}

function trimOrUndefined(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized ? normalized : undefined;
}

function trimOrEmpty(value: unknown): string {
  return String(value || '').trim();
}

function normalizeCategory(value: unknown): string | undefined {
  const raw = trimOrUndefined(value);
  if (!raw) return undefined;
  const mapped = CATEGORY_LABEL_MAP[raw.toLowerCase()];
  return mapped || raw;
}

function makeSupplierId(orgId: string, name: string): string {
  const source = `${orgId}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return source ? `supplier-${source}` : `supplier-${Date.now()}`;
}

function shouldPreferEmailMatch(byOrg: SupplierRecord | null, byEmail: SupplierRecord | null): boolean {
  if (!byEmail) return false;
  if (!byOrg) return true;
  if (byOrg.id === byEmail.id) return true;
  if ((byOrg.reviewsCount || 0) <= 0 && (byEmail.reviewsCount || 0) > 0) return true;
  if ((byOrg.rating || 0) <= 0 && (byEmail.rating || 0) > 0) return true;
  return false;
}

export class SupplierDirectoryService {
  private static initialized = false;
  private static pool: Pool | null = null;
  private static dbEnabled = false;
  private static inMemory = new Map<string, SupplierRecord>();

  static async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const connectionString = String(process.env.DATABASE_URL || '').trim();
    if (!connectionString) {
      for (const supplier of SUPPLIER_SEED) {
        this.inMemory.set(supplier.id, { ...supplier });
      }
      console.warn('[supplier-directory] DATABASE_URL not configured; using in-memory supplier catalog.');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      });

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS supplier_directory (
          id TEXT PRIMARY KEY,
          supplier_org_id TEXT NOT NULL,
          name TEXT NOT NULL,
          location TEXT NOT NULL,
          category TEXT NOT NULL,
          budget_tier TEXT NOT NULL,
          rating DOUBLE PRECISION NOT NULL,
          reviews_count INTEGER NOT NULL DEFAULT 0,
          photo_url TEXT NOT NULL,
          description TEXT NOT NULL,
          services JSONB NOT NULL DEFAULT '[]'::jsonb,
          email TEXT NOT NULL,
          website TEXT NOT NULL DEFAULT '',
          instagram TEXT NOT NULL DEFAULT '',
          tiktok TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await this.pool.query(`
        ALTER TABLE supplier_directory
          ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS instagram TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS tiktok TEXT NOT NULL DEFAULT '';
      `);

      const countResult = await this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM supplier_directory');
      const count = Number(countResult.rows[0]?.count || 0);
      if (count === 0) {
        for (const supplier of SUPPLIER_SEED) {
          await this.pool.query(
            `
            INSERT INTO supplier_directory (
              id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
            `,
            [
              supplier.id,
              supplier.supplierOrgId,
              supplier.name,
              supplier.location,
              supplier.category,
              supplier.budgetTier,
              supplier.rating,
              supplier.reviewsCount,
              supplier.photoUrl,
              supplier.description,
              JSON.stringify(supplier.services),
              supplier.email,
              supplier.website || '',
              supplier.instagram || '',
              supplier.tiktok || '',
            ]
          );
        }
      }
      this.dbEnabled = true;
    } catch (error) {
      console.error('[supplier-directory] Failed to initialize database catalog. Falling back to in-memory.', error);
      this.dbEnabled = false;
      if (this.pool) {
        await this.pool.end().catch(() => undefined);
        this.pool = null;
      }
      for (const supplier of SUPPLIER_SEED) {
        this.inMemory.set(supplier.id, { ...supplier });
      }
    }
  }

  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.dbEnabled = false;
  }

  static async resetForTests(): Promise<void> {
    await this.close();
    this.initialized = false;
    this.inMemory.clear();
  }

  static async list(filters: SupplierFilters = {}): Promise<SupplierRecord[]> {
    await this.init();
    const category = String(filters.category || '').trim();
    const budgetTier = normalizeBudgetTier(filters.budgetTier);
    const minRating = typeof filters.minRating === 'number' && Number.isFinite(filters.minRating)
      ? Math.max(0, Math.min(filters.minRating, 5))
      : undefined;
    const query = String(filters.query || '').trim();

    if (this.dbEnabled && this.pool) {
      const result = await this.pool.query(
        `
        SELECT
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        FROM supplier_directory
        WHERE ($1::text = '' OR category = $1)
          AND ($2::text = '' OR budget_tier = $2)
          AND ($3::double precision IS NULL OR rating >= $3)
          AND (
            $4::text = ''
            OR name ILIKE '%' || $4 || '%'
            OR location ILIKE '%' || $4 || '%'
            OR category ILIKE '%' || $4 || '%'
          )
        ORDER BY rating DESC, reviews_count DESC, name ASC
        `,
        [category, budgetTier || '', minRating ?? null, query]
      );
      return result.rows.map((row) => normalizeSupplierRow(row));
    }

    return Array.from(this.inMemory.values())
      .filter((supplier) => {
        if (category && supplier.category !== category) {
          return false;
        }
        if (budgetTier && supplier.budgetTier !== budgetTier) {
          return false;
        }
        if (typeof minRating === 'number' && supplier.rating < minRating) {
          return false;
        }
        if (query) {
          const haystack = `${supplier.name} ${supplier.location} ${supplier.category}`.toLowerCase();
          if (!haystack.includes(query.toLowerCase())) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => (b.rating - a.rating) || (b.reviewsCount - a.reviewsCount) || a.name.localeCompare(b.name));
  }

  static async getById(id: string): Promise<SupplierRecord | null> {
    await this.init();
    const supplierId = String(id || '').trim();
    if (!supplierId) {
      return null;
    }

    if (this.dbEnabled && this.pool) {
      const result = await this.pool.query(
        `
        SELECT
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        FROM supplier_directory
        WHERE id = $1
        LIMIT 1
        `,
        [supplierId]
      );
      if (!result.rows[0]) {
        return null;
      }
      return normalizeSupplierRow(result.rows[0]);
    }

    return this.inMemory.get(supplierId) || null;
  }

  static async getByOrgId(supplierOrgId: string): Promise<SupplierRecord | null> {
    await this.init();
    const orgId = String(supplierOrgId || '').trim();
    if (!orgId) {
      return null;
    }

    if (this.dbEnabled && this.pool) {
      const result = await this.pool.query(
        `
        SELECT
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        FROM supplier_directory
        WHERE supplier_org_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [orgId]
      );
      if (!result.rows[0]) {
        return null;
      }
      return normalizeSupplierRow(result.rows[0]);
    }

    return Array.from(this.inMemory.values()).find((row) => row.supplierOrgId === orgId) || null;
  }

  static async getByEmail(email: string): Promise<SupplierRecord | null> {
    await this.init();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    if (this.dbEnabled && this.pool) {
      const result = await this.pool.query(
        `
        SELECT
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        FROM supplier_directory
        WHERE lower(email) = $1
        ORDER BY reviews_count DESC, rating DESC, updated_at DESC
        LIMIT 1
        `,
        [normalizedEmail]
      );
      if (!result.rows[0]) {
        return null;
      }
      return normalizeSupplierRow(result.rows[0]);
    }

    return (
      Array.from(this.inMemory.values())
        .filter((row) => String(row.email || '').trim().toLowerCase() === normalizedEmail)
        .sort((a, b) => (b.reviewsCount - a.reviewsCount) || (b.rating - a.rating))
        [0] || null
    );
  }

  static async upsertProfileByOrgId(supplierOrgId: string, patch: SupplierProfileUpsertInput): Promise<SupplierRecord> {
    await this.init();
    const orgId = String(supplierOrgId || '').trim();
    if (!orgId) {
      throw new Error('supplier_org_id is required');
    }

    const emailFromPatch = patch.email !== undefined ? trimOrEmpty(patch.email) : '';
    const byOrg = await this.getByOrgId(orgId);
    const byEmail = emailFromPatch ? await this.getByEmail(emailFromPatch) : null;
    let current = byOrg;
    if (shouldPreferEmailMatch(byOrg, byEmail)) {
      current = byEmail;
    }
    const nextNameRaw = patch.name !== undefined ? trimOrEmpty(patch.name) : '';
    const name = nextNameRaw || current?.name || 'Leverancier';
    const nextLocationRaw = patch.location !== undefined ? trimOrEmpty(patch.location) : '';
    const location = nextLocationRaw || current?.location || 'Locatie onbekend';
    const category =
      patch.category !== undefined
        ? normalizeCategory(patch.category) || current?.category || 'Leverancier'
        : current?.category || 'Leverancier';
    const budgetTier =
      patch.budgetTier !== undefined
        ? normalizeBudgetTier(patch.budgetTier) || current?.budgetTier || '€€'
        : current?.budgetTier || '€€';
    const photoUrl = patch.photoUrl !== undefined ? trimOrEmpty(patch.photoUrl) : current?.photoUrl || '';
    const description = patch.description !== undefined ? trimOrEmpty(patch.description) : current?.description || '';
    const services =
      patch.services !== undefined
        ? (Array.isArray(patch.services)
            ? patch.services.map((value) => String(value || '').trim()).filter(Boolean)
            : [])
        : current?.services || [];
    const email = patch.email !== undefined ? trimOrEmpty(patch.email) : current?.email || '';
    const website = patch.website !== undefined ? trimOrEmpty(patch.website) : current?.website || '';
    const instagram = patch.instagram !== undefined ? trimOrEmpty(patch.instagram) : current?.instagram || '';
    const tiktok = patch.tiktok !== undefined ? trimOrEmpty(patch.tiktok) : current?.tiktok || '';
    const id = current?.id || makeSupplierId(orgId, name);
    const rating = current?.rating ?? 0;
    const reviewsCount = current?.reviewsCount ?? 0;

    if (this.dbEnabled && this.pool) {
      if (current) {
        const updated = await this.pool.query(
          `
          UPDATE supplier_directory
          SET
            supplier_org_id = $2,
            name = $3,
            location = $4,
            category = $5,
            budget_tier = $6,
            photo_url = $7,
            description = $8,
            services = $9::jsonb,
            email = $10,
            website = $11,
            instagram = $12,
            tiktok = $13,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
          `,
          [current.id, orgId, name, location, category, budgetTier, photoUrl, description, JSON.stringify(services), email, website, instagram, tiktok]
        );
        await this.pool.query(
          `
          DELETE FROM supplier_directory
          WHERE supplier_org_id = $1
            AND id <> $2
          `,
          [orgId, current.id]
        );
        return normalizeSupplierRow(updated.rows[0]);
      }

      const inserted = await this.pool.query(
        `
        INSERT INTO supplier_directory (
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
        RETURNING
          id, supplier_org_id, name, location, category, budget_tier, rating, reviews_count, photo_url, description, services, email, website, instagram, tiktok
        `,
        [id, orgId, name, location, category, budgetTier, rating, reviewsCount, photoUrl, description, JSON.stringify(services), email, website, instagram, tiktok]
      );
      return normalizeSupplierRow(inserted.rows[0]);
    }

    const localRecord: SupplierRecord = {
      id,
      supplierOrgId: orgId,
      name,
      location,
      category,
      budgetTier,
      rating,
      reviewsCount,
      photoUrl,
      description,
      services,
      email,
      website,
      instagram,
      tiktok,
    };
    for (const [existingId, existingRow] of this.inMemory.entries()) {
      if (existingRow.supplierOrgId === orgId && existingId !== localRecord.id) {
        this.inMemory.delete(existingId);
      }
    }
    this.inMemory.set(localRecord.id, localRecord);
    return localRecord;
  }

  static async listCategories(): Promise<string[]> {
    const suppliers = await this.list();
    return Array.from(new Set(suppliers.map((supplier) => supplier.category))).sort((a, b) => a.localeCompare(b));
  }

  static listBudgetTiers(): SupplierBudgetTier[] {
    return [...BUDGET_TIERS];
  }
}
