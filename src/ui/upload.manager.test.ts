import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadManager } from './upload.manager';

describe('UploadManager', () => {
  beforeEach(() => {
    UploadManager.clearStateForTests();
  });

  test('manages queue items with pause/resume/remove actions', () => {
    const item = UploadManager.addFile({ name: 'video.mp4', size: 12 * 1024 * 1024 });
    assert.equal(item.status, 'Queued');

    UploadManager.startUpload(item.id);
    assert.equal(UploadManager.getQueue()[0]?.status, 'Uploading');

    UploadManager.pauseUpload(item.id);
    assert.equal(UploadManager.getQueue()[0]?.status, 'Paused');

    UploadManager.resumeUpload(item.id);
    assert.equal(UploadManager.getQueue()[0]?.status, 'Uploading');

    UploadManager.updateProgress(item.id, 100);
    assert.equal(UploadManager.getQueue()[0]?.status, 'Completed');

    assert.equal(UploadManager.removeUpload(item.id), true);
    assert.equal(UploadManager.getQueue().length, 0);
  });

  test('retries failed uploads and marks hard failures after 3 attempts', async () => {
    const item = UploadManager.addFile({ name: 'retry.pdf', size: 6 * 1024 * 1024 });
    UploadManager.startUpload(item.id);
    UploadManager.markFailed(item.id, 'Network issue', true);

    let attempts = 0;
    await UploadManager.retryUpload(item.id, async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('temporary');
      }
    });

    assert.equal(UploadManager.getQueue()[0]?.status, 'Completed');

    const hardFail = UploadManager.addFile({ name: 'invalid.exe', size: 1000 });
    UploadManager.markFailed(hardFail.id, 'Unsupported file type', false);
    const retried = await UploadManager.retryUpload(hardFail.id, async () => {
      throw new Error('should not run');
    });
    assert.equal(retried, null);
    assert.equal(UploadManager.getQueue().find((q) => q.id === hardFail.id)?.status, 'Failed');
  });

  test('queue state persists globally across reads', () => {
    UploadManager.addFile({ name: 'persist.zip', size: 9 * 1024 * 1024 });
    const firstRead = UploadManager.getQueue();
    const secondRead = UploadManager.getQueue();
    assert.equal(firstRead.length, 1);
    assert.equal(secondRead.length, 1);
    assert.equal(firstRead[0]?.id, secondRead[0]?.id);
  });
});

