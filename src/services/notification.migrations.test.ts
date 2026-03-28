import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

describe('Notification migration coverage (7.2.1/7.2.2)', () => {
  test('creates device token, notification preference and mute override tables with indexes', () => {
    const sql = readMigration('020_notification_system.sql');

    assert.match(sql, /CREATE TABLE device_tokens/i);
    assert.match(sql, /CREATE TABLE notification_preferences/i);
    assert.match(sql, /CREATE TABLE wedding_mute_overrides/i);

    assert.match(sql, /ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE wedding_mute_overrides ENABLE ROW LEVEL SECURITY/i);

    assert.match(sql, /CREATE INDEX idx_device_tokens_user_id ON device_tokens\(user_id\)/i);
    assert.match(sql, /CREATE INDEX idx_notification_prefs_user_id ON notification_preferences\(user_id\)/i);
  });
});
