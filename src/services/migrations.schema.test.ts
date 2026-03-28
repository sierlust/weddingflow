import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

function getTableBlock(sql: string, table: string): string {
  const regex = new RegExp(`CREATE TABLE\\s+${table}\\s*\\(([^;]+?)\\);`, 'is');
  const match = sql.match(regex);
  assert.ok(match, `Expected CREATE TABLE for ${table}`);
  return match?.[1] || '';
}

describe('Schema migrations (1.1.11)', () => {
  test('initial schema defines required tables, core columns and foreign keys', () => {
    const sql = readMigration('001_initial_schema.sql');

    const requiredTables = [
      'users',
      'supplier_orgs',
      'supplier_org_members',
      'weddings',
      'wedding_members',
      'wedding_supplier_assignments',
      'wedding_supplier_staff_assignments',
      'invitations',
      'user_identity_providers',
    ];

    for (const table of requiredTables) {
      assert.match(sql, new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, 'i'));
    }

    const invitationsBlock = getTableBlock(sql, 'invitations');
    assert.match(invitationsBlock, /\btarget_email\s+TEXT\b/i);
    assert.match(invitationsBlock, /\bissuer_user_id\s+UUID\b/i);
    assert.match(invitationsBlock, /\btoken_hash\s+TEXT\s+NOT NULL\b/i);
    assert.match(invitationsBlock, /\bmetadata_json\s+JSONB\b/i);
    assert.match(invitationsBlock, /REFERENCES users\(id\)/i);
    assert.match(invitationsBlock, /REFERENCES weddings\(id\)/i);
    assert.match(invitationsBlock, /REFERENCES supplier_orgs\(id\)/i);

    const staffBlock = getTableBlock(sql, 'wedding_supplier_staff_assignments');
    assert.match(staffBlock, /UNIQUE\s*\(wedding_id,\s*supplier_org_id,\s*user_id\)/i);

    assert.match(sql, /CREATE INDEX idx_wedding_members_wedding_id ON wedding_members\(wedding_id\)/i);
    assert.match(sql, /CREATE INDEX idx_wedding_members_user_id ON wedding_members\(user_id\)/i);
    assert.match(sql, /CREATE INDEX idx_supplier_org_members_org_id ON supplier_org_members\(supplier_org_id\)/i);
    assert.match(sql, /CREATE INDEX idx_supplier_org_members_user_id ON supplier_org_members\(user_id\)/i);
  });

  test('seed migration references schema tables that are created in initial migration', () => {
    const schemaSql = readMigration('001_initial_schema.sql');
    const seedSql = readMigration('009_seed_dev_data.sql');

    const tableNames = Array.from(
      schemaSql.matchAll(/CREATE TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gim)
    ).map((m) => (m[1] || '').toLowerCase());
    const knownTables = new Set(tableNames);

    const seedTargets = Array.from(seedSql.matchAll(/INSERT INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gim)).map((m) =>
      (m[1] || '').toLowerCase()
    );

    for (const target of seedTargets) {
      assert.equal(knownTables.has(target), true, `Seed target table missing from schema: ${target}`);
    }
  });
});

