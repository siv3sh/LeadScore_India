import { animate, createTimeline, stagger } from 'animejs';

type MotionEl = HTMLElement;
type AnimationFactory = (el: Element, reduced: boolean) => void;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function asElements(targets: Element | Element[] | NodeListOf<Element>): MotionEl[] {
  const list: Element[] = Array.isArray(targets)
    ? targets
    : typeof NodeList !== 'undefined' && targets instanceof NodeList
      ? Array.from(targets)
      : [targets as Element];
  return list.filter((el): el is MotionEl => el instanceof HTMLElement);
}

/** Make motion targets readable immediately (reduced-motion / cleanup). */
export function showImmediately(targets: Element | Element[] | NodeListOf<Element>): void {
  asElements(targets).forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

/**
 * Play once when the target enters the viewport.
 * Missing nodes, missing IntersectionObserver, and reduced-motion all show content.
 */
export function revealOnScroll(
  target: Element | string | null,
  animationFactory: AnimationFactory,
): () => void {
  if (typeof document === 'undefined') return () => {};

  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return () => {};

  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    animationFactory(el, true);
    return () => {};
  }

  let played = false;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting || played) return;
      played = true;
      animationFactory(el, false);
      io.disconnect();
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  );
  io.observe(el);
  return () => io.disconnect();
}

function collect(root: HTMLElement, selector: string): MotionEl[] {
  return Array.from(root.querySelectorAll<MotionEl>(selector));
}

/**
 * Landing-only motion: hero timeline, ranked-list stagger, below-fold reveals.
 * Returns a cleanup that cancels animations and leaves content visible.
 */
export function playLandingMotion(root: HTMLElement): () => void {
  const hero = collect(root, '[data-motion="hero"]');
  const mockRows = collect(root, '[data-motion="mock-row"]');
  const reveals = collect(root, '[data-motion="reveal"]');
  const staggerItems = collect(root, '[data-motion="stagger"]');
  const all = [...hero, ...mockRows, ...staggerItems, ...reveals.filter((el) => {
    return el.querySelector('[data-motion="stagger"]') === null;
  })];

  if (prefersReducedMotion()) {
    showImmediately(all);
    return () => {};
  }

  const running: Array<{ revert: () => void }> = [];
  const observers: Array<() => void> = [];

  const tl = createTimeline({ defaults: { ease: 'outExpo' } });
  running.push(tl);

  if (hero.length > 0) {
    tl.add(hero, {
      opacity: [0, 1],
      y: [18, 0],
      duration: 720,
      delay: stagger(70),
    });
  }

  if (mockRows.length > 0) {
    tl.add(
      mockRows,
      {
        opacity: [0, 1],
        x: [-12, 0],
        duration: 480,
        delay: stagger(65),
      },
      hero.length > 0 ? '-=380' : 0,
    );
  }

  reveals.forEach((section) => {
    observers.push(
      revealOnScroll(section, (_el, reduced) => {
        const children = collect(section, '[data-motion="stagger"]');
        const targets = children.length > 0 ? children : [section];
        if (reduced) {
          showImmediately(targets);
          return;
        }
        running.push(
          animate(targets, {
            opacity: [0, 1],
            y: [16, 0],
            ease: 'outExpo',
            duration: 680,
            delay: stagger(80),
          }),
        );
      }),
    );
  });

  return () => {
    observers.forEach((stop) => stop());
    running.forEach((anim) => {
      anim.revert();
    });
    // Drop inline styles so CSS hiding applies again (React Strict Mode remounts).
    all.forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
    });
  };
}
