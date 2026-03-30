import { AuthService } from '../services/auth.service';

/**
 * Phase 1.3.2 Auth Middleware
 */
export async function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = AuthService.validateAccessToken(token);
        req.user = {
            sub: decoded.sub,
            orgClaims: decoded.orgClaims || [],
            is_platform_admin: !!decoded.is_platform_admin,
            supplier_org_id: decoded.sub,
            role: 'owner',
        };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
