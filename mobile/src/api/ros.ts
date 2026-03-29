import { api } from './client';

export type RosItemType = 'ceremony' | 'reception' | 'dinner' | 'party' | 'logistics' | 'other';

export interface RosItem {
  id: string;
  sort_index: number;
  start_at: string;   // "HH:MM"
  end_at: string;     // "HH:MM"
  title: string;
  item_type: RosItemType;
  location: string | null;
  owner_supplier_org_id: string | null;
  instructions: string;
  visibility_scope?: string;
}

export interface RosDraft {
  wedding_id: string;
  draft_json: RosItem[];
  updated_at: string;
}

export interface RosVersion {
  id: string;
  version_number: number;
  published_at: string;
  snapshot_json: RosItem[];
  change_summary: string;
}

export const rosApi = {
  getDraft: (weddingId: string): Promise<RosDraft> =>
    api.get<RosDraft>(`/weddings/${weddingId}/ros/draft`)
      .then((r: any) => r.draft ?? r)
      .catch(() => ({ wedding_id: weddingId, draft_json: [], updated_at: '' } as RosDraft)),

  saveDraft: (weddingId: string, items: RosItem[]): Promise<RosDraft> =>
    api.post<{ draft: RosDraft }>(`/weddings/${weddingId}/ros/draft`, { items })
      .then((r: any) => r.draft ?? r),

  getPublished: (weddingId: string): Promise<RosVersion | null> =>
    api.get<{ version: RosVersion }>(`/weddings/${weddingId}/ros/published`)
      .then((r: any) => r.version ?? r)
      .catch(() => null),

  publish: (weddingId: string, changeSummary: string): Promise<RosVersion> =>
    api.post<{ version: RosVersion }>(`/weddings/${weddingId}/ros/publish`, { changeSummary })
      .then((r: any) => r.version ?? r),
};
