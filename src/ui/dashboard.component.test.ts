import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardComponent } from './dashboard.component';

const weddings = [
  {
    id: 'w1',
    wedding_date: '2026-03-10',
    status: 'active',
    is_assigned_to_me: true,
    last_activity_at: '2026-02-26T10:00:00.000Z',
    unread_messages: 1,
  },
  {
    id: 'w2',
    wedding_date: '2026-03-01',
    status: 'invited',
    is_assigned_to_me: false,
    last_activity_at: '2026-02-27T10:00:00.000Z',
    unread_messages: 0,
  },
  {
    id: 'w3',
    wedding_date: '2026-03-01',
    status: 'active',
    is_assigned_to_me: false,
    last_activity_at: '2026-02-20T10:00:00.000Z',
    unread_messages: 2,
  },
];

describe('DashboardComponent', () => {
  test('returns empty state when there are no weddings', () => {
    const component = new DashboardComponent();
    const result = component.getRenderData();
    assert.equal(result.title, 'Geen bruiloften gevonden');
    assert.equal(result.cta, 'Stel profiel in');
  });

  test('applies filters and default sorting by date then activity', () => {
    const component = new DashboardComponent();
    component.setWeddings(weddings);
    component.setFilters({ status: 'active' as any });
    const result = component.getRenderData();

    assert.equal(result.length, 2);
    // Same date first is w3 on 2026-03-01, then w1 on 2026-03-10.
    assert.equal(result[0].id, 'w3');
    assert.equal(result[1].id, 'w1');
  });

  test('supports my weddings toggle for strict assignment mode', () => {
    const component = new DashboardComponent();
    component.setWeddings(weddings);
    component.setFilters({ myWeddings: true });
    const result = component.getRenderData();

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'w1');
  });

  test('increments unread badge via realtime update without resetting filter state', () => {
    const component = new DashboardComponent();
    component.setWeddings(weddings);
    component.setFilters({ status: 'active' as any, myWeddings: true });
    const beforeFilters = component.getFilters();
    const beforeRevision = component.getFilterRevision();

    component.handleNewMessage('w1');

    const afterFilters = component.getFilters();
    const afterRevision = component.getFilterRevision();
    assert.deepEqual(afterFilters, beforeFilters);
    assert.equal(afterRevision, beforeRevision);

    const rendered = component.getRenderData();
    assert.equal(rendered[0].unread_messages, 2);
  });

  test('returns loading skeleton data', () => {
    const component = new DashboardComponent();
    const skeleton = component.getSkeleton();
    assert.equal(skeleton.length, 3);
    assert.equal(skeleton[0].loading, true);
  });
});
