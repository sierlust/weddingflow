import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  revokeInvitation,
} from '../controllers/invitation.controller';
import { NotificationController } from '../controllers/notification.controller';
import { DocumentService, CalendarService } from './collaboration.service';
import { ROSService } from './ros.service';
import { InvitationService } from './invitation.service';
import { NotificationService } from './notification.service';
import { BillingService } from './billing.service';
import { AuditService } from './audit.service';

function tokenFromLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  return url.searchParams.get('token') || '';
}

function createRes() {
  return {
    statusCode: 200,
    payload: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.payload = body;
      return this;
    },
    send(body: any) {
      this.payload = body;
      return this;
    },
  };
}

describe('AuditService hooks (6.1.2/6.1.7)', () => {
  beforeEach(() => {
    AuditService.clearStateForTests();
    BillingService.clearStateForTests();
    InvitationService.clearStateForTests();
    DocumentService.clearStateForTests();
    CalendarService.clearStateForTests();
    ROSService.clearStateForTests();
    NotificationService.clearStateForTests();
  });

  test('creates audit events for all required state transitions with before/after payloads', async () => {
    const invitedAccepted = await createInvitation(
      'accept-a@example.com',
      'wed-audit-1',
      'wedding_supplier_invite',
      'issuer-a',
      'org-a'
    );
    await acceptInvitation(tokenFromLink(invitedAccepted.inviteLink), 'supplier-user-a');

    const invitedDeclined = await createInvitation(
      'decline-a@example.com',
      'wed-audit-1',
      'wedding_supplier_invite',
      'issuer-a',
      'org-b'
    );
    await declineInvitation(tokenFromLink(invitedDeclined.inviteLink), 'Too busy', 'No capacity this date');

    const invitedRemoved = await createInvitation(
      'remove-a@example.com',
      'wed-audit-1',
      'wedding_supplier_invite',
      'issuer-a',
      'org-c'
    );
    await revokeInvitation(invitedRemoved.invitation.id, 'issuer-a');

    const doc = await DocumentService.confirmUpload({
      weddingId: 'wed-audit-1',
      userId: 'owner-a',
      filename: 'contract.pdf',
      s3Key: 'uploads/wed-audit-1/contract.pdf',
      category: 'Contracts',
    });
    await DocumentService.shareDocument(doc.id, 'selected_suppliers', ['org-a'], 'owner-a');
    await DocumentService.shareDocument(doc.id, 'couple_only', [], 'owner-a');

    await ROSService.saveDraft('wed-audit-1', 'owner-a', [
      {
        id: 'item-1',
        sort_index: 1,
        title: 'Ceremony',
        start_at: '2026-08-10T10:00:00.000Z',
        end_at: '2026-08-10T11:00:00.000Z',
        item_type: 'ceremony',
        visibility_scope: 'all_published',
      },
    ]);
    await ROSService.publishVersion('wed-audit-1', 'owner-a', 'Initial publish');

    const appointment = await CalendarService.createAppointment({
      weddingId: 'wed-audit-1',
      title: 'Venue walkthrough',
      startAt: '2026-08-10T08:00:00.000Z',
      endAt: '2026-08-10T09:00:00.000Z',
      visibilityScope: 'all_assigned_suppliers',
    });
    await CalendarService.updateAppointment(
      appointment.id,
      { title: 'Venue walkthrough (updated)' },
      'owner-a'
    );
    await CalendarService.cancelAppointment(appointment.id, 'owner-a');

    const res = createRes();
    await NotificationController.updatePreferences(
      {
        user: { sub: 'owner-a' },
        body: {
          weddingId: 'wed-audit-1',
          preferences: { messaging: 'mentions_only' },
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);

    await AuditService.flushForTests();
    const events = AuditService.getEventsForTests();

    const eventKeys = events.map((event) => `${event.entity_type}:${event.action}`);
    assert.ok(eventKeys.includes('supplier:invited'));
    assert.ok(eventKeys.includes('supplier:accepted'));
    assert.ok(eventKeys.includes('supplier:declined'));
    assert.ok(eventKeys.includes('supplier:removed'));
    assert.ok(eventKeys.includes('document:shared'));
    assert.ok(eventKeys.includes('document:unshared'));
    assert.ok(eventKeys.includes('run_sheet:published'));
    assert.ok(eventKeys.includes('appointment:changed'));
    assert.ok(eventKeys.includes('appointment:canceled'));
    assert.ok(eventKeys.includes('permission_profile:permission_changed'));

    const accepted = events.find((event) => event.entity_type === 'supplier' && event.action === 'accepted');
    assert.equal((accepted?.before_json as any)?.status, 'pending');
    assert.equal((accepted?.after_json as any)?.status, 'accepted');

    const changed = events.find((event) => event.entity_type === 'appointment' && event.action === 'changed');
    assert.equal(typeof (changed?.before_json as any)?.title, 'string');
    assert.equal(typeof (changed?.after_json as any)?.title, 'string');

    const canceled = events.find((event) => event.entity_type === 'appointment' && event.action === 'canceled');
    assert.equal((canceled?.after_json as any)?.status, 'canceled');
  });
});
