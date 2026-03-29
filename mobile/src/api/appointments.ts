import { api } from './client';

export interface Appointment {
  id: string;
  weddingId?: string;
  wedding_id?: string;
  title: string;
  startAt: string;
  endAt: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  locationOrLink?: string;
  location_or_link?: string;
  notes?: string;
  visibilityScope?: string;
  visibility_scope?: string;
  cancelled_at?: string | null;
}

export interface NewAppointment {
  title: string;
  startAt: string;   // ISO 8601
  endAt: string;     // ISO 8601
  locationOrLink?: string;
  notes?: string;
}

export const appointmentsApi = {
  list: (weddingId: string): Promise<Appointment[]> =>
    api.get<{ appointments: Appointment[] }>(`/weddings/${weddingId}/appointments`)
      .then((r: any) => r.appointments ?? r)
      .catch(() => [] as Appointment[]),

  create: (weddingId: string, appt: NewAppointment): Promise<Appointment> =>
    api.post<{ appointment: Appointment }>(`/weddings/${weddingId}/appointments`, {
      title: appt.title,
      startAt: appt.startAt,
      endAt: appt.endAt,
      locationOrLink: appt.locationOrLink,
      notes: appt.notes,
    }).then((r: any) => r.appointment ?? r),

  update: (id: string, updates: Partial<NewAppointment>): Promise<Appointment> =>
    api.patch<{ appointment: Appointment }>(`/appointments/${id}`, updates)
      .then((r: any) => r.appointment ?? r),

  cancel: (id: string): Promise<{ cancelled: boolean }> =>
    api.delete<{ cancelled: boolean }>(`/appointments/${id}`),
};
