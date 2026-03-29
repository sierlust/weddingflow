import { api } from './client';

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
    api.get(`/weddings/${id}`),

  create: (wedding: NewWedding): Promise<Wedding> =>
    api.post('/weddings', wedding).then((r: any) => r.wedding ?? r),

  update: (id: string, updates: Partial<Wedding>): Promise<Wedding> =>
    api.patch(`/weddings/${id}`, updates),
};
