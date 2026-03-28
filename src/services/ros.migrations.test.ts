import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

function tableBlock(sql: string, tableName: string): string {
  const match = sql.match(new RegExp(`CREATE TABLE\\s+${tableName}\\s*\\(([^;]+?)\\);`, 'is'));
  assert.ok(match, `Missing table: ${tableName}`);
  return match?.[1] || '';
}

describe('RoS migration coverage (5.1.1-5.1.5)', () => {
  test('contains all required Run-of-Show tables and key columns', () => {
    const sql = readMigration('006_ros_master_engine.sql');

    const requiredTables = [
      'run_sheets',
      'run_sheet_items',
      'run_sheet_versions',
      'run_sheet_acknowledgements',
      'run_sheet_change_requests',
    ];
    for (const table of requiredTables) {
      assert.match(sql, new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, 'i'));
    }

    const runSheets = tableBlock(sql, 'run_sheets');
    assert.match(runSheets, /\bdraft_json\s+JSONB/i);
    assert.match(runSheets, /\bupdated_at\b/i);
    assert.match(runSheets, /\bupdated_by\b/i);

    const items = tableBlock(sql, 'run_sheet_items');
    assert.match(items, /\bsort_index\s+INTEGER/i);
    assert.match(items, /\bstart_at\s+TIMESTAMPTZ/i);
    assert.match(items, /\bend_at\s+TIMESTAMPTZ/i);
    assert.match(items, /\bvisibility_scope\b/i);

    const versions = tableBlock(sql, 'run_sheet_versions');
    assert.match(versions, /\bversion_number\s+INTEGER/i);
    assert.match(versions, /\bsnapshot_json\s+JSONB/i);
    assert.match(versions, /\bsuppliers_shared_to\s+UUID\[]/i);

    const requests = tableBlock(sql, 'run_sheet_change_requests');
    assert.match(requests, /\breason\s+TEXT\b/i);
    assert.match(requests, /\bstatus\s+change_request_status\b/i);
    assert.match(requests, /\brequest_type\s+change_request_type\b/i);
  });
});

