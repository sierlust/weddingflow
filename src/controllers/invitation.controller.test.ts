import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptInvitation,
  acceptInvitationFlowB,
  createInvitation,
  resolveInvitation,
} from './invitation.controller';
import { InvitationError, InvitationService } from '../services/invitation.service';
import { ChatService } from '../services/collaboration.service';
import { AuthService } from '../services/auth.service';
import { DashboardService } from '../services/dashboard.service';

function tokenFromLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  return url.searchParams.get('token') || '';
}

describe('invitation controller flows', () => {
  beforeEach(() => {
    InvitationService.clearStateForTests();
    ChatService.clearStateForTests();
    AuthService.clearStateForTests();
    DashboardService.resetDataForTests();
  });

  test('resolves invitation token for flow pre-screens', async () => {
    const created = await createInvitation(
      'flow-a@example.com',
      'wed-flow-a',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );
    const token = tokenFromLink(created.inviteLink);
    const resolved = await resolveInvitation(token);

    assert.equal(resolved.invitation.status, 'pending');
    assert.equal(resolved.screens.flowA, 'accept_invitation');
    assert.match(resolved.screens.flowB, /landing/);
  });

  test('flow A accept creates default supplier thread and checklist is shown once', async () => {
    const first = await createInvitation(
      'flow-a-1@example.com',
      'wed-flow-a',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );
    const firstAccepted = await acceptInvitation(tokenFromLink(first.inviteLink), 'supplier-user-1');

    assert.equal(firstAccepted.success, true);
    assert.equal(!!firstAccepted.defaultSupplierThreadId, true);
    assert.equal(firstAccepted.onboardingChecklist.show, true);
    assert.equal(firstAccepted.onboardingChecklist.items.length, 5);
    const supplierWeddings = DashboardService.getSupplierWeddings({
      userId: 'supplier-user-1',
      supplierOrgId: 'org-1',
      limit: 100,
    });
    assert.equal(supplierWeddings.weddings.some((wedding) => wedding.id === 'wed-flow-a'), true);

    const second = await createInvitation(
      'flow-a-2@example.com',
      'wed-flow-a',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );
    const secondAccepted = await acceptInvitation(tokenFromLink(second.inviteLink), 'supplier-user-1');
    assert.equal(secondAccepted.onboardingChecklist.show, false);
  });

  test('flow B creates account with locked email and accepts invitation', async () => {
    const created = await createInvitation(
      'flow-b@example.com',
      'wed-flow-b',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );

    const result = await acceptInvitationFlowB(
      tokenFromLink(created.inviteLink),
      {
        email: 'flow-b@example.com',
        name: 'Flow B User',
        password: 'super-secret',
        acceptTerms: true,
      },
      { orgMode: 'create_new', orgName: 'Flow B Org', region: 'NL' }
    );

    assert.equal(result.flow, 'B');
    assert.equal(!!result.tokens.accessToken, true);
    assert.equal(result.accepted.invitation.status, 'accepted');
    assert.equal(result.accepted.onboardingChecklist.show, true);
  });

  test('flow B rejects mismatched email and does not create user state', async () => {
    const created = await createInvitation(
      'flow-b-locked@example.com',
      'wed-flow-b-2',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );

    await assert.rejects(
      async () =>
        acceptInvitationFlowB(tokenFromLink(created.inviteLink), {
          email: 'wrong@example.com',
          name: 'Wrong User',
          password: 'super-secret',
          acceptTerms: true,
        }),
      (err: any) => err instanceof InvitationError && err.code === 'EMAIL_MISMATCH'
    );

    const resolvedWrongUser = await AuthService.resolveUserByProvider('email_password', 'wrong@example.com');
    assert.equal(resolvedWrongUser, null);
  });

  test('flow B rolls back created user when accept step fails', async () => {
    const created = await createInvitation(
      'flow-b-rollback@example.com',
      'wed-flow-b-3',
      'wedding_supplier_invite',
      'issuer-1',
      'org-1'
    );
    const originalAccept = InvitationService.acceptByToken;
    try {
      (InvitationService as any).acceptByToken = () => {
        throw new Error('accept failed');
      };

      await assert.rejects(async () => {
        await acceptInvitationFlowB(tokenFromLink(created.inviteLink), {
          email: 'flow-b-rollback@example.com',
          name: 'Rollback User',
          password: 'secret',
          acceptTerms: true,
        });
      });

      const resolved = await AuthService.resolveUserByProvider('email_password', 'flow-b-rollback@example.com');
      assert.equal(resolved, null);
    } finally {
      (InvitationService as any).acceptByToken = originalAccept;
    }
  });
});
