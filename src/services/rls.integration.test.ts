import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function read(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

describe('RLS policy integration coverage (1.2.9)', () => {
  test('enables RLS for all wedding-scoped tables up to phase 4.3', () => {
    const sql = `${read('002_rls_policies.sql')}\n${read('005_collaboration_modules.sql')}\n${read('010_rls_refinement_and_tasks.sql')}`;
    const scopedTables = [
      'weddings',
      'wedding_members',
      'wedding_supplier_assignments',
      'threads',
      'messages',
      'documents',
      'tasks',
      'appointments',
    ];

    for (const table of scopedTables) {
      assert.match(sql, new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
    }
  });

  test('contains policy paths for CO, supplier admin/staff and platform admin', () => {
    const sql = `${read('002_rls_policies.sql')}\n${read('010_rls_refinement_and_tasks.sql')}\n${read('011_rls_unification.sql')}`;

    assert.match(sql, /role\s*=\s*'owner'/i);
    assert.match(sql, /has_supplier_access\s*\(/i);
    assert.match(sql, /wedding_supplier_staff_assignments/i);
    assert.match(sql, /app\.is_platform_admin/i);
  });

  test('verification script includes role scenarios CO, SA, SS and PA', () => {
    const verifyScript = read('999_verify_rls.sql');
    assert.match(verifyScript, /Couple Owner/i);
    assert.match(verifyScript, /Supplier Admin/i);
    assert.match(verifyScript, /Supplier Staff/i);
    assert.match(verifyScript, /Platform Admin/i);
  });
});

