import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentLibraryUI } from './document.library';

describe('DocumentLibraryUI', () => {
  test('builds table rows with expected columns and actions', () => {
    const rows = DocumentLibraryUI.buildTableRows([
      {
        id: 'doc-1',
        filename: 'contract.pdf',
        category: 'Contracts',
        uploadedBy: 'Sarah',
        createdAt: '2026-01-01T10:00:00.000Z',
        visibilityScope: 'selected_suppliers',
        sharedWithSupplierOrgIds: ['org-1', 'org-2'],
      },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.filename, 'contract.pdf');
    assert.equal(rows[0]?.type, 'Contracts');
    assert.match(rows[0]?.sharedWithBadge || '', /Selected/);
    assert.equal(rows[0]?.actions.includes('share'), true);
  });

  test('enforces mandatory share selection controls on upload/share changes', () => {
    const model = DocumentLibraryUI.getShareControlModel('selected_suppliers', ['org-1']);
    assert.equal(model.mandatory, true);
    assert.equal(model.options.length, 3);

    const invalid = DocumentLibraryUI.validateShareControl('selected_suppliers', []);
    assert.equal(invalid.valid, false);

    const valid = DocumentLibraryUI.validateShareControl('all_assigned_suppliers', []);
    assert.equal(valid.valid, true);
  });
});

