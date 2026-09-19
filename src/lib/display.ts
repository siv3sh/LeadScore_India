import type { Priority } from '@/types';

/** Friendly names for the sources the model one-hot encodes. */
const SOURCE_LABELS: Record<string, string> = {
  fb: 'Facebook Ads',
  ig: 'Instagram',
  google: 'Google Search',
  referral: 'Referral',
  walkin: 'Walk-in',
  other: 'Other',
};

export function formatSource(source: string | null): string {
  if (!source) return '—';
  const known = SOURCE_LABELS[source.toLowerCase()];
  if (known) return known;
  // An unrecognised source still needs to read like a label, not a slug.
  return source
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface StatusStyle {
  label: string;
  className: string;
  dot: string;
}

/**
 * Covers both pipeline stages a CRM exports and the settled outcomes the model
 * trains on. Anything unrecognised falls back to neutral styling rather than
 * being hidden.
 */
const STATUS_STYLES: Record<string, StatusStyle> = {
  new: { label: 'New', className: 'text-sky-700 bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
  contacted: {
    label: 'Contacted',
    className: 'text-blue-700 bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
  },
  follow_up: {
    label: 'Follow-up',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
  },
  qualified: {
    label: 'Qualified',
    className: 'text-violet-700 bg-violet-50 border-violet-200',
    dot: 'bg-violet-500',
  },
  won: {
    label: 'Converted',
    className: 'text-green-700 bg-green-50 border-green-200',
    dot: 'bg-green-500',
  },
  lost: {
    label: 'Not converted',
    className: 'text-red-700 bg-red-50 border-red-200',
    dot: 'bg-red-500',
  },
  no_response: {
    label: 'No answer',
    className: 'text-slate-600 bg-slate-50 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export function formatStatus(status: string | null): StatusStyle {
  const key = normalizeLeadStatus(status);
  return (
    STATUS_STYLES[key] ?? {
      label: formatSource(status || key),
      className: 'text-slate-600 bg-slate-50 border-slate-200',
      dot: 'bg-slate-400',
    }
  );
}

/** Snooze is not stored as a DB status; the grid still treats it as one. */
export const TOMORROW_STATUS_STYLE: StatusStyle = {
  label: 'Tomorrow',
  className: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  dot: 'bg-indigo-500',
};

/** Values a sales person can set from the grid Status menu. */
export const GRID_STATUS_VALUES = [
  'new',
  'contacted',
  'follow_up',
  'no_response',
  'tomorrow',
  'won',
  'lost',
] as const;

export type GridStatusValue = (typeof GRID_STATUS_VALUES)[number];

export const GRID_STATUS_OPTIONS: Array<{
  value: GridStatusValue;
  label: string;
  className: string;
  dot: string;
}> = GRID_STATUS_VALUES.map((value) =>
  value === 'tomorrow'
    ? { value, ...TOMORROW_STATUS_STYLE }
    : { value, ...STATUS_STYLES[value] },
);

/** Maps CSV / CRM labels onto the keys we store. */
export function normalizeLeadStatus(status: string | null): string {
  if (!status) return 'new';
  const key = status.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!key || key === 'open' || key === 'unknown') return 'new';
  if (key === 'no_answer') return 'no_response';
  if (key === 'converted') return 'won';
  if (key === 'not_converted') return 'lost';
  return key;
}

export const PRIORITY_STYLES: Record<Priority, { label: string; dot: string; className: string }> = {
  high: {
    label: 'High',
    dot: 'bg-green-500',
    className: 'text-green-700 bg-green-50 border-green-200',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-amber-500',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  low: {
    label: 'Low',
    dot: 'bg-slate-400',
    className: 'text-slate-600 bg-slate-50 border-slate-200',
  },
};

/** Whole rupees — lead values are never precise enough to warrant paise. */
export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * wa.me needs a country code and digits only. Returns null when the number
 * cannot be trusted, so the caller can disable the button instead of opening a
 * broken chat.
 */
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  // Any other length is either an international number we cannot infer a code
  // for, or junk.
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** tel: URIs must not contain spaces or formatting characters. */
export function telLink(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 6 ? `tel:${cleaned}` : null;
}

/** Wa.me URL; optional prefilled message for one-tap outreach. */
export function whatsappHref(phone: string | null, message?: string): string | null {
  const digits = whatsappNumber(phone);
  if (!digits) return null;
  if (!message?.trim()) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`;
}

/** Short follow-up copy Indian SMB callers can send as-is. */
export function defaultWhatsAppMessage(name: string | null): string {
  const who = name?.trim() || 'there';
  return `Hi ${who}, this is a quick follow-up from our team. When would be a good time to talk?`;
}

/** Statuses that mean "already handled" for Today's call list. */
export function isSettledOutreachStatus(status: string | null): boolean {
  if (!status) return false;
  const key = status.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return (
    key === 'contacted' ||
    key === 'won' ||
    key === 'lost' ||
    key === 'no_response' ||
    key === 'no_answer'
  );
}

export function isSnoozed(snoozedUntil: string | null | undefined, now = new Date()): boolean {
  if (!snoozedUntil) return false;
  const until = new Date(snoozedUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

export function isSnoozedOpen(
  status: string | null,
  snoozedUntil: string | null | undefined,
  now = new Date(),
): boolean {
  return isSnoozed(snoozedUntil, now) && !isSettledOutreachStatus(status);
}

export function gridStatusAppearance(
  status: string | null,
  snoozedUntil: string | null | undefined,
): StatusStyle {
  if (isSnoozedOpen(status, snoozedUntil)) return TOMORROW_STATUS_STYLE;
  return formatStatus(status);
}

export function isGridStatusActive(
  option: GridStatusValue,
  status: string | null,
  snoozedUntil: string | null | undefined,
): boolean {
  const snoozed = isSnoozedOpen(status, snoozedUntil);
  if (option === 'tomorrow') return snoozed;
  if (snoozed) return false;
  return normalizeLeadStatus(status) === option;
}

/** Tomorrow 9:00 local — next morning call list. */
export function snoozeUntilTomorrowMorning(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** Local calendar day as YYYY-MM-DD (shop owner's timezone, not UTC). */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calendarDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return localDateKey(parsed);
}

export function leadArrivalDateKey(lead: {
  created_at_lead: string | null;
  created_at: string;
}): string | null {
  return calendarDateKey(lead.created_at_lead) ?? calendarDateKey(lead.created_at);
}

export function formatCalendarDateLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function uniqueLeadDateKeys(
  leads: Array<{ created_at_lead: string | null; created_at: string }>,
): string[] {
  const keys = new Set<string>();
  for (const lead of leads) {
    const key = leadArrivalDateKey(lead);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DATE_FILTER_PRESETS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

export type DateFilterPreset = (typeof DATE_FILTER_PRESETS)[number]['value'];

/** Shift a YYYY-MM-DD key by whole local calendar days. */
export function shiftLocalDateKey(ymd: string, deltaDays: number): string {
  const match = YMD.exec(ymd);
  if (!match) return ymd;
  const shifted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  shifted.setDate(shifted.getDate() + deltaDays);
  return localDateKey(shifted);
}

export function isCalendarDayFilter(value: string): boolean {
  return YMD.test(value);
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = YMD.exec(ymd);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export type MonthCell = {
  ymd: string;
  day: number;
  inMonth: boolean;
};

/** Sunday-first, matching how Indian calendars are usually read. */
export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const shifted = new Date(year, month - 1 + deltaMonths, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

/** 6-week Sunday-start grid for a 1–12 calendar month. */
export function monthCells(year: number, month: number): MonthCell[] {
  const first = new Date(year, month - 1, 1);
  const cursor = new Date(year, month - 1, 1 - first.getDay());
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push({
      ymd: localDateKey(cursor),
      day: cursor.getDate(),
      inMonth: cursor.getFullYear() === year && cursor.getMonth() === month - 1,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export function dateFilterLabel(value: string): string {
  const preset = DATE_FILTER_PRESETS.find((row) => row.value === value);
  if (preset) return preset.label;
  if (YMD.test(value)) return formatCalendarDateLabel(value);
  return 'All dates';
}

export function leadMatchesDateFilter(
  lead: { created_at_lead: string | null; created_at: string },
  dateFilter: string,
  todayKey: string,
): boolean {
  if (dateFilter === 'all') return true;
  const key = leadArrivalDateKey(lead);
  if (!key) return false;

  switch (dateFilter) {
    case 'today':
      return key === todayKey;
    case 'yesterday':
      return key === shiftLocalDateKey(todayKey, -1);
    case '7d':
      return key >= shiftLocalDateKey(todayKey, -6) && key <= todayKey;
    case '30d':
      return key >= shiftLocalDateKey(todayKey, -29) && key <= todayKey;
    default:
      return key === dateFilter;
  }
}
