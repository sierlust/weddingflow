import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadService, UploadValidationError } from './upload.service';

describe('UploadService', () => {
  beforeEach(() => {
    UploadService.clearStateForTests();
  });

  test('rejects invalid file type and oversized file before upload starts', async () => {
    await assert.rejects(
      async () =>
        UploadService.initiateMultipart('bad.exe', 'application/x-msdownload', 'wed-1', 1024),
      (err: any) => err instanceof UploadValidationError && err.code === 'INVALID_FILE_TYPE'
    );

    await assert.rejects(
      async () =>
        UploadService.initiateMultipart(
          'huge.mp4',
          'video/mp4',
          'wed-1',
          251 * 1024 * 1024
        ),
      (err: any) => err instanceof UploadValidationError && err.code === 'FILE_TOO_LARGE'
    );
  });

  test('supports resumable multipart upload and enforces 5MiB minimum part size', async () => {
    const initiated = await UploadService.initiateMultipart(
      'video.mp4',
      'video/mp4',
      'wed-2',
      9 * 1024 * 1024
    );

    await assert.rejects(
      async () => UploadService.uploadPart(initiated.uploadId, 1, Buffer.alloc(1024)),
      (err: any) => err instanceof UploadValidationError && err.code === 'PART_TOO_SMALL'
    );

    const firstPart = await UploadService.uploadPart(
      initiated.uploadId,
      1,
      Buffer.alloc(5 * 1024 * 1024)
    );
    assert.equal(firstPart.status, 'uploading');

    const finalPart = await UploadService.uploadPart(
      initiated.uploadId,
      -1,
      Buffer.alloc(4 * 1024 * 1024)
    );
    assert.equal(finalPart.status, 'completed');
    assert.equal((UploadService.getUpload(initiated.uploadId)?.uploadedBytes || 0) >= 9 * 1024 * 1024, true);
  });

  test('shows duplicate warning when same filename and size were uploaded in last 24h', async () => {
    const first = await UploadService.initiateMultipart('contract.pdf', 'application/pdf', 'wed-3', 6 * 1024 * 1024);
    await UploadService.uploadPart(first.uploadId, -1, Buffer.alloc(6 * 1024 * 1024));

    const second = await UploadService.initiateMultipart('contract.pdf', 'application/pdf', 'wed-3', 6 * 1024 * 1024);
    assert.ok(second.warning);
    assert.match(second.warning?.message || '', /uploaded recently/i);
  });

  test('retries transient failures with exponential backoff up to 3 attempts', async () => {
    let calls = 0;
    const result = await UploadService.uploadWithRetry(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('temporary network drop');
      }
      return { ok: true };
    }, 3, 1);

    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  });

  test('abort cleans up incomplete session', async () => {
    const initiated = await UploadService.initiateMultipart('image.png', 'image/png', 'wed-4', 7 * 1024 * 1024);
    await UploadService.uploadPart(initiated.uploadId, 1, Buffer.alloc(5 * 1024 * 1024));

    const aborted = await UploadService.abortUpload(initiated.uploadId);
    assert.equal(aborted.success, true);
    assert.equal(UploadService.getUpload(initiated.uploadId), null);
  });
});

