import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../services/auth.service';
import { authMiddleware } from './auth.middleware';

describe('authMiddleware', () => {
  beforeEach(() => {
    AuthService.clearStateForTests();
  });

  test('hydrates req.user and db session context from JWT claims', async () => {
    const { accessToken } = await AuthService.generateTokens('user-ctx', ['org-ctx']);
    const req: any = {
      headers: { authorization: `Bearer ${accessToken}` },
    };
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
        return this;
      },
    };

    let called = false;
    await authMiddleware(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
    assert.equal(req.user.sub, 'user-ctx');
    assert.deepEqual(req.user.orgClaims, ['org-ctx']);
    assert.ok(req.dbSessionContext);
    assert.equal(req.dbSessionContext.currentUserId, 'user-ctx');
    assert.equal(Array.isArray(req.dbSessionSql), true);
    assert.equal(req.dbSessionSql.length, 3);
  });
});

