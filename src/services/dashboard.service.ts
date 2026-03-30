type WeddingStatus = 'draft' | 'invited' | 'active' | 'completed' | 'canceled';

type Wedding = {
  id: string;
  title: string;
  wedding_date: string;
  timezone: string;
  status: WeddingStatus;
  location: string;
  coupleNames: string[];
  created_by_user_id?: string;
  notes?: string;
  contact_email?: string;
  category_data?: Record<string, string>;
};

type Assignment = {
  weddingId: string;
  supplierOrgId: string;
  status: 'invited' | 'active' | 'removed';
  category: string;
};

type StaffAssignment = {
  weddingId: string;
  supplierOrgId: string;
  userId: string;
};

type Thread = {
  id: string;
  weddingId: string;
};

type ThreadParticipant = {
  threadId: string;
  userId: string;
  lastReadAt: string;
};

type Message = {
  id: string;
  threadId: string;
  createdAt: string;
};

type Task = {
  id: string;
  weddingId: string;
  supplierOrgId: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  updatedAt: string;
};

type Appointment = {
  id: string;
  weddingId: string;
  startAt: string;
};

type AppointmentParticipant = {
  appointmentId: string;
  userId?: string;
  supplierOrgId?: string;
};

type Document = {
  id: string;
  weddingId: string;
  createdAt: string;
};

type User = {
  id: string;
  name: string;
};

type DashboardData = {
  weddings: Wedding[];
  assignments: Assignment[];
  staffAssignments: StaffAssignment[];
  threads: Thread[];
  threadParticipants: ThreadParticipant[];
  messages: Message[];
  tasks: Task[];
  appointments: Appointment[];
  appointmentParticipants: AppointmentParticipant[];
  documents: Document[];
  users: User[];
};

type SupplierWeddingParams = {
  userId: string;
  supplierOrgId: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  myAssignmentsOnly?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
};

type SearchParams = {
  supplierOrgId: string;
  searchTerm: string;
};

type CreateWeddingInput = {
  title: string;
  weddingDate: string;
  timezone?: string;
  status?: string;
  location?: string;
  coupleNames?: string[];
  supplierOrgId: string;
  supplierCategory?: string;
  createdByUserId: string;
};

type UpdateWeddingInput = {
  weddingId: string;
  title?: string;
  weddingDate?: string;
  location?: string;
  coupleNames?: string[];
  notes?: string;
  contactEmail?: string;
  status?: WeddingStatus;
  updatedByUserId?: string;
  categoryData?: Record<string, string>;
  weddingInfo?: Record<string, string>;
};

import * as WeddingsRepo from '../repositories/weddings.repo';

const defaultData: DashboardData = {
  weddings: [
    {
      id: 'wed-100',
      title: 'Sarah & Tom Summer Wedding',
      wedding_date: '2026-07-15',
      timezone: 'Europe/Amsterdam',
      status: 'active',
      location: 'Kasteel de Haar',
      coupleNames: ['Sarah', 'Tom'],
    },
    {
      id: 'wed-200',
      title: 'Emma & Noah City Ceremony',
      wedding_date: '2026-08-03',
      timezone: 'Europe/Amsterdam',
      status: 'active',
      location: 'Amsterdam Centrum',
      coupleNames: ['Emma', 'Noah'],
    },
  ],
  assignments: [
    { weddingId: 'wed-100', supplierOrgId: 'org-1', status: 'active', category: 'Photographer' },
    { weddingId: 'wed-200', supplierOrgId: 'org-2', status: 'active', category: 'Catering' },
  ],
  staffAssignments: [{ weddingId: 'wed-100', supplierOrgId: 'org-1', userId: 'supplier-user-1' }],
  threads: [
    { id: 'thread-1', weddingId: 'wed-100' },
    { id: 'thread-2', weddingId: 'wed-100' },
  ],
  threadParticipants: [
    { threadId: 'thread-1', userId: 'supplier-user-1', lastReadAt: '2026-02-20T10:00:00.000Z' },
    { threadId: 'thread-2', userId: 'supplier-user-1', lastReadAt: '2026-02-20T10:00:00.000Z' },
  ],
  messages: [
    { id: 'msg-1', threadId: 'thread-1', createdAt: '2026-02-20T12:00:00.000Z' },
    { id: 'msg-2', threadId: 'thread-2', createdAt: '2026-02-21T12:00:00.000Z' },
  ],
  tasks: [
    { id: 'task-1', weddingId: 'wed-100', supplierOrgId: 'org-1', status: 'todo', updatedAt: '2026-02-22T12:00:00.000Z' },
    { id: 'task-2', weddingId: 'wed-100', supplierOrgId: 'org-1', status: 'done', updatedAt: '2026-02-19T12:00:00.000Z' },
  ],
  appointments: [
    { id: 'appt-1', weddingId: 'wed-100', startAt: '2026-03-15T10:00:00.000Z' },
    { id: 'appt-2', weddingId: 'wed-100', startAt: '2026-04-01T10:00:00.000Z' },
  ],
  appointmentParticipants: [{ appointmentId: 'appt-1', supplierOrgId: 'org-1' }],
  documents: [{ id: 'doc-1', weddingId: 'wed-100', createdAt: '2026-02-23T10:00:00.000Z' }],
  users: [{ id: 'supplier-user-1', name: 'Jane Assistant' }],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toDate(value: string): Date {
  return new Date(value);
}

function encodeCursor(weddingDate: string, weddingId: string): string {
  return Buffer.from(`${weddingDate}|${weddingId}`).toString('base64url');
}

function decodeCursor(cursor: string): { weddingDate: string; weddingId: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [weddingDate, weddingId] = decoded.split('|');
    if (!weddingDate || !weddingId) {
      return null;
    }
    return { weddingDate, weddingId };
  } catch {
    return null;
  }
}

function isFutureOrNow(dateIso: string): boolean {
  return toDate(dateIso).getTime() >= Date.now();
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export class DashboardService {
  // DashboardService manages its OWN copy of data (cloned, isolated from the repo)
  // to preserve test isolation. Mutations (createWedding, updateWedding,
  // ensureSupplierWeddingAssignment) additionally sync to the repo so that other
  // services and the repo's async API stay consistent.
  private static data: DashboardData = cloneData(defaultData);

  static setDataForTests(data: DashboardData) {
    this.data = cloneData(data);
    // Also sync to the repo so findWeddingById etc. return test data.
    WeddingsRepo._setWeddingsDataForTests(
      data.weddings as any[],
      data.assignments as any[],
      data.staffAssignments,
      data.users
    );
  }

  static resetDataForTests() {
    this.data = cloneData(defaultData);
    // Sync to repo.
    WeddingsRepo._setWeddingsDataForTests(
      defaultData.weddings as any[],
      defaultData.assignments as any[],
      defaultData.staffAssignments,
      defaultData.users
    );
  }

  static getWeddingSummaryById(weddingId: string) {
    const id = String(weddingId || '').trim();
    if (!id) return null;
    const wedding = this.data.weddings.find((row) => row.id === id);
    if (!wedding) return null;
    return {
      id: wedding.id,
      title: wedding.title,
      couple_names: Array.isArray(wedding.coupleNames) ? [...wedding.coupleNames] : [],
    };
  }

  static getWeddingById(weddingId: string) {
    const id = String(weddingId || '').trim();
    if (!id) return null;
    const wedding = this.data.weddings.find((row) => row.id === id);
    if (!wedding) return null;
    return {
      id: wedding.id,
      title: wedding.title,
      wedding_date: wedding.wedding_date,
      timezone: wedding.timezone,
      status: wedding.status,
      location: wedding.location,
      couple_names: Array.isArray(wedding.coupleNames) ? [...wedding.coupleNames] : [],
      notes: wedding.notes ?? null,
      contact_email: wedding.contact_email ?? null,
      category_data: wedding.category_data ? { ...wedding.category_data } : undefined,
    };
  }

  static isUserAssignedToWedding(userId: string, weddingId: string): boolean {
    return this.data.staffAssignments.some(
      (sa) => sa.userId === userId && sa.weddingId === weddingId
    );
  }

  static getWeddingMembers(weddingId: string) {
    const assignments = this.data.assignments.filter(
      (a) => a.weddingId === weddingId && a.status === 'active'
    );
    const staffAssignments = this.data.staffAssignments.filter(
      (sa) => sa.weddingId === weddingId
    );
    return {
      assignments: assignments.map(a => {
        const staff = this.data.staffAssignments.find(
          sa => sa.supplierOrgId === a.supplierOrgId && sa.weddingId === weddingId
        );
        const user = staff ? this.data.users.find(u => u.id === staff.userId) : null;
        return {
          supplierOrgId: a.supplierOrgId,
          category: a.category,
          status: a.status,
          supplierName: user?.name ?? null,
        };
      }),
      staff: staffAssignments.map(sa => ({
        userId: sa.userId,
        supplierOrgId: sa.supplierOrgId,
      })),
    };
  }

  static ensureSupplierWeddingAssignment(input: {
    weddingId: string;
    supplierOrgId: string;
    userId: string;
    category?: string;
  }) {
    const weddingId = String(input.weddingId || '').trim();
    const supplierOrgId = String(input.supplierOrgId || '').trim();
    const userId = String(input.userId || '').trim();
    const category = String(input.category || 'General').trim() || 'General';
    if (!weddingId || !supplierOrgId || !userId) {
      return { ok: false };
    }

    let wedding = this.data.weddings.find((row) => row.id === weddingId);
    if (!wedding) {
      wedding = {
        id: weddingId,
        title: weddingId,
        wedding_date: '2099-12-31',
        timezone: 'Europe/Amsterdam',
        status: 'active',
        location: 'Locatie onbekend',
        coupleNames: [],
      };
      this.data.weddings.push(wedding);
      WeddingsRepo.insertWeddingSync({ ...wedding });
    }

    const existingAssignment = this.data.assignments.find(
      (assignment) => assignment.weddingId === weddingId && assignment.supplierOrgId === supplierOrgId
    );
    if (existingAssignment) {
      existingAssignment.status = 'active';
      if (!existingAssignment.category) {
        existingAssignment.category = category;
      }
      WeddingsRepo.insertAssignmentSync({ ...existingAssignment });
    } else {
      const newAssignment = { weddingId, supplierOrgId, status: 'active' as const, category };
      this.data.assignments.push(newAssignment);
      WeddingsRepo.insertAssignmentSync(newAssignment);
    }

    const hasStaffAssignment = this.data.staffAssignments.some(
      (entry) => entry.weddingId === weddingId && entry.supplierOrgId === supplierOrgId && entry.userId === userId
    );
    if (!hasStaffAssignment) {
      const newStaff = { weddingId, supplierOrgId, userId };
      this.data.staffAssignments.push(newStaff);
      WeddingsRepo.insertStaffAssignmentSync(newStaff);
    }

    if (!this.data.users.some((user) => user.id === userId)) {
      const newUser = { id: userId, name: `User ${userId.slice(0, 8)}` };
      this.data.users.push(newUser);
      WeddingsRepo.insertDashboardUserSync(newUser);
    }

    return { ok: true, weddingId, supplierOrgId, userId };
  }

  /**
   * Product dashboard create flow: create wedding + supplier assignment so it appears in lists.
   */
  static createWedding(input: CreateWeddingInput) {
    const title = String(input.title || '').trim();
    const weddingDate = String(input.weddingDate || '').trim();
    const supplierOrgId = String(input.supplierOrgId || '').trim();
    const createdByUserId = String(input.createdByUserId || '').trim();
    const location = String(input.location || '').trim();
    const timezone = String(input.timezone || 'Europe/Amsterdam').trim();
    const status = String(input.status || 'active') as WeddingStatus;
    const coupleNames = Array.isArray(input.coupleNames)
      ? input.coupleNames.map((name) => String(name || '').trim()).filter(Boolean)
      : [];

    if (!title) {
      throw new Error('Titel is verplicht.');
    }
    if (!weddingDate || Number.isNaN(new Date(weddingDate).getTime())) {
      throw new Error('Bruiloftsdatum is ongeldig.');
    }
    if (!supplierOrgId) {
      throw new Error('supplier_org_id is verplicht.');
    }
    if (!createdByUserId) {
      throw new Error('created_by_user_id is verplicht.');
    }
    if (!['draft', 'invited', 'active', 'completed', 'canceled'].includes(status)) {
      throw new Error('Ongeldige status.');
    }

    const weddingId = `wed-${Math.random().toString(36).slice(2, 8)}`;
    const wedding: Wedding = {
      id: weddingId,
      title,
      wedding_date: new Date(weddingDate).toISOString().slice(0, 10),
      timezone,
      status,
      location: location || 'Nog niet ingevuld',
      coupleNames: coupleNames.length ? coupleNames : [title],
      created_by_user_id: createdByUserId,
    };
    this.data.weddings.push(wedding);
    WeddingsRepo.insertWeddingSync({ ...wedding });

    const newAssignment = {
      weddingId,
      supplierOrgId,
      status: 'active' as const,
      category: String(input.supplierCategory || 'General'),
    };
    this.data.assignments.push(newAssignment);
    WeddingsRepo.insertAssignmentSync(newAssignment);

    const newStaff = { weddingId, supplierOrgId, userId: createdByUserId };
    this.data.staffAssignments.push(newStaff);
    WeddingsRepo.insertStaffAssignmentSync(newStaff);

    if (!this.data.users.some((user) => user.id === createdByUserId)) {
      const newUser = { id: createdByUserId, name: `User ${createdByUserId.slice(0, 8)}` };
      this.data.users.push(newUser);
      WeddingsRepo.insertDashboardUserSync(newUser);
    }

    return {
      wedding,
      assignment: this.data.assignments[this.data.assignments.length - 1],
    };
  }

  static updateWedding(input: UpdateWeddingInput) {
    const weddingId = String(input.weddingId || '').trim();
    if (!weddingId) {
      throw new Error('wedding_id is verplicht.');
    }

    const wedding = this.data.weddings.find((row) => row.id === weddingId);
    if (!wedding) {
      throw new Error('Bruiloft niet gevonden.');
    }

    const titleProvided = typeof input.title === 'string';
    if (titleProvided) {
      const title = String(input.title || '').trim();
      if (!title) {
        throw new Error('Titel is verplicht.');
      }
      wedding.title = title;
    }

    if (typeof input.weddingDate === 'string') {
      const weddingDate = String(input.weddingDate || '').trim();
      if (!weddingDate || Number.isNaN(new Date(weddingDate).getTime())) {
        throw new Error('Bruiloftsdatum is ongeldig.');
      }
      wedding.wedding_date = new Date(weddingDate).toISOString().slice(0, 10);
    }

    if (typeof input.location === 'string') {
      const location = String(input.location || '').trim();
      wedding.location = location || 'Nog niet ingevuld';
    }

    if (Array.isArray(input.coupleNames)) {
      const coupleNames = input.coupleNames.map((name) => String(name || '').trim()).filter(Boolean);
      if (!coupleNames.length) {
        throw new Error('Minimaal één naam is verplicht.');
      }
      wedding.coupleNames = coupleNames;
      if (!titleProvided) {
        wedding.title = coupleNames.join(' & ');
      }
    }

    if (typeof input.notes === 'string') {
      wedding.notes = input.notes;
    }

    if (typeof input.contactEmail === 'string') {
      wedding.contact_email = input.contactEmail.trim();
    }

    if (input.categoryData !== undefined && typeof input.categoryData === 'object') {
      wedding.category_data = { ...(wedding.category_data ?? {}), ...input.categoryData };
    }

    if (input.weddingInfo !== undefined && typeof input.weddingInfo === 'object') {
      wedding.wedding_info = { ...(wedding.wedding_info ?? {}), ...input.weddingInfo };
    }

    const validStatuses: WeddingStatus[] = ['draft', 'invited', 'active', 'completed', 'canceled'];
    if (typeof input.status === 'string' && validStatuses.includes(input.status as WeddingStatus)) {
      wedding.status = input.status as WeddingStatus;
    }

    // Sync updated wedding to the repo (fire-and-forget — repo is async-ready).
    WeddingsRepo.insertWeddingSync({ ...wedding });

    return {
      wedding: {
        id: wedding.id,
        title: wedding.title,
        wedding_date: wedding.wedding_date,
        timezone: wedding.timezone,
        status: wedding.status,
        location: wedding.location,
        couple_names: Array.isArray(wedding.coupleNames) ? [...wedding.coupleNames] : [],
        coupleNames: Array.isArray(wedding.coupleNames) ? [...wedding.coupleNames] : [],
        created_by_user_id: wedding.created_by_user_id,
        notes: wedding.notes,
        contact_email: wedding.contact_email,
        category_data: wedding.category_data ? { ...wedding.category_data } : undefined,
        wedding_info: wedding.wedding_info ? { ...wedding.wedding_info } : undefined,
      },
    };
  }

  /**
   * 3.1.1 - 3.1.8 Supplier triage query with precomputed maps to avoid N+1 scans.
   */
  static getSupplierWeddings(params: SupplierWeddingParams) {
    const limit = Math.max(1, Math.min(params.limit || 20, 100));
    const activeAssignments = this.data.assignments.filter(
      (a) => a.supplierOrgId === params.supplierOrgId && a.status === 'active'
    );

    const accessibleWeddingIds = new Set(activeAssignments.map((a) => a.weddingId));
    const threadToWedding = new Map(this.data.threads.map((t) => [t.id, t.weddingId]));
    const participantByThread = new Map(
      this.data.threadParticipants
        .filter((p) => p.userId === params.userId)
        .map((p) => [p.threadId, p])
    );

    const unreadByWedding = new Map<string, number>();
    for (const message of this.data.messages) {
      const weddingId = threadToWedding.get(message.threadId);
      const participant = participantByThread.get(message.threadId);
      if (!weddingId || !participant) {
        continue;
      }
      if (toDate(message.createdAt) > toDate(participant.lastReadAt)) {
        unreadByWedding.set(weddingId, (unreadByWedding.get(weddingId) || 0) + 1);
      }
    }

    const openTaskByWedding = new Map<string, number>();
    const latestTaskByWedding = new Map<string, Date>();
    for (const task of this.data.tasks) {
      if (task.supplierOrgId === params.supplierOrgId && task.status !== 'done') {
        openTaskByWedding.set(task.weddingId, (openTaskByWedding.get(task.weddingId) || 0) + 1);
      }
      const current = latestTaskByWedding.get(task.weddingId);
      const updated = toDate(task.updatedAt);
      if (!current || updated > current) {
        latestTaskByWedding.set(task.weddingId, updated);
      }
    }

    const latestMessageByWedding = new Map<string, Date>();
    for (const message of this.data.messages) {
      const weddingId = threadToWedding.get(message.threadId);
      if (!weddingId) {
        continue;
      }
      const current = latestMessageByWedding.get(weddingId);
      const created = toDate(message.createdAt);
      if (!current || created > current) {
        latestMessageByWedding.set(weddingId, created);
      }
    }

    const latestDocumentByWedding = new Map<string, Date>();
    for (const document of this.data.documents) {
      const current = latestDocumentByWedding.get(document.weddingId);
      const created = toDate(document.createdAt);
      if (!current || created > current) {
        latestDocumentByWedding.set(document.weddingId, created);
      }
    }

    const appointmentParticipantsById = new Map<string, AppointmentParticipant[]>();
    for (const participant of this.data.appointmentParticipants) {
      const list = appointmentParticipantsById.get(participant.appointmentId) || [];
      list.push(participant);
      appointmentParticipantsById.set(participant.appointmentId, list);
    }

    const nextAppointmentByWedding = new Map<string, string>();
    for (const appointment of this.data.appointments) {
      if (!isFutureOrNow(appointment.startAt)) {
        continue;
      }
      const participants = appointmentParticipantsById.get(appointment.id) || [];
      const hasSupplierOrg = participants.some((p) => p.supplierOrgId === params.supplierOrgId);
      if (!hasSupplierOrg) {
        continue;
      }
      const existing = nextAppointmentByWedding.get(appointment.weddingId);
      if (!existing || toDate(appointment.startAt) < toDate(existing)) {
        nextAppointmentByWedding.set(appointment.weddingId, appointment.startAt);
      }
    }

    const assignmentByWedding = new Map(activeAssignments.map((a) => [a.weddingId, a]));
    const staffSet = new Set(
      this.data.staffAssignments
        .filter((s) => s.userId === params.userId && s.supplierOrgId === params.supplierOrgId)
        .map((s) => s.weddingId)
    );

    const filtered = this.data.weddings
      .filter((w) => accessibleWeddingIds.has(w.id))
      .filter((w) => (params.status ? w.status === params.status : true))
      .filter((w) => (params.dateFrom ? toDate(w.wedding_date) >= params.dateFrom : true))
      .filter((w) => (params.dateTo ? toDate(w.wedding_date) <= params.dateTo : true))
      .filter((w) => (params.myAssignmentsOnly ? staffSet.has(w.id) : true))
      .filter((w) => {
        if (!params.search) {
          return true;
        }
        const term = normalize(params.search);
        const assignment = assignmentByWedding.get(w.id);
        const fields = [w.title, w.location, w.id, assignment?.category || '', ...w.coupleNames]
          .join(' ')
          .toLowerCase();
        return fields.includes(term);
      })
      .map((w) => {
        const assignment = assignmentByWedding.get(w.id);
        const candidates = [
          latestMessageByWedding.get(w.id),
          latestTaskByWedding.get(w.id),
          latestDocumentByWedding.get(w.id),
        ].filter((v): v is Date => !!v);
        const lastActivity = candidates.length
          ? new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString()
          : null;

        return {
          id: w.id,
          title: w.title,
          couple_names: Array.isArray(w.coupleNames) ? [...w.coupleNames] : [],
          wedding_date: w.wedding_date,
          timezone: w.timezone,
          location: w.location,
          category: assignment?.category || null,
          status: w.status,
          unread_messages: unreadByWedding.get(w.id) || 0,
          open_tasks: openTaskByWedding.get(w.id) || 0,
          next_appointment_at: nextAppointmentByWedding.get(w.id) || null,
          last_activity_at: lastActivity,
          is_assigned_to_me: staffSet.has(w.id),
        };
      })
      .sort((a, b) => {
        const dateDiff = toDate(a.wedding_date).getTime() - toDate(b.wedding_date).getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        const lastA = a.last_activity_at ? toDate(a.last_activity_at).getTime() : 0;
        const lastB = b.last_activity_at ? toDate(b.last_activity_at).getTime() : 0;
        return lastB - lastA;
      });

    const cursor = params.cursor ? decodeCursor(params.cursor) : null;
    const cursorFiltered = filtered.filter((row) => {
      if (!cursor) {
        return true;
      }
      if (row.wedding_date > cursor.weddingDate) {
        return true;
      }
      if (row.wedding_date === cursor.weddingDate) {
        return row.id > cursor.weddingId;
      }
      return false;
    });

    const page = cursorFiltered.slice(0, limit);
    const nextCursor =
      cursorFiltered.length > limit && page.length > 0
        ? encodeCursor(page[page.length - 1].wedding_date, page[page.length - 1].id)
        : null;

    return {
      weddings: page,
      nextCursor,
    };
  }

  /**
   * 3.3.1 - 3.3.6 Search scoped to supplier access with deterministic ranking.
   */
  static searchWeddings(params: SearchParams) {
    const term = normalize(params.searchTerm);
    if (!term) {
      return {
        results: [],
        emptyState: {
          title: 'No search term',
          suggestion: 'Enter a search term to find weddings.',
          clearFiltersCTA: 'Clear filters',
          helperText: 'Try searching by couple name or wedding date',
        },
      };
    }

    const activeAssignments = this.data.assignments.filter(
      (a) => a.supplierOrgId === params.supplierOrgId && a.status === 'active'
    );
    const accessibleWeddingIds = new Set(activeAssignments.map((a) => a.weddingId));
    const assignmentByWedding = new Map(activeAssignments.map((a) => [a.weddingId, a]));
    const usersById = new Map(this.data.users.map((u) => [u.id, u]));

    const latestActivityByWedding = new Map<string, Date>();
    const recordActivity = (weddingId: string, when: string) => {
      const current = latestActivityByWedding.get(weddingId);
      const date = toDate(when);
      if (!current || date > current) {
        latestActivityByWedding.set(weddingId, date);
      }
    };

    for (const message of this.data.messages) {
      const thread = this.data.threads.find((t) => t.id === message.threadId);
      if (thread) {
        recordActivity(thread.weddingId, message.createdAt);
      }
    }
    for (const task of this.data.tasks) {
      recordActivity(task.weddingId, task.updatedAt);
    }
    for (const document of this.data.documents) {
      recordActivity(document.weddingId, document.createdAt);
    }

    const scored = this.data.weddings
      .filter((w) => accessibleWeddingIds.has(w.id))
      .map((w) => {
        const assignment = assignmentByWedding.get(w.id);
        const staffNames = this.data.staffAssignments
          .filter((s) => s.weddingId === w.id)
          .map((s) => usersById.get(s.userId)?.name || '')
          .filter(Boolean);
        const coupleNamesText = w.coupleNames.join(' ').toLowerCase();
        const title = w.title.toLowerCase();
        const location = w.location.toLowerCase();
        const category = (assignment?.category || '').toLowerCase();
        const staffText = staffNames.join(' ').toLowerCase();
        const weddingId = w.id.toLowerCase();

        let rank = Number.MAX_SAFE_INTEGER;
        if (title === term) {
          rank = 1;
        } else if (title.startsWith(term)) {
          rank = 2;
        } else if (title.includes(term)) {
          rank = 3;
        } else if (location.includes(term)) {
          rank = 4;
        } else if (staffText.includes(term) || coupleNamesText.includes(term) || category.includes(term)) {
          rank = 5;
        } else if (weddingId === term) {
          rank = 6;
        }

        if (rank === Number.MAX_SAFE_INTEGER) {
          return null;
        }

        const lastActivity = latestActivityByWedding.get(w.id);
        return {
          id: w.id,
          title: w.title,
          location: w.location,
          wedding_date: w.wedding_date,
          status: w.status,
          rank,
          category: assignment?.category || null,
          last_activity_at: lastActivity ? lastActivity.toISOString() : null,
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        const dateDiff = toDate(a.wedding_date).getTime() - toDate(b.wedding_date).getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        const lastA = a.last_activity_at ? toDate(a.last_activity_at).getTime() : 0;
        const lastB = b.last_activity_at ? toDate(b.last_activity_at).getTime() : 0;
        return lastB - lastA;
      });

    return {
      results: scored,
      emptyState: scored.length
        ? null
        : {
            title: 'No results',
            suggestion: 'Try searching by couple name or wedding date.',
            clearFiltersCTA: 'Clear filters',
            helperText: 'Try searching by couple name or wedding date',
          },
    };
  }
}
