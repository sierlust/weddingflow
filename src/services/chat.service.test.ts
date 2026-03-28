import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from './collaboration.service';
import { RealtimeService } from './realtime.service';

describe('ChatService', () => {
  beforeEach(() => {
    ChatService.clearStateForTests();
    RealtimeService.clearStateForTests();
  });

  test('creates and lists threads for participants only', async () => {
    const thread = await ChatService.createThread('wed-1', 'supplier_thread', ['user-b'], {
      creatorUserId: 'user-a',
      creatorRole: 'owner',
    });

    const forUserA = await ChatService.getThreads('wed-1', 'user-a');
    const forUserB = await ChatService.getThreads('wed-1', 'user-b');
    const forUserC = await ChatService.getThreads('wed-1', 'user-c');

    assert.equal(forUserA.length, 1);
    assert.equal(forUserB.length, 1);
    assert.equal(forUserA[0].id, thread.id);
    assert.equal(forUserC.length, 0);
  });

  test('enforces owner-only rule for all_suppliers thread creation', async () => {
    await assert.rejects(async () => {
      await ChatService.createThread('wed-2', 'all_suppliers', [], {
        creatorUserId: 'supplier-user',
        creatorRole: 'supplier',
      });
    });
  });

  test('rejects message send when sender is not a thread participant', async () => {
    const thread = await ChatService.createThread('wed-3', 'supplier_thread', ['participant-user'], {
      creatorUserId: 'owner-user',
      creatorRole: 'owner',
    });

    await assert.rejects(async () => {
      await ChatService.sendMessage(thread.id, 'stranger-user', 'hello');
    });
  });

  test('supports cursor-based message pagination', async () => {
    const thread = await ChatService.createThread('wed-4', 'supplier_thread', [], {
      creatorUserId: 'user-a',
      creatorRole: 'owner',
    });

    await ChatService.sendMessage(thread.id, 'user-a', 'first');
    await new Promise((resolve) => setTimeout(resolve, 3));
    await ChatService.sendMessage(thread.id, 'user-a', 'second');

    const page1 = await ChatService.getMessages(thread.id, undefined, 1);
    assert.equal(page1.messages.length, 1);
    assert.ok(page1.nextCursor);

    const page2 = await ChatService.getMessages(thread.id, page1.nextCursor || undefined, 1);
    assert.equal(page2.messages.length, 1);
    assert.notEqual(page1.messages[0].id, page2.messages[0].id);
  });

  test('disconnects user transport when supplier is removed', async () => {
    let disconnectedUserId: string | null = null;
    const original = RealtimeService.disconnectUser;
    (RealtimeService as any).disconnectUser = (userId: string) => {
      disconnectedUserId = userId;
    };

    await ChatService.handleSupplierRemoval('removed-user');
    assert.equal(disconnectedUserId, 'removed-user');

    (RealtimeService as any).disconnectUser = original;
  });

  test('supports reply, pin, convert-to-task, convert-to-appointment and attach-document actions', async () => {
    const thread = await ChatService.createThread('wed-5', 'supplier_thread', ['user-b'], {
      creatorUserId: 'user-a',
      creatorRole: 'owner',
    });

    const original = await ChatService.sendMessage(thread.id, 'user-a', 'base message');
    const reply = await ChatService.replyToMessage(thread.id, 'user-b', original.id, 'reply message');
    assert.equal(reply.replyToMessageId, original.id);

    const pinned = ChatService.pinToWedding('wed-5', original.id, 'user-a');
    assert.equal(pinned.status, 'pinned');

    const asTask = ChatService.convertToTask(original.id);
    assert.equal(asTask.status, 'task_created');
    assert.ok(asTask.taskId);

    const asAppointment = ChatService.convertToAppointment(
      original.id,
      '2026-08-01T10:00:00.000Z',
      '2026-08-01T11:00:00.000Z'
    );
    assert.equal(asAppointment.status, 'appointment_created');
    assert.ok(asAppointment.appointmentId);

    const attached = ChatService.attachDocument(original.id, 'doc-123');
    assert.equal(attached.status, 'document_attached');
    assert.equal(attached.documentId, 'doc-123');
  });
});
