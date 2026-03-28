import { AuditService } from '../services/audit.service';

/**
 * Phase 6.1 Audit Controller
 */
export class AuditController {
  /**
   * 6.1.3 List Audit Logs
   */
  static async list(req: any, res: any) {
    const { id: weddingId } = req.params;
    const { entityType, dateFrom, dateTo, page, limit } = req.query;

    const isOwner = req.user?.role === 'owner';
    const isPlatformAdmin = Boolean(req.user?.is_platform_admin);
    if (!isOwner && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Forbidden: audit access requires owner or platform admin role.' });
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);

    const result = await AuditService.getAuditLogs(
      weddingId,
      {
        entityType: typeof entityType === 'string' ? entityType : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
      },
      safePage,
      safeLimit
    );

    return res.json(result);
  }
}
