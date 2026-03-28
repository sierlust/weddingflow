type DocumentRowInput = {
  id: string;
  filename: string;
  category: string;
  uploadedBy: string;
  createdAt: string;
  visibilityScope: 'couple_only' | 'all_assigned_suppliers' | 'selected_suppliers';
  sharedWithSupplierOrgIds?: string[];
};

/**
 * Phase 4.2.5 + 4.2.6 Document library UI models
 */
export class DocumentLibraryUI {
  static buildTableRows(documents: DocumentRowInput[]) {
    return documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      type: doc.category,
      uploadedBy: doc.uploadedBy,
      uploadedAt: doc.createdAt,
      sharedWithBadge: this.getSharedWithBadge(doc.visibilityScope, doc.sharedWithSupplierOrgIds || []),
      actions: ['download', 'share', 'rename'],
    }));
  }

  static getShareControlModel(scope: DocumentRowInput['visibilityScope'], selectedSupplierOrgIds: string[] = []) {
    return {
      mandatory: true,
      scope,
      options: [
        { value: 'couple_only', label: 'Couple only' },
        { value: 'all_assigned_suppliers', label: 'All assigned suppliers' },
        { value: 'selected_suppliers', label: 'Selected suppliers' },
      ],
      selectedSupplierOrgIds: [...selectedSupplierOrgIds],
    };
  }

  static validateShareControl(scope: DocumentRowInput['visibilityScope'], selectedSupplierOrgIds: string[] = []) {
    if (scope === 'selected_suppliers' && selectedSupplierOrgIds.length === 0) {
      return { valid: false, error: 'Select at least one supplier when using selected_suppliers scope.' };
    }
    return { valid: true as const };
  }

  private static getSharedWithBadge(
    scope: DocumentRowInput['visibilityScope'],
    selectedSupplierOrgIds: string[]
  ): string {
    if (scope === 'couple_only') {
      return 'Couple only';
    }
    if (scope === 'all_assigned_suppliers') {
      return 'All suppliers';
    }
    return `Selected (${selectedSupplierOrgIds.length})`;
  }
}

