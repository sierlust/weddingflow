type OptimisticMessage = {
  id: string;
  threadId: string;
  content: string;
  status: 'sending' | 'sent' | 'failed';
  createdAt: string;
  error?: string;
  serverMessageId?: string;
};

/**
 * Phase 4.1.6 Chat optimistic UI state manager
 */
export class ChatUIState {
  private messagesByThread = new Map<string, OptimisticMessage[]>();

  insertOptimisticMessage(threadId: string, content: string): OptimisticMessage {
    const optimistic: OptimisticMessage = {
      id: `tmp-${Math.random().toString(36).slice(2, 10)}`,
      threadId,
      content,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    const list = this.messagesByThread.get(threadId) || [];
    list.push(optimistic);
    this.messagesByThread.set(threadId, list);
    return optimistic;
  }

  acknowledgeMessage(threadId: string, tempId: string, serverMessageId: string): OptimisticMessage | null {
    const list = this.messagesByThread.get(threadId) || [];
    const target = list.find((message) => message.id === tempId);
    if (!target) {
      return null;
    }
    target.status = 'sent';
    target.serverMessageId = serverMessageId;
    target.error = undefined;
    return target;
  }

  markFailed(threadId: string, tempId: string, errorMessage: string): OptimisticMessage | null {
    const list = this.messagesByThread.get(threadId) || [];
    const target = list.find((message) => message.id === tempId);
    if (!target) {
      return null;
    }
    target.status = 'failed';
    target.error = errorMessage;
    return target;
  }

  retryFailedMessage(threadId: string, tempId: string): OptimisticMessage | null {
    const list = this.messagesByThread.get(threadId) || [];
    const target = list.find((message) => message.id === tempId);
    if (!target || target.status !== 'failed') {
      return null;
    }
    target.status = 'sending';
    target.error = undefined;
    return target;
  }

  getThreadMessages(threadId: string): OptimisticMessage[] {
    return [...(this.messagesByThread.get(threadId) || [])];
  }
}

