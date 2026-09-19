import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  monthCells,
  monthLabel,
  parseYmd,
  shiftYearMonth,
  WEEKDAY_LABELS,
} from '@/lib/display';

export default function DayPicker({
  value,
  max,
  onChange,
}: {
  value: string | null;
  max: string;
  onChange: (ymd: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const seed =
    parseYmd(value ?? '') ??
    parseYmd(max) ??
    { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [view, setView] = useState(seed);

  useEffect(() => {
    if (!open) return;
    const next = parseYmd(value ?? '') ?? parseYmd(max);
    if (next) setView({ year: next.year, month: next.month });
  }, [open, value, max]);

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

  const maxParts = parseYmd(max);
  const canGoNext =
    !maxParts ||
    view.year < maxParts.year ||
    (view.year === maxParts.year && view.month < maxParts.month);

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border bg-white transition shrink-0 ${
          value
            ? 'border-blue-400 text-blue-600'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
        aria-label="Pick a day"
        title="Pick a day"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Choose a date"
          className="absolute z-40 top-full left-0 mt-1.5 w-[17.5rem] rounded-xl border border-slate-200/90 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between mb-2 px-0.5">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
              aria-label="Previous month"
              onClick={() => setView((current) => shiftYearMonth(current.year, current.month, -1))}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">
              {monthLabel(view.year, view.month)}
            </p>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Next month"
              disabled={!canGoNext}
              onClick={() => {
                if (!canGoNext) return;
                setView((current) => shiftYearMonth(current.year, current.month, 1));
              }}
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="h-7 flex items-center justify-center text-[10px] font-medium uppercase tracking-wide text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {monthCells(view.year, view.month).map((cell) => {
              const selected = cell.ymd === value;
              const isToday = cell.ymd === max;
              const disabled = cell.ymd > max;
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  disabled={disabled}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={selected}
                  className={`h-8 w-8 mx-auto rounded-lg text-[13px] tabular-nums transition ${dayClass({
                    selected,
                    isToday,
                    inMonth: cell.inMonth,
                    disabled,
                  })}`}
                  onClick={() => {
                    if (disabled) return;
                    onChange(cell.ymd);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dayClass({
  selected,
  isToday,
  inMonth,
  disabled,
}: {
  selected: boolean;
  isToday: boolean;
  inMonth: boolean;
  disabled: boolean;
}): string {
  if (disabled) return 'text-slate-300 cursor-not-allowed';
  if (selected) return 'bg-blue-600 text-white font-semibold shadow-sm';
  if (isToday) return 'text-blue-700 font-semibold ring-1 ring-inset ring-blue-200 hover:bg-blue-50';
  if (!inMonth) return 'text-slate-400 hover:bg-slate-50 hover:text-slate-700';
  return 'text-slate-700 hover:bg-slate-50';
}
