import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UXManager } from './ux.manager';

describe('UXManager (7.3)', () => {
  test('shows skeletons only on slower data fetches and avoids <100ms flicker', () => {
    const now = Date.now();
    const fast = UXManager.shouldShowLoader(now - 50);
    const slow = UXManager.shouldShowLoader(now - 450);
    assert.equal(fast, false);
    assert.equal(slow, true);

    const loaderState = UXManager.getLoaderState(now - 450, 400);
    assert.equal(loaderState.showSkeleton, true);
  });

  test('returns meaningful progress updates and ARIA metadata', () => {
    const staticProgress = UXManager.getProgressState(10, 10.4);
    assert.equal(staticProgress.isMeaningfulUpdate, false);

    const meaningful = UXManager.getProgressState(10, 25);
    assert.equal(meaningful.isMeaningfulUpdate, true);
    assert.equal(meaningful.aria.role, 'progressbar');
    assert.equal(meaningful.aria['aria-valuenow'], 25);
  });

  test('maps errors to plain-language output without showing raw codes', () => {
    const mapped = UXManager.getPlainLanguageError({ code: 'LIMIT_EXCEEDED_STORAGE' });
    assert.equal(mapped.title, 'Plan limit reached');
    assert.equal(mapped.showCode, false);
  });

  test('builds empty states and accessibility attributes for custom components', () => {
    const empty = UXManager.getEmptyState('documents');
    assert.match(empty.illustration, /empty-documents\.svg$/);
    assert.match(empty.description, /Start by creating/i);

    const dropzone = UXManager.getARIAAttrs('dropzone');
    assert.equal(dropzone.role, 'button');
    assert.equal(dropzone.tabIndex, 0);
  });

  test('runs accessibility scan and reports critical/serious violations', () => {
    const report = UXManager.runAccessibilityScan([
      {
        id: 'screen-1',
        interactiveElements: [{ keyboard: false }],
        images: [{ alt: '' }],
        colorContrastPairs: [{ ratio: 3.2 }],
      },
    ]);
    assert.equal(report.passed, false);
    assert.equal(report.summary.critical >= 1, true);
    assert.equal(report.summary.serious >= 1, true);

    const clean = UXManager.runAccessibilityScan([
      {
        id: 'screen-2',
        interactiveElements: [{ role: 'button', keyboard: true }],
        images: [{ alt: 'Wedding timeline illustration' }],
        colorContrastPairs: [{ ratio: 7 }],
      },
    ]);
    assert.equal(clean.passed, true);
    assert.equal(clean.summary.critical, 0);
    assert.equal(clean.summary.serious, 0);
  });
});
