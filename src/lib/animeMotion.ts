import {
  animate,
  createAnimatable,
  createTimeline,
  spring,
  stagger,
  type JSAnimation,
} from 'animejs';

export interface RiseInOptions {
  delay?: number;
  staggerMs?: number;
  duration?: number;
  y?: number;
}

type RevertibleAnim = {
  pause?: () => unknown;
  revert: () => unknown;
};

type ScaleXHandle = {
  scaleX: (value: number) => unknown;
  revert: () => unknown;
};

/**
 * Respect the OS/browser reduced-motion setting. Missing window counts as
 * reduced so server/test environments never start a visual animation.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Staggered fade/rise. Empty lists are a no-op so callers can pass query results
 * without a separate length check.
 */
export function riseIn(
  targets: HTMLElement[],
  { delay = 0, staggerMs = 70, duration = 800, y = 22 }: RiseInOptions = {},
): JSAnimation | null {
  if (targets.length === 0) return null;

  if (prefersReducedMotion()) {
    return animate(targets, { opacity: 1, y: 0, duration: 1 });
  }

  return animate(targets, {
    opacity: [0, 1],
    y: [y, 0],
    ease: 'outExpo',
    duration,
    delay: staggerMs > 0 ? stagger(staggerMs, { start: delay }) : delay,
  });
}

/**
 * Play an animation once when `target` enters the viewport.
 * Returns a disconnect/cancel callback.
 */
export function revealOnScroll(
  target: Element | string | null | undefined,
  animationFactory: (el: Element, reduced: boolean) => void,
): () => void {
  const el =
    typeof target === 'string'
      ? typeof document === 'undefined'
        ? null
        : document.querySelector(target)
      : (target ?? null);
  if (!el) return () => {};

  if (prefersReducedMotion()) {
    animationFactory(el, true);
    return () => {};
  }

  if (typeof IntersectionObserver === 'undefined') {
    animationFactory(el, false);
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
    { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
  );

  io.observe(el);
  return () => io.disconnect();
}

function itemsIn(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function showMotionItems(root: ParentNode) {
  itemsIn(root, '.landing-motion-item').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

function countScores(root: ParentNode, delay: number): JSAnimation[] {
  if (prefersReducedMotion()) return [];

  return itemsIn(root, '[data-score]').flatMap((el, index) => {
    const target = Number(el.dataset.score);
    if (!Number.isFinite(target) || target < 0) return [];

    const state = { v: 0 };
    el.textContent = '0';
    return [
      animate(state, {
        v: target,
        ease: 'outExpo',
        duration: 900,
        delay: delay + index * 70,
        onUpdate: () => {
          el.textContent = String(Math.round(state.v));
        },
      }),
    ];
  });
}

function fillScoreBars(root: ParentNode, delay: number): JSAnimation[] {
  const bars = itemsIn(root, '[data-score-bar]');

  return bars.flatMap((el, index) => {
    const raw = Number(el.dataset.scoreBar);
    const width = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
    if (prefersReducedMotion()) {
      el.style.width = `${width}%`;
      return [];
    }
    return [
      animate(el, {
        width: ['0%', `${width}%`],
        duration: 900,
        delay: delay + index * 70,
        ease: 'outExpo',
      }),
    ];
  });
}

/** Cycle the top three ranked rows so the mock list reads as "call this next". */
function playPrioritySweep(rows: HTMLElement[]): () => void {
  const top = rows.slice(0, 3);
  if (top.length === 0 || prefersReducedMotion()) return () => {};

  let index = 0;
  const running: JSAnimation[] = [];

  const paint = () => {
    running.splice(0).forEach((anim) => anim.pause());
    top.forEach((row, rowIndex) => {
      const on = rowIndex === index;
      running.push(
        animate(row, {
          backgroundColor: on ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255, 255, 255, 0)',
          duration: 420,
          ease: 'outQuad',
        }),
      );
      const hint = row.querySelector<HTMLElement>('[data-call-hint]');
      if (hint) {
        running.push(animate(hint, { opacity: on ? 1 : 0, duration: 280, ease: 'outQuad' }));
      }
    });
    index = (index + 1) % top.length;
  };

  let intervalId = 0;
  const startId = window.setTimeout(() => {
    paint();
    intervalId = window.setInterval(paint, 2400);
  }, 1500);

  return () => {
    window.clearTimeout(startId);
    window.clearInterval(intervalId);
    running.forEach((anim) => {
      anim.pause();
      anim.revert();
    });
  };
}

function bindScrollProgress(bar: HTMLElement | null): () => void {
  if (!bar || typeof window === 'undefined') return () => {};

  const readProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  if (prefersReducedMotion()) {
    const sync = () => {
      bar.style.transform = `scaleX(${readProgress()})`;
    };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
    return () => window.removeEventListener('scroll', sync);
  }

  const anim = createAnimatable(bar, {
    scaleX: { duration: 140, ease: 'out(2)' },
  }) as unknown as ScaleXHandle;
  anim.scaleX(0);

  const sync = () => {
    anim.scaleX(readProgress());
  };
  window.addEventListener('scroll', sync, { passive: true });
  sync();
  return () => {
    window.removeEventListener('scroll', sync);
    anim.revert();
  };
}

function bindStickyCta(
  sticky: HTMLElement | null,
  hero: HTMLElement | null,
  footer: HTMLElement | null,
): () => void {
  if (!sticky || !hero || typeof IntersectionObserver === 'undefined') return () => {};

  let heroVisible = true;
  let footerVisible = false;
  let shown = false;

  const apply = (show: boolean) => {
    if (show === shown) return;
    shown = show;
    sticky.style.pointerEvents = show ? 'auto' : 'none';
    sticky.toggleAttribute('data-on', show);
    sticky.parentElement?.classList.toggle('landing-sticky-pad', show);

    if (prefersReducedMotion()) {
      sticky.style.opacity = show ? '1' : '0';
      sticky.style.transform = show ? 'translateY(0)' : 'translateY(100%)';
      return;
    }

    animate(sticky, {
      opacity: show ? 1 : 0,
      translateY: show ? 0 : 72,
      duration: 420,
      ease: 'outExpo',
    });
  };

  const sync = () => apply(!heroVisible && !footerVisible);

  const heroIo = new IntersectionObserver(
    ([entry]) => {
      heroVisible = Boolean(entry?.isIntersecting);
      sync();
    },
    { threshold: 0.2 },
  );
  heroIo.observe(hero);

  let footerIo: IntersectionObserver | null = null;
  if (footer) {
    footerIo = new IntersectionObserver(
      ([entry]) => {
        footerVisible = Boolean(entry?.isIntersecting);
        sync();
      },
      { threshold: 0.05 },
    );
    footerIo.observe(footer);
  }

  return () => {
    heroIo.disconnect();
    footerIo?.disconnect();
    sticky.parentElement?.classList.remove('landing-sticky-pad');
  };
}

function bindCtaMotion(root: HTMLElement, running: RevertibleAnim[]): () => void {
  const buttons = itemsIn(root, '[data-cta]');
  const listeners: Array<() => void> = [];

  const heroCta = root.querySelector<HTMLElement>('[data-cta="hero"]');
  if (heroCta && !prefersReducedMotion()) {
    running.push(
      animate(heroCta, {
        scale: [1, 1.045, 1],
        duration: 1600,
        delay: 1700,
        ease: 'inOutSine',
        loop: 3,
      }),
    );
  }

  if (prefersReducedMotion()) return () => {};

  buttons.forEach((el) => {
    const enter = () => {
      animate(el, {
        scale: 1.04,
        duration: 280,
        ease: spring({ stiffness: 260, damping: 16 }),
      });
    };
    const leave = () => {
      animate(el, {
        scale: 1,
        duration: 280,
        ease: spring({ stiffness: 260, damping: 16 }),
      });
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    listeners.push(() => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    });
  });

  return () => listeners.forEach((fn) => fn());
}

/**
 * Landing-page motion: hero timeline, live call-list sweep, scroll progress,
 * sticky trial bar, and one-shot reveals further down the page.
 */
export function playLandingMotion(root: HTMLElement): () => void {
  const running: RevertibleAnim[] = [];
  const cleanups: Array<() => void> = [];

  const track = (anim: RevertibleAnim | null) => {
    if (anim) running.push(anim);
  };

  try {
    const heroItems = itemsIn(root, '[data-motion="hero"] > [data-motion-item]');
    const panel = itemsIn(root, '[data-motion="hero-panel"] > [data-motion-item]');
    const rows = itemsIn(root, '[data-motion="call-list"] > [data-motion-item]');
    const floater = root.querySelector<HTMLElement>('[data-motion="float"]');
    const ping = root.querySelector<HTMLElement>('[data-motion="live-ping"]');

    if (prefersReducedMotion()) {
      track(riseIn([...heroItems, ...panel, ...rows], { staggerMs: 0, duration: 1, y: 0 }));
    } else {
      const tl = createTimeline({ defaults: { ease: 'outExpo' } });
      track(tl);

      if (heroItems.length > 0) {
        tl.add(heroItems, {
          opacity: [0, 1],
          y: [18, 0],
          duration: 680,
          delay: stagger(75),
        });
      }

      if (panel.length > 0) {
        tl.add(
          panel,
          {
            opacity: [0, 1],
            y: [28, 0],
            duration: 900,
            ease: spring({ stiffness: 110, damping: 14 }),
          },
          heroItems.length > 0 ? '-=420' : 0,
        );
      }

      if (rows.length > 0) {
        tl.add(
          rows,
          {
            opacity: [0, 1],
            x: [-12, 0],
            duration: 460,
            delay: stagger(55),
          },
          '-=520',
        );
      }

      countScores(root, 520).forEach(track);
      fillScoreBars(root, 520).forEach(track);

      if (floater) {
        track(
          animate(floater, {
            translateY: [-6, 6],
            duration: 3200,
            ease: 'inOutSine',
            loop: true,
            alternate: true,
          }),
        );
      }

      if (ping) {
        track(
          animate(ping, {
            scale: [1, 2.1],
            opacity: [0.7, 0],
            duration: 1600,
            ease: 'outQuad',
            loop: true,
          }),
        );
      }
    }

    if (prefersReducedMotion()) fillScoreBars(root, 0);

    cleanups.push(playPrioritySweep(rows));
    cleanups.push(bindScrollProgress(root.querySelector('[data-motion="scroll-progress"]')));
    cleanups.push(
      bindStickyCta(
        root.querySelector('[data-motion="sticky-cta"]'),
        root.querySelector('#top'),
        root.querySelector('footer'),
      ),
    );
    cleanups.push(bindCtaMotion(root, running));

    itemsIn(root, '[data-motion="reveal"]').forEach((section) => {
      const targets = itemsIn(section, '[data-motion-item]');
      if (targets.length === 0) return;

      cleanups.push(
        revealOnScroll(section, (_el, reduced) => {
          track(
            reduced
              ? animate(targets, { opacity: 1, y: 0, duration: 1 })
              : riseIn(targets, { staggerMs: 70, duration: 680, y: 16 }),
          );
        }),
      );
    });

    const recommended = root.querySelector<HTMLElement>('[data-plan="recommended"]');
    if (recommended && !prefersReducedMotion()) {
      cleanups.push(
        revealOnScroll(recommended, () => {
          track(
            animate(recommended, {
              scale: [1, 1.03, 1],
              duration: 900,
              delay: 280,
              ease: 'inOutSine',
            }),
          );
        }),
      );
    }
  } catch {
    showMotionItems(root);
  }

  return () => {
    running.forEach((anim) => {
      anim.pause?.();
      anim.revert();
    });
    cleanups.forEach((fn) => fn());
  };
}
