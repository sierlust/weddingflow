import crypto from 'crypto';
import { AuditService } from './audit.service';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export type InvitationRecord = {
  id: string;
  type: string;
  target_email: string;
  target_user_id: string | null;
  issuer_user_id: string;
  wedding_id: string | null;
  supplier_org_id: string | null;
  status: InvitationStatus;
  token_hash: string;
  expires_at: Date;
  accepted_at: Date | null;
  declined_at: Date | null;
  revoked_at: Date | null;
  metadata_json: Record<string, unknown>;
  created_at: Date;
};

export type WeddingInvitationListItem = {
  id: string;
  type: string;
  target_email: string;
  issuer_user_id: string;
  wedding_id: string | null;
  supplier_org_id: string | null;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at: Date | null;
  declined_at: Date | null;
  revoked_at: Date | null;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  decline_reason: string | null;
  decline_note: string | null;
};

type CreateInvitationInput = {
  email: string;
  weddingId: string;
  type: string;
  issuerId: string;
  supplierOrgId?: string | null;
  targetUserId?: string | null;
  ttlDays?: number;
};

type SupplierAssignment = {
  weddingId: string;
  supplierOrgId: string;
  userId: string;
  status: 'active';
};

export type FirstRunChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
};

const allowedTransitions: Record<InvitationStatus, InvitationStatus[]> = {
  pending: ['accepted', 'declined', 'expired', 'revoked'],
  accepted: [],
  declined: [],
  expired: [],
  revoked: [],
};

export class InvitationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class InvitationService {
  private static invitations: Map<string, InvitationRecord> = new Map();
  private static checklist: Map<string, Map<string, boolean>> = new Map();
  private static assignments: SupplierAssignment[] = [];
  private static checklistShown: Set<string> = new Set();
  private static rawTokenByInvitationId: Map<string, string> = new Map();

  private static readonly checklistTemplate: Array<{ id: string; label: string }> = [
    { id: 'add_logo', label: 'Add logo' },
    { id: 'add_staff', label: 'Add staff' },
    { id: 'configure_notifications', label: 'Configure notifications' },
    { id: 'review_run_of_show', label: 'Review run-of-show' },
    { id: 'send_first_message', label: 'Send first message' },
  ];

  /**
   * 2.2.1 Generate cryptographically random token
   */
  static generateToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(raw);
    return { raw, hash };
  }

  /**
   * 2.2.4 Timing-safe comparison
   */
  static verifyToken(rawToken: string, storedHash: string): boolean {
    const hash = this.hashToken(rawToken);
    if (hash.length !== storedHash.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  }

  static createInvitation(input: CreateInvitationInput) {
    this.expirePendingInvitations();
    const normalizedEmail = input.email.trim().toLowerCase();

    const duplicatePending = Array.from(this.invitations.values()).find(
      (invite) =>
        invite.status === 'pending' &&
        invite.target_email === normalizedEmail &&
        invite.wedding_id === input.weddingId
    );

    if (duplicatePending) {
      throw new InvitationError(409, 'DUPLICATE_PENDING_INVITATION', 'A pending invitation already exists.');
    }

    const { raw, hash } = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.ttlDays || 7) * 24 * 60 * 60 * 1000);
    const invite: InvitationRecord = {
      id: crypto.randomUUID(),
      type: input.type,
      target_email: normalizedEmail,
      target_user_id: input.targetUserId || null,
      issuer_user_id: input.issuerId,
      wedding_id: input.weddingId || null,
      supplier_org_id: input.supplierOrgId || null,
      status: 'pending',
      token_hash: hash,
      expires_at: expiresAt,
      accepted_at: null,
      declined_at: null,
      revoked_at: null,
      metadata_json: {},
      created_at: now,
    };

    this.invitations.set(invite.id, invite);
    this.rawTokenByInvitationId.set(invite.id, raw);
    AuditService.logEvent({
      weddingId: invite.wedding_id,
      actorUserId: invite.issuer_user_id,
      entityType: 'supplier',
      entityId: invite.supplier_org_id || invite.id,
      action: 'invited',
      beforeJson: null,
      afterJson: {
        invitation_id: invite.id,
        target_email: invite.target_email,
        status: invite.status,
      },
    });

    return {
      invitation: this.toPublic(invite),
      inviteLink: this.buildInviteLink(raw),
    };
  }

  static expirePendingInvitations(referenceTime: Date = new Date()): { expiredCount: number } {
    let expiredCount = 0;
    for (const invite of this.invitations.values()) {
      if (invite.status === 'pending' && invite.expires_at < referenceTime) {
        this.applyTransition(invite, 'expired');
        expiredCount += 1;
      }
    }
    return { expiredCount };
  }

  static declineByToken(token: string, reason: string, note?: string) {
    const invite = this.findPendingByTokenOrThrow(token);
    return this.declineInvite(invite, reason, note);
  }

  static declineById(inviteId: string, reason: string, note?: string) {
    const invite = this.findPendingByIdOrThrow(inviteId);
    return this.declineInvite(invite, reason, note);
  }

  static acceptByToken(token: string, userId: string, orgData?: any) {
    const invite = this.findPendingByTokenOrThrow(token);
    return this.acceptInvite(invite, userId, orgData);
  }

  static acceptById(inviteId: string, userId: string, orgData?: any) {
    const invite = this.findPendingByIdOrThrow(inviteId);
    return this.acceptInvite(invite, userId, orgData);
  }

  static resolveByToken(token: string) {
    const invite = this.findPendingByTokenOrThrow(token);
    return this.toPublic(invite);
  }

  static resendInvitation(oldInviteId: string, issuerId: string) {
    const oldInvite = this.invitations.get(oldInviteId);
    if (!oldInvite) {
      throw new InvitationError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }
    if (oldInvite.issuer_user_id !== issuerId) {
      throw new InvitationError(403, 'FORBIDDEN', 'Only the issuer can resend this invitation.');
    }
    if (oldInvite.status !== 'pending') {
      throw new InvitationError(409, 'NOT_PENDING', 'Only pending invitations can be resent.');
    }

    const beforeState = this.toPublic(oldInvite);
    this.applyTransition(oldInvite, 'revoked');
    const afterState = this.toPublic(oldInvite);
    AuditService.logEvent({
      weddingId: oldInvite.wedding_id,
      actorUserId: issuerId,
      entityType: 'supplier',
      entityId: oldInvite.supplier_org_id || oldInvite.id,
      action: 'removed',
      beforeJson: { status: beforeState.status },
      afterJson: { status: afterState.status },
    });
    return this.createInvitation({
      email: oldInvite.target_email,
      weddingId: oldInvite.wedding_id || '',
      type: oldInvite.type,
      issuerId,
      supplierOrgId: oldInvite.supplier_org_id,
      targetUserId: oldInvite.target_user_id,
      ttlDays: 7,
    });
  }

  static revokeInvitation(inviteId: string, issuerId: string) {
    const invite = this.invitations.get(inviteId);
    if (!invite) {
      throw new InvitationError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }
    if (invite.issuer_user_id !== issuerId) {
      throw new InvitationError(403, 'FORBIDDEN', 'Only the issuer can revoke this invitation.');
    }
    if (invite.status !== 'pending') {
      throw new InvitationError(409, 'NOT_PENDING', 'Only pending invitations can be revoked.');
    }
    const beforeState = this.toPublic(invite);
    this.applyTransition(invite, 'revoked');
    const afterState = this.toPublic(invite);
    AuditService.logEvent({
      weddingId: invite.wedding_id,
      actorUserId: issuerId,
      entityType: 'supplier',
      entityId: invite.supplier_org_id || invite.id,
      action: 'removed',
      beforeJson: { status: beforeState.status },
      afterJson: { status: afterState.status },
    });
    return { success: true, invitation: this.toPublic(invite) };
  }

  static updateChecklist(userId: string, itemId: string, completed: boolean) {
    const userChecklist = this.checklist.get(userId) || new Map<string, boolean>();
    userChecklist.set(itemId, completed);
    this.checklist.set(userId, userChecklist);
    return { userId, itemId, completed };
  }

  static getChecklist(userId: string) {
    const userChecklist = this.checklist.get(userId);
    if (!userChecklist) {
      return {};
    }
    return Object.fromEntries(userChecklist.entries());
  }

  static getFirstRunChecklist(userId: string): FirstRunChecklistItem[] {
    const completion = this.checklist.get(userId) || new Map<string, boolean>();
    return this.checklistTemplate.map((item) => ({
      id: item.id,
      label: item.label,
      completed: completion.get(item.id) === true,
    }));
  }

  static consumeFirstRunChecklist(userId: string): { show: boolean; items: FirstRunChecklistItem[] } {
    const show = !this.checklistShown.has(userId);
    if (show) {
      this.checklistShown.add(userId);
    }
    return { show, items: this.getFirstRunChecklist(userId) };
  }

  static getInvitationById(inviteId: string): InvitationRecord | null {
    return this.invitations.get(inviteId) || null;
  }

  static listInvitationsByWedding(
    weddingId: string,
    filters: { status?: InvitationStatus } = {}
  ): WeddingInvitationListItem[] {
    this.expirePendingInvitations();

    return Array.from(this.invitations.values())
      .filter((invite) => invite.wedding_id === weddingId)
      .filter((invite) => (filters.status ? invite.status === filters.status : true))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .map((invite) => {
        const declineReasonValue = invite.metadata_json['decline_reason'];
        const declineNoteValue = invite.metadata_json['decline_note'];

        return {
          ...this.toPublic(invite),
          decline_reason: typeof declineReasonValue === 'string' ? declineReasonValue : null,
          decline_note: typeof declineNoteValue === 'string' ? declineNoteValue : null,
        };
      });
  }

  static listPendingInvitationsByTargetEmail(targetEmail: string) {
    const normalizedEmail = String(targetEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return [];
    }
    this.expirePendingInvitations();

    return Array.from(this.invitations.values())
      .filter((invite) => invite.status === 'pending')
      .filter((invite) => invite.target_email === normalizedEmail)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .map((invite) => ({
        ...this.toPublic(invite),
        token: this.rawTokenByInvitationId.get(invite.id) || null,
      }));
  }

  static clearStateForTests() {
    this.invitations.clear();
    this.checklist.clear();
    this.assignments = [];
    this.checklistShown.clear();
    this.rawTokenByInvitationId.clear();
  }

  private static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private static findPendingByTokenOrThrow(rawToken: string): InvitationRecord {
    this.expirePendingInvitations();

    const invite = Array.from(this.invitations.values()).find(
      (candidate) => this.verifyToken(rawToken, candidate.token_hash)
    );

    if (!invite) {
      throw new InvitationError(404, 'INVITATION_NOT_FOUND', 'Invitation token is invalid.');
    }
    if (invite.status !== 'pending') {
      throw new InvitationError(410, 'INVITATION_INACTIVE', 'Invitation is no longer active.');
    }

    return invite;
  }

  private static findPendingByIdOrThrow(inviteId: string): InvitationRecord {
    const id = String(inviteId || '').trim();
    if (!id) {
      throw new InvitationError(400, 'INVITATION_ID_REQUIRED', 'Invitation id is required.');
    }
    this.expirePendingInvitations();
    const invite = this.invitations.get(id);
    if (!invite) {
      throw new InvitationError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }
    if (invite.status !== 'pending') {
      throw new InvitationError(410, 'INVITATION_INACTIVE', 'Invitation is no longer active.');
    }
    return invite;
  }

  private static acceptInvite(invite: InvitationRecord, userId: string, orgData?: any) {
    if (!userId) {
      throw new InvitationError(400, 'USER_ID_REQUIRED', 'userId is required to accept an invitation.');
    }
    const beforeState = this.toPublic(invite);

    // 2.4.3 anti-ambiguity: assignment only after explicit accept.
    invite.target_user_id = userId;
    this.applyTransition(invite, 'accepted', orgData ? { org_data: orgData } : undefined);
    const afterState = this.toPublic(invite);

    if (invite.wedding_id && invite.supplier_org_id) {
      this.assignments.push({
        weddingId: invite.wedding_id,
        supplierOrgId: invite.supplier_org_id,
        userId,
        status: 'active',
      });
    }

    AuditService.logEvent({
      weddingId: invite.wedding_id,
      actorUserId: userId,
      entityType: 'supplier',
      entityId: invite.supplier_org_id || invite.id,
      action: 'accepted',
      beforeJson: {
        status: beforeState.status,
      },
      afterJson: {
        status: afterState.status,
        target_user_id: afterState.target_user_id,
      },
    });

    return {
      success: true,
      redirect: invite.wedding_id ? `/weddings/${invite.wedding_id}` : '/weddings',
      invitation: this.toPublic(invite),
    };
  }

  private static declineInvite(invite: InvitationRecord, reason: string, note?: string) {
    if (!reason?.trim()) {
      throw new InvitationError(400, 'DECLINE_REASON_REQUIRED', 'A decline reason is required.');
    }
    const beforeState = this.toPublic(invite);
    const safeNote = note ? note.slice(0, 1024) : undefined;
    this.applyTransition(invite, 'declined', {
      decline_reason: reason,
      decline_note: safeNote,
    });
    const afterState = this.toPublic(invite);
    AuditService.logEvent({
      weddingId: invite.wedding_id,
      actorUserId: invite.target_user_id,
      entityType: 'supplier',
      entityId: invite.supplier_org_id || invite.id,
      action: 'declined',
      beforeJson: {
        status: beforeState.status,
        metadata_json: beforeState.metadata_json,
      },
      afterJson: {
        status: afterState.status,
        metadata_json: afterState.metadata_json,
      },
    });
    return this.toPublic(invite);
  }

  private static applyTransition(
    invite: InvitationRecord,
    nextStatus: InvitationStatus,
    metadataPatch?: Record<string, unknown>
  ): void {
    if (!allowedTransitions[invite.status].includes(nextStatus)) {
      throw new InvitationError(
        409,
        'ILLEGAL_TRANSITION',
        `Illegal transition from ${invite.status} to ${nextStatus}.`
      );
    }

    invite.status = nextStatus;
    if (nextStatus !== 'pending') {
      this.rawTokenByInvitationId.delete(invite.id);
    }
    if (nextStatus === 'accepted') {
      invite.accepted_at = new Date();
    }
    if (nextStatus === 'declined') {
      invite.declined_at = new Date();
    }
    if (nextStatus === 'revoked') {
      invite.revoked_at = new Date();
    }
    if (metadataPatch) {
      invite.metadata_json = { ...invite.metadata_json, ...metadataPatch };
    }
  }

  private static buildInviteLink(rawToken: string): string {
    const base = process.env.INVITATION_BASE_URL || 'http://localhost:3000/invite';
    return `${base}?token=${rawToken}`;
  }

  private static toPublic(invite: InvitationRecord) {
    return {
      id: invite.id,
      type: invite.type,
      target_email: invite.target_email,
      issuer_user_id: invite.issuer_user_id,
      wedding_id: invite.wedding_id,
      supplier_org_id: invite.supplier_org_id,
      status: invite.status,
      expires_at: invite.expires_at,
      accepted_at: invite.accepted_at,
      declined_at: invite.declined_at,
      revoked_at: invite.revoked_at,
      metadata_json: invite.metadata_json,
      created_at: invite.created_at,
    };
  }
}
