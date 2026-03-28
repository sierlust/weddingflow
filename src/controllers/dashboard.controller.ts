import { DashboardService } from '../services/dashboard.service';

/**
 * Phase 3.1 Triage View API
 */
export const getSupplierWeddings = async (params: {
  userId: string;
  supplierOrgId: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  myAssignmentsOnly?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
}) => {
  return DashboardService.getSupplierWeddings(params);
};

/**
 * Phase 3.3 Global Search Engine
 */
export const searchWeddings = async (params: {
  supplierOrgId: string;
  searchTerm: string;
}) => {
  return DashboardService.searchWeddings(params);
};

export const createWedding = async (params: {
  title: string;
  weddingDate: string;
  timezone?: string;
  status?: string;
  location?: string;
  coupleNames?: string[];
  supplierOrgId: string;
  supplierCategory?: string;
  createdByUserId: string;
}) => {
  return DashboardService.createWedding(params);
};

export const updateWedding = async (params: {
  weddingId: string;
  title?: string;
  weddingDate?: string;
  location?: string;
  coupleNames?: string[];
  updatedByUserId?: string;
}) => {
  return DashboardService.updateWedding(params);
};

/**
 * Phase 3.2 Dashboard UI Helpers
 */
export const getWeddingById = (weddingId: string) => {
  return DashboardService.getWeddingById(weddingId);
};

export const getDashboardSkeletons = () => {
  return [
    { type: 'card', rows: 5 },
    { type: 'table', rows: 10 }
  ];
};
