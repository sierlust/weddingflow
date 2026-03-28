import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

type RateLimitKind = 'login' | 'refresh' | 'register';
type ProviderType = 'email_password' | 'oidc_google' | 'oidc_microsoft';

type UserRecord = {
    id: string;
    email: string;
    name: string;
    locale: string;
    createdAt: Date;
};

type RefreshSession = {
    userId: string;
    orgClaims: string[];
    expiresAt: Date;
};

type AccessTokenClaims = {
    sub: string;
    orgClaims: string[];
    is_platform_admin?: boolean;
};

/**
 * Phase 1.3 Auth Integration Service
 */
export class AuthService {
    private static readonly ACCESS_TOKEN_EXPIRY = '15m';
    private static readonly REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    private static readonly JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    private static readonly JWT_ISSUER = process.env.JWT_ISSUER || 'managementapp-local';
    private static readonly JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'managementapp-api';

    // 1.3.3 Refresh Token Rotation Store
    private static refreshTokens: Map<string, RefreshSession> = new Map();

    // Minimal in-memory identity store to support 1.4.3/1.4.4 locally.
    private static users: Map<string, UserRecord> = new Map();
    private static identityProviders: Map<string, string> = new Map();

    // 1.3.6 Sliding-window rate limiter state
    private static rateWindows: Map<string, number[]> = new Map();
    private static readonly RATE_LIMITS: Record<RateLimitKind, { max: number; windowMs: number }> = {
        login: { max: 10, windowMs: 60_000 },
        refresh: { max: 20, windowMs: 60_000 },
        register: { max: 10, windowMs: 60_000 },
    };

    private static initialized = false;

    private static ensureInitialized(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        const demoUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
        this.users.set(demoUserId, {
            id: demoUserId,
            email: 'couple@example.com',
            name: 'Sarah & Tom',
            locale: 'nl',
            createdAt: new Date(),
        });
        this.identityProviders.set(this.getIdentityKey('email_password', 'couple@example.com'), demoUserId);
    }

    private static getIdentityKey(providerType: ProviderType | string, providerSubject: string): string {
        return `${providerType}:${providerSubject.toLowerCase()}`;
    }

    /**
     * 1.3.2 Generate and Sign JWT
     */
    static async generateTokens(userId: string, orgClaims: string[]) {
        this.ensureInitialized();
        const accessToken = jwt.sign(
            {
                sub: userId,
                orgClaims,
            } satisfies AccessTokenClaims,
            this.JWT_SECRET,
            {
                algorithm: 'HS256',
                expiresIn: this.ACCESS_TOKEN_EXPIRY,
                issuer: this.JWT_ISSUER,
                audience: this.JWT_AUDIENCE,
            }
        );
        const refreshToken = crypto.randomBytes(32).toString('hex');

        // 1.3.7 Refresh token rotation storage.
        this.refreshTokens.set(refreshToken, {
            userId,
            orgClaims,
            expiresAt: new Date(Date.now() + this.REFRESH_TTL_MS)
        });

        return { accessToken, refreshToken, expiresIn: '15m' };
    }

    /**
     * 1.3.2 Validate signature, expiry, issuer, audience.
     */
    static validateAccessToken(token: string): AccessTokenClaims {
        const decoded = jwt.verify(token, this.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: this.JWT_ISSUER,
            audience: this.JWT_AUDIENCE,
        }) as AccessTokenClaims;
        return decoded;
    }

    /**
     * 1.3.1 OIDC Discovery Endpoint payload
     */
    static getOidcDiscovery(baseUrl: string) {
        const issuer = `${baseUrl.replace(/\/$/, '')}/v1/auth`;
        return {
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks.json`,
            userinfo_endpoint: `${issuer}/userinfo`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['HS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
            scopes_supported: ['openid', 'profile', 'email'],
            claims_supported: ['sub', 'orgClaims', 'is_platform_admin'],
        };
    }

    /**
     * Local JWKS endpoint for OIDC discovery completeness.
     * HS256 has no public key distribution, so this list is empty by design.
     */
    static getJwks() {
        return { keys: [] as any[] };
    }

    /**
     * 1.3.3 Refresh Logic
     */
    static async refresh(oldRefreshToken: string) {
        this.ensureInitialized();
        const session = this.refreshTokens.get(oldRefreshToken);
        if (!session || session.expiresAt < new Date()) {
            this.refreshTokens.delete(oldRefreshToken);
            throw new Error('Invalid or expired refresh token');
        }

        // 1.3.7 Refresh token rotation: revoke old, issue new.
        this.refreshTokens.delete(oldRefreshToken);
        return this.generateTokens(session.userId, session.orgClaims);
    }

    /**
     * 1.3.4 Logout (Revocation)
     */
    static async logout(refreshToken: string) {
        this.refreshTokens.delete(refreshToken);
        return { success: true };
    }

    /**
     * 1.3.6 Rate Limiting (Helper logic)
     */
    static async checkRateLimit(identifier: string, type: RateLimitKind): Promise<boolean> {
        const key = `${type}:${identifier || 'anonymous'}`;
        const now = Date.now();
        const config = this.RATE_LIMITS[type];
        const existing = this.rateWindows.get(key) || [];
        const recent = existing.filter((t) => now - t < config.windowMs);

        if (recent.length >= config.max) {
            this.rateWindows.set(key, recent);
            return false;
        }

        recent.push(now);
        this.rateWindows.set(key, recent);
        return true;
    }

    static getUserFromToken(token: string) {
        try {
            const claims = jwt.verify(token, this.JWT_SECRET) as AccessTokenClaims;
            const user = this.users.get(claims.sub);
            if (!user) return null;
            return { id: user.id, email: user.email, name: user.name, role: 'couple' };
        } catch {
            return null;
        }
    }

    /**
     * 1.4.3 Resolve user via identity provider lookup
     */
    static async resolveUserByProvider(providerType: string, providerSubject: string) {
        this.ensureInitialized();
        const key = this.getIdentityKey(providerType, providerSubject);
        return this.identityProviders.get(key) || null;
    }

    /**
     * 1.4.4 Register user with identity provider row
     */
    static async registerUserWithIdentity(email: string, name: string, providerType: string, providerSubject: string) {
        this.ensureInitialized();
        const normalizedEmail = email.toLowerCase();
        const identityKey = this.getIdentityKey(providerType, providerSubject);
        if (this.identityProviders.has(identityKey)) {
            return this.identityProviders.get(identityKey)!;
        }
        const newUserId = crypto.randomUUID();
        this.users.set(newUserId, {
            id: newUserId,
            email: normalizedEmail,
            name,
            locale: 'nl',
            createdAt: new Date(),
        });
        this.identityProviders.set(identityKey, newUserId);
        this.identityProviders.set(this.getIdentityKey('email_password', normalizedEmail), newUserId);
        return newUserId;
    }

    static async rollbackUserRegistration(userId: string) {
        this.users.delete(userId);
        for (const [identityKey, mappedUserId] of Array.from(this.identityProviders.entries())) {
            if (mappedUserId === userId) {
                this.identityProviders.delete(identityKey);
            }
        }
    }

    static clearStateForTests() {
        this.refreshTokens.clear();
        this.rateWindows.clear();
        this.users.clear();
        this.identityProviders.clear();
        this.initialized = false;
        this.ensureInitialized();
    }

    static getJwtConfigForTests() {
        return {
            secret: this.JWT_SECRET,
            issuer: this.JWT_ISSUER,
            audience: this.JWT_AUDIENCE,
        };
    }
}
