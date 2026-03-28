import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSUIManager } from './ros.ui';

const sampleItems = [
  {
    id: 'i1',
    title: 'Ceremony',
    start_at: '2026-08-01T10:00:00.000Z',
    end_at: '2026-08-01T10:30:00.000Z',
  },
  {
    id: 'i2',
    title: 'Photos',
    start_at: '2026-08-01T10:20:00.000Z',
    end_at: '2026-08-01T11:00:00.000Z',
  },
  {
    id: 'i3',
    title: 'Dinner',
    start_at: '2026-08-01T12:00:00.000Z',
    end_at: '2026-08-01T13:00:00.000Z',
  },
];

describe('ROSUIManager', () => {
  test('agenda view sorts items by start_at', () => {
    const ui = new ROSUIManager();
    const sorted = ui.getAgendaData([...sampleItems].reverse());
    assert.equal(sorted[0].id, 'i1');
    assert.equal(sorted[1].id, 'i2');
    assert.equal(sorted[2].id, 'i3');
  });

  test('timeline layout computes proportional blocks and overlap columns', () => {
    const ui = new ROSUIManager();
    const layout = ui.getTimelineLayout(sampleItems, 2);
    const first = layout.find((row) => row.id === 'i1');
    const second = layout.find((row) => row.id === 'i2');
    const third = layout.find((row) => row.id === 'i3');

    assert.ok(first?.overlaps);
    assert.ok(second?.overlaps);
    assert.equal(third?.overlaps, false);
    assert.equal((first?.height || 0) > 0, true);
    assert.equal((second?.columnIndex || 0) >= 0, true);
  });

  test('supports tap-to-open inspector and snap increments', () => {
    const ui = new ROSUIManager();
    const inspector = ui.openItemInspector(sampleItems[0], 'edit');
    assert.equal(inspector.fullScreen, true);
    assert.equal(inspector.mode, 'edit');
    assert.equal(inspector.actions.includes('save'), true);

    const snapped5 = ui.snapTime(new Date('2026-08-01T10:07:00.000Z'));
    assert.equal(snapped5.getUTCMinutes(), 5);
    ui.setSnapIncrement(15);
    const snapped15 = ui.snapTime(new Date('2026-08-01T10:07:00.000Z'));
    assert.equal(snapped15.getUTCMinutes(), 0);
  });

  test('manual time input and render strategy cover mobile timeline requirements', () => {
    const ui = new ROSUIManager();
    const cfg = ui.getTimeInputConfig();
    assert.equal(cfg.preferredVariant, 'text_input');
    assert.equal(cfg.allowManualInput, true);
    assert.equal(cfg.allowPicker, true);

    const parsed = ui.parseManualTimeInput('14:35', new Date('2026-08-01T00:00:00.000Z'));
    assert.ok(parsed);
    assert.equal(parsed?.getUTCHours(), 14);
    assert.equal(parsed?.getUTCMinutes(), 35);
    assert.equal(ui.parseManualTimeInput('99:99'), null);

    assert.equal(ui.getRenderStrategy(10), 'dom');
    assert.equal(ui.getRenderStrategy(50), 'virtualized');
    assert.equal(ui.getRenderStrategy(150), 'canvas');
  });

  test('change-request form and sorting support supplier workflow', () => {
    const ui = new ROSUIManager();
    assert.equal(ui.shouldShowRequestChangeButton('supplier'), true);
    assert.equal(ui.shouldShowRequestChangeButton('owner'), false);

    const form = ui.getChangeRequestForm();
    assert.equal(form.types.length, 4);
    assert.equal(form.validation.reasonMin, 20);
    assert.equal(form.validation.reasonMax, 500);

    const sorted = ui.sortMyRequests([
      {
        item_title: 'Dinner',
        type: 'instruction_change',
        created_at: '2026-08-01T10:00:00.000Z',
        status: 'accepted',
        summary: 'x',
      },
      {
        item_title: 'Ceremony',
        type: 'time_change',
        created_at: '2026-08-01T10:00:00.000Z',
        status: 'submitted',
        summary: 'y',
      },
    ]);
    assert.equal(sorted[0].status, 'submitted');
  });

  test('review panel metadata and diff preview support owner decisions', () => {
    const ui = new ROSUIManager();
    const meta = ui.getReviewPanelMetadata(3);
    assert.match(meta.title, /3/);
    assert.equal(meta.actions.length, 4);

    const diff = ui.getDiffPreview(
      { start_at: '10:00', instructions: 'Old', owner_role: 'photo' },
      { start_at: '10:15', instructions: 'New' }
    );
    assert.deepEqual(diff.start_at, { from: '10:00', to: '10:15' });
    assert.deepEqual(diff.instructions, { from: 'Old', to: 'New' });
  });
});

