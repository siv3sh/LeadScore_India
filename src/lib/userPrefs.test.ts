import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIST_DISPLAY,
  DEFAULT_LIST_FILTERS,
  filtersAreDefault,
  loadCustomStatuses,
  loadListDisplay,
  loadListFilters,
  parseCustomStatusLabel,
  rememberCustomStatus,
  saveListDisplay,
  saveListFilters,
  visibleExtraKeys,
} from './userPrefs';

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe('list filters', () => {
  it('returns defaults when nothing is stored for that user', () => {
    expect(loadListFilters('user-a', memoryStore())).toEqual(DEFAULT_LIST_FILTERS);
  });

  it('round-trips filters per user', () => {
    const store = memoryStore();
    saveListFilters('user-a', { priority: 'high', source: 'referral', status: 'new', scoreFirst: true, date: 'all' }, store);
    saveListFilters('user-b', { priority: 'low', source: 'all', status: 'won', scoreFirst: true, date: 'all' }, store);
    expect(loadListFilters('user-a', store)).toEqual({
      priority: 'high',
      source: 'referral',
      status: 'new',
      scoreFirst: true,
      date: 'all',
    });
    expect(loadListFilters('user-b', store)).toEqual({
      priority: 'low',
      source: 'all',
      status: 'won',
      scoreFirst: true,
      date: 'all',
    });
  });

  it('round-trips the score-first toggle and a picked day', () => {
    const store = memoryStore();
    saveListFilters(
      'user-a',
      { priority: 'all', source: 'all', status: 'all', scoreFirst: false, date: '2026-09-18' },
      store,
    );
    expect(loadListFilters('user-a', store)).toEqual({
      priority: 'all',
      source: 'all',
      status: 'all',
      scoreFirst: false,
      date: '2026-09-18',
    });
  });

  it('maps a saved Open filter onto New', () => {
    const store = memoryStore();
    saveListFilters('user-a', { ...DEFAULT_LIST_FILTERS, status: 'unknown' }, store);
    expect(loadListFilters('user-a', store).status).toBe('new');
  });

  it('ignores a corrupt payload instead of crashing', () => {
    const store = memoryStore({ 'leadscore.filters.user-a': '{not json' });
    expect(loadListFilters('user-a', store)).toEqual(DEFAULT_LIST_FILTERS);
  });

  it('round-trips Last 7 days and ignores an unknown date token', () => {
    const store = memoryStore();
    saveListFilters('user-a', { ...DEFAULT_LIST_FILTERS, date: '7d' }, store);
    expect(loadListFilters('user-a', store).date).toBe('7d');
    saveListFilters('user-a', { ...DEFAULT_LIST_FILTERS, date: 'last-week' }, store);
    expect(loadListFilters('user-a', store).date).toBe('all');
  });

  it('knows when filters are back at defaults', () => {
    expect(filtersAreDefault(DEFAULT_LIST_FILTERS)).toBe(true);
    expect(filtersAreDefault({ ...DEFAULT_LIST_FILTERS, date: 'today' })).toBe(false);
    expect(filtersAreDefault({ ...DEFAULT_LIST_FILTERS, scoreFirst: false })).toBe(false);
  });
});

describe('custom statuses', () => {
  it('accepts a short shop-floor label', () => {
    expect(parseCustomStatusLabel('  Busy  ')).toEqual({ slug: 'busy', label: 'Busy' });
    expect(parseCustomStatusLabel('VIP client')).toEqual({ slug: 'vip_client', label: 'VIP client' });
  });

  it('rejects blank, reserved, and overlong names', () => {
    expect(parseCustomStatusLabel('   ')).toEqual({ error: 'Type a status name first.' });
    expect(parseCustomStatusLabel('New')).toEqual({ error: '"New" is already a built-in status.' });
    expect(parseCustomStatusLabel('Converted')).toEqual({
      error: '"Converted" is already a built-in status.',
    });
    expect(parseCustomStatusLabel('x'.repeat(25))).toEqual({
      error: 'Keep it under 24 characters.',
    });
  });

  it('remembers a new status for that user only', () => {
    const store = memoryStore();
    const saved = rememberCustomStatus('user-a', { slug: 'busy', label: 'Busy' }, store);
    expect(saved).toEqual([{ slug: 'busy', label: 'Busy' }]);
    expect(loadCustomStatuses('user-a', store)).toEqual([{ slug: 'busy', label: 'Busy' }]);
    expect(loadCustomStatuses('user-b', store)).toEqual([]);
  });

  it('does not duplicate an existing slug', () => {
    const store = memoryStore();
    rememberCustomStatus('user-a', { slug: 'busy', label: 'Busy' }, store);
    const again = rememberCustomStatus('user-a', { slug: 'busy', label: 'Busy' }, store);
    expect(again).toEqual([{ slug: 'busy', label: 'Busy' }]);
  });
});

describe('list display columns', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadListDisplay('user-a', memoryStore())).toEqual(DEFAULT_LIST_DISPLAY);
  });

  it('round-trips extra columns per user', () => {
    const store = memoryStore();
    saveListDisplay(
      'user-a',
      { extraKeys: ['email', 'campaign_name'], showSource: false, showValue: true, extrasConfigured: true },
      store,
    );
    expect(loadListDisplay('user-a', store)).toEqual({
      extraKeys: ['email', 'campaign_name'],
      showSource: false,
      showValue: true,
      extrasConfigured: true,
    });
    expect(loadListDisplay('user-b', store)).toEqual(DEFAULT_LIST_DISPLAY);
  });

  it('suggests extras until the user has configured the list', () => {
    const available = ['ad_id', 'email', 'campaign_name', 'is_organic'];
    expect(visibleExtraKeys(available, DEFAULT_LIST_DISPLAY)).toEqual(['email', 'campaign_name']);
    expect(
      visibleExtraKeys(available, {
        extraKeys: [],
        showSource: true,
        showValue: true,
        extrasConfigured: true,
      }),
    ).toEqual([]);
  });
});
