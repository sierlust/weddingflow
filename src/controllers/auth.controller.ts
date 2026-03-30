import { createPublicKey } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth.service';

// ─── OAuth helpers ────────────────────────────────────────────────────────────

async function verifyGoogleIdToken(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured.');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('Invalid Google token payload');
    return {
        sub: payload.sub!,
        email: payload.email!,
        name: payload.name || payload.given_name || payload.email!,
    };
}

async function verifyAppleIdToken(idToken: string) {
    const resp = await fetch('https://appleid.apple.com/auth/keys');
    const { keys } = await resp.json() as { keys: any[] };
    const [headerB64] = idToken.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) throw new Error('Apple signing key not found');
    const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }) as string;
    const payload = jwt.verify(idToken, pem, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
    }) as { sub: string; email?: string };
    return payload;
}

/**
 * Phase 1.3 Auth Controller
 */
export class AuthController {
    /**
     * 1.3.1 OIDC discovery
     */
    static async discovery(req: any, res: any) {
        const origin = `${req.protocol}://${req.get('host')}`;
        return res.json(AuthService.getOidcDiscovery(origin));
    }

    /**
     * 1.3.1 JWKS endpoint
     */
    static async jwks(_req: any, res: any) {
        return res.json(AuthService.getJwks());
    }

    /**
     * 1.3.1 Login
     */
    static async login(req: any, res: any) {
        const { providerType, providerSubject, password } = req.body ?? {};

        if (typeof providerType !== 'string' || !providerType.trim() ||
            typeof providerSubject !== 'string' || !providerSubject.trim()) {
            return res.status(400).json({ error: 'providerType and providerSubject are required.' });
        }

        const limiterKey = providerSubject || req.ip || 'anonymous';

        // Rate Limiting
        if (!await AuthService.checkRateLimit(limiterKey, 'login')) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        let userId: string | null;

        if (providerType === 'email_password') {
            // Wachtwoord verificatie via Supabase Auth
            if (typeof password !== 'string' || !password) {
                return res.status(400).json({ error: 'Wachtwoord is verplicht.' });
            }
            userId = await AuthService.verifyEmailPassword(providerSubject, password);
            if (!userId) {
                return res.status(401).json({ error: 'Ongeldig e-mailadres of wachtwoord.' });
            }
        } else {
            // OAuth providers: resolve via identity store
            userId = await AuthService.resolveUserByProvider(providerType, providerSubject);
            if (!userId) {
                return res.status(401).json({ error: 'User not found' });
            }
        }

        const tokens = await AuthService.generateTokens(userId, []);
        return res.json(tokens);
    }

    /**
     * 1.4.4 Standard Registration
     */
    static async register(req: any, res: any) {
        const { email, name, password } = req.body ?? {};

        // Rate limit registration attempts per IP
        const limiterKey = req.ip || 'anonymous';
        if (!await AuthService.checkRateLimit(limiterKey, 'register')) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        const emailStr = typeof email === 'string' ? email.trim() : '';
        const nameStr = typeof name === 'string' ? name.trim() : '';
        const passwordStr = typeof password === 'string' ? password : '';

        if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr) || emailStr.length > 254) {
            return res.status(400).json({ error: 'A valid email address is required (max 254 characters).' });
        }
        if (!nameStr || nameStr.length > 100) {
            return res.status(400).json({ error: 'Name is required (max 100 characters).' });
        }
        if (!passwordStr || passwordStr.length < 8 || passwordStr.length > 128) {
            return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
        }

        // For email/password, subject is the email — reject if already registered
        const existing = await AuthService.resolveUserByProvider('email_password', emailStr);
        if (existing) {
            return res.status(409).json({ error: 'E-mailadres is al in gebruik.' });
        }

        const userId = await AuthService.registerUserWithIdentity(emailStr, nameStr, 'email_password', emailStr, passwordStr);
        const tokens = await AuthService.generateTokens(userId, []);

        return res.status(201).json(tokens);
    }

    /**
     * 1.3.3 Token Refresh
     */
    static async refresh(req: any, res: any) {
        const { refreshToken } = req.body;
        const limiterKey = refreshToken ? String(refreshToken).slice(0, 16) : req.ip || 'anonymous';

        if (!await AuthService.checkRateLimit(limiterKey, 'refresh')) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        try {
            const tokens = await AuthService.refresh(refreshToken);
            return res.json(tokens);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }
    }

    /**
     * OAuth login — Google or Apple
     * Body: { provider: 'google' | 'apple', idToken: string }
     */
    static async oauthLogin(req: any, res: any) {
        const { provider, idToken } = req.body ?? {};
        if (!provider || !idToken) {
            return res.status(400).json({ error: 'provider en idToken zijn verplicht.' });
        }

        const limiterKey = req.ip || 'anonymous';
        if (!await AuthService.checkRateLimit(limiterKey, 'login')) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        try {
            let sub: string;
            let email: string;
            let name: string;

            if (provider === 'google') {
                const p = await verifyGoogleIdToken(idToken);
                sub = p.sub; email = p.email; name = p.name;
            } else if (provider === 'apple') {
                const p = await verifyAppleIdToken(idToken);
                sub = p.sub;
                email = p.email ?? `${sub}@privaterelay.appleid.com`;
                name = email.split('@')[0];
            } else {
                return res.status(400).json({ error: 'Ongeldige provider. Gebruik "google" of "apple".' });
            }

            let userId = await AuthService.resolveUserByProvider(provider, sub);
            if (!userId) {
                userId = await AuthService.registerUserWithIdentity(email, name, provider, sub);
            }

            const tokens = await AuthService.generateTokens(userId, []);
            return res.json(tokens);
        } catch (err: any) {
            return res.status(401).json({ error: err.message || 'OAuth verificatie mislukt.' });
        }
    }

    /**
     * 1.3.4 Logout
     */
    static async logout(req: any, res: any) {
        const { refreshToken } = req.body;
        await AuthService.logout(refreshToken);
        return res.status(204).send();
    }

    /**
     * Get current user info from token
     */
    static async me(req: any, res: any) {
        const authHeader = req.headers['authorization'] ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'No token' });
        const user = AuthService.getUserFromToken(token);
        if (!user) return res.status(401).json({ error: 'Invalid token' });
        return res.json(user);
    }
}
