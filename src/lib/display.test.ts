import { describe, expect, it } from 'vitest';
import {
  PRIORITY_STYLES,
  calendarDateKey,
  dateFilterLabel,
  formatCalendarDateLabel,
  formatINR,
  formatSource,
  formatStatus,
  gridStatusAppearance,
  isGridStatusActive,
  leadArrivalDateKey,
  leadMatchesDateFilter,
  localDateKey,
  monthCells,
  monthLabel,
  shiftLocalDateKey,
  shiftYearMonth,
  telLink,
  uniqueLeadDateKeys,
  whatsappNumber,
} from './display';

describe('formatSource', () => {
  it('labels every source the model one-hot encodes', () => {
    expect(formatSource('fb')).toBe('Facebook Ads');
    expect(formatSource('ig')).toBe('Instagram');
    expect(formatSource('google')).toBe('Google Search');
    expect(formatSource('referral')).toBe('Referral');
    expect(formatSource('walkin')).toBe('Walk-in');
    expect(formatSource('other')).toBe('Other');
  });

  it('matches regardless of casing', () => {
    expect(formatSource('FB')).toBe('Facebook Ads');
    expect(formatSource('Referral')).toBe('Referral');
  });

  it('title-cases an unrecognised source instead of showing a raw slug', () => {
    expect(formatSource('linkedin_ads')).toBe('Linkedin Ads');
    expect(formatSource('trade-show')).toBe('Trade Show');
    expect(formatSource('justdial')).toBe('Justdial');
  });

  it('falls back to a dash when there is no source', () => {
    expect(formatSource(null)).toBe('—');
    expect(formatSource('')).toBe('—');
  });
});

describe('formatStatus', () => {
  it('styles the settled outcomes the model trains on', () => {
    expect(formatStatus('won').label).toBe('Converted');
    expect(formatStatus('lost').label).toBe('Not converted');
    expect(formatStatus('no_response').label).toBe('No answer');
  });

  it('styles the open pipeline stages a CRM exports', () => {
    expect(formatStatus('new').label).toBe('New');
    expect(formatStatus('contacted').label).toBe('Contacted');
    expect(formatStatus('follow_up').label).toBe('Follow-up');
    expect(formatStatus('qualified').label).toBe('Qualified');
  });

  // Same separator normalisation as normalizeStatus in csvParser, so a CRM
  // exporting "No Response" is styled as the outcome rather than as unknown.
  it('normalises spaces and hyphens before matching', () => {
    expect(formatStatus('No Response').label).toBe('No answer');
    expect(formatStatus('Follow-Up').label).toBe('Follow-up');
    expect(formatStatus('  WON  ').label).toBe('Converted');
  });

  it('shows an unrecognised status neutrally rather than hiding it', () => {
    const styled = formatStatus('negotiating');
    expect(styled.label).toBe('Negotiating');
    expect(styled.className).toContain('slate');
  });

  it('treats a missing or untouched status as New', () => {
    expect(formatStatus(null).label).toBe('New');
    expect(formatStatus('unknown').label).toBe('New');
    expect(formatStatus('open').label).toBe('New');
  });
});

describe('gridStatusAppearance', () => {
  it('shows Tomorrow when an open lead is snoozed', () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(gridStatusAppearance('unknown', later).label).toBe('Tomorrow');
  });

  it('keeps Converted even if a snooze timestamp is still set', () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(gridStatusAppearance('won', later).label).toBe('Converted');
  });

  it('marks New as the active choice for an untouched lead', () => {
    expect(isGridStatusActive('new', 'unknown', null)).toBe(true);
    expect(isGridStatusActive('new', 'new', null)).toBe(true);
    expect(isGridStatusActive('contacted', 'unknown', null)).toBe(false);
  });
});

describe('formatINR', () => {
  it('groups in lakhs, not thousands', () => {
    expect(formatINR(1000)).toBe('₹1,000');
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1234567)).toBe('₹12,34,567');
  });

  it('rounds to whole rupees', () => {
    expect(formatINR(1999.4)).toBe('₹1,999');
    expect(formatINR(1999.5)).toBe('₹2,000');
  });

  it('handles zero', () => {
    expect(formatINR(0)).toBe('₹0');
  });
});

describe('whatsappNumber', () => {
  it('adds the country code to a bare 10-digit Indian mobile', () => {
    expect(whatsappNumber('9876543210')).toBe('919876543210');
  });

  it('strips formatting before reading the digits', () => {
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210');
    expect(whatsappNumber('(98765) 43210')).toBe('919876543210');
  });

  it('drops the trunk zero from an 11-digit number', () => {
    expect(whatsappNumber('09876543210')).toBe('919876543210');
  });

  it('leaves an already-prefixed number alone', () => {
    expect(whatsappNumber('919876543210')).toBe('919876543210');
  });

  it('passes through a plausible international number', () => {
    expect(whatsappNumber('441234567890')).toBe('441234567890');
  });

  // The caller disables the button on null, so junk must not produce a link.
  it('rejects numbers too short or too long to be real', () => {
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('1234567890123456')).toBeNull();
    expect(whatsappNumber('not a phone')).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe('telLink', () => {
  it('keeps the plus sign and drops everything else', () => {
    expect(telLink('+91 98765-43210')).toBe('tel:+919876543210');
  });

  it('handles a landline with an area code', () => {
    expect(telLink('(022) 4567-8900')).toBe('tel:02245678900');
  });

  it('rejects anything too short to dial', () => {
    expect(telLink('12345')).toBeNull();
    expect(telLink('n/a')).toBeNull();
    expect(telLink('')).toBeNull();
    expect(telLink(null)).toBeNull();
  });
});

describe('lead arrival dates', () => {
  it('uses the local calendar day, not UTC', () => {
    const local = new Date(2026, 8, 19, 22, 15, 0);
    expect(calendarDateKey(local.toISOString())).toBe(localDateKey(local));
  });

  it('prefers created_at_lead over the row insert time', () => {
    expect(
      leadArrivalDateKey({
        created_at_lead: '2026-09-18T10:00:00.000Z',
        created_at: '2026-09-20T10:00:00.000Z',
      }),
    ).toBe(calendarDateKey('2026-09-18T10:00:00.000Z'));
  });

  it('lists unique arrival days newest first', () => {
    const keys = uniqueLeadDateKeys([
      { created_at_lead: '2026-09-18T10:00:00.000Z', created_at: '2026-09-18T10:00:00.000Z' },
      { created_at_lead: '2026-09-19T10:00:00.000Z', created_at: '2026-09-19T10:00:00.000Z' },
      { created_at_lead: '2026-09-19T12:00:00.000Z', created_at: '2026-09-19T12:00:00.000Z' },
    ]);
    expect(keys[0] >= keys[1]).toBe(true);
    expect(keys).toHaveLength(2);
  });

  it('labels a day the way a shop owner reads a calendar', () => {
    expect(formatCalendarDateLabel('2026-09-19')).toMatch(/^19 Sept? 2026$/);
  });

  it('matches Today against the local day key', () => {
    const today = localDateKey(new Date());
    const lead = {
      created_at_lead: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    expect(leadMatchesDateFilter(lead, 'all', today)).toBe(true);
    expect(leadMatchesDateFilter(lead, 'today', today)).toBe(true);
    expect(leadMatchesDateFilter(lead, '1999-01-01', today)).toBe(false);
  });

  it('shifts a calendar key across a month boundary', () => {
    expect(shiftLocalDateKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftLocalDateKey('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('treats Last 7 days as today plus the six days before', () => {
    const today = '2026-09-20';
    const leadOn = (ymd: string) => {
      const [year, month, day] = ymd.split('-').map(Number);
      const iso = new Date(year, month - 1, day, 12, 0, 0).toISOString();
      return { created_at_lead: iso, created_at: iso };
    };
    expect(leadMatchesDateFilter(leadOn('2026-09-20'), '7d', today)).toBe(true);
    expect(leadMatchesDateFilter(leadOn('2026-09-14'), '7d', today)).toBe(true);
    expect(leadMatchesDateFilter(leadOn('2026-09-13'), '7d', today)).toBe(false);
    expect(leadMatchesDateFilter(leadOn('2026-09-19'), 'yesterday', today)).toBe(true);
    expect(leadMatchesDateFilter(leadOn('2026-08-22'), '30d', today)).toBe(true);
    expect(leadMatchesDateFilter(leadOn('2026-08-21'), '30d', today)).toBe(false);
  });

  it('labels presets and a picked day for the toolbar', () => {
    expect(dateFilterLabel('7d')).toBe('Last 7 days');
    expect(dateFilterLabel('2026-09-19')).toMatch(/^19 Sept? 2026$/);
  });

  it('builds a Sunday-first month grid', () => {
    const cells = monthCells(2026, 9);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ ymd: '2026-08-30', day: 30, inMonth: false });
    expect(cells[2]).toEqual({ ymd: '2026-09-01', day: 1, inMonth: true });
    expect(cells[31]).toEqual({ ymd: '2026-09-30', day: 30, inMonth: true });
    expect(monthLabel(2026, 9)).toMatch(/September 2026/);
    expect(shiftYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('PRIORITY_STYLES', () => {
  it('covers every priority the scorer can assign', () => {
    expect(Object.keys(PRIORITY_STYLES).sort()).toEqual(['high', 'low', 'medium']);
  });
});
