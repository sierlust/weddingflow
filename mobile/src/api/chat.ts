import { api } from './client';

export interface Thread {
  id: string;
  weddingId: string;
  wedding_id?: string;
  type: 'supplier_thread' | 'couple_internal' | 'all_suppliers';
  createdAt: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  thread_id?: string;
  senderId: string;
  sender_id?: string;
  content: string;
  createdAt: string;
  created_at?: string;
  replyToMessageId?: string;
  reply_to_message_id?: string;
}

export const chatApi = {
  /** Get existing threads; create one if none exists */
  getOrCreateThread: async (weddingId: string): Promise<Thread> => {
    const result = await api.get<{ threads: Thread[] }>(`/weddings/${weddingId}/threads`)
      .then((r: any) => r.threads ?? r);
    const threads: Thread[] = Array.isArray(result) ? result : [];

    if (threads.length > 0) {
      return threads[0];
    }

    const created = await api.post<{ thread: Thread }>(`/weddings/${weddingId}/threads`, {
      type: 'supplier_thread',
    });
    return (created as any).thread ?? created;
  },

  getMessages: (
    threadId: string,
    cursor?: string,
  ): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> => {
    const path = cursor
      ? `/threads/${threadId}/messages?cursor=${encodeURIComponent(cursor)}`
      : `/threads/${threadId}/messages`;
    return api.get<{ messages: ChatMessage[]; nextCursor: string | null }>(path)
      .then((r: any) => ({
        messages: r.messages ?? r,
        nextCursor: r.nextCursor ?? null,
      }));
  },

  send: (threadId: string, content: string): Promise<ChatMessage> =>
    api.post<{ message: ChatMessage }>(`/threads/${threadId}/messages`, { content })
      .then((r: any) => r.message ?? r),
};
