import { useRef, type PointerEvent, type ReactNode } from 'react';

const MAX_TILT = 10;

/**
 * Overview cards only. Pointer position tilts the card in 3D; it eases
 * back flat on leave. Disabled when the user prefers reduced motion.
 */
export default function TiltCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - py) * MAX_TILT * 2;
    const rotateY = (px - 0.5) * MAX_TILT * 2;
    el.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-6px) scale(1.02)`;
  }

  function flatten() {
    const el = rootRef.current;
    if (!el) return;
    el.style.transform = '';
  }

  return (
    <div
      ref={rootRef}
      className={`card card-tilt ${className}`.trim()}
      onPointerMove={tilt}
      onPointerLeave={flatten}
    >
      {children}
    </div>
  );
}
