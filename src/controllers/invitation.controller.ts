import { ChatService } from '../services/collaboration.service';
import { AuthService } from '../services/auth.service';
import { InvitationError, InvitationService, type InvitationStatus } from '../services/invitation.service';
import { EntitlementService } from '../services/entitlement.service';
import { DashboardService } from '../services/dashboard.service';

const allowedStatuses = new Set<InvitationStatus>(['pending', 'accepted', 'declined', 'expired', 'revoked']);

/**
 * Phase 2.1.3 Create Invitation with Duplicate Detection
 */
export const createInvitation = async (
  email: string,
  wedding_id: string,
  type: string,
  issuer_id: string,
  supplier_org_id?: string
) => {
  return InvitationService.createInvitation({
    email,
    weddingId: wedding_id,
    type,
    issuerId: issuer_id,
    supplierOrgId: supplier_org_id || null,
  });
};

/**
 * Phase 2.3.2 Decline Invitation Logic
 */
export const declineInvitation = async (token: string, reason: string, note?: string) => {
  const declinedInvite = InvitationService.declineByToken(token, reason, note);

  // 2.3.3 Optional system message to couple.
  if (note && declinedInvite.wedding_id) {
    await ChatService.sendSystemMessage(
      declinedInvite.wedding_id,
      `Supplier declined invitation. Reason: ${reason}. Note: ${note.slice(0, 500)}`
    );
  }

  return declinedInvite;
};

export const declineInvitationById = async (inviteId: string, reason: string, note?: string) => {
  const declinedInvite = InvitationService.declineById(inviteId, reason, note);

  if (note && declinedInvite.wedding_id) {
    await ChatService.sendSystemMessage(
      declinedInvite.wedding_id,
      `Supplier declined invitation. Reason: ${reason}. Note: ${note.slice(0, 500)}`
    );
  }

  return declinedInvite;
};

/**
 * Phase 2.4.1 & 2.4.2 Accept Invitation (Flow A & B)
 */
export const acceptInvitation = async (token: string, userId: string, orgData?: any) => {
  const pendingInvitation = InvitationService.resolveByToken(token);
  if (pendingInvitation.supplier_org_id) {
    await EntitlementService.validateAction(
      pendingInvitation.supplier_org_id,
      'active_weddings',
      1,
      { role: 'supplier' }
    );
    await EntitlementService.validateAction(
      pendingInvitation.supplier_org_id,
      'seats',
      1,
      { role: 'supplier' }
    );
  }

  const result = InvitationService.acceptByToken(token, userId, orgData);
  if (result.invitation.supplier_org_id) {
    EntitlementService.consumeUsage(result.invitation.supplier_org_id, 'active_weddings', 1);
    EntitlementService.consumeUsage(result.invitation.supplier_org_id, 'seats', 1);
  }
  if (result.invitation.wedding_id && userId) {
    const orgId = result.invitation.supplier_org_id || userId;
    DashboardService.ensureSupplierWeddingAssignment({
      weddingId: result.invitation.wedding_id,
      supplierOrgId: orgId,
      userId,
      category: result.invitation.type === 'couple_invite' ? 'Bruidspaar' : 'Supplier',
    });
  }
  const onboardingChecklist = InvitationService.consumeFirstRunChecklist(userId);
  let defaultSupplierThreadId: string | null = null;

  if (result.invitation.wedding_id) {
    const thread = await ChatService.createThread(
      result.invitation.wedding_id,
      'supplier_thread',
      [],
      {
        creatorUserId: userId,
        creatorRole: 'supplier',
        metadata: {
          supplierKey: result.invitation.supplier_org_id ? `org:${result.invitation.supplier_org_id}` : `mail:${result.invitation.target_email}`
        }
      }
    );
    defaultSupplierThreadId = thread.id;

    ChatService.broadcastMessage('system', {
      event: 'invitation.accepted',
      weddingId: result.invitation.wedding_id,
      userId,
    });
  }

  return {
    ...result,
    defaultSupplierThreadId,
    onboardingChecklist,
  };
};

export const acceptInvitationById = async (inviteId: string, userId: string, orgData?: any) => {
  const pendingInvitation = InvitationService.getInvitationById(inviteId);
  if (!pendingInvitation) {
    throw new InvitationError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
  }
  if (pendingInvitation.supplier_org_id) {
    await EntitlementService.validateAction(
      pendingInvitation.supplier_org_id,
      'active_weddings',
      1,
      { role: 'supplier' }
    );
    await EntitlementService.validateAction(
      pendingInvitation.supplier_org_id,
      'seats',
      1,
      { role: 'supplier' }
    );
  }

  const result = InvitationService.acceptById(inviteId, userId, orgData);
  if (result.invitation.supplier_org_id) {
    EntitlementService.consumeUsage(result.invitation.supplier_org_id, 'active_weddings', 1);
    EntitlementService.consumeUsage(result.invitation.supplier_org_id, 'seats', 1);
  }
  if (result.invitation.wedding_id && userId) {
    const orgId = result.invitation.supplier_org_id || userId;
    DashboardService.ensureSupplierWeddingAssignment({
      weddingId: result.invitation.wedding_id,
      supplierOrgId: orgId,
      userId,
      category: result.invitation.type === 'couple_invite' ? 'Bruidspaar' : 'Supplier',
    });
  }
  const onboardingChecklist = InvitationService.consumeFirstRunChecklist(userId);
  let defaultSupplierThreadId: string | null = null;

  if (result.invitation.wedding_id) {
    const thread = await ChatService.createThread(
      result.invitation.wedding_id,
      'supplier_thread',
      [],
      {
        creatorUserId: userId,
        creatorRole: 'supplier',
        metadata: {
          supplierKey: result.invitation.supplier_org_id ? `org:${result.invitation.supplier_org_id}` : `mail:${result.invitation.target_email}`
        }
      }
    );
    defaultSupplierThreadId = thread.id;

    ChatService.broadcastMessage('system', {
      event: 'invitation.accepted',
      weddingId: result.invitation.wedding_id,
      userId,
    });
  }

  return {
    ...result,
    defaultSupplierThreadId,
    onboardingChecklist,
  };
};

/**
 * Phase 2.4.4 First-run Checklist Persistence
 */
export const updateChecklist = async (userId: string, itemId: string, completed: boolean) => {
  return InvitationService.updateChecklist(userId, itemId, completed);
};

/**
 * Phase 2.1.4 Resend Logic
 */
export const resendInvitation = async (oldInviteId: string, issuerId: string) => {
  const resent = InvitationService.resendInvitation(oldInviteId, issuerId);
  return { success: true, ...resent };
};

/**
 * Phase 2.1.5 Revoke Logic
 */
export const revokeInvitation = async (inviteId: string, issuerId: string) => {
  return InvitationService.revokeInvitation(inviteId, issuerId);
};

/**
 * Phase 2.3.4 Invited Suppliers Read-Only Decline Context
 */
export const listWeddingInvitations = async (weddingId: string, status?: string) => {
  if (status && !allowedStatuses.has(status as InvitationStatus)) {
    throw new InvitationError(400, 'INVALID_STATUS_FILTER', 'Invalid invitation status filter.');
  }

  return InvitationService.listInvitationsByWedding(weddingId, {
    status: status as InvitationStatus | undefined,
  });
};

export const listPendingInvitationsForEmail = async (email: string) => {
  if (!String(email || '').trim()) {
    throw new InvitationError(400, 'EMAIL_REQUIRED', 'Email is required.');
  }
  const invitations = InvitationService.listPendingInvitationsByTargetEmail(email);
  return invitations.map((invitation) => {
    const weddingId = String(invitation.wedding_id || '').trim();
    const wedding = weddingId ? DashboardService.getWeddingSummaryById(weddingId) : null;
    const coupleNames = Array.isArray(wedding?.couple_names)
      ? wedding.couple_names.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const weddingTitle =
      coupleNames.length >= 2
        ? `${coupleNames[0]} & ${coupleNames[1]}`
        : coupleNames[0] || String(wedding?.title || '').trim() || weddingId || null;

    return {
      ...invitation,
      wedding_title: weddingTitle,
      couple_names: coupleNames,
    };
  });
};

/**
 * Phase 2.4 Resolve invitation token (Flow A/B pre-screen)
 */
export const resolveInvitation = async (token: string) => {
  const invitation = InvitationService.resolveByToken(token);
  return {
    invitation,
    screens: {
      flowA: 'accept_invitation',
      flowB: 'landing_then_register_then_org_setup_then_accept',
    },
  };
};

/**
 * Phase 2.4.2 Flow B - register account + accept invite atomically (saga rollback)
 */
export const acceptInvitationFlowB = async (
  token: string,
  accountData: { email: string; name: string; password: string; acceptTerms: boolean },
  orgData?: any
) => {
  if (!accountData?.acceptTerms) {
    throw new InvitationError(400, 'TERMS_REQUIRED', 'Terms must be accepted.');
  }

  const invitation = InvitationService.resolveByToken(token);
  const lockedEmail = invitation.target_email;
  if (accountData.email.trim().toLowerCase() !== lockedEmail.toLowerCase()) {
    throw new InvitationError(400, 'EMAIL_MISMATCH', 'Email must match invitation target email.');
  }

  let newUserId: string | null = null;
  try {
    newUserId = await AuthService.registerUserWithIdentity(
      accountData.email,
      accountData.name,
      'email_password',
      accountData.email
    );
    const tokens = await AuthService.generateTokens(newUserId, []);
    const accepted = await acceptInvitation(token, newUserId, orgData);

    return {
      flow: 'B',
      userId: newUserId,
      tokens,
      accepted,
    };
  } catch (error) {
    if (newUserId) {
      await AuthService.rollbackUserRegistration(newUserId);
    }
    throw error;
  }
};
