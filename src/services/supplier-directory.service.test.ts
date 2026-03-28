import test from 'node:test';
import assert from 'node:assert/strict';
import { SupplierDirectoryService } from './supplier-directory.service';

test('SupplierDirectoryService lists, filters and resolves supplier details', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = '';
  await SupplierDirectoryService.resetForTests();

  const allSuppliers = await SupplierDirectoryService.list();
  assert.ok(allSuppliers.length >= 10, 'expected seeded suppliers');

  const locationSuppliers = await SupplierDirectoryService.list({ category: 'Locatie' });
  assert.ok(locationSuppliers.length >= 1, 'expected at least one location supplier');
  assert.ok(locationSuppliers.every((supplier) => supplier.category === 'Locatie'));

  const highBudgetSuppliers = await SupplierDirectoryService.list({ budgetTier: '€€€€€' });
  assert.ok(highBudgetSuppliers.length >= 1, 'expected at least one highest-budget supplier');
  assert.ok(highBudgetSuppliers.every((supplier) => supplier.budgetTier === '€€€€€'));

  const single = await SupplierDirectoryService.getById(allSuppliers[0].id);
  assert.ok(single, 'expected supplier by id');
  assert.equal(single?.id, allSuppliers[0].id);

  const claimedExisting = await SupplierDirectoryService.upsertProfileByOrgId('org-claimed-noa', {
    email: 'hello@noa-bloemen.nl',
    name: 'Hello',
    description: 'Nieuw profiel voor dezelfde leverancierkaart',
  });
  assert.equal(claimedExisting.id, 'supplier-noa-flowers');
  assert.equal(claimedExisting.supplierOrgId, 'org-claimed-noa');
  assert.equal(claimedExisting.name, 'Hello');

  const updated = await SupplierDirectoryService.upsertProfileByOrgId('org-custom-supplier', {
    name: 'Mijn Leveranciersprofiel',
    category: 'weddingplanner',
    description: 'Wij verzorgen de volledige dagcoordinatie.',
    email: 'profiel@leverancier.nl',
    website: 'https://mijnleverancier.nl',
    instagram: '@mijnleverancier',
    tiktok: '@mijnleverancier',
    photoUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  });
  assert.equal(updated.supplierOrgId, 'org-custom-supplier');
  assert.equal(updated.name, 'Mijn Leveranciersprofiel');
  assert.equal(updated.category, 'Weddingplanner');
  assert.equal(updated.instagram, '@mijnleverancier');

  const byOrg = await SupplierDirectoryService.getByOrgId('org-custom-supplier');
  assert.ok(byOrg, 'expected supplier by org id');
  assert.equal(byOrg?.email, 'profiel@leverancier.nl');

  const cleared = await SupplierDirectoryService.upsertProfileByOrgId('org-custom-supplier', {
    website: '',
    instagram: '',
    tiktok: '',
    description: '',
  });
  assert.equal(cleared.website, '');
  assert.equal(cleared.instagram, '');
  assert.equal(cleared.tiktok, '');
  assert.equal(cleared.description, '');

  await SupplierDirectoryService.resetForTests();
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
