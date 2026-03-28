import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSService } from './ros.service';

async function seedDraftAndPublish() {
  await ROSService.saveDraft('wed-ros-1', 'owner-1', [
    {
      id: 'item-a',
      sort_index: 0,
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: '2026-07-01T10:30:00.000Z',
      title: 'Ceremony intro',
      item_type: 'ceremony',
      owner_supplier_org_id: 'org-photo',
      visibility_scope: 'selected_suppliers',
      instructions: 'Keep aisle clear',
    },
  ]);
  return ROSService.publishVersion('wed-ros-1', 'owner-1', 'Initial publish');
}

describe('ROSService', () => {
  beforeEach(() => {
    ROSService.clearStateForTests();
  });

  test('autosaves draft with debounce metadata and stores draft items', async () => {
    const result = await ROSService.saveDraft('wed-ros-draft', 'owner-x', [
      {
        start_at: '2026-07-01T08:00:00.000Z',
        end_at: '2026-07-01T09:00:00.000Z',
        title: 'Setup',
        sort_index: 0,
      },
    ]);

    assert.equal(result.success, true);
    assert.equal(result.debounce_ms, 500);
    assert.equal(result.save_indicator, 'Saving...');

    const draft = ROSService.getDraftForTests('wed-ros-draft');
    assert.ok(draft);
    assert.equal(draft.draft_json.length, 1);
    assert.equal(draft.updated_by, 'owner-x');
  });

  test('publishes immutable snapshot and supplier API returns only published versions', async () => {
    const version1 = await seedDraftAndPublish();
    assert.equal(version1.version_number, 1);
    assert.equal(version1.snapshot_json[0].title, 'Ceremony intro');

    await ROSService.saveDraft('wed-ros-1', 'owner-1', [
      {
        id: 'item-a',
        sort_index: 0,
        start_at: '2026-07-01T10:00:00.000Z',
        end_at: '2026-07-01T10:45:00.000Z',
        title: 'Ceremony intro UPDATED',
        owner_supplier_org_id: 'org-photo',
        visibility_scope: 'all_published',
      },
    ]);

    const supplierLatest = await ROSService.getLatestPublishedVersion('wed-ros-1', 'org-photo');
    assert.ok(supplierLatest);
    assert.equal(supplierLatest?.snapshot_json[0].title, 'Ceremony intro');

    const noAccess = await ROSService.getLatestPublishedVersion('wed-ros-1', 'org-catering');
    assert.equal(noAccess, null);
  });

  test('blocks publish when draft has blocking validation errors', async () => {
    await ROSService.saveDraft('wed-invalid', 'owner-1', [
      {
        start_at: '2026-07-01T12:00:00.000Z',
        end_at: '2026-07-01T11:00:00.000Z',
        title: '',
        sort_index: 0,
      },
    ]);

    await assert.rejects(async () => {
      await ROSService.publishVersion('wed-invalid', 'owner-1', 'Should fail');
    });
  });

  test('submits change request with server-side reason and visibility checks', async () => {
    const version = await seedDraftAndPublish();

    await assert.rejects(async () => {
      await ROSService.submitChangeRequest({
        versionId: version.id,
        itemId: 'item-a',
        supplierOrgId: 'org-photo',
        userId: 'supplier-user',
        type: 'time_change',
        reason: 'Too short',
        proposedValues: { proposed_start_at: '2026-07-01T09:55:00.000Z' },
      });
    });

    const ok = await ROSService.submitChangeRequest({
      versionId: version.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'time_change',
      reason: 'Need five more minutes for setup and camera calibration',
      proposedValues: { proposed_start_at: '2026-07-01T09:55:00.000Z' },
    });
    assert.equal(ok.status, 'submitted');

    await assert.rejects(async () => {
      await ROSService.submitChangeRequest({
        versionId: version.id,
        itemId: 'item-a',
        supplierOrgId: 'org-catering',
        userId: 'supplier-user-2',
        type: 'time_change',
        reason: 'Need five more minutes for setup and camera calibration',
        proposedValues: { proposed_start_at: '2026-07-01T09:50:00.000Z' },
      });
    });
  });

  test('lists my requests with newest-first and submitted-first tiebreak', async () => {
    const version = await seedDraftAndPublish();
    const first = await ROSService.submitChangeRequest({
      versionId: version.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'instruction_change',
      reason: 'Please include camera lane reservation in this run sheet item.',
      proposedValues: { proposed_instruction: 'Reserve camera lane' },
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await ROSService.submitChangeRequest({
      versionId: version.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'time_change',
      reason: 'Need buffer after ceremony for family portraits and logistics',
      proposedValues: { proposed_end_at: '2026-07-01T10:40:00.000Z' },
    });

    const rows = await ROSService.getMyChangeRequests('org-photo');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, second.id);
    assert.equal(rows[1].id, first.id);
  });

  test('accepting applies to draft (without publishing), rejecting stores reason, publish marks included version', async () => {
    const version = await seedDraftAndPublish();
    const request = await ROSService.submitChangeRequest({
      versionId: version.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'instruction_change',
      reason: 'Need clearer instruction for live transition between ceremony and photos.',
      proposedValues: { proposed_instruction: 'Transition directly to portraits after vows' },
    });

    const accepted = await ROSService.resolveChangeRequest(request.id, 'accept', 'owner-1');
    assert.equal(accepted.status, 'accepted');

    const draftAfterAccept = ROSService.getDraftForTests('wed-ros-1');
    assert.equal(
      draftAfterAccept?.draft_json.find((row) => row.id === 'item-a')?.instructions,
      'Transition directly to portraits after vows'
    );

    const stillPublished = await ROSService.getLatestPublishedVersion('wed-ros-1', 'org-photo');
    assert.equal(stillPublished?.version_number, 1);
    assert.equal(stillPublished?.snapshot_json[0].instructions, 'Keep aisle clear');

    const published2 = await ROSService.publishVersion('wed-ros-1', 'owner-1', 'Apply supplier request');
    assert.equal(published2.version_number, 2);

    const requestAfterPublish = ROSService.getChangeRequestByIdForTests(request.id);
    assert.equal(requestAfterPublish?.status, 'included_in_version');
    assert.equal(requestAfterPublish?.included_in_version_number, 2);

    const request2 = await ROSService.submitChangeRequest({
      versionId: published2.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'ownership_clarification',
      reason: 'Need explicit owner role confirmation before final timeline circulation.',
      proposedValues: { proposed_instruction: 'Owner role should remain photographer' },
    });

    await assert.rejects(async () => {
      await ROSService.resolveChangeRequest(request2.id, 'reject', 'owner-1');
    });

    const rejected = await ROSService.resolveChangeRequest(
      request2.id,
      'reject',
      'owner-1',
      'Out of scope for this version'
    );
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.request.rejection_reason, 'Out of scope for this version');
  });

  test('returns pending requests with diff preview for couple owner panel', async () => {
    const version = await seedDraftAndPublish();
    await ROSService.submitChangeRequest({
      versionId: version.id,
      itemId: 'item-a',
      supplierOrgId: 'org-photo',
      userId: 'supplier-user',
      type: 'time_change',
      reason: 'Need slightly earlier start and clearer instruction for setup.',
      proposedValues: {
        proposed_start_at: '2026-07-01T09:55:00.000Z',
        proposed_instruction: 'Arrive 5 minutes earlier for lighting',
      },
    });

    const pending = await ROSService.getPendingChangeRequests('wed-ros-1');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].item_title, 'Ceremony intro');
    assert.ok(pending[0].diff_preview.instructions);
    assert.ok(pending[0].diff_preview.start_at);
  });
});
