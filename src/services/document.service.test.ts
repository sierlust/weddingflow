import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentService } from './collaboration.service';

describe('DocumentService', () => {
  beforeEach(() => {
    DocumentService.clearStateForTests();
  });

  test('presign enforces max 250MB and returns short-lived URL metadata', async () => {
    await assert.rejects(async () => {
      await DocumentService.presignUpload('big.mov', 'video/mp4', 251 * 1024 * 1024);
    });

    const result = await DocumentService.presignUpload('ok.pdf', 'application/pdf', 1024);
    assert.equal(result.expiresIn, 900);
    assert.match(result.uploadUrl, /presigned=true/);
  });

  test('creates documents with category-based default visibility', async () => {
    const proposal = await DocumentService.confirmUpload({
      weddingId: 'wed-1',
      userId: 'user-1',
      filename: 'proposal.pdf',
      s3Key: 'uploads/1',
      category: 'Proposals/Quotes',
    });
    const runOfShow = await DocumentService.confirmUpload({
      weddingId: 'wed-1',
      userId: 'user-1',
      filename: 'timeline.pdf',
      s3Key: 'uploads/2',
      category: 'Run-of-show attachments',
    });
    const inspiration = await DocumentService.confirmUpload({
      weddingId: 'wed-1',
      userId: 'user-1',
      filename: 'moodboard.pdf',
      s3Key: 'uploads/3',
      category: 'Inspiration',
      sharedWithSupplierOrgIds: ['org-a'],
    });

    assert.equal(proposal.visibilityScope, 'couple_only');
    assert.equal(runOfShow.visibilityScope, 'all_assigned_suppliers');
    assert.equal(inspiration.visibilityScope, 'selected_suppliers');
  });

  test('requires selected suppliers when uploading inspiration files', async () => {
    await assert.rejects(async () => {
      await DocumentService.confirmUpload({
        weddingId: 'wed-1',
        userId: 'user-1',
        filename: 'missing-targets.pdf',
        s3Key: 'uploads/4',
        category: 'Inspiration',
      });
    });
  });

  test('updates sharing scope and enforces selected supplier access', async () => {
    const doc = await DocumentService.confirmUpload({
      weddingId: 'wed-2',
      userId: 'user-1',
      filename: 'contract.pdf',
      s3Key: 'uploads/contract',
      category: 'Contracts',
    });
    assert.equal(DocumentService.canSupplierAccessDocument(doc.id, 'org-a'), false);

    const shared = await DocumentService.shareDocument(doc.id, 'selected_suppliers', ['org-a']);
    assert.equal(shared.status, 'updated');
    assert.equal(shared.accessVersion, 2);
    assert.equal(DocumentService.canSupplierAccessDocument(doc.id, 'org-a'), true);
    assert.equal(DocumentService.canSupplierAccessDocument(doc.id, 'org-b'), false);

    await DocumentService.shareDocument(doc.id, 'couple_only', []);
    assert.equal(DocumentService.canSupplierAccessDocument(doc.id, 'org-a'), false);
  });

  test('lists documents by wedding and optional category filter', async () => {
    await DocumentService.confirmUpload({
      weddingId: 'wed-3',
      userId: 'user-1',
      filename: 'a.pdf',
      s3Key: 'uploads/a',
      category: 'Contracts',
    });
    await DocumentService.confirmUpload({
      weddingId: 'wed-3',
      userId: 'user-1',
      filename: 'b.pdf',
      s3Key: 'uploads/b',
      category: 'Inspiration',
      sharedWithSupplierOrgIds: ['org-a'],
    });
    await DocumentService.confirmUpload({
      weddingId: 'wed-other',
      userId: 'user-1',
      filename: 'c.pdf',
      s3Key: 'uploads/c',
      category: 'Contracts',
    });

    const all = await DocumentService.getWeddingDocuments('wed-3');
    const contracts = await DocumentService.getWeddingDocuments('wed-3', 'Contracts');
    assert.equal(all.length, 2);
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].category, 'Contracts');
  });
});
