import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { RealtimeService } from './realtime.service';
import { ChatService } from './collaboration.service';
import { AuthService } from './auth.service';

type TrackedSocket = {
  ws: WebSocket;
  nextMessage: (timeoutMs?: number) => Promise<any>;
};

async function startWsServer(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  RealtimeService.init(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not resolve test server address');
  }
  return { server, port: address.port };
}

function createTrackedSocket(url: string): TrackedSocket {
  const ws = new WebSocket(url);
  const queue: any[] = [];
  const waiters: Array<(value: any) => void> = [];

  ws.on('message', (raw) => {
    const payload = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(payload);
      return;
    }
    queue.push(payload);
  });

  return {
    ws,
    nextMessage(timeoutMs = 1000) {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift());
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for websocket message')), timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
  };
}

describe('RealtimeService', () => {
  let server: Server | null = null;

  beforeEach(() => {
    ChatService.clearStateForTests();
    RealtimeService.clearStateForTests();
    AuthService.clearStateForTests();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    await RealtimeService.shutdownForTests();
  });

  test('rejects supplier subscription to threads they are not participant in', async () => {
    const thread = await ChatService.createThread('wed-rt-1', 'supplier_thread', [], {
      creatorUserId: 'user-a',
      creatorRole: 'owner',
    });

    const started = await startWsServer();
    server = started.server;

    const socket = createTrackedSocket(`ws://127.0.0.1:${started.port}/ws?user_id=user-b`);
    await new Promise<void>((resolve) => socket.ws.once('open', () => resolve()));
    await socket.nextMessage(); // ws.connected

    const { accessToken } = await AuthService.generateTokens('user-b', []);
    socket.ws.send(
      JSON.stringify({
        action: 'subscribe',
        threadId: thread.id,
        token: accessToken,
      })
    );

    const response = await socket.nextMessage();
    assert.equal(response.event, 'error');
    assert.equal(response.code, 'FORBIDDEN_THREAD');
    socket.ws.close();
  });

  test('severs websocket access immediately after supplier removal', async () => {
    const thread = await ChatService.createThread('wed-rt-2', 'supplier_thread', ['removed-user'], {
      creatorUserId: 'owner-user',
      creatorRole: 'owner',
    });

    const started = await startWsServer();
    server = started.server;

    const socket = createTrackedSocket(`ws://127.0.0.1:${started.port}/ws?user_id=removed-user`);
    await new Promise<void>((resolve) => socket.ws.once('open', () => resolve()));
    await socket.nextMessage(); // ws.connected

    const { accessToken } = await AuthService.generateTokens('removed-user', []);
    socket.ws.send(
      JSON.stringify({
        action: 'subscribe',
        threadId: thread.id,
        token: accessToken,
      })
    );
    const subscribed = await socket.nextMessage();
    assert.equal(subscribed.event, 'subscribed');

    const closed = new Promise<boolean>((resolve) => socket.ws.once('close', () => resolve(true)));
    await ChatService.handleSupplierRemoval('removed-user');
    assert.equal(await closed, true);
  });

  test('supports wedding event subscriptions for task/document/appointment updates', async () => {
    const started = await startWsServer();
    server = started.server;

    const socket = createTrackedSocket(`ws://127.0.0.1:${started.port}/ws?user_id=user-wed`);
    await new Promise<void>((resolve) => socket.ws.once('open', () => resolve()));
    await socket.nextMessage(); // ws.connected

    const { accessToken } = await AuthService.generateTokens('user-wed', []);
    socket.ws.send(
      JSON.stringify({
        action: 'subscribe_wedding',
        weddingId: 'wed-events',
        token: accessToken,
      })
    );
    const subscribed = await socket.nextMessage();
    assert.equal(subscribed.event, 'subscribed_wedding');

    RealtimeService.broadcastEvent('document.shared', {
      weddingId: 'wed-events',
      data: { documentId: 'doc-1' },
    });
    const event1 = await socket.nextMessage();
    assert.equal(event1.event, 'document.shared');

    RealtimeService.broadcastEvent('task.updated', {
      weddingId: 'wed-events',
      data: { taskId: 'task-1' },
    });
    const event2 = await socket.nextMessage();
    assert.equal(event2.event, 'task.updated');

    RealtimeService.broadcastEvent('appointment.updated', {
      weddingId: 'wed-events',
      data: { appointmentId: 'appt-1' },
    });
    const event3 = await socket.nextMessage();
    assert.equal(event3.event, 'appointment.updated');

    socket.ws.close();
  });
});

