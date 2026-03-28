import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from './auth.service';
import { ChatService } from './collaboration.service';

type SocketMeta = {
  userId: string;
};

export class RealtimeService {
  private static wss: WebSocketServer | null = null;
  private static clientsByUser = new Map<string, Set<WebSocket>>();
  private static threadSubscriptions = new Map<string, Set<WebSocket>>();
  private static weddingSubscriptions = new Map<string, Set<WebSocket>>();
  private static socketMeta = new WeakMap<WebSocket, SocketMeta>();

  static init(server: Server) {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token');
      // In development only, allow header-based auth for local testing convenience.
      const devFallbackUserId = process.env.NODE_ENV !== 'production'
        ? (url.searchParams.get('user_id') || req.headers['x-user-id']?.toString())
        : undefined;

      let userId: string | null = null;
      if (token) {
        try {
          const claims = AuthService.validateAccessToken(token);
          userId = claims.sub;
        } catch {
          ws.close(1008, 'Invalid token');
          return;
        }
      } else if (devFallbackUserId) {
        userId = devFallbackUserId;
      }

      if (!userId) {
        ws.close(1008, 'Authentication required');
        return;
      }

      this.socketMeta.set(ws, { userId });
      const existing = this.clientsByUser.get(userId) || new Set<WebSocket>();
      existing.add(ws);
      this.clientsByUser.set(userId, existing);

      ws.on('message', (raw) => {
        this.handleClientMessage(ws, raw.toString());
      });

      ws.on('close', () => {
        this.cleanupSocket(ws);
      });

      ws.send(
        JSON.stringify({
          event: 'ws.connected',
          userId,
        })
      );
    });
  }

  static broadcastToThread(threadId: string, payload: any) {
    const subscribers = this.threadSubscriptions.get(threadId) || new Set<WebSocket>();
    const message = JSON.stringify(payload);
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  static broadcastToWedding(weddingId: string, payload: any) {
    const subscribers = this.weddingSubscriptions.get(weddingId) || new Set<WebSocket>();
    const message = JSON.stringify(payload);
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  static broadcastEvent(
    event: 'message.created' | 'task.updated' | 'appointment.updated' | 'document.shared',
    payload: { threadId?: string; weddingId?: string; data?: unknown }
  ) {
    if (payload.threadId) {
      this.broadcastToThread(payload.threadId, { event, data: payload.data });
    }
    if (payload.weddingId) {
      this.broadcastToWedding(payload.weddingId, { event, data: payload.data });
    }
  }

  static disconnectUser(userId: string) {
    const sockets = this.clientsByUser.get(userId) || new Set<WebSocket>();
    for (const socket of sockets) {
      socket.close(1000, 'Access revoked');
      this.cleanupSocket(socket);
    }
  }

  static clearStateForTests() {
    this.clientsByUser.clear();
    this.threadSubscriptions.clear();
    this.weddingSubscriptions.clear();
    this.socketMeta = new WeakMap<WebSocket, SocketMeta>();
  }

  static async shutdownForTests() {
    if (!this.wss) {
      this.clearStateForTests();
      return;
    }

    const instance = this.wss;
    this.wss = null;
    this.clearStateForTests();
    for (const client of instance.clients) {
      client.terminate();
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        instance.close(() => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    ]);
  }

  private static handleClientMessage(ws: WebSocket, raw: string) {
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ event: 'error', code: 'INVALID_JSON' }));
      return;
    }

    const meta = this.socketMeta.get(ws);
    if (!meta) {
      ws.close(1008, 'Unauthenticated');
      return;
    }

    // 4.1.9: revalidate token on each control message, not just handshake.
    if (!message?.token) {
      ws.send(JSON.stringify({ event: 'error', code: 'TOKEN_REQUIRED' }));
      return;
    }

    try {
      const claims = AuthService.validateAccessToken(String(message.token));
      if (claims.sub !== meta.userId) {
        ws.send(JSON.stringify({ event: 'error', code: 'TOKEN_USER_MISMATCH' }));
        return;
      }
    } catch {
      ws.send(JSON.stringify({ event: 'error', code: 'INVALID_TOKEN' }));
      return;
    }

    if (message.action === 'subscribe') {
      const threadId = String(message.threadId || '');
      if (!threadId || !ChatService.canUserAccessThread(threadId, meta.userId)) {
        ws.send(JSON.stringify({ event: 'error', code: 'FORBIDDEN_THREAD' }));
        return;
      }
      const existing = this.threadSubscriptions.get(threadId) || new Set<WebSocket>();
      existing.add(ws);
      this.threadSubscriptions.set(threadId, existing);
      ws.send(JSON.stringify({ event: 'subscribed', threadId }));
      return;
    }

    if (message.action === 'subscribe_wedding') {
      const weddingId = String(message.weddingId || '');
      if (!weddingId) {
        ws.send(JSON.stringify({ event: 'error', code: 'INVALID_WEDDING' }));
        return;
      }
      const existing = this.weddingSubscriptions.get(weddingId) || new Set<WebSocket>();
      existing.add(ws);
      this.weddingSubscriptions.set(weddingId, existing);
      ws.send(JSON.stringify({ event: 'subscribed_wedding', weddingId }));
      return;
    }

    if (message.action === 'unsubscribe') {
      const threadId = String(message.threadId || '');
      const existing = this.threadSubscriptions.get(threadId);
      if (existing) {
        existing.delete(ws);
        if (existing.size === 0) {
          this.threadSubscriptions.delete(threadId);
        }
      }
      ws.send(JSON.stringify({ event: 'unsubscribed', threadId }));
      return;
    }

    if (message.action === 'unsubscribe_wedding') {
      const weddingId = String(message.weddingId || '');
      const existing = this.weddingSubscriptions.get(weddingId);
      if (existing) {
        existing.delete(ws);
        if (existing.size === 0) {
          this.weddingSubscriptions.delete(weddingId);
        }
      }
      ws.send(JSON.stringify({ event: 'unsubscribed_wedding', weddingId }));
      return;
    }
  }

  private static cleanupSocket(ws: WebSocket) {
    for (const subscribers of this.threadSubscriptions.values()) {
      subscribers.delete(ws);
    }
    for (const [threadId, subscribers] of this.threadSubscriptions.entries()) {
      if (subscribers.size === 0) {
        this.threadSubscriptions.delete(threadId);
      }
    }
    for (const subscribers of this.weddingSubscriptions.values()) {
      subscribers.delete(ws);
    }
    for (const [weddingId, subscribers] of this.weddingSubscriptions.entries()) {
      if (subscribers.size === 0) {
        this.weddingSubscriptions.delete(weddingId);
      }
    }

    const meta = this.socketMeta.get(ws);
    if (meta) {
      const set = this.clientsByUser.get(meta.userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          this.clientsByUser.delete(meta.userId);
        }
      }
    }
  }
}
