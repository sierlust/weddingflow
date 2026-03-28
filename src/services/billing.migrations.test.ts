import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

describe('Phase 6 migration coverage', () => {
  test('defines audit and billing entities', () => {
    const sql = readMigration('007_audit_and_billing.sql');
    assert.match(sql, /CREATE TABLE audit_events/i);
    assert.match(sql, /CREATE TABLE plans/i);
    assert.match(sql, /CREATE TABLE subscriptions/i);
    assert.match(sql, /CREATE TABLE usage_counters/i);
  });

  test('adds plan entitlements and usage period columns', () => {
    const sql = readMigration('019_billing_refinements.sql');
    assert.match(sql, /ALTER TABLE plans ADD COLUMN IF NOT EXISTS entitlements JSONB/i);
    assert.match(sql, /ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ/i);
    assert.match(sql, /ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ/i);
  });

  test('enforces append-only audit policy at SQL level', () => {
    const sql = readMigration('018_audit_enforcement.sql');
    assert.match(sql, /REVOKE UPDATE,\s*DELETE ON audit_events/i);
    assert.match(sql, /CREATE POLICY audit_no_update_policy ON audit_events/i);
    assert.match(sql, /CREATE POLICY audit_no_delete_policy ON audit_events/i);
  });
});
