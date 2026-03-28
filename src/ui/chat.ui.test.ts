import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatUIState } from './chat.ui';

describe('ChatUIState', () => {
  test('supports optimistic send, ack, failure and retry', () => {
    const ui = new ChatUIState();
    const optimistic = ui.insertOptimisticMessage('thread-1', 'Hello');
    assert.equal(optimistic.status, 'sending');

    const acknowledged = ui.acknowledgeMessage('thread-1', optimistic.id, 'msg-1');
    assert.equal(acknowledged?.status, 'sent');
    assert.equal(acknowledged?.serverMessageId, 'msg-1');

    const second = ui.insertOptimisticMessage('thread-1', 'Will fail');
    const failed = ui.markFailed('thread-1', second.id, 'Network error');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'Network error');

    const retried = ui.retryFailedMessage('thread-1', second.id);
    assert.equal(retried?.status, 'sending');
    assert.equal(retried?.error, undefined);
  });
});

