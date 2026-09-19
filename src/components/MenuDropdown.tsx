import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, MoreVertical } from 'lucide-react';

export type MenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Color-codes the row (success = green, danger = red). */
  tone?: 'success' | 'danger';
  /** Highlights the current selection. */
  active?: boolean;
};

type MenuTone = 'success' | 'danger';

function menuRowClass(tone: MenuTone | undefined, active: boolean): string {
  if (!tone) {
    return active ? 'bg-blue-50 text-blue-900 font-medium' : 'text-slate-700 hover:bg-slate-50';
  }
  switch (tone) {
    case 'success':
      return active
        ? 'bg-green-50 text-green-800 font-medium'
        : 'text-green-700 hover:bg-green-50';
    case 'danger':
      return active ? 'bg-red-50 text-red-800 font-medium' : 'text-red-700 hover:bg-red-50';
    default: {
      const _never: never = tone;
      return _never;
    }
  }
}

type MenuDropdownProps = {
  items: MenuItem[];
  ariaLabel: string;
  align?: 'left' | 'right';
  /** Compact icon trigger for dense table rows. */
  size?: 'sm' | 'md';
  /** Optional custom trigger (defaults to ⋮). */
  trigger?: ReactNode;
  /** Replaces the default icon-button classes when the trigger is a labeled control. */
  triggerClassName?: string;
  /** Extra classes on the root (e.g. flex-1 in a form row). */
  className?: string;
  /** Extra node under the items (e.g. an add-status field). */
  footer?: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * Lightweight actions menu. One open at a time per instance; closes on
 * outside click, Escape, or selecting an item.
 */
export default function MenuDropdown({
  items,
  ariaLabel,
  align = 'right',
  size = 'md',
  trigger,
  triggerClassName,
  className,
  footer,
}: MenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const triggerClass =
    triggerClassName ??
    (size === 'sm'
      ? 'p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition'
      : 'p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition');

  return (
    <div className={`relative inline-flex ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className={triggerClass}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger ?? <MoreVertical className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute z-40 top-full mt-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1.5 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => {
            const tone = item.tone ?? (item.danger ? 'danger' : undefined);
            const rowClass = menuRowClass(tone, Boolean(item.active));
            const checkClass =
              tone === 'success'
                ? 'text-green-600'
                : tone === 'danger'
                  ? 'text-red-600'
                  : 'text-blue-600';
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                aria-current={item.active ? 'true' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${rowClass}`}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
                {item.active ? (
                  <Check className={`w-3.5 h-3.5 shrink-0 ${checkClass}`} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
          {footer ? (
            <div className="border-t border-slate-100 mt-1 pt-1">
              {typeof footer === 'function' ? footer(() => setOpen(false)) : footer}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
