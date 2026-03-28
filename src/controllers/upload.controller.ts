import { UploadService, UploadValidationError } from '../services/upload.service';
import { EntitlementService } from '../services/entitlement.service';

/**
 * Phase 4.3 Upload Controller
 */
export class UploadController {
    /**
     * 4.3.1 Initiate Upload
     */
    static async initiate(req: any, res: any) {
        const { filename, fileType, sizeBytes, weddingId } = req.body;
        try {
            if (req.user?.supplier_org_id) {
                await EntitlementService.validateAction(
                    req.user.supplier_org_id,
                    'storage_bytes',
                    Number(sizeBytes) || 0,
                    { role: req.user?.role, isPlatformAdmin: req.user?.is_platform_admin }
                );
            }
            const result = await UploadService.initiateMultipart(filename, fileType, weddingId, sizeBytes);
            return res.json(result);
        } catch (err: any) {
            if (err?.code) {
                return res.status(err.status || 403).json({ error: err.message, code: err.code, details: err.details });
            }
            if (err instanceof UploadValidationError) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }
    }

    /**
     * 4.3.1 Upload Part
     */
    static async uploadPart(req: any, res: any) {
        const { uploadId, partNumber } = req.params;
        const { buffer } = req.body; // Simulated
        const partBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
        try {
            const result = await UploadService.uploadWithRetry(() =>
                UploadService.uploadPart(uploadId, Number(partNumber), partBuffer)
            );
            return res.json(result);
        } catch (err: any) {
            if (err instanceof UploadValidationError) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            const detail = process.env.NODE_ENV !== 'production' ? err?.message : undefined;
            return res.status(500).json({ error: 'Failed after 3 retries', ...(detail !== undefined ? { detail } : {}) });
        }
    }

    /**
     * 4.3.7 Abort Upload
     */
    static async abort(req: any, res: any) {
        const { uploadId } = req.params;
        const result = await UploadService.abortUpload(uploadId);
        return res.json(result);
    }
}
