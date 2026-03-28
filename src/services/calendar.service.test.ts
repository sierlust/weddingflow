import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CalendarService } from './collaboration.service';

function extractToken(url: string): string {
  return new URL(url).searchParams.get('token') || '';
}

describe('CalendarService', () => {
  beforeEach(() => {
    CalendarService.clearStateForTests();
  });

  test('creates appointment with full field set and validates start/end range', async () => {
    const appointment = await CalendarService.createAppointment({
      weddingId: 'wed-cal-1',
      title: 'Venue walkthrough',
      startAt: '2026-08-01T10:00:00.000Z',
      endAt: '2026-08-01T11:00:00.000Z',
      timezone: 'Europe/Amsterdam',
      locationOrLink: 'https://meet.example/room',
      participants: [{ userId: 'owner-user' }, { supplierOrgId: 'org-1' }],
      notes: { value: 'Bring floorplan', scope: 'selected_suppliers' },
      attachments: ['doc-floorplan'],
      reminderSettings: [{ minutesBefore: 60, channel: 'email' }],
      visibilityScope: 'selected_suppliers',
    });

    assert.equal(appointment.title, 'Venue walkthrough');
    assert.equal(appointment.timezone, 'Europe/Amsterdam');
    assert.equal(Array.isArray(appointment.participants), true);
    assert.equal(appointment.participants.length, 2);

    await assert.rejects(async () => {
      await CalendarService.createAppointment({
        weddingId: 'wed-cal-1',
        title: 'Invalid range',
        startAt: '2026-08-01T11:00:00.000Z',
        endAt: '2026-08-01T10:00:00.000Z',
      });
    });
  });

  test('filters appointments by visibility for owners, participants and supplier orgs', async () => {
    await CalendarService.createAppointment({
      weddingId: 'wed-cal-2',
      title: 'Couple private meeting',
      startAt: '2026-09-01T09:00:00.000Z',
      endAt: '2026-09-01T09:30:00.000Z',
      visibilityScope: 'couple_only',
      notes: { value: 'Private note', scope: 'couple_only' },
    });
    await CalendarService.createAppointment({
      weddingId: 'wed-cal-2',
      title: 'All suppliers sync',
      startAt: '2026-09-01T10:00:00.000Z',
      endAt: '2026-09-01T10:30:00.000Z',
      visibilityScope: 'all_assigned_suppliers',
      notes: { value: 'Public supplier note', scope: 'all_assigned_suppliers' },
    });
    await CalendarService.createAppointment({
      weddingId: 'wed-cal-2',
      title: 'Photo-only slot',
      startAt: '2026-09-01T11:00:00.000Z',
      endAt: '2026-09-01T11:30:00.000Z',
      visibilityScope: 'selected_suppliers',
      participants: [{ supplierOrgId: 'org-photo' }],
      notes: { value: 'Selected supplier note', scope: 'selected_suppliers' },
    });

    const ownerView = await CalendarService.getAppointments('wed-cal-2', {
      userId: 'owner',
      isOwner: true,
    });
    assert.equal(ownerView.length, 3);
    assert.equal(ownerView.every((entry) => entry.notes !== null), true);

    const photoSupplierView = await CalendarService.getAppointments('wed-cal-2', {
      userId: 'photo-user',
      supplierOrgIds: ['org-photo'],
    });
    assert.equal(photoSupplierView.length, 2);
    assert.deepEqual(photoSupplierView.map((entry) => entry.title), ['All suppliers sync', 'Photo-only slot']);

    const cateringSupplierView = await CalendarService.getAppointments('wed-cal-2', {
      userId: 'cat-user',
      supplierOrgIds: ['org-catering'],
    });
    assert.equal(cateringSupplierView.length, 1);
    assert.equal(cateringSupplierView[0]?.title, 'All suppliers sync');
  });

  test('generates stable unique tokenized subscription URLs and webcal links', async () => {
    const first = await CalendarService.getSubscriptionUrl('wed-cal-3', 'user-1', {
      supplierOrgIds: ['org-1'],
    });
    const second = await CalendarService.getSubscriptionUrl('wed-cal-3', 'user-1', {
      supplierOrgIds: ['org-1'],
    });
    const third = await CalendarService.getSubscriptionUrl('wed-cal-3', 'user-2', {
      supplierOrgIds: ['org-1'],
    });

    const firstToken = extractToken(first);
    const secondToken = extractToken(second);
    const thirdToken = extractToken(third);

    assert.equal(firstToken, secondToken);
    assert.notEqual(firstToken, thirdToken);
    assert.equal(/^[a-f0-9]{48}$/.test(firstToken), true);

    await CalendarService.createAppointment({
      weddingId: 'wed-cal-3',
      title: 'Planner sync',
      startAt: '2026-10-01T12:00:00.000Z',
      endAt: '2026-10-01T13:00:00.000Z',
      visibilityScope: 'all_assigned_suppliers',
    });
    const list = await CalendarService.getAppointments('wed-cal-3', {
      userId: 'user-1',
      supplierOrgIds: ['org-1'],
    });

    assert.ok(list[0]?.add_to_calendar);
    assert.match(list[0]?.add_to_calendar.webcal || '', /^webcal:\/\//);
    assert.match(list[0]?.add_to_calendar.download_ics || '', /\/v1\/appointments\/.+\/calendar\.ics\?token=/);
  });

  test('ics feed respects visibility rules and outputs valid text/calendar payload', async () => {
    await CalendarService.createAppointment({
      weddingId: 'wed-cal-4',
      title: 'Public supplier briefing',
      startAt: '2026-11-01T10:00:00.000Z',
      endAt: '2026-11-01T10:30:00.000Z',
      visibilityScope: 'all_assigned_suppliers',
      notes: { value: 'Visible note', scope: 'all_assigned_suppliers' },
    });
    await CalendarService.createAppointment({
      weddingId: 'wed-cal-4',
      title: 'Owner-only confidential',
      startAt: '2026-11-01T11:00:00.000Z',
      endAt: '2026-11-01T11:30:00.000Z',
      visibilityScope: 'couple_only',
      notes: { value: 'Secret note', scope: 'couple_only' },
    });

    const supplierUrl = await CalendarService.getSubscriptionUrl('wed-cal-4', 'supplier-user', {
      supplierOrgIds: ['org-a'],
    });
    const supplierToken = extractToken(supplierUrl);
    const supplierIcs = await CalendarService.generateIcal(supplierToken, 'wed-cal-4');

    assert.match(supplierIcs, /^BEGIN:VCALENDAR/m);
    assert.match(supplierIcs, /SUMMARY:Public supplier briefing/);
    assert.doesNotMatch(supplierIcs, /Owner-only confidential/);

    const ownerUrl = await CalendarService.getSubscriptionUrl('wed-cal-4', 'owner-user', {
      isOwner: true,
    });
    const ownerIcs = await CalendarService.generateIcal(extractToken(ownerUrl), 'wed-cal-4');
    assert.match(ownerIcs, /SUMMARY:Owner-only confidential/);
  });

  test('single-event ics works and supplier removal revokes feed token', async () => {
    const appt = await CalendarService.createAppointment({
      weddingId: 'wed-cal-5',
      title: 'Florist check-in',
      startAt: '2026-12-01T08:00:00.000Z',
      endAt: '2026-12-01T08:30:00.000Z',
      visibilityScope: 'selected_suppliers',
      participants: [{ supplierOrgId: 'org-florist' }],
    });

    const url = await CalendarService.getSubscriptionUrl('wed-cal-5', 'florist-user', {
      supplierOrgIds: ['org-florist'],
    });
    const token = extractToken(url);

    const single = await CalendarService.generateSingleEventIcal(appt.id, token);
    assert.match(single, /BEGIN:VEVENT/);
    assert.match(single, /SUMMARY:Florist check-in/);

    const revoked = CalendarService.revokeSubscriptionsForSupplierOrg('wed-cal-5', 'org-florist');
    assert.equal(revoked.revokedCount, 1);

    await assert.rejects(async () => {
      await CalendarService.generateIcal(token, 'wed-cal-5');
    });
  });
});

