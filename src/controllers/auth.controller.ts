import { AuthService } from '../services/auth.service';

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
     * 1.3.1 Login (OIDC Callback simulation)
     */
    static async login(req: any, res: any) {
        const { providerType, providerSubject } = req.body;
        const limiterKey = providerSubject || req.ip || 'anonymous';

        // 1.3.6 Rate Limiting
        if (!await AuthService.checkRateLimit(limiterKey, 'login')) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        // 1.4.3 Resolve user via identity provider
        const userId = await AuthService.resolveUserByProvider(providerType, providerSubject);
        if (!userId) {
            return res.status(401).json({ error: 'User not found' });
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

        // For email/password, subject is the email
        const userId = await AuthService.registerUserWithIdentity(emailStr, nameStr, 'email_password', emailStr);
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
