import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MailService } from './mail.service';
import type { EmailTemplateKey } from '../mail/templates';

function sampleDataForTemplate(key: EmailTemplateKey) {
  const signedInviteUrl = MailService.generateSignedLink(
    'https://managementapp.local/v1/invitations/accept',
    { invitationId: 'inv-1' },
    { purpose: 'invitation_accept', recipient: 'vendor@example.com', ttlSeconds: 3600 }
  );
  const signedSignupUrl = MailService.generateSignedLink(
    'https://managementapp.local/v1/onboarding',
    { invitationId: 'inv-2' },
    { purpose: 'flow_b_signup', recipient: 'vendor@example.com', ttlSeconds: 3600 }
  );
  const signedResetUrl = MailService.generateSignedLink(
    'https://managementapp.local/v1/auth/reset-password',
    { userId: 'user-1' },
    { purpose: 'password_reset', recipient: 'vendor@example.com', ttlSeconds: 600 }
  );

  const shared = {
    coupleName: 'Sanne & Koen',
    supplierName: 'Bloom Florals',
    weddingName: 'Sanne & Koen',
    title: 'Venue walkthrough',
    taskTitle: 'Finalize floral moodboard',
    startAt: '2026-05-01T10:00:00.000Z',
    endAt: '2026-05-01T11:00:00.000Z',
    reason: 'Date conflict',
    version: 3,
    expiresAt: '2026-05-01T10:00:00.000Z',
    inviteUrl: signedInviteUrl,
    signupUrl: signedSignupUrl,
    resetUrl: signedResetUrl,
    documentUrl: 'https://managementapp.local/v1/weddings/wed-1/documents',
    viewUrl: 'https://managementapp.local/v1/weddings/wed-1/ros/published',
    firstName: 'Sanne',
  };

  return shared;
}

describe('MailService (7.1)', () => {
  beforeEach(() => {
    MailService.clearStateForTests();
  });

  test('sends all required templates from code-based catalog in staging', async () => {
    MailService.configure({
      provider: 'postmark',
      environment: 'staging',
      fromEmail: 'info@managementapp.local',
    });

    const templateKeys: EmailTemplateKey[] = [
      'SUPPLIER_INVITATION_FLOW_A',
      'SUPPLIER_INVITATION_FLOW_B',
      'INVITATION_ACCEPTED',
      'INVITATION_DECLINED',
      'INVITATION_EXPIRY_REMINDER',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_UPDATED',
      'APPOINTMENT_CANCELED',
      'DOCUMENT_SHARED',
      'ROS_PUBLISHED',
      'TASK_ASSIGNED',
      'PASSWORD_RESET',
      'ACCOUNT_WELCOME',
    ];

    for (const key of templateKeys) {
      const response = await MailService.send('vendor@example.com', key, sampleDataForTemplate(key));
      assert.equal(response.skipped, false);
      assert.equal(response.provider, 'postmark');
    }

    const sent = MailService.getSentMailForTests();
    assert.equal(sent.length, templateKeys.length);
    assert.equal(sent.every((entry) => entry.to === 'vendor@example.com'), true);
    assert.equal(sent.every((entry) => entry.subject.length > 5), true);
    assert.equal(sent.every((entry) => entry.html.includes('ManagementApp B.V.')), true);
  });

  test('generates verifiable signed links and rejects expired tokens', () => {
    const now = new Date('2026-03-01T10:00:00.000Z');
    const link = MailService.generateSignedLink(
      'https://managementapp.local/v1/invitations/accept',
      { invitationId: 'inv-123' },
      { purpose: 'invitation_accept', recipient: 'vendor@example.com', ttlSeconds: 120, now }
    );
    const token = new URL(link).searchParams.get('token') || '';

    const verified = MailService.verifySignedToken(token, {
      purpose: 'invitation_accept',
      recipient: 'vendor@example.com',
      now: new Date('2026-03-01T10:01:00.000Z'),
    });
    assert.equal(verified.valid, true);
    assert.equal(verified.payload?.claims.invitationId, 'inv-123');

    const expired = MailService.verifySignedToken(token, {
      purpose: 'invitation_accept',
      recipient: 'vendor@example.com',
      now: new Date('2026-03-01T10:04:00.000Z'),
    });
    assert.equal(expired.valid, false);
    assert.equal(expired.reason, 'expired');
  });

  test('enforces unsubscribe for non-critical emails but keeps critical emails active', async () => {
    MailService.unsubscribe('vendor@example.com', 'appointments');

    const skipped = await MailService.send('vendor@example.com', 'APPOINTMENT_CREATED', sampleDataForTemplate('APPOINTMENT_CREATED'));
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.reason, 'unsubscribed');

    const security = await MailService.send('vendor@example.com', 'PASSWORD_RESET', sampleDataForTemplate('PASSWORD_RESET'));
    assert.equal(security.skipped, false);
  });

  test('processes unsubscribe links via signed tokens', () => {
    const url = MailService.generateSignedLink(
      'https://managementapp.local/v1/mail/unsubscribe',
      { email: 'vendor@example.com', category: 'tasks' },
      {
        purpose: 'unsubscribe',
        recipient: 'vendor@example.com',
        category: 'tasks',
        ttlSeconds: 60,
      }
    );
    const token = new URL(url).searchParams.get('token') || '';
    const result = MailService.unsubscribeFromToken(token);
    assert.equal(result.success, true);
    assert.equal(MailService.isUnsubscribed('vendor@example.com', 'tasks'), true);
  });
});
