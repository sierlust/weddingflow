/**
 * Phase 6.1 Audit UI Logic
 */
export class AuditUIManager {
  /**
   * 6.1.4 Action Description Builder (Human-readable)
   */
  static formatActionDescription(log: any): string {
    const actor = log?.actor_name || 'Onbekende gebruiker';
    const action = String(log?.action || '');
    const entityType = String(log?.entity_type || '');
    const entityLabel = this.getEntityLabel(entityType);

    switch (action) {
      case 'invited':
        return `${actor} heeft een leverancier uitgenodigd.`;
      case 'accepted':
        return `${actor} heeft de leveranciersuitnodiging geaccepteerd.`;
      case 'declined':
        return `${actor} heeft de leveranciersuitnodiging afgewezen.`;
      case 'removed':
        return `${actor} heeft de leverancierstoegang verwijderd.`;
      case 'shared':
        return `${actor} heeft de ${entityLabel} gedeeld.`;
      case 'unshared':
        return `${actor} heeft de ${entityLabel} niet langer gedeeld.`;
      case 'published':
        return `${actor} heeft het draaiboek gepubliceerd.`;
      case 'changed':
        return `${actor} heeft de ${entityLabel} aangepast.`;
      case 'canceled':
        return `${actor} heeft de ${entityLabel} geannuleerd.`;
      case 'permission_changed':
        return `${actor} heeft het rechtenprofiel aangepast.`;
      case 'deleted':
        if (entityType === 'document') {
          return 'Document deleted';
        }
        return `${actor} heeft de ${entityLabel} verwijderd.`;
      default:
        return `${actor} heeft ${action || 'een actie'} uitgevoerd op ${entityLabel}.`;
    }
  }

  /**
   * 6.1.4 Screen table model with expandable details
   */
  static buildTableModel(logs: any[], expandedRowId?: string) {
    const rows = logs.map((log) => {
      const diff = this.getDiff(log.before_json, log.after_json, {
        action: log.action,
        entityType: log.entity_type,
      });

      return {
        id: log.id,
        timestamp: log.created_at,
        actorName: log.actor_name || 'Onbekend',
        actionDescription: this.formatActionDescription(log),
        entity: `${this.getEntityLabel(log.entity_type)} · ${log.entity_id}`,
        isExpanded: expandedRowId === log.id,
        expanded: expandedRowId === log.id ? diff : null,
      };
    });

    return {
      columns: ['timestamp', 'actor', 'action', 'entity'],
      rows,
    };
  }

  /**
   * 6.1.4 Diff Display Logic
   * 6.1.5 Tombstone behavior for deleted artifacts
   */
  static getDiff(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    meta: { action?: string; entityType?: string } = {}
  ) {
    if (meta.action === 'deleted' && meta.entityType === 'document') {
      return {
        tombstone: true,
        message: 'Document deleted',
        before: null,
        after: null,
        changedFields: [] as string[],
      };
    }

    if (!before && !after) {
      return null;
    }

    const allKeys = new Set<string>([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);
    const changedFields: string[] = [];
    for (const key of allKeys) {
      const beforeValue = before?.[key];
      const afterValue = after?.[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changedFields.push(key);
      }
    }

    return {
      tombstone: false,
      message: null,
      before: before || null,
      after: after || null,
      changedFields,
    };
  }

  private static getEntityLabel(type: string): string {
    const labels: Record<string, string> = {
      document: 'document',
      run_sheet: 'draaiboek',
      ros_item: 'draaiboek-item',
      supplier: 'leverancier',
      invitation: 'uitnodiging',
      appointment: 'afspraak',
      permission_profile: 'rechtenprofiel',
      membership: 'lidmaatschap',
    };
    return labels[type] || type || 'entity';
  }
}
