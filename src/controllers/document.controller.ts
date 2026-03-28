import { DocumentService } from '../services/collaboration.service';
import { EntitlementService } from '../services/entitlement.service';

/**
 * Phase 4.2 Document Controller
 */
export class DocumentController {
    /**
     * 4.2.1 Presign Upload
     */
    static async presign(req: any, res: any) {
        const { filename, fileType, sizeBytes } = req.body;
        try {
            const data = await DocumentService.presignUpload(filename, fileType, sizeBytes);
            return res.json(data);
        } catch (err: any) {
            const msg = process.env.NODE_ENV !== 'production' ? err?.message : 'Request failed';
            return res.status(400).json({ error: msg });
        }
    }

    /**
     * 4.2.2 Create Document
     */
    static async create(req: any, res: any) {
        const { weddingId } = req.params;
        try {
            const sizeBytes = Number(req.body?.sizeBytes || 0);
            if (req.user?.supplier_org_id) {
                await EntitlementService.validateAction(
                    req.user.supplier_org_id,
                    'storage_bytes',
                    sizeBytes,
                    { role: req.user?.role, isPlatformAdmin: req.user?.is_platform_admin }
                );
            }

            const doc = await DocumentService.confirmUpload({
                weddingId,
                userId: req.user.sub,
                ...req.body
            });
            if (req.user?.supplier_org_id && sizeBytes > 0) {
                EntitlementService.consumeUsage(req.user.supplier_org_id, 'storage_bytes', sizeBytes);
            }
            return res.status(201).json(doc);
        } catch (err: any) {
            if (err?.code) {
                return res.status(err.status || 403).json({ error: err.message, code: err.code });
            }
            const msg = process.env.NODE_ENV !== 'production' ? err?.message : 'Request failed';
            return res.status(400).json({ error: msg });
        }
    }

    /**
     * 4.2.3 Share Document
     */
    static async share(req: any, res: any) {
        const { id } = req.params;
        const { scope, sharedWithSupplierOrgIds } = req.body;
        const result = await DocumentService.shareDocument(id, scope, sharedWithSupplierOrgIds || [], req.user?.sub);
        return res.json(result);
    }

    /**
     * 4.2.4 List Documents
     */
    static async list(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { category } = req.query;
        const documents = await DocumentService.getWeddingDocuments(weddingId, category);
        return res.json(documents.map((doc: any) => ({
            id: doc.id,
            weddingId: doc.weddingId,
            filename: doc.filename,
            category: doc.category,
            sizeBytes: doc.sizeBytes ?? null,
            createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        })));
    }
}
