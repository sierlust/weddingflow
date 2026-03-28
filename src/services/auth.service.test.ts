import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  beforeEach(() => {
    AuthService.clearStateForTests();
  });

  test('generates and validates JWT access token with issuer/audience checks', async () => {
    const { accessToken } = await AuthService.generateTokens('user-123', ['org-1']);
    const claims = AuthService.validateAccessToken(accessToken);
    assert.equal(claims.sub, 'user-123');
    assert.deepEqual(claims.orgClaims, ['org-1']);
  });

  test('rotates refresh token and revokes old refresh token', async () => {
    const first = await AuthService.generateTokens('user-abc', []);
    const second = await AuthService.refresh(first.refreshToken);

    assert.ok(second.refreshToken);
    assert.notEqual(second.refreshToken, first.refreshToken);

    await assert.rejects(async () => {
      await AuthService.refresh(first.refreshToken);
    });
  });

  test('logout revokes refresh token', async () => {
    const first = await AuthService.generateTokens('logout-user', []);
    await AuthService.logout(first.refreshToken);

    await assert.rejects(async () => {
      await AuthService.refresh(first.refreshToken);
    });
  });

  test('rate limiter blocks after configured threshold', async () => {
    const key = 'rate-test-user';
    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 12; i += 1) {
      const allowed = await AuthService.checkRateLimit(key, 'login');
      if (allowed) {
        allowedCount += 1;
      } else {
        blockedCount += 1;
      }
    }

    assert.equal(allowedCount, 10);
    assert.equal(blockedCount, 2);
  });

  test('rejects tampered and expired tokens', async () => {
    const { accessToken } = await AuthService.generateTokens('verify-user', []);
    const tampered = `${accessToken}x`;
    assert.throws(() => {
      AuthService.validateAccessToken(tampered);
    });

    const cfg = AuthService.getJwtConfigForTests();
    const expired = jwt.sign(
      { sub: 'verify-user', orgClaims: [] },
      cfg.secret,
      {
        algorithm: 'HS256',
        expiresIn: -1,
        issuer: cfg.issuer,
        audience: cfg.audience,
      }
    );
    assert.throws(() => {
      AuthService.validateAccessToken(expired);
    });
  });

  test('register resolves via identity provider lookup', async () => {
    const userId = await AuthService.registerUserWithIdentity(
      'newuser@example.com',
      'New User',
      'email_password',
      'newuser@example.com'
    );
    const resolved = await AuthService.resolveUserByProvider('email_password', 'newuser@example.com');
    assert.equal(resolved, userId);
  });

  test('provides OIDC discovery metadata', () => {
    const metadata = AuthService.getOidcDiscovery('http://localhost:3000');
    assert.equal(metadata.issuer, 'http://localhost:3000/v1/auth');
    assert.equal(metadata.jwks_uri, 'http://localhost:3000/v1/auth/jwks.json');
    assert.match(metadata.authorization_endpoint, /\/authorize$/);
  });

  test('supports registering users with new OIDC providers without schema changes', async () => {
    const userId = await AuthService.registerUserWithIdentity(
      'okta-user@example.com',
      'Okta User',
      'oidc_okta',
      'okta|abc123'
    );

    const resolved = await AuthService.resolveUserByProvider('oidc_okta', 'okta|abc123');
    assert.equal(resolved, userId);
  });
});
