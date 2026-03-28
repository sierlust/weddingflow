type RosTimelineItem = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
};

type ChangeRequestRow = {
  item_title: string;
  type: string;
  created_at: string;
  status: 'submitted' | 'accepted' | 'rejected' | 'included_in_version';
  summary: string;
};

/**
 * Phase 5.2 / 5.3 / 5.4 Mobile Run-of-Show UI Logic
 */
export class ROSUIManager {
  private view: 'agenda' | 'timeline' = 'agenda';
  private snapIncrement: 5 | 15 = 5;

  setView(view: 'agenda' | 'timeline') {
    this.view = view;
  }

  getView() {
    return this.view;
  }

  setSnapIncrement(value: 5 | 15) {
    this.snapIncrement = value;
  }

  getSnapIncrement() {
    return this.snapIncrement;
  }

  /**
   * 5.2.1 Agenda View: sorted by start_at
   */
  getAgendaData(items: RosTimelineItem[]) {
    return [...items].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }

  /**
   * 5.2.2 + 5.2.5 Timeline View with overlap columns
   */
  getTimelineLayout(items: RosTimelineItem[], pixelsPerMinute = 2) {
    const sorted = this.getAgendaData(items);
    const activeColumns: Array<{ end: number; column: number }> = [];
    const layout: Array<
      RosTimelineItem & {
        top: number;
        height: number;
        columnIndex: number;
        overlapColumns: number;
        overlaps: boolean;
        overlapMessage: string | null;
      }
    > = [];

    for (const item of sorted) {
      const start = new Date(item.start_at);
      const end = new Date(item.end_at);
      const startMs = start.getTime();
      const endMs = end.getTime();
      const durationMinutes = Math.max(1, (endMs - startMs) / (1000 * 60));

      for (let i = activeColumns.length - 1; i >= 0; i -= 1) {
        if (activeColumns[i].end <= startMs) {
          activeColumns.splice(i, 1);
        }
      }

      let columnIndex = 0;
      const used = new Set(activeColumns.map((entry) => entry.column));
      while (used.has(columnIndex)) {
        columnIndex += 1;
      }
      activeColumns.push({ end: endMs, column: columnIndex });

      const overlapping = sorted.filter((candidate) => {
        if (candidate.id === item.id) return false;
        const candidateStart = new Date(candidate.start_at).getTime();
        const candidateEnd = new Date(candidate.end_at).getTime();
        return candidateStart < endMs && candidateEnd > startMs;
      });

      layout.push({
        ...item,
        top: (start.getHours() * 60 + start.getMinutes()) * pixelsPerMinute,
        height: durationMinutes * pixelsPerMinute,
        columnIndex,
        overlapColumns: Math.max(1, activeColumns.length),
        overlaps: overlapping.length > 0,
        overlapMessage: overlapping.length > 0 ? `Overlaps with ${overlapping[0].title}` : null,
      });
    }

    return layout;
  }

  /**
   * 5.2.3 Tap block -> inspector/editor modal model
   */
  openItemInspector(item: RosTimelineItem, mode: 'view' | 'edit' = 'edit') {
    return {
      mode,
      fullScreen: true,
      item: { ...item },
      actions: mode === 'edit' ? ['save', 'cancel'] : ['close', 'edit'],
    };
  }

  /**
   * 5.2.4 Snap increment logic
   */
  snapTime(date: Date) {
    const minutes = date.getMinutes();
    const snapped = Math.round(minutes / this.snapIncrement) * this.snapIncrement;
    const newDate = new Date(date);
    newDate.setMinutes(snapped);
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
  }

  /**
   * 5.2.6 Material-like time input config with manual + picker
   */
  getTimeInputConfig() {
    return {
      preferredVariant: 'text_input',
      allowManualInput: true,
      allowPicker: true,
      format: 'HH:mm',
    };
  }

  parseManualTimeInput(value: string, anchorDate = new Date()) {
    const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
      return null;
    }
    const result = new Date(anchorDate);
    result.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
    return result;
  }

  /**
   * 5.2.7 Performance strategy for 40+ items
   */
  getRenderStrategy(itemCount: number) {
    if (itemCount > 120) return 'canvas';
    if (itemCount > 40) return 'virtualized';
    return 'dom';
  }

  /**
   * 5.3.1 Request change button visibility
   */
  shouldShowRequestChangeButton(userRole: 'supplier' | 'owner' | 'collaborator') {
    return userRole === 'supplier';
  }

  /**
   * 5.3.2 Structured form with live reason counter
   */
  getChangeRequestForm() {
    return {
      types: [
        { id: 'time_change', label: 'Tijdswijziging' },
        { id: 'instruction_change', label: 'Instructiewijziging' },
        { id: 'ownership_clarification', label: 'Eigenaarschap verduidelijken' },
        { id: 'location_clarification', label: 'Locatie verduidelijken' },
      ],
      conditionalFields: {
        time_change: ['proposed_start_at', 'proposed_end_at'],
        instruction_change: ['proposed_instruction'],
        ownership_clarification: ['proposed_instruction'],
        location_clarification: ['proposed_instruction'],
      },
      validation: {
        reasonMin: 20,
        reasonMax: 500,
        liveCounter: true,
      },
    };
  }

  /**
   * 5.3.4 My Requests default sort
   */
  sortMyRequests(rows: ChangeRequestRow[]) {
    const statusOrder = new Map([
      ['submitted', 0],
      ['accepted', 1],
      ['rejected', 2],
      ['included_in_version', 3],
    ]);
    return [...rows].sort((a, b) => {
      const time = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (time !== 0) return time;
      return (statusOrder.get(a.status) ?? 9) - (statusOrder.get(b.status) ?? 9);
    });
  }

  /**
   * 5.4.2 Diff preview
   */
  getDiffPreview(original: Record<string, any>, proposed: Record<string, any>) {
    const diff: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(proposed)) {
      if (proposed[key] !== undefined && original[key] !== proposed[key]) {
        diff[key] = {
          from: original[key],
          to: proposed[key],
        };
      }
    }
    return diff;
  }

  /**
   * 5.4.1 + 5.4.2 Pending panel metadata
   */
  getReviewPanelMetadata(pendingCount: number) {
    return {
      title: `Pending change requests (${pendingCount})`,
      emptyState: 'No pending requests from suppliers.',
      actions: [
        { id: 'apply_to_draft', label: 'Apply to draft', variant: 'primary' },
        { id: 'apply_with_edits', label: 'Apply with edits', variant: 'secondary' },
        { id: 'reject', label: 'Reject', variant: 'danger' },
        { id: 'message_supplier', label: 'Message supplier', variant: 'secondary' },
      ],
    };
  }
}
