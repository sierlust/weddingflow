import { api } from './client';

export interface SupplierProfile {
  id?: string;
  name?: string;
  category?: string;
  location?: string;
  description?: string;
  website?: string;
  instagram?: string;
  email?: string;
  budgetTier?: string;
  budget_tier?: string;
  user_id?: string;
}

export const supplierApi = {
  getProfile: (): Promise<SupplierProfile> =>
    api.get<any>('/suppliers/profile')
      .then((r: any) => r.supplier ?? r.profile ?? r)
      .catch((e: any) => {
        if (e.message?.includes('404') || e.message?.includes('niet gevonden')) {
          return {} as SupplierProfile;
        }
        throw e;
      }),

  updateProfile: (data: Partial<SupplierProfile>): Promise<SupplierProfile> =>
    api.patch<any>('/suppliers/profile', data)
      .then((r: any) => r.supplier ?? r.profile ?? r),
};
