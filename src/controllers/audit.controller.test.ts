import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditController } from './audit.controller';
import { AuditService } from '../services/audit.service';

function createRes() {
  return {
    statusCode: 200,
    payload: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.payload = body;
      return this;
    },
    send(body: any) {
      this.payload = body;
      return this;
    },
  };
}

describe('AuditController', () => {
  beforeEach(() => {
    AuditService.clearStateForTests();
  });

  test('denies audit log access for non-owner non-platform-admin users', async () => {
    const res = createRes();
    await AuditController.list(
      {
        params: { id: 'wed-audit-2' },
        query: {},
        user: { role: 'supplier', is_platform_admin: false },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.match(String(res.payload?.error || ''), /forbidden/i);
  });

  test('allows owners and supports pagination/filtering', async () => {
    AuditService.logEvent({
      weddingId: 'wed-audit-2',
      actorUserId: 'owner-1',
      entityType: 'document',
      entityId: 'doc-1',
      action: 'shared',
      afterJson: { visibility_scope: 'selected_suppliers' },
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });
    AuditService.logEvent({
      weddingId: 'wed-audit-2',
      actorUserId: 'owner-1',
      entityType: 'run_sheet',
      entityId: 'version-1',
      action: 'published',
      afterJson: { version_number: 1 },
      createdAt: new Date('2026-01-02T10:00:00.000Z'),
    });
    await AuditService.flushForTests();

    const res = createRes();
    await AuditController.list(
      {
        params: { id: 'wed-audit-2' },
        query: { entityType: 'run_sheet', page: '1', limit: '10' },
        user: { role: 'owner', is_platform_admin: false },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.total, 1);
    assert.equal(res.payload.logs[0].entity_type, 'run_sheet');
  });
});
