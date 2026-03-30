import { api } from './client';

export interface SupplierAssignment {
  supplierOrgId: string;
  category: string;
  status: string;
  supplierName: string | null;
}

export interface Wedding {
  id: string;
  title: string;
  wedding_date?: string;
  location?: string;
  status?: string;
  couple_names?: string;
  created_at?: string;
  contact_email?: string;
  notes?: string;
  category_data?: Record<string, string>;
  wedding_info?: Record<string, string>;
}

export interface NewWedding {
  title: string;
  wedding_date?: string;
  location?: string;
}

export const weddingsApi = {
  list: (): Promise<Wedding[]> =>
    api.get('/weddings').then((r: any) => r.weddings ?? r),

  get: (id: string): Promise<Wedding> =>
    api.get(`/weddings/${id}`).then((r: any) => r.wedding ?? r),

  create: (wedding: NewWedding): Promise<Wedding> =>
    api.post('/weddings', wedding).then((r: any) => r.wedding ?? r),

  update: (id: string, updates: Partial<Wedding>): Promise<Wedding> =>
    api.patch(`/weddings/${id}`, updates),

  getMembers: (id: string): Promise<{ assignments: SupplierAssignment[]; staff: any[] }> =>
    api.get<any>(`/weddings/${id}/members`)
      .then((r: any) => ({
        assignments: r.members?.assignments ?? [],
        staff: r.members?.staff ?? [],
      }))
      .catch(() => ({ assignments: [], staff: [] })),
};
