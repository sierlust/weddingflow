import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditUIManager } from './audit.ui';

describe('AuditUIManager', () => {
  test('renders tombstone text for deleted documents', () => {
    const description = AuditUIManager.formatActionDescription({
      actor_name: 'Owner',
      action: 'deleted',
      entity_type: 'document',
    });
    assert.equal(description, 'Document deleted');

    const diff = AuditUIManager.getDiff(
      { filename: 'quote.pdf' },
      null,
      { action: 'deleted', entityType: 'document' }
    );
    assert.equal(diff?.tombstone, true);
    assert.equal(diff?.message, 'Document deleted');
  });

  test('builds table rows with expandable diff payload', () => {
    const table = AuditUIManager.buildTableModel(
      [
        {
          id: 'evt-1',
          created_at: '2026-02-01T12:00:00.000Z',
          actor_name: 'Owner',
          action: 'changed',
          entity_type: 'appointment',
          entity_id: 'appt-1',
          before_json: { title: 'Old' },
          after_json: { title: 'New' },
        },
      ],
      'evt-1'
    );

    assert.equal(table.columns.length, 4);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0].isExpanded, true);
    assert.deepEqual(table.rows[0].expanded?.changedFields, ['title']);
  });
});
