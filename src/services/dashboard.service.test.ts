import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardService } from './dashboard.service';

const testData = {
  weddings: [
    {
      id: 'wed-a',
      title: 'Alpha Wedding',
      wedding_date: '2026-06-01',
      timezone: 'Europe/Amsterdam',
      status: 'active',
      location: 'Utrecht',
      coupleNames: ['Anna', 'Ben'],
    },
    {
      id: 'wed-b',
      title: 'Beta Celebration',
      wedding_date: '2026-06-20',
      timezone: 'Europe/Amsterdam',
      status: 'active',
      location: 'Rotterdam',
      coupleNames: ['Cara', 'Daan'],
    },
    {
      id: 'wed-c',
      title: 'Gamma Event',
      wedding_date: '2026-07-01',
      timezone: 'Europe/Amsterdam',
      status: 'completed',
      location: 'Amsterdam',
      coupleNames: ['Eva', 'Finn'],
    },
  ],
  assignments: [
    { weddingId: 'wed-a', supplierOrgId: 'org-1', status: 'active', category: 'Photography' },
    { weddingId: 'wed-b', supplierOrgId: 'org-1', status: 'active', category: 'Catering' },
    { weddingId: 'wed-c', supplierOrgId: 'org-2', status: 'active', category: 'Video' },
  ],
  staffAssignments: [
    { weddingId: 'wed-a', supplierOrgId: 'org-1', userId: 'user-1' },
    { weddingId: 'wed-b', supplierOrgId: 'org-1', userId: 'user-2' },
  ],
  threads: [
    { id: 'thr-1', weddingId: 'wed-a' },
    { id: 'thr-2', weddingId: 'wed-b' },
  ],
  threadParticipants: [
    { threadId: 'thr-1', userId: 'user-1', lastReadAt: '2026-02-01T10:00:00.000Z' },
    { threadId: 'thr-2', userId: 'user-1', lastReadAt: '2026-02-05T10:00:00.000Z' },
  ],
  messages: [
    { id: 'm1', threadId: 'thr-1', createdAt: '2026-02-03T10:00:00.000Z' },
    { id: 'm2', threadId: 'thr-2', createdAt: '2026-02-03T10:00:00.000Z' },
    { id: 'm3', threadId: 'thr-2', createdAt: '2026-02-06T10:00:00.000Z' },
  ],
  tasks: [
    { id: 't1', weddingId: 'wed-a', supplierOrgId: 'org-1', status: 'todo', updatedAt: '2026-02-02T10:00:00.000Z' },
    { id: 't2', weddingId: 'wed-a', supplierOrgId: 'org-1', status: 'done', updatedAt: '2026-02-01T10:00:00.000Z' },
    { id: 't3', weddingId: 'wed-b', supplierOrgId: 'org-1', status: 'blocked', updatedAt: '2026-02-07T10:00:00.000Z' },
  ],
  appointments: [
    { id: 'a1', weddingId: 'wed-a', startAt: '2099-01-01T09:00:00.000Z' },
    { id: 'a2', weddingId: 'wed-a', startAt: '2099-02-01T09:00:00.000Z' },
    { id: 'a3', weddingId: 'wed-b', startAt: '2099-03-01T09:00:00.000Z' },
  ],
  appointmentParticipants: [
    { appointmentId: 'a1', supplierOrgId: 'org-1' },
    { appointmentId: 'a3', supplierOrgId: 'org-1' },
  ],
  documents: [
    { id: 'd1', weddingId: 'wed-a', createdAt: '2026-02-08T10:00:00.000Z' },
    { id: 'd2', weddingId: 'wed-b', createdAt: '2026-02-04T10:00:00.000Z' },
  ],
  users: [
    { id: 'user-1', name: 'Alice Supplier' },
    { id: 'user-2', name: 'Boris Staff' },
  ],
};

describe('DashboardService', () => {
  beforeEach(() => {
    DashboardService.setDataForTests(testData as any);
  });

  test('returns supplier scoped weddings with unread counts, task counts and next appointment', () => {
    const result = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
    });

    assert.equal(result.weddings.length, 2);
    const first = result.weddings[0];
    assert.equal(first.id, 'wed-a');
    assert.equal(first.unread_messages, 1);
    assert.equal(first.open_tasks, 1);
    assert.equal(first.next_appointment_at, '2099-01-01T09:00:00.000Z');
    assert.ok(first.last_activity_at);
  });

  test('supports my_assignments strict staff filtering', () => {
    const result = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
      myAssignmentsOnly: true,
    });
    assert.equal(result.weddings.length, 1);
    assert.equal(result.weddings[0].id, 'wed-a');
  });

  test('supports cursor-based pagination', () => {
    const page1 = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
      limit: 1,
    });
    assert.equal(page1.weddings.length, 1);
    assert.ok(page1.nextCursor);

    const page2 = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
      limit: 1,
      cursor: page1.nextCursor || undefined,
    });
    assert.equal(page2.weddings.length, 1);
    assert.notEqual(page1.weddings[0].id, page2.weddings[0].id);
  });

  test('creates a wedding and auto-assigns it to supplier org for dashboard visibility', () => {
    const created = DashboardService.createWedding({
      title: 'Sanne & Koen',
      weddingDate: '2026-09-12',
      timezone: 'Europe/Amsterdam',
      location: 'Haarlem',
      status: 'active',
      coupleNames: ['Sanne', 'Koen'],
      supplierOrgId: 'org-1',
      supplierCategory: 'Planning',
      createdByUserId: 'user-1',
    });

    assert.ok(created.wedding.id.startsWith('wed-'));
    assert.equal(created.wedding.title, 'Sanne & Koen');
    assert.equal(created.assignment.supplierOrgId, 'org-1');

    const list = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
      search: 'sanne',
    });
    assert.ok(list.weddings.some((wedding) => wedding.id === created.wedding.id));
  });

  test('rejects invalid create wedding payload', () => {
    assert.throws(
      () =>
        DashboardService.createWedding({
          title: '',
          weddingDate: 'invalid-date',
          supplierOrgId: 'org-1',
          createdByUserId: 'user-1',
        } as any),
      /Titel is verplicht|ongeldig/i
    );
  });

  test('updates wedding basisgegevens and keeps title/couple names in sync', () => {
    const updated = DashboardService.updateWedding({
      weddingId: 'wed-a',
      weddingDate: '2026-09-10',
      location: 'Den Haag',
      coupleNames: ['Lina', 'Mats'],
    });

    assert.equal(updated.wedding.title, 'Lina & Mats');
    assert.equal(updated.wedding.wedding_date, '2026-09-10');
    assert.equal(updated.wedding.location, 'Den Haag');
    assert.deepEqual(updated.wedding.couple_names, ['Lina', 'Mats']);

    const list = DashboardService.getSupplierWeddings({
      userId: 'user-1',
      supplierOrgId: 'org-1',
      search: 'lina',
    });
    assert.ok(list.weddings.some((wedding) => wedding.id === 'wed-a'));
  });

  test('rejects update for unknown wedding', () => {
    assert.throws(
      () =>
        DashboardService.updateWedding({
          weddingId: 'wed-missing',
          location: 'Utrecht',
        }),
      /niet gevonden/i
    );
  });

  test('search returns only accessible weddings with ranking and tie-breaks', () => {
    const result = DashboardService.searchWeddings({
      supplierOrgId: 'org-1',
      searchTerm: 'alpha',
    });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, 'wed-a');
  });

  test('search returns no-results helper state when nothing matches', () => {
    const result = DashboardService.searchWeddings({
      supplierOrgId: 'org-1',
      searchTerm: 'non-existent-search-term',
    });
    assert.equal(result.results.length, 0);
    assert.ok(result.emptyState);
    assert.equal(result.emptyState?.clearFiltersCTA, 'Clear filters');
  });
});
