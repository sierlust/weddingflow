/**
 * Phase 7.3 UX & Accessibility Helpers
 */
export class UXManager {
  /**
   * 7.3.1 & 7.3.7 Skeleton loader threshold (no flicker under 100ms)
   */
  static shouldShowLoader(startTime: number): boolean {
    const duration = Date.now() - startTime;
    return duration > 100;
  }

  static getLoaderState(startTime: number, responseThresholdMs = 400) {
    const elapsed = Date.now() - startTime;
    return {
      showSkeleton: elapsed >= responseThresholdMs && this.shouldShowLoader(startTime),
      elapsed,
      threshold: responseThresholdMs,
    };
  }

  /**
   * 7.3.2 Progress indicators with meaningful increments
   */
  static getProgressState(previousPercent: number, nextPercent: number) {
    const clampedPrev = Math.max(0, Math.min(100, Number(previousPercent) || 0));
    const clampedNext = Math.max(0, Math.min(100, Number(nextPercent) || 0));
    const delta = clampedNext - clampedPrev;
    return {
      percent: clampedNext,
      label: `${Math.round(clampedNext)}%`,
      animate: delta >= 1,
      isMeaningfulUpdate: delta >= 1,
      isComplete: clampedNext >= 100,
      aria: {
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(clampedNext),
      },
    };
  }

  /**
   * 7.3.3 Standardized error messaging (no raw codes shown)
   */
  static getPlainLanguageError(error: any): { title: string; message: string; action: string; showCode: false } {
    const code = error?.code || 'UNKNOWN';
    const errorCatalog: Record<string, { title: string; message: string; action: string }> = {
      LIMIT_EXCEEDED_WEDDINGS: {
        title: 'Plan limit reached',
        message: 'You reached the maximum number of weddings for your current plan.',
        action: 'Upgrade plan',
      },
      LIMIT_EXCEEDED_SEATS: {
        title: 'Plan limit reached',
        message: 'You reached the maximum number of team members for your current plan.',
        action: 'Manage members',
      },
      LIMIT_EXCEEDED_STORAGE: {
        title: 'Plan limit reached',
        message: 'You reached the storage limit for your current plan.',
        action: 'Manage storage',
      },
      NETWORK_ERROR: {
        title: 'Connection problem',
        message: 'We could not connect to the server.',
        action: 'Try again',
      },
      AUTH_EXPIRED: {
        title: 'Session expired',
        message: 'Your session has expired.',
        action: 'Sign in again',
      },
    };

    const mapped = errorCatalog[code] || {
      title: 'Something went wrong',
      message: 'An unexpected error occurred.',
      action: 'Refresh page',
    };
    return {
      ...mapped,
      showCode: false,
    };
  }

  /**
   * 7.3.4 Empty state generator with illustration + explanation + CTA
   */
  static getEmptyState(entityType: string) {
    return {
      illustration: `/assets/empty-${entityType}.svg`,
      title: `No ${entityType} yet`,
      description: `Start by creating your first ${entityType}.`,
      primaryCTA: `Create ${entityType}`,
    };
  }

  /**
   * 7.3.5 Accessibility role helpers for custom components
   */
  static getARIAAttrs(componentType: 'toolbar' | 'modal' | 'progress' | 'timeline' | 'dropzone') {
    switch (componentType) {
      case 'progress':
        return { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 };
      case 'modal':
        return { role: 'dialog', 'aria-modal': 'true' };
      case 'toolbar':
        return { role: 'toolbar', 'aria-label': 'Actions' };
      case 'timeline':
        return { role: 'list', 'aria-label': 'Timeline items' };
      case 'dropzone':
        return { role: 'button', tabIndex: 0, 'aria-label': 'Upload files' };
      default:
        return {};
    }
  }

  /**
   * 7.3.6 Automated accessibility scan helper
   */
  static runAccessibilityScan(screens: Array<{
    id: string;
    interactiveElements: Array<{ role?: string; keyboard: boolean }>;
    images: Array<{ alt?: string }>;
    colorContrastPairs: Array<{ ratio: number }>;
  }>) {
    const violations: Array<{ screenId: string; severity: 'critical' | 'serious'; issue: string }> = [];

    for (const screen of screens) {
      for (const el of screen.interactiveElements) {
        if (!el.role) {
          violations.push({ screenId: screen.id, severity: 'critical', issue: 'Missing role on interactive element' });
        }
        if (!el.keyboard) {
          violations.push({ screenId: screen.id, severity: 'serious', issue: 'Interactive element not keyboard operable' });
        }
      }
      for (const img of screen.images) {
        if (!img.alt || !img.alt.trim()) {
          violations.push({ screenId: screen.id, severity: 'serious', issue: 'Image missing alt text' });
        }
      }
      for (const pair of screen.colorContrastPairs) {
        if (pair.ratio < 4.5) {
          violations.push({ screenId: screen.id, severity: 'serious', issue: 'Color contrast below 4.5:1' });
        }
      }
    }

    return {
      violations,
      summary: {
        critical: violations.filter((v) => v.severity === 'critical').length,
        serious: violations.filter((v) => v.severity === 'serious').length,
      },
      passed: violations.length === 0,
    };
  }

  static getSlow3GScenario() {
    return {
      networkPreset: 'Slow 3G',
      expectSkeletons: true,
      expectProgressAnimation: true,
      expectNoCriticalA11yViolations: true,
    };
  }
}
