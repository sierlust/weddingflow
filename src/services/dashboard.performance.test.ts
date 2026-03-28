import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DashboardService } from './dashboard.service';

function buildLargeDataset(size: number) {
  const weddings: any[] = [];
  const assignments: any[] = [];
  const staffAssignments: any[] = [];
  const threads: any[] = [];
  const threadParticipants: any[] = [];
  const messages: any[] = [];
  const tasks: any[] = [];
  const appointments: any[] = [];
  const appointmentParticipants: any[] = [];
  const documents: any[] = [];
  const users = [{ id: 'bench-user', name: 'Bench User' }];

  for (let i = 0; i < size; i += 1) {
    const weddingId = `bench-wed-${i}`;
    const threadId = `bench-thread-${i}`;
    const appointmentId = `bench-appt-${i}`;
    const date = new Date(2026, 0, 1 + (i % 365)).toISOString().slice(0, 10);

    weddings.push({
      id: weddingId,
      title: i % 2 === 0 ? `Alpha Event ${i}` : `City Wedding ${i}`,
      wedding_date: date,
      timezone: 'Europe/Amsterdam',
      status: 'active',
      location: i % 2 === 0 ? 'Utrecht' : 'Amsterdam',
      coupleNames: [`Couple${i}`, `Partner${i}`],
    });
    assignments.push({
      weddingId,
      supplierOrgId: 'org-bench',
      status: 'active',
      category: i % 2 === 0 ? 'Photography' : 'Catering',
    });
    staffAssignments.push({
      weddingId,
      supplierOrgId: 'org-bench',
      userId: 'bench-user',
    });
    threads.push({ id: threadId, weddingId });
    threadParticipants.push({
      threadId,
      userId: 'bench-user',
      lastReadAt: '2026-01-01T00:00:00.000Z',
    });
    messages.push({
      id: `bench-msg-${i}`,
      threadId,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    tasks.push({
      id: `bench-task-${i}`,
      weddingId,
      supplierOrgId: 'org-bench',
      status: i % 3 === 0 ? 'done' : 'todo',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    appointments.push({
      id: appointmentId,
      weddingId,
      startAt: '2099-01-01T00:00:00.000Z',
    });
    appointmentParticipants.push({
      appointmentId,
      supplierOrgId: 'org-bench',
    });
    documents.push({
      id: `bench-doc-${i}`,
      weddingId,
      createdAt: '2026-01-04T00:00:00.000Z',
    });
  }

  return {
    weddings,
    assignments,
    staffAssignments,
    threads,
    threadParticipants,
    messages,
    tasks,
    appointments,
    appointmentParticipants,
    documents,
    users,
  };
}

describe('DashboardService performance checks', () => {
  beforeEach(() => {
    DashboardService.resetDataForTests();
  });

  test('benchmarks triage and search against 10k wedding dataset', () => {
    const largeData = buildLargeDataset(10_000);
    DashboardService.setDataForTests(largeData as any);

    const triageStart = Date.now();
    const triage = DashboardService.getSupplierWeddings({
      userId: 'bench-user',
      supplierOrgId: 'org-bench',
      limit: 20,
      search: 'alpha',
    });
    const triageMs = Date.now() - triageStart;

    const searchStart = Date.now();
    const search = DashboardService.searchWeddings({
      supplierOrgId: 'org-bench',
      searchTerm: 'alpha event 100',
    });
    const searchMs = Date.now() - searchStart;

    assert.ok(triage.weddings.length > 0);
    assert.ok(search.results.length > 0);
    // Generous local benchmark budget to detect accidental O(N^2) regressions.
    assert.ok(triageMs < 4000, `triage benchmark too slow: ${triageMs}ms`);
    assert.ok(searchMs < 4000, `search benchmark too slow: ${searchMs}ms`);
  });

  test('confirms pg_trgm GIN index migration is present for wedding search', () => {
    const migrationPath = path.resolve(process.cwd(), 'migrations/014_search_optimizations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
    assert.match(sql, /idx_weddings_search_trgm/i);
    assert.match(sql, /GIN \(title gin_trgm_ops, location gin_trgm_ops\)/i);
  });
});
