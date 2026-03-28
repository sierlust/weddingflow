import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { InvitationFlowUI } from './invitation.flow';

describe('InvitationFlowUI', () => {
  test('builds decline screen with predefined reasons and live counter', () => {
    const screen = InvitationFlowUI.getDeclineScreen(
      { id: 'inv-1', wedding_id: 'wed-1', target_email: 'supplier@example.com', status: 'pending' },
      'note'
    );

    assert.equal(screen.reasonDropdown.required, true);
    assert.equal(screen.noteField.maxLength, 1024);
    assert.equal(screen.noteField.currentLength, 4);
    assert.equal(screen.reasonDropdown.options.length > 0, true);
  });

  test('validates decline and optional note limits', () => {
    const valid = InvitationFlowUI.validateDeclineInput('Not available on date', 'ok');
    assert.equal(valid.valid, true);

    const invalidReason = InvitationFlowUI.validateDeclineInput('');
    assert.equal(invalidReason.valid, false);

    const invalidLength = InvitationFlowUI.validateDeclineInput(
      'Other',
      'x'.repeat(1025)
    );
    assert.equal(invalidLength.valid, false);
  });

  test('supports optional note-to-couple screen with 500-char limit', () => {
    const screen = InvitationFlowUI.getSendNoteToCoupleScreen('hello');
    assert.equal(screen.maxLength, 500);
    assert.equal(screen.currentLength, 5);

    const valid = InvitationFlowUI.validateSendNoteToCouple('a'.repeat(500));
    assert.equal(valid.valid, true);

    const invalid = InvitationFlowUI.validateSendNoteToCouple('a'.repeat(501));
    assert.equal(invalid.valid, false);
  });

  test('maps invited suppliers rows with read-only decline fields', () => {
    const rows = InvitationFlowUI.buildInvitedSuppliersList([
      {
        id: 'inv-2',
        target_email: 'supplier2@example.com',
        status: 'declined',
        decline_reason: 'Budget mismatch',
        decline_note: 'Too small project scope',
      },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.declineFieldsReadOnly, true);
    assert.equal(rows[0]?.decline_reason, 'Budget mismatch');
  });
});

