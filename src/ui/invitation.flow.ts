type InvitationSummary = {
  id: string;
  wedding_id: string | null;
  target_email: string;
  status: string;
};

type InvitationListRow = {
  id: string;
  target_email: string;
  status: string;
  decline_reason?: string | null;
  decline_note?: string | null;
};

/**
 * Phase 2.3 + 2.4 Invitation UI models
 */
export class InvitationFlowUI {
  static readonly DECLINE_REASONS = [
    'Not available on date',
    'Outside service area',
    'Category mismatch',
    'Budget mismatch',
    'Other',
  ] as const;

  static getDeclineScreen(invitation: InvitationSummary, declineNote = '') {
    return {
      title: 'Decline invitation',
      weddingSummary: {
        weddingId: invitation.wedding_id,
        invitedEmail: invitation.target_email,
      },
      reasonDropdown: {
        required: true,
        options: [...this.DECLINE_REASONS],
      },
      noteField: {
        maxLength: 1024,
        currentLength: declineNote.length,
        value: declineNote.slice(0, 1024),
      },
    };
  }

  static validateDeclineInput(reason: string, declineNote?: string) {
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
      return { valid: false, error: 'Decline reason is required.' };
    }
    if (!this.DECLINE_REASONS.includes(normalizedReason as (typeof this.DECLINE_REASONS)[number])) {
      return { valid: false, error: 'Decline reason is invalid.' };
    }
    if ((declineNote || '').length > 1024) {
      return { valid: false, error: 'Decline note cannot exceed 1024 characters.' };
    }
    return { valid: true as const };
  }

  static getSendNoteToCoupleScreen(note = '') {
    return {
      title: 'Send note to couple',
      plainTextOnly: true,
      maxLength: 500,
      currentLength: note.length,
      value: note.slice(0, 500),
    };
  }

  static validateSendNoteToCouple(note: string) {
    if ((note || '').length > 500) {
      return { valid: false, error: 'Note to couple cannot exceed 500 characters.' };
    }
    return { valid: true as const };
  }

  static buildInvitedSuppliersList(rows: InvitationListRow[]) {
    return rows.map((row) => ({
      id: row.id,
      target_email: row.target_email,
      status: row.status,
      decline_reason: row.decline_reason || null,
      decline_note: row.decline_note || null,
      declineFieldsReadOnly: true,
    }));
  }

  static getFlowAAcceptScreen(invitation: InvitationSummary) {
    return {
      title: 'Accept invitation',
      invitationId: invitation.id,
      lockedEmail: invitation.target_email,
      status: invitation.status,
      cta: 'Accept invitation',
    };
  }

  static getFlowBLandingScreen(invitation: InvitationSummary) {
    return {
      title: 'Create account to join wedding workspace',
      invitationId: invitation.id,
      prefilledEmail: invitation.target_email,
      emailLocked: true,
      steps: ['Create account', 'Set up organization', 'Accept invitation'],
    };
  }
}

