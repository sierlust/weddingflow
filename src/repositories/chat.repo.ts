// Repository for chat threads, participants, messages, and pinned messages.
// Async functions use Supabase; sync Map accessors kept for ChatService (synchronous internally).

import { db } from '../db/client';

export type Thread = {
    id: string;
    weddingId: string;
    type: 'supplier_thread' | 'couple_internal' | 'all_suppliers';
    createdAt: Date;
    metadata?: Record<string, unknown>;
};

export type ChatMessage = {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    createdAt: Date;
    replyToMessageId?: string;
    metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// In-memory stores (kept for sync access by ChatService)
// ---------------------------------------------------------------------------

const threads = new Map<string, Thread>();
const threadParticipants = new Map<string, Set<string>>();
const messages = new Map<string, ChatMessage[]>();
const pinnedByWedding = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToThread(row: any): Thread {
    return {
        id: row.id,
        weddingId: row.wedding_id,
        type: row.type ?? 'supplier_thread',
        createdAt: new Date(row.created_at),
        metadata: row.title ? { title: row.title } : {},
    };
}

function rowToMessage(row: any): ChatMessage {
    return {
        id: row.id,
        threadId: row.thread_id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: new Date(row.created_at),
    };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function findThreadById(id: string): Promise<Thread | null> {
    if (threads.has(id)) return threads.get(id)!;
    const { data, error } = await db.from('chat_threads').select('*').eq('id', id).single();
    if (error || !data) return null;
    const thread = rowToThread(data);
    threads.set(thread.id, thread);
    ensureThreadMaps(thread.id);
    return thread;
}

export async function findThreadsByWedding(weddingId: string): Promise<Thread[]> {
    const { data, error } = await db.from('chat_threads').select('*').eq('wedding_id', weddingId);
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToThread);
    for (const t of results) {
        threads.set(t.id, t);
        ensureThreadMaps(t.id);
    }
    return results;
}

export async function createThread(thread: Thread): Promise<Thread> {
    const { data, error } = await db.from('chat_threads').insert({
        id: thread.id,
        wedding_id: thread.weddingId,
        type: thread.type,
        title: (thread.metadata?.title as string) ?? null,
        pinned: false,
        created_by: null,
        created_at: thread.createdAt.toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToThread(data);
    threads.set(result.id, result);
    ensureThreadMaps(result.id);
    return result;
}

export async function updateThreadMetadata(id: string, metadata: Record<string, unknown>): Promise<Thread | null> {
    const existing = threads.get(id);
    if (!existing) return null;
    existing.metadata = { ...existing.metadata, ...metadata };
    threads.set(id, existing);
    if (metadata.title !== undefined) {
        await db.from('chat_threads').update({ title: metadata.title as string }).eq('id', id);
    }
    return existing;
}

export function threadExists(id: string): boolean {
    return threads.has(id);
}

export function setThreadSync(thread: Thread): void {
    threads.set(thread.id, thread);
    ensureThreadMaps(thread.id);
    // Fire-and-forget
    db.from('chat_threads').upsert({
        id: thread.id,
        wedding_id: thread.weddingId,
        type: thread.type,
        title: (thread.metadata?.title as string) ?? null,
        pinned: false,
        created_at: thread.createdAt.toISOString(),
    }, { onConflict: 'id' }).then(() => {});
}

// ---------------------------------------------------------------------------
// Thread Participants
// ---------------------------------------------------------------------------

export function getParticipants(threadId: string): Set<string> {
    return threadParticipants.get(threadId) ?? new Set();
}

export function addParticipant(threadId: string, userId: string): void {
    ensureThreadMaps(threadId);
    threadParticipants.get(threadId)!.add(userId);
    // Fire-and-forget
    db.from('chat_participants').upsert(
        { thread_id: threadId, user_id: userId, joined_at: new Date().toISOString() },
        { onConflict: 'thread_id,user_id' }
    ).then(() => {});
}

export function isParticipant(threadId: string, userId: string): boolean {
    const participants = threadParticipants.get(threadId);
    return !!participants && participants.has(userId);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function findMessagesByThread(threadId: string): Promise<ChatMessage[]> {
    const cached = messages.get(threadId);
    if (cached && cached.length > 0) return cached;
    const { data, error } = await db
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    const results = (data ?? []).map(rowToMessage);
    messages.set(threadId, results);
    return results;
}

export async function createMessage(message: ChatMessage): Promise<ChatMessage> {
    const { data, error } = await db.from('chat_messages').insert({
        id: message.id,
        thread_id: message.threadId,
        sender_id: message.senderId,
        content: message.content,
        created_at: message.createdAt.toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const result = rowToMessage(data);
    ensureThreadMaps(result.threadId);
    messages.get(result.threadId)!.push(result);
    return result;
}

export function findMessageById(messageId: string): { threadId: string; message: ChatMessage } | null {
    for (const [threadId, threadMessages] of messages.entries()) {
        const message = threadMessages.find(m => m.id === messageId);
        if (message) return { threadId, message };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Pinned messages
// ---------------------------------------------------------------------------

export function getPinnedForWedding(weddingId: string): Set<string> {
    return pinnedByWedding.get(weddingId) ?? new Set();
}

export function pinMessage(weddingId: string, messageId: string): void {
    const set = pinnedByWedding.get(weddingId) ?? new Set<string>();
    set.add(messageId);
    pinnedByWedding.set(weddingId, set);
}

// ---------------------------------------------------------------------------
// Sync Map accessors (for ChatService which is synchronous internally)
// ---------------------------------------------------------------------------

export function getThreadsMap(): Map<string, Thread> { return threads; }
export function getThreadParticipantsMap(): Map<string, Set<string>> { return threadParticipants; }
export function getMessagesMap(): Map<string, ChatMessage[]> { return messages; }
export function getPinnedByWeddingMap(): Map<string, Set<string>> { return pinnedByWedding; }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureThreadMaps(threadId: string): void {
    if (!threadParticipants.has(threadId)) {
        threadParticipants.set(threadId, new Set());
    }
    if (!messages.has(threadId)) {
        messages.set(threadId, []);
    }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _clearChatStoreForTests(): void {
    threads.clear();
    threadParticipants.clear();
    messages.clear();
    pinnedByWedding.clear();
}
