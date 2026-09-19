import type { Priority } from '@/types';

export type ListFilters = {
  priority: 'all' | Priority;
  source: string;
  status: string;
  /** Rank by score (on) or by arrival day (off). */
  scoreFirst: boolean;
  /** `all` / `today` / `yesterday` / `7d` / `30d`, or a YYYY-MM-DD arrival day. */
  date: string;
};

export type CustomStatus = {
  slug: string;
  label: string;
};

export const DEFAULT_LIST_FILTERS: ListFilters = {
  priority: 'all',
  source: 'all',
  status: 'all',
  scoreFirst: true,
  date: 'all',
};

export const MAX_CUSTOM_STATUSES = 12;
export const CUSTOM_STATUS_MAX_LEN = 24;

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const FILTERS_PREFIX = 'leadscore.filters.';
const STATUSES_PREFIX = 'leadscore.customStatuses.';

const PRIORITIES = new Set<ListFilters['priority']>(['all', 'high', 'medium', 'low']);

/** Built-in keys a shop owner must not recreate as a custom label. */
const RESERVED_STATUS_SLUGS = new Set([
  'new',
  'contacted',
  'follow_up',
  'qualified',
  'won',
  'lost',
  'no_response',
  'tomorrow',
  'unknown',
  'open',
  'converted',
  'not_converted',
  'no_answer',
]);

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota
  }
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PRESETS = new Set(['all', 'today', 'yesterday', '7d', '30d']);

function parseDateFilter(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_LIST_FILTERS.date;
  if (DATE_PRESETS.has(value) || DATE_KEY.test(value)) return value;
  return DEFAULT_LIST_FILTERS.date;
}

export function filtersAreDefault(filters: ListFilters): boolean {
  return (
    filters.priority === DEFAULT_LIST_FILTERS.priority &&
    filters.source === DEFAULT_LIST_FILTERS.source &&
    filters.status === DEFAULT_LIST_FILTERS.status &&
    filters.scoreFirst === DEFAULT_LIST_FILTERS.scoreFirst &&
    filters.date === DEFAULT_LIST_FILTERS.date
  );
}

export function loadListFilters(userId: string, store: KeyValueStore | null = browserStore()): ListFilters {
  const raw = readJson(store, FILTERS_PREFIX + userId);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LIST_FILTERS };
  const rec = raw as Record<string, unknown>;
  const priority = typeof rec.priority === 'string' && PRIORITIES.has(rec.priority as ListFilters['priority'])
    ? (rec.priority as ListFilters['priority'])
    : DEFAULT_LIST_FILTERS.priority;
  const source = typeof rec.source === 'string' && rec.source.trim() ? rec.source : DEFAULT_LIST_FILTERS.source;
  let status = typeof rec.status === 'string' && rec.status.trim() ? rec.status : DEFAULT_LIST_FILTERS.status;
  if (status === 'unknown' || status === 'open') status = 'new';
  if (status === 'qualified') status = DEFAULT_LIST_FILTERS.status;
  const scoreFirst = typeof rec.scoreFirst === 'boolean' ? rec.scoreFirst : DEFAULT_LIST_FILTERS.scoreFirst;
  const date = parseDateFilter(rec.date);
  return { priority, source, status, scoreFirst, date };
}

export function saveListFilters(
  userId: string,
  filters: ListFilters,
  store: KeyValueStore | null = browserStore(),
): void {
  writeJson(store, FILTERS_PREFIX + userId, filters);
}

export function loadCustomStatuses(
  userId: string,
  store: KeyValueStore | null = browserStore(),
): CustomStatus[] {
  const raw = readJson(store, STATUSES_PREFIX + userId);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomStatus[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const slug = typeof (row as CustomStatus).slug === 'string' ? (row as CustomStatus).slug : '';
    const label = typeof (row as CustomStatus).label === 'string' ? (row as CustomStatus).label.trim() : '';
    if (!slug || !label || seen.has(slug) || RESERVED_STATUS_SLUGS.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label });
    if (out.length >= MAX_CUSTOM_STATUSES) break;
  }
  return out;
}

export function saveCustomStatuses(
  userId: string,
  statuses: CustomStatus[],
  store: KeyValueStore | null = browserStore(),
): void {
  writeJson(store, STATUSES_PREFIX + userId, statuses.slice(0, MAX_CUSTOM_STATUSES));
}

export function parseCustomStatusLabel(raw: string): CustomStatus | { error: string } {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return { error: 'Type a status name first.' };
  if (label.length > CUSTOM_STATUS_MAX_LEN) {
    return { error: `Keep it under ${CUSTOM_STATUS_MAX_LEN} characters.` };
  }
  const slug = label
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!slug) return { error: 'Use letters or numbers in the name.' };
  if (RESERVED_STATUS_SLUGS.has(slug)) {
    return { error: `"${label}" is already a built-in status.` };
  }
  return { slug, label };
}

export function rememberCustomStatus(
  userId: string,
  entry: CustomStatus,
  store: KeyValueStore | null = browserStore(),
): CustomStatus[] | { error: string } {
  const current = loadCustomStatuses(userId, store);
  if (current.some((row) => row.slug === entry.slug)) return current;
  if (current.length >= MAX_CUSTOM_STATUSES) {
    return { error: `You can add up to ${MAX_CUSTOM_STATUSES} custom statuses.` };
  }
  const next = [...current, entry];
  saveCustomStatuses(userId, next, store);
  return next;
}
