import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InvitationError, InvitationService } from './invitation.service';

function tokenFromLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  return url.searchParams.get('token') || '';
}

describe('InvitationService', () => {
  beforeEach(() => {
    InvitationService.clearStateForTests();
  });

  test('creates invitation and blocks duplicate pending invitation', () => {
    InvitationService.createInvitation({
      email: 'supplier@example.com',
      weddingId: 'wedding-1',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-1',
    });

    assert.throws(() => {
      InvitationService.createInvitation({
        email: 'supplier@example.com',
        weddingId: 'wedding-1',
        type: 'wedding_supplier_invite',
        issuerId: 'issuer-1',
        supplierOrgId: 'org-1',
      });
    }, (err: any) => err instanceof InvitationError && err.code === 'DUPLICATE_PENDING_INVITATION');
  });

  test('accept transition only works from pending status', () => {
    const created = InvitationService.createInvitation({
      email: 'supplier@example.com',
      weddingId: 'wedding-2',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-2',
    });
    const token = tokenFromLink(created.inviteLink);

    const accepted = InvitationService.acceptByToken(token, 'user-55');
    assert.equal(accepted.success, true);
    assert.equal(accepted.invitation.status, 'accepted');

    assert.throws(() => {
      InvitationService.acceptByToken(token, 'user-55');
    }, (err: any) => err instanceof InvitationError && err.code === 'INVITATION_INACTIVE');
  });

  test('decline stores reason/note and uses token hashing verification', () => {
    const created = InvitationService.createInvitation({
      email: 'supplier2@example.com',
      weddingId: 'wedding-3',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-3',
    });
    const token = tokenFromLink(created.inviteLink);
    const declined = InvitationService.declineByToken(token, 'Agenda conflict', 'Cannot make this date.');
    assert.equal(declined.status, 'declined');
    assert.equal(declined.metadata_json.decline_reason, 'Agenda conflict');
    assert.equal(declined.metadata_json.decline_note, 'Cannot make this date.');

    const invite = InvitationService.getInvitationById(declined.id);
    assert.ok(invite);
    assert.equal(InvitationService.verifyToken(token, invite!.token_hash), true);
    assert.equal(InvitationService.verifyToken(`${token}-tampered`, invite!.token_hash), false);
  });

  test('resend revokes old invitation and creates a fresh pending invitation', () => {
    const created = InvitationService.createInvitation({
      email: 'supplier3@example.com',
      weddingId: 'wedding-4',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-77',
      supplierOrgId: 'org-4',
    });
    const oldId = created.invitation.id;

    const resent = InvitationService.resendInvitation(oldId, 'issuer-77');
    assert.equal(resent.invitation.status, 'pending');
    assert.notEqual(resent.invitation.id, oldId);

    const oldInvite = InvitationService.getInvitationById(oldId);
    assert.equal(oldInvite?.status, 'revoked');
  });

  test('allows re-invite after decline by creating a new invitation record', () => {
    const first = InvitationService.createInvitation({
      email: 'supplier5@example.com',
      weddingId: 'wedding-6',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-6',
    });
    const token = tokenFromLink(first.inviteLink);
    const declined = InvitationService.declineByToken(token, 'Not available');
    assert.equal(declined.status, 'declined');

    const second = InvitationService.createInvitation({
      email: 'supplier5@example.com',
      weddingId: 'wedding-6',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-6',
    });

    assert.notEqual(second.invitation.id, declined.id);
    assert.equal(second.invitation.status, 'pending');
  });

  test('expire job marks overdue pending invitations as expired', () => {
    const created = InvitationService.createInvitation({
      email: 'supplier4@example.com',
      weddingId: 'wedding-5',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-5',
    });
    const invite = InvitationService.getInvitationById(created.invitation.id);
    assert.ok(invite);
    invite!.expires_at = new Date(Date.now() - 60_000);

    const result = InvitationService.expirePendingInvitations();
    assert.equal(result.expiredCount, 1);
    assert.equal(InvitationService.getInvitationById(invite!.id)?.status, 'expired');
  });

  test('lists wedding invitations with decline context and status filter', () => {
    const declinedInvite = InvitationService.createInvitation({
      email: 'supplier6@example.com',
      weddingId: 'wedding-7',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-7',
    });
    const declinedToken = tokenFromLink(declinedInvite.inviteLink);
    InvitationService.declineByToken(declinedToken, 'Too busy', 'Booked on another event');

    InvitationService.createInvitation({
      email: 'supplier7@example.com',
      weddingId: 'wedding-7',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-7',
    });

    InvitationService.createInvitation({
      email: 'supplier8@example.com',
      weddingId: 'wedding-other',
      type: 'wedding_supplier_invite',
      issuerId: 'issuer-1',
      supplierOrgId: 'org-8',
    });

    const list = InvitationService.listInvitationsByWedding('wedding-7');
    assert.equal(list.length, 2);

    const declined = list.find((row) => row.status === 'declined');
    assert.ok(declined);
    assert.equal(declined.decline_reason, 'Too busy');
    assert.equal(declined.decline_note, 'Booked on another event');

    const pending = list.find((row) => row.status === 'pending');
    assert.ok(pending);
    assert.equal(pending.decline_reason, null);
    assert.equal(pending.decline_note, null);

    const declinedOnly = InvitationService.listInvitationsByWedding('wedding-7', { status: 'declined' });
    assert.equal(declinedOnly.length, 1);
    assert.equal(declinedOnly[0]?.status, 'declined');
    assert.equal(declinedOnly[0]?.target_email, 'supplier6@example.com');
  });
});
