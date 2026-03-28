import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DbSessionService } from './db-session.service';

describe('DbSessionService', () => {
  test('builds SET LOCAL statements for user/session claims', () => {
    const context = DbSessionService.buildContext({
      sub: 'user-123',
      orgClaims: ['org-1', 'org-2'],
      is_platform_admin: true,
    });

    assert.equal(context.currentUserId, 'user-123');
    assert.deepEqual(context.supplierOrgIds, ['org-1', 'org-2']);
    assert.equal(context.isPlatformAdmin, true);
    assert.equal(context.sqlStatements.length, 3);
    assert.match(context.sqlStatements[0] || '', /SET LOCAL app\.current_user_id/);
    assert.match(context.sqlStatements[1] || '', /SET LOCAL app\.current_user_supplier_org_ids/);
    assert.match(context.sqlStatements[2] || '', /SET LOCAL app\.is_platform_admin = 'true'/);
  });
});

