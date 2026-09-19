import { afterEach, describe, expect, it, vi } from 'vitest';
import { playLandingMotion, prefersReducedMotion, revealOnScroll, riseIn } from './animeMotion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('defaults to reduced when window is missing', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('follows the prefers-reduced-motion media query', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
      }),
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('allows motion when the user has not requested a reduction', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false, media: '' }),
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('revealOnScroll', () => {
  it('is a no-op when the target is missing', () => {
    const cleanup = revealOnScroll(null, () => {
      throw new Error('should not run');
    });
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});

describe('riseIn', () => {
  it('does not start an animation when there is nothing to move', () => {
    expect(riseIn([])).toBeNull();
  });
});

describe('playLandingMotion', () => {
  it('returns a cleanup that can run on an empty root', () => {
    if (typeof document === 'undefined') return;
    const root = document.createElement('div');
    const stop = playLandingMotion(root);
    expect(typeof stop).toBe('function');
    stop();
  });
});
