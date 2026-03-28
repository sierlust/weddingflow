import { ChatService } from '../services/collaboration.service';

/**
 * Phase 4.1 Chat Controller
 */
export class ChatController {
    /**
     * 4.1.1 List Threads
     */
    static async listThreads(req: any, res: any) {
        const { id: weddingId } = req.params;
        const threads = await ChatService.getThreads(weddingId, req.user.sub, req.user.role);
        return res.json(threads);
    }

    /**
     * 4.1.2 Create Thread
     */
    static async createThread(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { type, participants } = req.body ?? {};
        const validTypes = ['supplier_thread', 'couple_internal', 'all_suppliers'];
        if (!type || !validTypes.includes(type)) {
            return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}.` });
        }
        if (participants !== undefined && !Array.isArray(participants)) {
            return res.status(400).json({ error: 'participants must be an array.' });
        }
        const thread = await ChatService.createThread(weddingId, type, participants || [], {
            creatorUserId: req.user.sub,
            creatorRole: req.user.role
        });
        return res.status(201).json(thread);
    }

    /**
     * 4.1.3 List Messages
     */
    static async listMessages(req: any, res: any) {
        const { threadId } = req.params;
        if (!ChatService.canUserAccessThread(threadId, req.user.sub, req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { cursor, limit } = req.query;
        const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
        const result = await ChatService.getMessages(threadId, cursor, safeLimit);
        return res.json(result);
    }

    /**
     * 4.1.4 Send Message
     */
    static async send(req: any, res: any) {
        const { threadId } = req.params;
        const { content } = req.body ?? {};
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: 'content is required.' });
        }
        if (content.length > 10_000) {
            return res.status(400).json({ error: 'content must be 10,000 characters or fewer.' });
        }
        const message = await ChatService.sendMessage(threadId, req.user.sub, content, req.user.role);
        return res.status(201).json(message);
    }

    /**
     * 4.1.7 Message Actions (Convert to Task)
     */
    static async convertToTask(req: any, res: any) {
        const { messageId } = req.params;
        const result = ChatService.convertToTask(messageId);
        return res.json(result);
    }

    static async reply(req: any, res: any) {
        const { threadId, messageId } = req.params;
        const { content } = req.body;
        const result = await ChatService.replyToMessage(threadId, req.user.sub, messageId, content, req.user.role);
        return res.status(201).json(result);
    }

    static async pin(req: any, res: any) {
        const { messageId } = req.params;
        const { weddingId } = req.body;
        const result = ChatService.pinToWedding(weddingId, messageId, req.user.sub, req.user.role);
        return res.json(result);
    }

    static async convertToAppointment(req: any, res: any) {
        const { messageId } = req.params;
        const { startAt, endAt } = req.body;
        const result = ChatService.convertToAppointment(messageId, startAt, endAt);
        return res.json(result);
    }

    static async attachDocument(req: any, res: any) {
        const { messageId } = req.params;
        const { documentId } = req.body;
        const result = ChatService.attachDocument(messageId, documentId);
        return res.json(result);
    }
}
