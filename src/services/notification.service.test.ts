import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from './notification.service';
import { MailService } from './mail.service';

describe('NotificationService (7.2)', () => {
  beforeEach(() => {
    NotificationService.clearStateForTests();
    MailService.clearStateForTests();
  });

  test('registers device tokens and refreshes ownership when token moves users', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');
    await NotificationService.registerToken('user-2', 'token-a', 'ios');

    const user1Tokens = NotificationService.getDeviceTokensForTests('user-1');
    const user2Tokens = NotificationService.getDeviceTokensForTests('user-2');
    assert.equal(user1Tokens.length, 0);
    assert.equal(user2Tokens.length, 1);
    assert.equal(user2Tokens[0].token, 'token-a');
  });

  test('dispatches minimal push payload to correct devices and never leaks message content', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');
    await NotificationService.registerToken('user-1', 'token-b', 'web');

    const sentBodies: string[] = [];
    NotificationService.setPushSenderForTests(async (_token, _platform, content) => {
      sentBodies.push(String(content.body));
    });

    const result = await NotificationService.notify('user-1', 'wed-1', 'message.created', {
      weddingName: 'Sanne & Koen',
      messageContent: 'Secret chat line',
      senderEmail: 'sanne@example.com',
    });
    assert.equal(result.sent, 2);
    assert.equal(sentBodies.length, 2);
    assert.equal(sentBodies.every((body) => body.includes('Secret chat line') === false), true);
    assert.equal(sentBodies.every((body) => body.includes('@example.com') === false), true);
  });

  test('keeps push payload within 4KB budget', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');
    let serialized = '';
    NotificationService.setPushSenderForTests(async (_token, _platform, content) => {
      serialized = JSON.stringify(content);
    });

    await NotificationService.notify('user-1', 'wed-1', 'message.created', {
      weddingName: 'W'.repeat(7000),
    });

    assert.equal(Buffer.byteLength(serialized, 'utf8') <= 4096, true);
  });

  test('supports FCM/APNs provider configuration for platform routing', async () => {
    await NotificationService.registerToken('user-1', 'token-ios', 'ios');
    NotificationService.configurePushProviders({ fcmEnabled: false, apnsEnabled: false, iosViaFcm: false });

    const result = await NotificationService.notify('user-1', 'wed-1', 'message.created', {
      weddingName: 'Provider test',
    });
    assert.equal(result.sent, 0);
    const failed = NotificationService.getDispatchLogForTests().find((entry) => entry.status === 'failed');
    assert.ok(failed);
    assert.equal(failed?.reason, 'PUSH_PROVIDER_UNAVAILABLE');
  });

  test('skips pushes for muted weddings and opted-out preferences', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');

    await NotificationService.setWeddingMuteOverride('user-1', 'wed-muted', null);
    const muted = await NotificationService.notify('user-1', 'wed-muted', 'document.shared', {
      weddingName: 'Muted Wedding',
    });
    assert.equal(muted.sent, 0);
    assert.equal(muted.skippedMuted, true);

    await NotificationService.updatePreferences('user-1', { 'push:document.shared': false });
    const optOut = await NotificationService.notify('user-1', 'wed-1', 'document.shared', {
      weddingName: 'Open Wedding',
    });
    assert.equal(optOut.sent, 0);
    assert.equal(optOut.skippedPreference, true);
  });

  test('invalidates cached preferences when user preferences change', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');
    NotificationService.setPushSenderForTests(async () => {});

    await NotificationService.updatePreferences('user-1', { 'push:task.assigned': false });
    const first = await NotificationService.notify('user-1', 'wed-1', 'task.assigned', {
      weddingName: 'Cache wedding',
    });
    assert.equal(first.sent, 0);

    await NotificationService.updatePreferences('user-1', { 'push:task.assigned': true });
    const second = await NotificationService.notify('user-1', 'wed-1', 'task.assigned', {
      weddingName: 'Cache wedding',
    });
    assert.equal(second.sent, 1);
  });

  test('retries transient failures and removes stale tokens on UNREGISTERED', async () => {
    await NotificationService.registerToken('user-1', 'token-transient', 'ios');
    await NotificationService.registerToken('user-1', 'token-stale', 'web');

    let transientAttempts = 0;
    NotificationService.setPushSenderForTests(async (token) => {
      if (token === 'token-transient') {
        transientAttempts += 1;
        if (transientAttempts < 2) {
          const err: any = new Error('Temporary network issue');
          err.code = 'ETIMEDOUT';
          throw err;
        }
        return;
      }
      if (token === 'token-stale') {
        const err: any = new Error('Token invalid');
        err.code = 'UNREGISTERED';
        throw err;
      }
    });

    const result = await NotificationService.notify('user-1', 'wed-1', 'task.assigned', {
      weddingName: 'Sanne & Koen',
    });
    assert.equal(result.sent, 1);
    assert.equal(result.removedTokens, 1);
    assert.equal(result.retried >= 1, true);
    assert.equal(NotificationService.getDeviceTokensForTests('user-1').some((t) => t.token === 'token-stale'), false);
  });

  test('dispatchEvent uses shared event catalog for push and email channels', async () => {
    await NotificationService.registerToken('user-1', 'token-a', 'ios');
    NotificationService.setPushSenderForTests(async () => {});

    const dispatched = await NotificationService.dispatchEvent({
      userId: 'user-1',
      weddingId: 'wed-1',
      eventType: 'invitation.created',
      payload: {
        coupleName: 'Sanne & Koen',
        inviteUrl: 'https://managementapp.local/invite',
        weddingName: 'Sanne & Koen',
      },
      email: 'vendor@example.com',
    });

    assert.equal(dispatched.push.sent, 1);
    assert.equal(dispatched.email.skipped, false);
    const sentMail = MailService.getSentMailForTests();
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].templateKey, 'SUPPLIER_INVITATION_FLOW_A');
  });
});
