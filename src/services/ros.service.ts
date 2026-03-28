import { AuditService } from './audit.service';

type RosItemType = 'ceremony' | 'reception' | 'dinner' | 'party' | 'logistics' | 'other';
type VisibilityScope = 'all_published' | 'selected_suppliers' | 'couple_only';
type ChangeRequestStatus = 'submitted' | 'accepted' | 'rejected' | 'included_in_version';
type ChangeRequestType =
  | 'time_change'
  | 'instruction_change'
  | 'ownership_clarification'
  | 'location_clarification';

type RunSheetItem = {
  id: string;
  wedding_id: string;
  sort_index: number;
  start_at: string;
  end_at: string;
  title: string;
  item_type: RosItemType;
  location: string | null;
  owner_role: string | null;
  owner_supplier_org_id: string | null;
  owner_supplier_org_ids: string[];
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  instructions: string;
  private_notes: string;
  visibility_scope: VisibilityScope;
  created_at: string;
};

type RunSheet = {
  id: string;
  wedding_id: string;
  draft_json: RunSheetItem[];
  updated_at: string;
  updated_by: string;
};

type RunSheetVersion = {
  id: string;
  wedding_id: string;
  version_number: number;
  published_at: string;
  published_by_user_id: string;
  snapshot_json: RunSheetItem[];
  change_summary: string;
  suppliers_shared_to: string[];
};

type RunSheetAcknowledgement = {
  run_sheet_version_id: string;
  supplier_org_id: string;
  acknowledged_at: string;
  acknowledged_by_user_id: string;
};

type RunSheetChangeRequest = {
  id: string;
  wedding_id: string;
  run_sheet_version_id: string;
  item_id: string;
  supplier_org_id: string;
  requester_user_id: string;
  request_type: ChangeRequestType;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  proposed_instruction: string | null;
  reason: string;
  attachment_ids: string[];
  status: ChangeRequestStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
  included_in_version_number: number | null;
  created_at: string;
};

type SubmitChangeRequestInput = {
  versionId: string;
  itemId: string;
  supplierOrgId: string;
  userId: string;
  type: string;
  reason: string;
  proposedValues: any;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function statusPriority(status: ChangeRequestStatus): number {
  if (status === 'submitted') return 0;
  if (status === 'accepted') return 1;
  if (status === 'included_in_version') return 2;
  return 3;
}

/**
 * Phase 5.1 / 5.3 / 5.4 Run-of-Show Service
 */
export class ROSService {
  private static runSheetsByWedding = new Map<string, RunSheet>();
  private static runSheetItemsByWedding = new Map<string, Map<string, RunSheetItem>>();
  private static runSheetVersionsByWedding = new Map<string, RunSheetVersion[]>();
  private static acknowledgements = new Map<string, RunSheetAcknowledgement>();
  private static changeRequests = new Map<string, RunSheetChangeRequest>();

  private static readonly allowedItemTypes = new Set<RosItemType>([
    'ceremony',
    'reception',
    'dinner',
    'party',
    'logistics',
    'other',
  ]);

  private static readonly allowedChangeRequestTypes = new Set<ChangeRequestType>([
    'time_change',
    'instruction_change',
    'ownership_clarification',
    'location_clarification',
  ]);

  /**
   * 5.1.6 Publish Run-of-Show (immutable snapshot)
   */
  static async publishVersion(weddingId: string, userId: string, changeSummary: string) {
    const runSheet = this.runSheetsByWedding.get(weddingId);
    const draftItems = runSheet?.draft_json || [];
    if (draftItems.length === 0) {
      throw new Error('Cannot publish an empty run sheet. Add at least one item.');
    }

    const blockingErrors = this.validateBlockingErrors(draftItems);
    if (blockingErrors.length > 0) {
      throw new Error(`Publish blocked: ${blockingErrors.join('; ')}`);
    }

    const versions = this.runSheetVersionsByWedding.get(weddingId) || [];
    const previousVersion = versions[versions.length - 1] || null;
    const versionNumber = versions.length + 1;
    const sharedSuppliers = Array.from(
      new Set(
        draftItems
          .flatMap((item) => {
            const ids = Array.isArray(item.owner_supplier_org_ids) ? item.owner_supplier_org_ids : [];
            if (ids.length > 0) return ids;
            return item.owner_supplier_org_id ? [item.owner_supplier_org_id] : [];
          })
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    );

    const version: RunSheetVersion = {
      id: makeId('version'),
      wedding_id: weddingId,
      version_number: versionNumber,
      published_at: nowIso(),
      published_by_user_id: userId,
      snapshot_json: clone(draftItems),
      change_summary: changeSummary || '',
      suppliers_shared_to: sharedSuppliers,
    };
    versions.push(version);
    this.runSheetVersionsByWedding.set(weddingId, versions);

    AuditService.logEvent({
      weddingId,
      actorUserId: userId,
      entityType: 'run_sheet',
      entityId: version.id,
      action: 'published',
      beforeJson: previousVersion
        ? {
            previous_version_id: previousVersion.id,
            previous_version_number: previousVersion.version_number,
          }
        : null,
      afterJson: {
        version_id: version.id,
        version_number: version.version_number,
        suppliers_shared_to: version.suppliers_shared_to,
      },
    });

    // 5.4.5 accepted requests become included_in_version on publish
    for (const request of this.changeRequests.values()) {
      if (request.wedding_id === weddingId && request.status === 'accepted') {
        request.status = 'included_in_version';
        request.included_in_version_number = versionNumber;
      }
    }

    return {
      ...clone(version),
      notifications: sharedSuppliers.map((supplierOrgId) => ({
        supplier_org_id: supplierOrgId,
        event: 'run_sheet.published',
      })),
    };
  }

  /**
   * 5.1.7 Autosave draft with debounce metadata
   */
  static async saveDraft(weddingId: string, userId: string, draftData: any) {
    const normalizedItems = this.normalizeDraftItems(weddingId, Array.isArray(draftData) ? draftData : []);
    const runSheet = this.runSheetsByWedding.get(weddingId) || {
      id: makeId('runsheet'),
      wedding_id: weddingId,
      draft_json: [],
      updated_at: nowIso(),
      updated_by: userId,
    };

    runSheet.draft_json = normalizedItems;
    runSheet.updated_at = nowIso();
    runSheet.updated_by = userId;
    this.runSheetsByWedding.set(weddingId, runSheet);

    const itemMap = new Map<string, RunSheetItem>();
    for (const item of normalizedItems) {
      itemMap.set(item.id, item);
    }
    this.runSheetItemsByWedding.set(weddingId, itemMap);

    return {
      success: true,
      debounce_ms: 500,
      save_indicator: 'Saving...',
      offline_banner_on_failure: 'Offline — changes not saved',
      draft_item_count: normalizedItems.length,
      updated_at: runSheet.updated_at,
    };
  }

  static async getDraft(weddingId: string) {
    const runSheet = this.runSheetsByWedding.get(weddingId);
    return {
      wedding_id: weddingId,
      draft_json: clone(runSheet?.draft_json || []),
      updated_at: runSheet?.updated_at || null,
      updated_by: runSheet?.updated_by || null,
    };
  }

  /**
   * 5.1.8 suppliers only get latest published version, never draft
   */
  static async getLatestPublishedVersion(weddingId: string, orgId: string) {
    const versions = this.runSheetVersionsByWedding.get(weddingId) || [];
    const latest = versions[versions.length - 1];
    if (!latest) {
      return null;
    }
    if (!latest.suppliers_shared_to.includes(orgId)) {
      return null;
    }
    return clone(latest);
  }

  /**
   * 5.1.4 acknowledgement persistence
   */
  static async acknowledgeVersion(runSheetVersionId: string, supplierOrgId: string, userId: string) {
    const key = `${runSheetVersionId}:${supplierOrgId}`;
    const ack: RunSheetAcknowledgement = {
      run_sheet_version_id: runSheetVersionId,
      supplier_org_id: supplierOrgId,
      acknowledged_at: nowIso(),
      acknowledged_by_user_id: userId,
    };
    this.acknowledgements.set(key, ack);
    return clone(ack);
  }

  /**
   * 5.3.1 + 5.3.3 request change on published items
   */
  static async submitChangeRequest(data: SubmitChangeRequestInput) {
    if (!this.allowedChangeRequestTypes.has(data.type as ChangeRequestType)) {
      throw new Error('Invalid request type.');
    }
    if (data.reason.length < 20 || data.reason.length > 500) {
      throw new Error('De reden moet tussen de 20 en 500 tekens zijn.');
    }

    const version = this.findVersionOrThrow(data.versionId);
    const item = this.findItemInVersion(version, data.itemId);
    if (!item) {
      throw new Error('Run-of-show item not found in selected version.');
    }

    if (!this.canSupplierSeeItem(item, data.supplierOrgId)) {
      throw new Error('Forbidden: You cannot request changes for this item.');
    }

    const requestId = makeId('req');
    const request: RunSheetChangeRequest = {
      id: requestId,
      wedding_id: version.wedding_id,
      run_sheet_version_id: data.versionId,
      item_id: data.itemId,
      supplier_org_id: data.supplierOrgId,
      requester_user_id: data.userId,
      request_type: data.type as ChangeRequestType,
      proposed_start_at: data.proposedValues?.proposed_start_at || null,
      proposed_end_at: data.proposedValues?.proposed_end_at || null,
      proposed_instruction: data.proposedValues?.proposed_instruction || null,
      reason: data.reason,
      attachment_ids: Array.isArray(data.proposedValues?.attachment_ids) ? data.proposedValues.attachment_ids : [],
      status: 'submitted',
      resolved_at: null,
      resolved_by: null,
      rejection_reason: null,
      included_in_version_number: null,
      created_at: nowIso(),
    };
    this.changeRequests.set(requestId, request);

    return {
      ...clone(request),
      notification: {
        event: 'ros.change_request.submitted',
        wedding_id: version.wedding_id,
      },
    };
  }

  /**
   * 5.3.4 list supplier requests with newest-first + status tie-break
   */
  static async getMyChangeRequests(orgId: string) {
    const rows = Array.from(this.changeRequests.values())
      .filter((request) => request.supplier_org_id === orgId)
      .map((request) => {
        const item = this.getItemByWedding(request.wedding_id, request.item_id);
        return {
          ...clone(request),
          item_title: item?.title || 'Unknown item',
          summary: this.summarizeProposedValues(request),
        };
      })
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return statusPriority(a.status) - statusPriority(b.status);
      });

    return rows;
  }

  /**
   * 5.4.1 list pending requests for couple owner drawer
   */
  static async getPendingChangeRequests(weddingId: string) {
    const rows = Array.from(this.changeRequests.values())
      .filter((request) => request.wedding_id === weddingId && request.status === 'submitted')
      .map((request) => {
        const item = this.getItemByWedding(weddingId, request.item_id);
        const proposed = {
          proposed_start_at: request.proposed_start_at,
          proposed_end_at: request.proposed_end_at,
          proposed_instruction: request.proposed_instruction,
        };
        return {
          ...clone(request),
          item_title: item?.title || 'Unknown item',
          diff_preview: this.buildDiff(item, proposed),
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return rows;
  }

  /**
   * 5.4.2/5.4.3/5.4.4 resolve request (apply/reject)
   */
  static async resolveChangeRequest(
    requestId: string,
    action: 'accept' | 'reject',
    resolverUserId: string,
    rejectionReason?: string,
    applyEdits?: {
      proposed_start_at?: string;
      proposed_end_at?: string;
      proposed_instruction?: string;
    }
  ) {
    const request = this.changeRequests.get(requestId);
    if (!request) {
      throw new Error('Change request not found.');
    }
    if (request.status !== 'submitted') {
      throw new Error('Only submitted requests can be resolved.');
    }

    if (action === 'accept') {
      const draftItem = this.getItemByWedding(request.wedding_id, request.item_id);
      if (!draftItem) {
        throw new Error('Draft item not found.');
      }

      const proposedStart = applyEdits?.proposed_start_at || request.proposed_start_at;
      const proposedEnd = applyEdits?.proposed_end_at || request.proposed_end_at;
      const proposedInstruction = applyEdits?.proposed_instruction || request.proposed_instruction;

      if (proposedStart) {
        draftItem.start_at = proposedStart;
      }
      if (proposedEnd) {
        draftItem.end_at = proposedEnd;
      }
      if (proposedInstruction) {
        draftItem.instructions = proposedInstruction;
      }
      this.upsertDraftItem(request.wedding_id, draftItem);

      request.status = 'accepted';
      request.resolved_at = nowIso();
      request.resolved_by = resolverUserId;
      request.rejection_reason = null;

      return {
        status: 'accepted',
        message: 'Applied to draft — republish to share',
        request: clone(request),
      };
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      throw new Error('Rejection reason is required.');
    }
    request.status = 'rejected';
    request.resolved_at = nowIso();
    request.resolved_by = resolverUserId;
    request.rejection_reason = rejectionReason.trim();

    return {
      status: 'rejected',
      rejectionReason: request.rejection_reason,
      request: clone(request),
      notification: {
        event: 'ros.change_request.rejected',
        supplier_org_id: request.supplier_org_id,
      },
    };
  }

  static getDraftForTests(weddingId: string): RunSheet | null {
    const sheet = this.runSheetsByWedding.get(weddingId);
    return sheet ? clone(sheet) : null;
  }

  static getChangeRequestByIdForTests(requestId: string): RunSheetChangeRequest | null {
    const request = this.changeRequests.get(requestId);
    return request ? clone(request) : null;
  }

  static clearStateForTests() {
    this.runSheetsByWedding.clear();
    this.runSheetItemsByWedding.clear();
    this.runSheetVersionsByWedding.clear();
    this.acknowledgements.clear();
    this.changeRequests.clear();
  }

  private static normalizeDraftItems(weddingId: string, rawItems: any[]): RunSheetItem[] {
    return rawItems
      .map((item, index) => {
        const itemType: RosItemType = this.allowedItemTypes.has(item?.item_type) ? item.item_type : 'other';
        const visibility: VisibilityScope =
          item?.visibility_scope === 'selected_suppliers' || item?.visibility_scope === 'couple_only'
            ? item.visibility_scope
            : 'all_published';
        const ownerSupplierOrgIds = Array.isArray(item?.owner_supplier_org_ids)
          ? item.owner_supplier_org_ids.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
          : item?.owner_supplier_org_id
            ? [String(item.owner_supplier_org_id).trim()].filter(Boolean)
            : [];

        return {
          id: item?.id || makeId('ros-item'),
          wedding_id: weddingId,
          sort_index: Number.isFinite(item?.sort_index) ? Number(item.sort_index) : index,
          start_at: String(item?.start_at || new Date().toISOString()),
          end_at: String(item?.end_at || new Date(Date.now() + 30 * 60 * 1000).toISOString()),
          title: String(item?.title || '').trim(),
          item_type: itemType,
          location: item?.location || null,
          owner_role: item?.owner_role || null,
          owner_supplier_org_id: ownerSupplierOrgIds[0] || null,
          owner_supplier_org_ids: ownerSupplierOrgIds,
          primary_contact_name: item?.primary_contact_name || null,
          primary_contact_phone: item?.primary_contact_phone || null,
          instructions: String(item?.instructions || ''),
          private_notes: String(item?.private_notes || ''),
          visibility_scope: visibility,
          created_at: item?.created_at || nowIso(),
        };
      })
      .sort((a, b) => a.sort_index - b.sort_index);
  }

  private static validateBlockingErrors(items: RunSheetItem[]): string[] {
    const errors: string[] = [];
    for (const item of items) {
      if (!item.title.trim()) {
        errors.push(`Item ${item.id} missing title`);
      }
      const start = new Date(item.start_at).getTime();
      const end = new Date(item.end_at).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) {
        errors.push(`Item ${item.id} has invalid time`);
      } else if (start >= end) {
        errors.push(`Item ${item.id} end must be after start`);
      }
    }
    return errors;
  }

  private static findVersionOrThrow(versionId: string): RunSheetVersion {
    for (const versions of this.runSheetVersionsByWedding.values()) {
      const found = versions.find((version) => version.id === versionId);
      if (found) {
        return found;
      }
    }
    throw new Error('Run sheet version not found.');
  }

  private static findItemInVersion(version: RunSheetVersion, itemId: string): RunSheetItem | null {
    const item = version.snapshot_json.find((entry) => entry.id === itemId);
    return item ? clone(item) : null;
  }

  private static canSupplierSeeItem(item: RunSheetItem, supplierOrgId: string): boolean {
    if (item.visibility_scope === 'all_published') {
      return true;
    }
    if (item.visibility_scope === 'selected_suppliers') {
      const visibleTo = Array.isArray(item.owner_supplier_org_ids) && item.owner_supplier_org_ids.length > 0
        ? item.owner_supplier_org_ids
        : item.owner_supplier_org_id
          ? [item.owner_supplier_org_id]
          : [];
      return visibleTo.includes(supplierOrgId);
    }
    return false;
  }

  private static summarizeProposedValues(request: RunSheetChangeRequest): string {
    const parts: string[] = [];
    if (request.proposed_start_at || request.proposed_end_at) {
      parts.push('time update');
    }
    if (request.proposed_instruction) {
      parts.push('instruction update');
    }
    if (parts.length === 0) {
      return 'No structured values';
    }
    return parts.join(', ');
  }

  private static getItemByWedding(weddingId: string, itemId: string): RunSheetItem | null {
    const map = this.runSheetItemsByWedding.get(weddingId);
    if (!map) {
      return null;
    }
    const item = map.get(itemId);
    return item ? item : null;
  }

  private static upsertDraftItem(weddingId: string, item: RunSheetItem) {
    const map = this.runSheetItemsByWedding.get(weddingId) || new Map<string, RunSheetItem>();
    map.set(item.id, item);
    this.runSheetItemsByWedding.set(weddingId, map);

    const runSheet = this.runSheetsByWedding.get(weddingId);
    if (!runSheet) {
      return;
    }
    runSheet.draft_json = Array.from(map.values()).sort((a, b) => a.sort_index - b.sort_index);
    runSheet.updated_at = nowIso();
  }

  private static buildDiff(
    item: RunSheetItem | null,
    proposed: { proposed_start_at: string | null; proposed_end_at: string | null; proposed_instruction: string | null }
  ) {
    return {
      start_at:
        proposed.proposed_start_at && item?.start_at !== proposed.proposed_start_at
          ? { from: item?.start_at || null, to: proposed.proposed_start_at }
          : null,
      end_at:
        proposed.proposed_end_at && item?.end_at !== proposed.proposed_end_at
          ? { from: item?.end_at || null, to: proposed.proposed_end_at }
          : null,
      instructions:
        proposed.proposed_instruction && item?.instructions !== proposed.proposed_instruction
          ? { from: item?.instructions || null, to: proposed.proposed_instruction }
          : null,
    };
  }
}
