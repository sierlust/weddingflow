import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';

/**
 * Phase 7.2 Notification Controller
 */
export class NotificationController {
    /**
     * 7.2.2 Register device token
     */
    static async registerToken(req: any, res: any) {
        const { token, platform } = req.body;
        const userId = req.user.sub;

        try {
            await NotificationService.registerToken(userId, token, platform);
            return res.json({ success: true });
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    /**
     * 7.2.5 Update preferences
     */
    static async updatePreferences(req: any, res: any) {
        const userId = req.user.sub;
        const weddingId = typeof req.body?.weddingId === 'string' ? req.body.weddingId : null;
        const patch =
            req.body && typeof req.body.preferences === 'object' && req.body.preferences !== null
                ? req.body.preferences
                : {};

        const { before, after } = await NotificationService.updatePreferences(userId, patch);
        AuditService.logEvent({
            weddingId,
            actorUserId: userId,
            entityType: 'permission_profile',
            entityId: userId,
            action: 'permission_changed',
            beforeJson: before,
            afterJson: after,
        });

        return res.json({ success: true, preferences: after });
    }

    static async muteWedding(req: any, res: any) {
        const userId = req.user.sub;
        const weddingId = String(req.body?.weddingId || '');
        const mutedUntil = req.body?.mutedUntil ? new Date(req.body.mutedUntil) : null;
        if (!weddingId) {
            return res.status(400).json({ error: 'weddingId is required' });
        }
        const result = await NotificationService.setWeddingMuteOverride(
            userId,
            weddingId,
            mutedUntil && !Number.isNaN(mutedUntil.getTime()) ? mutedUntil : null
        );
        return res.json({ success: true, ...result });
    }
}
