import { ROSService } from '../services/ros.service';

/**
 * Phase 5.1 & 5.4 RoS Controller
 */
export class ROSController {
    static async getDraft(req: any, res: any) {
        const { id: wedding_id } = req.params;
        const draft = await ROSService.getDraft(wedding_id);
        return res.json(draft);
    }

    static async getPublished(req: any, res: any) {
        const { id: wedding_id } = req.params;
        const org_id = req.user.supplier_org_id;
        const version = await ROSService.getLatestPublishedVersion(wedding_id, org_id);
        return res.json({ version: version ?? null });
    }

    /**
     * 5.1.6 Publish Run-of-Show
     */
    static async publish(req: any, res: any) {
        const { id: wedding_id } = req.params;
        const { change_summary } = req.body;
        const user_id = req.user.sub;

        try {
            const result = await ROSService.publishVersion(wedding_id, user_id, change_summary);
            return res.status(201).json(result);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    /**
     * 5.1.7 Autosave Draft
     */
    static async saveDraft(req: any, res: any) {
        const { id: wedding_id } = req.params;
        const { draft_json } = req.body;
        await ROSService.saveDraft(wedding_id, req.user.sub, draft_json);
        // Return in RosDraft format so mobile client gets draft_json back
        const draft = await ROSService.getDraft(wedding_id);
        return res.json(draft);
    }

    /**
     * 5.3.1 & 5.3.3 Request Change (Supplier)
     */
    static async requestChange(req: any, res: any) {
        const { version_id, item_id, type, reason, proposed_values } = req.body;
        const org_id = req.user.supplier_org_id;

        try {
            const result = await ROSService.submitChangeRequest({
                versionId: version_id,
                itemId: item_id,
                supplierOrgId: org_id,
                userId: req.user.sub,
                type,
                reason,
                proposedValues: proposed_values
            });
            return res.status(201).json(result);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }

    /**
     * 5.3.4 List My Requests (Supplier)
     */
    static async listMyRequests(req: any, res: any) {
        const org_id = req.user.supplier_org_id;
        const requests = await ROSService.getMyChangeRequests(org_id);
        return res.json(requests);
    }

    /**
     * 5.4.1 List Pending Requests (Couple Owner)
     */
    static async listPendingRequests(req: any, res: any) {
        const { id: weddingId } = req.params;
        const requests = await ROSService.getPendingChangeRequests(weddingId);
        return res.json(requests);
    }

    /**
     * 5.4.2 Review Request (Couple Owner)
     */
    static async resolveRequest(req: any, res: any) {
        const { requestId } = req.params;
        const { status, rejectionReason, apply_edits } = req.body;
        const userId = req.user.sub;

        try {
            if (status === 'message') {
                return res.status(200).json({ status: 'message_sent', requestId });
            }

            const action = status === 'accepted' ? 'accept' : 'reject';
            const result = await ROSService.resolveChangeRequest(
                requestId,
                action,
                userId,
                rejectionReason,
                apply_edits
            );
            return res.status(200).json(result);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }
}
