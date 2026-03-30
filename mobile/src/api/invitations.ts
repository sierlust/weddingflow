import { api } from './client';

export type InviteType = 'couple_invite' | 'supplier_invite' | 'wedding_supplier_invite';

export interface Invitation {
  id: string;
  type: string;
  target_email: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  wedding_id: string | null;
  wedding_title?: string | null;
  issuer_user_id: string;
  created_at: string;
  expires_at: string;
}

export interface WeddingMember {
  userId: string;
  supplierOrgId: string;
}

export const invitationsApi = {
  invite: (weddingId: string, email: string, type: InviteType = 'supplier_invite') =>
    api.post<{ invitation: Invitation; inviteLink: string }>(`/weddings/${weddingId}/suppliers/invite`, {
      email,
      type,
    }),

  mine: (): Promise<Invitation[]> =>
    api.get<{ invitations: Invitation[] }>('/invitations/mine')
      .then((r: any) => r.invitations ?? r)
      .catch(() => [] as Invitation[]),

  accept: (inviteId: string, userId?: string): Promise<{ invitation: Invitation }> =>
    api.post<{ invitation: Invitation }>('/invitations/accept', { inviteId, userId }),

  decline: (inviteId: string, reason: string): Promise<{ id: string; status: string }> =>
    api.post<{ id: string; status: string }>('/invitations/decline', {
      inviteId,
      reason,
    }),

  listForWedding: (weddingId: string): Promise<Invitation[]> =>
    api.get<{ invitations: Invitation[] }>(`/weddings/${weddingId}/suppliers/invite`)
      .then((r: any) => r.invitations ?? r)
      .catch(() => [] as Invitation[]),

  members: (weddingId: string): Promise<{ assignments: any[]; staff: WeddingMember[] }> =>
    api.get<{ assignments: any[]; staff: WeddingMember[] }>(`/weddings/${weddingId}/members`)
      .then((r: any) => ({
        assignments: r.assignments ?? [],
        staff: r.staff ?? [],
      }))
      .catch(() => ({ assignments: [], staff: [] })),
};
