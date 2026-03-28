import crypto from 'crypto';
import { RealtimeService } from './realtime.service';
import { AuditService } from './audit.service';

/**
 * Phase 4.1 Chat Module logic
 */
export class ChatService {
    private static readonly MESSAGE_ACTIONS = {
        TASK: 'task',
        APPOINTMENT: 'appointment',
        ATTACHMENT: 'attachment',
        REPLY: 'reply',
    } as const;

    private static threads: Map<string, { id: string; weddingId: string; type: 'supplier_thread' | 'couple_internal' | 'all_suppliers'; createdAt: Date }> = new Map();
    private static threadParticipants: Map<string, Set<string>> = new Map();
    private static messages: Map<
        string,
        {
            id: string;
            threadId: string;
            senderId: string;
            content: string;
            createdAt: Date;
            replyToMessageId?: string;
            metadata?: Record<string, unknown>;
        }[]
    > = new Map();
    private static pinnedByWedding: Map<string, Set<string>> = new Map();

    private static ensureThread(threadId: string) {
        if (!this.threadParticipants.has(threadId)) {
            this.threadParticipants.set(threadId, new Set());
        }
        if (!this.messages.has(threadId)) {
            this.messages.set(threadId, []);
        }
    }

    static clearStateForTests() {
        this.threads.clear();
        this.threadParticipants.clear();
        this.messages.clear();
        this.pinnedByWedding.clear();
    }

    static canUserAccessThread(threadId: string, userId: string, role?: string): boolean {
        if (role === 'owner') return true;
        const participants = this.threadParticipants.get(threadId);
        return !!participants && participants.has(userId);
    }

    static getThreadById(threadId: string) {
        return this.threads.get(threadId) || null;
    }

    static addParticipant(threadId: string, userId: string) {
        this.ensureThread(threadId);
        this.threadParticipants.get(threadId)!.add(userId);
    }

    /**
     * 4.1.1 Get threads for user
     */
    static async getThreads(weddingId: string, userId: string, role?: string) {
        return Array.from(this.threads.values())
            .filter((t) => t.weddingId === weddingId && this.canUserAccessThread(t.id, userId, role))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * 4.1.2 Create thread
     */
    static async createThread(
        weddingId: string,
        type: 'supplier_thread' | 'couple_internal' | 'all_suppliers',
        participantIds: string[],
        options: { creatorUserId: string; creatorRole?: string; metadata?: Record<string, any>; id?: string }
    ) {
        if (type === 'all_suppliers' && options.creatorRole !== 'owner') {
            throw new Error('Only couple owner can create all_suppliers threads');
        }
        const id = options.id || `thread-${Math.random().toString(36).slice(2, 10)}`;
        let thread = this.threads.get(id);
        if (!thread) {
            thread = { id, weddingId, type, createdAt: new Date(), metadata: options.metadata || {} };
            this.threads.set(id, thread);
        } else if (options.metadata) {
            thread.metadata = { ...thread.metadata, ...options.metadata };
        }
        this.ensureThread(id);
        this.threadParticipants.get(id)!.add(options.creatorUserId);
        for (const participant of participantIds || []) {
            this.threadParticipants.get(id)!.add(participant);
        }
        return thread;
    }

    /**
     * 4.1.3 Get messages (pagination)
     */
    static async getMessages(threadId: string, cursor?: string, limit: number = 20) {
        const all = (this.messages.get(threadId) || [])
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const cursorDate = cursor ? new Date(cursor) : null;
        const filtered = cursorDate ? all.filter((m) => m.createdAt < cursorDate) : all;
        const page = filtered.slice(0, limit);
        const nextCursor = filtered.length > limit && page.length ? page[page.length - 1].createdAt.toISOString() : null;
        return { messages: page, nextCursor };
    }

    /**
     * 4.1.4 Send and Broadcast Message
     */
    static async sendMessage(threadId: string, senderId: string, content: string, senderRole?: string) {
        if (!this.canUserAccessThread(threadId, senderId, senderRole)) {
            throw new Error('Forbidden: sender is not a thread participant');
        }
        this.ensureThread(threadId);
        if (senderRole === 'owner' && !this.threads.has(threadId)) {
            const match = threadId.match(/^thread-(wed-[a-z0-9]+)-/);
            if (match) {
                this.threads.set(threadId, {
                    id: threadId,
                    weddingId: match[1],
                    type: 'supplier_thread',
                    createdAt: new Date(),
                    metadata: {}
                });
            }
        }
        const message = {
            id: `msg-${Math.random().toString(36).slice(2, 10)}`,
            threadId,
            senderId,
            content,
            createdAt: new Date()
        };
        this.messages.get(threadId)!.push(message);
        const thread = this.threads.get(threadId);
        RealtimeService.broadcastEvent('message.created', {
            threadId,
            weddingId: thread?.weddingId,
            data: message,
        });
        return message;
    }

    /**
     * 4.1.7 Convert message to task
     */
    static convertToTask(messageId: string) {
        const located = this.findMessageById(messageId);
        if (!located) {
            throw new Error('Message not found');
        }
        const taskId = `task-${Math.random().toString(36).slice(2, 10)}`;
        located.message.metadata = {
            ...(located.message.metadata || {}),
            action: this.MESSAGE_ACTIONS.TASK,
            taskId,
        };
        const weddingId = this.threads.get(located.threadId)?.weddingId;
        RealtimeService.broadcastEvent('task.updated', {
            threadId: located.threadId,
            weddingId,
            data: { messageId, taskId, status: 'created' },
        });
        return { messageId, taskId, status: 'task_created' };
    }

    static async replyToMessage(threadId: string, senderId: string, parentMessageId: string, content: string, senderRole?: string) {
        if (!this.canUserAccessThread(threadId, senderId, senderRole)) {
            throw new Error('Forbidden: sender is not a thread participant');
        }
        const parent = this.findMessageById(parentMessageId);
        if (!parent || parent.threadId !== threadId) {
            throw new Error('Parent message not found in thread');
        }

        this.ensureThread(threadId);
        const message = {
            id: `msg-${Math.random().toString(36).slice(2, 10)}`,
            threadId,
            senderId,
            content,
            createdAt: new Date(),
            replyToMessageId: parentMessageId,
            metadata: { action: this.MESSAGE_ACTIONS.REPLY },
        };
        this.messages.get(threadId)!.push(message);
        const weddingId = this.threads.get(threadId)?.weddingId;
        RealtimeService.broadcastEvent('message.created', {
            threadId,
            weddingId,
            data: message,
        });
        return message;
    }

    static pinToWedding(weddingId: string, messageId: string, userId: string, userRole?: string) {
        const located = this.findMessageById(messageId);
        if (!located) {
            throw new Error('Message not found');
        }
        if (!this.canUserAccessThread(located.threadId, userId, userRole)) {
            throw new Error('Forbidden: user is not a thread participant');
        }
        const set = this.pinnedByWedding.get(weddingId) || new Set<string>();
        set.add(messageId);
        this.pinnedByWedding.set(weddingId, set);
        return { weddingId, messageId, status: 'pinned' };
    }

    static convertToAppointment(messageId: string, startAtIso: string, endAtIso: string) {
        const located = this.findMessageById(messageId);
        if (!located) {
            throw new Error('Message not found');
        }
        const appointmentId = `appt-${Math.random().toString(36).slice(2, 10)}`;
        located.message.metadata = {
            ...(located.message.metadata || {}),
            action: this.MESSAGE_ACTIONS.APPOINTMENT,
            appointmentId,
            startAt: startAtIso,
            endAt: endAtIso,
        };
        const weddingId = this.threads.get(located.threadId)?.weddingId;
        RealtimeService.broadcastEvent('appointment.updated', {
            threadId: located.threadId,
            weddingId,
            data: { messageId, appointmentId, startAt: startAtIso, endAt: endAtIso },
        });
        return { messageId, appointmentId, status: 'appointment_created' };
    }

    static attachDocument(messageId: string, documentId: string) {
        const located = this.findMessageById(messageId);
        if (!located) {
            throw new Error('Message not found');
        }
        located.message.metadata = {
            ...(located.message.metadata || {}),
            action: this.MESSAGE_ACTIONS.ATTACHMENT,
            documentId,
        };
        const weddingId = this.threads.get(located.threadId)?.weddingId;
        RealtimeService.broadcastEvent('document.shared', {
            threadId: located.threadId,
            weddingId,
            data: { messageId, documentId },
        });
        return { messageId, documentId, status: 'document_attached' };
    }

    /**
     * 4.1.8 Supplier Removal WS Closure Helper
     */
    static async handleSupplierRemoval(userId: string, weddingId?: string, actorUserId?: string) {
        RealtimeService.disconnectUser(userId);
        AuditService.logEvent({
            weddingId: weddingId || null,
            actorUserId: actorUserId || null,
            entityType: 'supplier',
            entityId: userId,
            action: 'removed',
            beforeJson: { active: true },
            afterJson: { active: false },
        });
        console.log(`Closing all WS subscriptions for removed user ${userId}`);
    }

    /**
     * 4.1.8 WebSocket Broadcast helper
     */
    static broadcastMessage(threadId: string, payload: any) {
        RealtimeService.broadcastToThread(threadId, payload);
        console.log(`WS BROADCAST [Thread ${threadId}]:`, payload);
    }

    /**
     * 2.3.3 Send System Message
     */
    static async sendSystemMessage(weddingId: string, content: string) {
        console.log(`[SYSTEM ALERT] Wedding ${weddingId}: ${content}`);
        return { success: true };
    }

    private static findMessageById(messageId: string): { threadId: string; message: any } | null {
        for (const [threadId, messages] of this.messages.entries()) {
            const message = messages.find((entry) => entry.id === messageId);
            if (message) {
                return { threadId, message };
            }
        }
        return null;
    }
}

/**
 * Phase 4.2 Document Library logic
 */
export class DocumentService {
    private static documents: Map<string, any> = new Map();

    static clearStateForTests() {
        this.documents.clear();
    }

    /**
     * 4.2.1 Presign S3 Upload URL
     */
    static async presignUpload(filename: string, fileType: string, sizeBytes: number) {
        if (sizeBytes > 250 * 1024 * 1024) throw new Error('File too large (max 250MB)');
        return {
            uploadUrl: `https://s3.amazonaws.com/wedding-uploads/${filename}?presigned=true`,
            s3Key: `uploads/${Date.now()}-${filename}`,
            expiresIn: 900 // 15 minutes
        };
    }

    /**
     * 4.2.2 Confirm Upload & Create Record
     */
    static async confirmUpload(data: {
        weddingId: string,
        userId: string,
        filename: string,
        s3Key: string,
        category: string,
        visibilityScope?: string,
        sharedWithSupplierOrgIds?: string[],
        // Optioneel: bewaar originele waarden bij restore vanuit schijf
        id?: string,
        sizeBytes?: number,
        createdAt?: Date | string,
    }) {
        const inferredScope = data.visibilityScope || this.inferVisibilityScope(data.category);
        if (inferredScope === 'selected_suppliers' && (!data.sharedWithSupplierOrgIds || data.sharedWithSupplierOrgIds.length === 0)) {
            throw new Error('selected_suppliers visibility requires at least one supplier org');
        }
        const resolvedCreatedAt = data.createdAt
            ? (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt))
            : new Date();
        const doc = {
            id: data.id || `doc-${Math.random().toString(36).slice(2, 10)}`,
            weddingId: data.weddingId,
            userId: data.userId,
            filename: data.filename,
            s3Key: data.s3Key,
            category: data.category,
            visibilityScope: inferredScope,
            sharedWithSupplierOrgIds: data.sharedWithSupplierOrgIds || [],
            sizeBytes: data.sizeBytes,
            createdAt: resolvedCreatedAt,
            accessVersion: 1,
        };
        this.documents.set(doc.id, doc);
        return doc;
    }

    /**
     * 4.2.4 Get Wedding Documents with Filters
     */
    static async getWeddingDocuments(weddingId: string, category?: string) {
        return Array.from(this.documents.values())
            .filter((doc) => doc.weddingId === weddingId)
            .filter((doc) => (category ? doc.category === category : true))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * 4.2.3 Share Document
     */
    static async shareDocument(
        documentId: string,
        scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers',
        sharedWithSupplierOrgIds: string[] = [],
        actorUserId?: string
    ) {
        const doc = this.documents.get(documentId);
        if (!doc) {
            throw new Error('Document not found');
        }
        const beforeState = {
            visibility_scope: doc.visibilityScope,
            shared_with_supplier_org_ids: [...(doc.sharedWithSupplierOrgIds || [])],
            access_version: doc.accessVersion,
        };
        doc.visibilityScope = scope;
        doc.sharedWithSupplierOrgIds = sharedWithSupplierOrgIds;
        // 4.2.3: Force new signed URL generation semantics.
        doc.accessVersion += 1;
        const afterState = {
            visibility_scope: doc.visibilityScope,
            shared_with_supplier_org_ids: [...(doc.sharedWithSupplierOrgIds || [])],
            access_version: doc.accessVersion,
        };
        const isUnshared =
            scope === 'couple_only' ||
            (scope === 'selected_suppliers' && sharedWithSupplierOrgIds.length === 0);
        AuditService.logEvent({
            weddingId: doc.weddingId,
            actorUserId: actorUserId || null,
            entityType: 'document',
            entityId: documentId,
            action: isUnshared ? 'unshared' : 'shared',
            beforeJson: beforeState,
            afterJson: afterState,
        });
        RealtimeService.broadcastEvent('document.shared', {
            weddingId: doc.weddingId,
            data: { documentId, scope, sharedWithSupplierOrgIds, accessVersion: doc.accessVersion },
        });
        return { documentId, scope, status: 'updated', accessVersion: doc.accessVersion };
    }

    static async deleteDocument(documentId: string, actorUserId?: string) {
        const doc = this.documents.get(documentId);
        if (!doc) {
            throw new Error('Document not found');
        }
        const beforeState = {
            id: doc.id,
            filename: doc.filename,
            category: doc.category,
            visibility_scope: doc.visibilityScope,
        };
        this.documents.delete(documentId);
        AuditService.logEvent({
            weddingId: doc.weddingId,
            actorUserId: actorUserId || null,
            entityType: 'document',
            entityId: documentId,
            action: 'deleted',
            beforeJson: beforeState,
            afterJson: null,
        });
        return { success: true, documentId };
    }

    static canSupplierAccessDocument(documentId: string, supplierOrgId: string): boolean {
        const doc = this.documents.get(documentId);
        if (!doc) {
            return false;
        }
        if (doc.visibilityScope === 'all_assigned_suppliers') {
            return true;
        }
        if (doc.visibilityScope === 'selected_suppliers') {
            return (doc.sharedWithSupplierOrgIds || []).includes(supplierOrgId);
        }
        return false;
    }

    private static inferVisibilityScope(category: string): 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' {
        if (category === 'Inspiration') {
            return 'selected_suppliers';
        }
        if (category === 'Run-of-show attachments') {
            return 'all_assigned_suppliers';
        }
        return 'couple_only';
    }
}
/**
 * Phase 4.4 Calendar & iCal Feed logic
 */
export class CalendarService {
    private static appointments: Map<string, {
        id: string;
        weddingId: string;
        title: string;
        startAt: Date;
        endAt: Date;
        timezone: string;
        locationOrLink: string | null;
        notes: { value: string; scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' };
        attachments: string[];
        reminderSettings: { minutesBefore: number; channel: 'email' | 'push' }[];
        visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
        participants: { userId?: string; supplierOrgId?: string }[];
        createdAt: Date;
    }> = new Map();

    private static subscriptionsByKey: Map<string, string> = new Map();
    private static subscriptionsByToken: Map<string, {
        token: string;
        weddingId: string;
        userId: string;
        supplierOrgIds: string[];
        isOwner: boolean;
        isPlatformAdmin: boolean;
        revokedAt: Date | null;
    }> = new Map();

    /**
     * 4.4.1 Get appointments with visibility filtering
     */
    static async getAppointments(
        weddingId: string,
        context: {
            userId: string;
            supplierOrgIds?: string[];
            isOwner?: boolean;
            isPlatformAdmin?: boolean;
        }
    ) {
        const normalizedContext = this.normalizeContext(context);
        const subscriptionUrl = await this.getSubscriptionUrl(weddingId, normalizedContext.userId, normalizedContext);
        const token = this.extractToken(subscriptionUrl);

        return Array.from(this.appointments.values())
            .filter((appointment) => appointment.weddingId === weddingId)
            .filter((appointment) => this.canViewAppointment(appointment, normalizedContext))
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
            .map((appointment) => this.toPublicAppointment(appointment, normalizedContext, token));
    }

    /**
     * 4.4.2 Create appointment
     */
    static async createAppointment(data: {
        weddingId: string,
        title: string,
        startAt: Date | string,
        endAt: Date | string,
        timezone?: string,
        location?: string,
        locationOrLink?: string,
        notes?: string | { value: string; scope?: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' },
        visibilityScope?: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers',
        participants?: { userId?: string, supplierOrgId?: string }[]
        attachments?: string[],
        reminderSettings?: { minutesBefore: number; channel?: 'email' | 'push' }[]
    }) {
        if (!data.title?.trim()) {
            throw new Error('title is required');
        }
        const startAt = new Date(data.startAt);
        const endAt = new Date(data.endAt);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
            throw new Error('startAt and endAt must be valid dates');
        }
        if (startAt >= endAt) {
            throw new Error('endAt must be after startAt');
        }

        const visibilityScope = data.visibilityScope || 'couple_only';
        const participants = (data.participants || [])
            .filter((participant) => participant.userId || participant.supplierOrgId)
            .map((participant) => ({
                userId: participant.userId,
                supplierOrgId: participant.supplierOrgId,
            }));

        const notesValue = typeof data.notes === 'string' ? data.notes : (data.notes?.value || '');
        const notesScope =
            (typeof data.notes === 'string' ? undefined : data.notes?.scope) || visibilityScope || 'couple_only';

        const reminderSettings = (data.reminderSettings || []).map((reminder) => ({
            minutesBefore: reminder.minutesBefore,
            channel: reminder.channel || 'push',
        }));

        const appointment = {
            id: `appt-${Math.random().toString(36).slice(2, 10)}`,
            weddingId: data.weddingId,
            title: data.title.trim(),
            startAt,
            endAt,
            timezone: data.timezone || 'UTC',
            locationOrLink: data.locationOrLink || data.location || null,
            notes: {
                value: notesValue,
                scope: notesScope as 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers',
            },
            attachments: data.attachments || [],
            reminderSettings,
            visibilityScope,
            participants,
            createdAt: new Date(),
        };

        this.appointments.set(appointment.id, appointment);
        RealtimeService.broadcastEvent('appointment.updated', {
            weddingId: appointment.weddingId,
            data: { appointmentId: appointment.id, title: appointment.title, status: 'created' },
        });

        return this.toPublicAppointment(appointment, { userId: 'system', isOwner: true, supplierOrgIds: [] });
    }

    static async updateAppointment(
        appointmentId: string,
        patch: {
            title?: string;
            startAt?: Date | string;
            endAt?: Date | string;
            timezone?: string;
            locationOrLink?: string | null;
            notes?: string | { value: string; scope?: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' };
            visibilityScope?: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
            participants?: { userId?: string; supplierOrgId?: string }[];
            attachments?: string[];
            reminderSettings?: { minutesBefore: number; channel?: 'email' | 'push' }[];
        },
        actorUserId?: string
    ) {
        const appointment = this.appointments.get(appointmentId);
        if (!appointment) {
            throw new Error('Appointment not found');
        }

        const beforeState = this.toPublicAppointment(appointment, {
            userId: actorUserId || 'system',
            supplierOrgIds: [],
            isOwner: true,
            isPlatformAdmin: false,
        });

        if (typeof patch.title === 'string') {
            if (!patch.title.trim()) {
                throw new Error('title is required');
            }
            appointment.title = patch.title.trim();
        }
        if (patch.startAt) {
            const parsed = new Date(patch.startAt);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error('startAt must be a valid date');
            }
            appointment.startAt = parsed;
        }
        if (patch.endAt) {
            const parsed = new Date(patch.endAt);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error('endAt must be a valid date');
            }
            appointment.endAt = parsed;
        }
        if (appointment.startAt >= appointment.endAt) {
            throw new Error('endAt must be after startAt');
        }
        if (typeof patch.timezone === 'string') {
            appointment.timezone = patch.timezone;
        }
        if (patch.locationOrLink !== undefined) {
            appointment.locationOrLink = patch.locationOrLink || null;
        }
        if (patch.visibilityScope) {
            appointment.visibilityScope = patch.visibilityScope;
        }
        if (patch.notes !== undefined) {
            if (typeof patch.notes === 'string') {
                appointment.notes = {
                    value: patch.notes,
                    scope: appointment.visibilityScope,
                };
            } else {
                appointment.notes = {
                    value: patch.notes.value || '',
                    scope: patch.notes.scope || appointment.visibilityScope,
                };
            }
        }
        if (patch.participants) {
            appointment.participants = patch.participants
                .filter((participant) => participant.userId || participant.supplierOrgId)
                .map((participant) => ({
                    userId: participant.userId,
                    supplierOrgId: participant.supplierOrgId,
                }));
        }
        if (patch.attachments) {
            appointment.attachments = [...patch.attachments];
        }
        if (patch.reminderSettings) {
            appointment.reminderSettings = patch.reminderSettings.map((reminder) => ({
                minutesBefore: reminder.minutesBefore,
                channel: reminder.channel || 'push',
            }));
        }

        const afterState = this.toPublicAppointment(appointment, {
            userId: actorUserId || 'system',
            supplierOrgIds: [],
            isOwner: true,
            isPlatformAdmin: false,
        });
        AuditService.logEvent({
            weddingId: appointment.weddingId,
            actorUserId: actorUserId || null,
            entityType: 'appointment',
            entityId: appointment.id,
            action: 'changed',
            beforeJson: {
                title: beforeState.title,
                start_at: beforeState.start_at,
                end_at: beforeState.end_at,
                visibility_scope: beforeState.visibility_scope,
                notes_scope: beforeState.notes_scope,
            },
            afterJson: {
                title: afterState.title,
                start_at: afterState.start_at,
                end_at: afterState.end_at,
                visibility_scope: afterState.visibility_scope,
                notes_scope: afterState.notes_scope,
            },
        });
        RealtimeService.broadcastEvent('appointment.updated', {
            weddingId: appointment.weddingId,
            data: { appointmentId: appointment.id, title: appointment.title, status: 'changed' },
        });

        return afterState;
    }

    static async cancelAppointment(appointmentId: string, actorUserId?: string) {
        const appointment = this.appointments.get(appointmentId);
        if (!appointment) {
            throw new Error('Appointment not found');
        }
        const beforeState = this.toPublicAppointment(appointment, {
            userId: actorUserId || 'system',
            supplierOrgIds: [],
            isOwner: true,
            isPlatformAdmin: false,
        });
        this.appointments.delete(appointmentId);

        AuditService.logEvent({
            weddingId: appointment.weddingId,
            actorUserId: actorUserId || null,
            entityType: 'appointment',
            entityId: appointmentId,
            action: 'canceled',
            beforeJson: {
                title: beforeState.title,
                start_at: beforeState.start_at,
                end_at: beforeState.end_at,
            },
            afterJson: { status: 'canceled' },
        });
        RealtimeService.broadcastEvent('appointment.updated', {
            weddingId: appointment.weddingId,
            data: { appointmentId, status: 'canceled' },
        });

        return { success: true, appointmentId };
    }

    /**
     * 4.4.3 & 4.4.4 Generate iCal Feed
     */
    static async generateIcal(token: string, expectedWeddingId?: string) {
        const subscription = this.requireActiveSubscription(token);
        if (expectedWeddingId && subscription.weddingId !== expectedWeddingId) {
            throw new Error('Calendar token does not match wedding');
        }
        const context = {
            userId: subscription.userId,
            supplierOrgIds: subscription.supplierOrgIds,
            isOwner: subscription.isOwner,
            isPlatformAdmin: subscription.isPlatformAdmin,
        };
        const appointments = Array.from(this.appointments.values())
            .filter((appointment) => appointment.weddingId === subscription.weddingId)
            .filter((appointment) => this.canViewAppointment(appointment, context));

        return this.buildIcs(appointments, context);
    }

    /**
     * 4.4.4 Get/Generate unique subscription link
     */
    static async getSubscriptionUrl(
        weddingId: string,
        userId: string,
        context: { supplierOrgIds?: string[]; isOwner?: boolean; isPlatformAdmin?: boolean } = {}
    ) {
        const key = `${weddingId}:${userId}`;
        const normalizedContext = this.normalizeContext({ userId, ...context });
        const existingToken = this.subscriptionsByKey.get(key);
        if (existingToken) {
            const existing = this.subscriptionsByToken.get(existingToken);
            if (existing && !existing.revokedAt) {
                existing.supplierOrgIds = [...normalizedContext.supplierOrgIds];
                existing.isOwner = normalizedContext.isOwner;
                existing.isPlatformAdmin = normalizedContext.isPlatformAdmin;
                return this.buildCalendarFeedUrl(weddingId, existingToken);
            }
        }

        const token = crypto.randomBytes(24).toString('hex');
        this.subscriptionsByKey.set(key, token);
        this.subscriptionsByToken.set(token, {
            token,
            weddingId,
            userId,
            supplierOrgIds: [...normalizedContext.supplierOrgIds],
            isOwner: normalizedContext.isOwner,
            isPlatformAdmin: normalizedContext.isPlatformAdmin,
            revokedAt: null,
        });
        return this.buildCalendarFeedUrl(weddingId, token);
    }

    static async generateSingleEventIcal(appointmentId: string, token: string) {
        const subscription = this.requireActiveSubscription(token);
        const appointment = this.appointments.get(appointmentId);
        if (!appointment || appointment.weddingId !== subscription.weddingId) {
            throw new Error('Appointment not found for token');
        }

        const context = {
            userId: subscription.userId,
            supplierOrgIds: subscription.supplierOrgIds,
            isOwner: subscription.isOwner,
            isPlatformAdmin: subscription.isPlatformAdmin,
        };
        if (!this.canViewAppointment(appointment, context)) {
            throw new Error('Forbidden appointment');
        }
        return this.buildIcs([appointment], context);
    }

    static revokeSubscriptionsForSupplierOrg(weddingId: string, supplierOrgId: string) {
        let revokedCount = 0;
        for (const [token, subscription] of this.subscriptionsByToken.entries()) {
            if (
                subscription.weddingId === weddingId &&
                subscription.supplierOrgIds.includes(supplierOrgId) &&
                !subscription.isOwner &&
                !subscription.isPlatformAdmin &&
                !subscription.revokedAt
            ) {
                subscription.revokedAt = new Date();
                this.subscriptionsByToken.set(token, subscription);
                this.subscriptionsByKey.delete(`${subscription.weddingId}:${subscription.userId}`);
                revokedCount += 1;
            }
        }
        return { revokedCount };
    }

    static clearStateForTests() {
        this.appointments.clear();
        this.subscriptionsByKey.clear();
        this.subscriptionsByToken.clear();
    }

    private static normalizeContext(context: {
        userId: string;
        supplierOrgIds?: string[];
        isOwner?: boolean;
        isPlatformAdmin?: boolean;
    }) {
        return {
            userId: context.userId,
            supplierOrgIds: context.supplierOrgIds || [],
            isOwner: Boolean(context.isOwner),
            isPlatformAdmin: Boolean(context.isPlatformAdmin),
        };
    }

    private static canViewAppointment(
        appointment: {
            visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
            participants: { userId?: string; supplierOrgId?: string }[];
        },
        context: { userId: string; supplierOrgIds: string[]; isOwner: boolean; isPlatformAdmin: boolean }
    ) {
        if (context.isPlatformAdmin || context.isOwner) {
            return true;
        }
        if (appointment.participants.some((participant) => participant.userId === context.userId)) {
            return true;
        }
        if (
            appointment.participants.some(
                (participant) => participant.supplierOrgId && context.supplierOrgIds.includes(participant.supplierOrgId)
            )
        ) {
            return true;
        }
        return appointment.visibilityScope === 'all_assigned_suppliers' && context.supplierOrgIds.length > 0;
    }

    private static canViewNotes(
        appointment: {
            notes: { scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' };
            participants: { userId?: string; supplierOrgId?: string }[];
        },
        context: { userId: string; supplierOrgIds: string[]; isOwner: boolean; isPlatformAdmin: boolean }
    ) {
        if (context.isPlatformAdmin || context.isOwner) {
            return true;
        }
        if (appointment.notes.scope === 'all_assigned_suppliers') {
            return context.supplierOrgIds.length > 0;
        }
        if (appointment.notes.scope === 'selected_suppliers') {
            return (
                appointment.participants.some((participant) => participant.userId === context.userId) ||
                appointment.participants.some(
                    (participant) =>
                        participant.supplierOrgId && context.supplierOrgIds.includes(participant.supplierOrgId)
                )
            );
        }
        return false;
    }

    private static toPublicAppointment(
        appointment: {
            id: string;
            weddingId: string;
            title: string;
            startAt: Date;
            endAt: Date;
            timezone: string;
            locationOrLink: string | null;
            notes: { value: string; scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' };
            attachments: string[];
            reminderSettings: { minutesBefore: number; channel: 'email' | 'push' }[];
            visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
            participants: { userId?: string; supplierOrgId?: string }[];
            createdAt: Date;
        },
        context: { userId: string; supplierOrgIds: string[]; isOwner: boolean; isPlatformAdmin: boolean },
        subscriptionToken?: string
    ) {
        const feedUrl = subscriptionToken ? this.buildCalendarFeedUrl(appointment.weddingId, subscriptionToken) : null;
        return {
            id: appointment.id,
            wedding_id: appointment.weddingId,
            title: appointment.title,
            start_at: appointment.startAt.toISOString(),
            end_at: appointment.endAt.toISOString(),
            timezone: appointment.timezone,
            location_or_link: appointment.locationOrLink,
            notes: this.canViewNotes(appointment, context) ? appointment.notes.value : null,
            notes_scope: appointment.notes.scope,
            attachments: [...appointment.attachments],
            reminder_settings: appointment.reminderSettings.map((entry) => ({ ...entry })),
            visibility_scope: appointment.visibilityScope,
            participants: appointment.participants.map((participant) => ({ ...participant })),
            created_at: appointment.createdAt.toISOString(),
            add_to_calendar: subscriptionToken
                ? {
                    webcal: this.toWebcal(feedUrl!),
                    download_ics: this.buildSingleEventUrl(appointment.id, subscriptionToken),
                }
                : null,
        };
    }

    private static requireActiveSubscription(token: string) {
        const subscription = this.subscriptionsByToken.get(token);
        if (!subscription || subscription.revokedAt) {
            throw new Error('Invalid or revoked calendar token');
        }
        return subscription;
    }

    private static buildIcs(
        appointments: Array<{
            id: string;
            title: string;
            startAt: Date;
            endAt: Date;
            locationOrLink: string | null;
            notes: { value: string; scope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers' };
            participants: { userId?: string; supplierOrgId?: string }[];
        }>,
        context: { userId: string; supplierOrgIds: string[]; isOwner: boolean; isPlatformAdmin: boolean }
    ) {
        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//ManagementApp//Calendar//EN',
            'CALSCALE:GREGORIAN',
        ];

        for (const appointment of appointments) {
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${appointment.id}@managementapp.local`);
            lines.push(`DTSTAMP:${this.formatIcsDate(new Date())}`);
            lines.push(`DTSTART:${this.formatIcsDate(appointment.startAt)}`);
            lines.push(`DTEND:${this.formatIcsDate(appointment.endAt)}`);
            lines.push(`SUMMARY:${this.escapeIcsText(appointment.title)}`);
            if (appointment.locationOrLink) {
                lines.push(`LOCATION:${this.escapeIcsText(appointment.locationOrLink)}`);
            }
            const notes = this.canViewNotes(appointment, context) ? appointment.notes.value : '';
            lines.push(`DESCRIPTION:${this.escapeIcsText(notes)}`);
            lines.push('END:VEVENT');
        }

        lines.push('END:VCALENDAR');
        return `${lines.join('\r\n')}\r\n`;
    }

    private static buildCalendarFeedUrl(weddingId: string, token: string) {
        const base = (process.env.CALENDAR_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
        return `${base}/v1/weddings/${weddingId}/calendar.ics?token=${token}`;
    }

    private static buildSingleEventUrl(appointmentId: string, token: string) {
        const base = (process.env.CALENDAR_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
        return `${base}/v1/appointments/${appointmentId}/calendar.ics?token=${token}`;
    }

    private static toWebcal(url: string) {
        return url.replace(/^https?:\/\//, 'webcal://');
    }

    private static formatIcsDate(value: Date) {
        return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    }

    private static escapeIcsText(input: string) {
        return String(input || '')
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/,/g, '\\,')
            .replace(/;/g, '\\;');
    }

    private static extractToken(url: string) {
        return new URL(url).searchParams.get('token') || '';
    }
}
