import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BillingService } from '../services/billing.service';
import { DocumentService } from '../services/collaboration.service';
import { UploadService } from '../services/upload.service';
import { DocumentController } from './document.controller';
import { UploadController } from './upload.controller';

function createRes() {
  return {
    statusCode: 200,
    payload: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.payload = body;
      return this;
    },
    send(body: any) {
      this.payload = body;
      return this;
    },
  };
}

describe('Controller-level entitlement enforcement', () => {
  beforeEach(() => {
    BillingService.clearStateForTests();
    DocumentService.clearStateForTests();
    UploadService.clearStateForTests();

    BillingService.setPlanForTests({
      id: 'plan-storage-tight',
      name: 'Storage Tight',
      slug: 'storage-tight',
      active_weddings_limit: 5,
      seats_limit: 5,
      storage_gb_limit: 1,
      price_cents: 1000,
      currency: 'EUR',
      entitlements: {},
    });
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-storage-1',
      plan_id: 'plan-storage-tight',
      status: 'active',
    });
  });

  test('blocks document creation on storage limit hit and cancels action fully', async () => {
    BillingService.setUsageCounter('org-storage-1', 'storage_bytes', 1024 ** 3);

    const res = createRes();
    await DocumentController.create(
      {
        params: { weddingId: 'wed-storage-1' },
        body: {
          filename: 'large.pdf',
          s3Key: 'uploads/large.pdf',
          category: 'Contracts',
          sizeBytes: 10,
        },
        user: {
          sub: 'supplier-user-1',
          supplier_org_id: 'org-storage-1',
          role: 'supplier',
          is_platform_admin: false,
        },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'LIMIT_EXCEEDED_STORAGE');

    const docs = await DocumentService.getWeddingDocuments('wed-storage-1');
    assert.equal(docs.length, 0);
  });

  test('blocks upload initiation when storage limit is exceeded', async () => {
    BillingService.setUsageCounter('org-storage-1', 'storage_bytes', 1024 ** 3);

    const res = createRes();
    await UploadController.initiate(
      {
        body: {
          filename: 'video.mp4',
          fileType: 'video/mp4',
          sizeBytes: 1024,
          weddingId: 'wed-storage-1',
        },
        user: {
          sub: 'supplier-user-1',
          supplier_org_id: 'org-storage-1',
          role: 'supplier',
          is_platform_admin: false,
        },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'LIMIT_EXCEEDED_STORAGE');
  });

  test('keeps read access available while supplier writes are blocked after grace period', async () => {
    BillingService.setSubscriptionForTests({
      supplier_org_id: 'org-storage-1',
      plan_id: 'plan-storage-tight',
      status: 'past_due',
      current_period_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const writeRes = createRes();
    await UploadController.initiate(
      {
        body: {
          filename: 'blocked.pdf',
          fileType: 'application/pdf',
          sizeBytes: 1024,
          weddingId: 'wed-storage-1',
        },
        user: {
          sub: 'supplier-user-1',
          supplier_org_id: 'org-storage-1',
          role: 'supplier',
          is_platform_admin: false,
        },
      },
      writeRes
    );
    assert.equal(writeRes.statusCode, 403);
    assert.equal(writeRes.payload.code, 'SUBSCRIPTION_LAPSE_BLOCK');

    const readRes = createRes();
    await DocumentController.list(
      {
        params: { id: 'wed-storage-1' },
        query: {},
        user: {
          sub: 'supplier-user-1',
          supplier_org_id: 'org-storage-1',
          role: 'supplier',
          is_platform_admin: false,
        },
      },
      readRes
    );
    assert.equal(readRes.statusCode, 200);
    assert.deepEqual(readRes.payload, []);
  });
});
