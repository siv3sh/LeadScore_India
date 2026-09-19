import { describe, expect, it } from 'vitest';
import {
  RESOLVED_STATUSES,
  SOURCES,
  generateSampleCSV,
  generateTemplateCSV,
  guessColumnMapping,
  mapRowsToLeadsWithHeaders,
  normalizeStatus,
  parseCSV,
  summarizeStatuses,
  validateLeadsForScoring,
  type ColumnMapping,
  type RawLead,
} from './csvParser';
import { engineerFeatures } from './ml';
import { BASE_TIME, makeLead } from './testFixtures';

const TEMPLATE_HEADERS = [
  'lead_id',
  'name',
  'phone',
  'city',
  'source',
  'created_at',
  'last_contacted_at',
  'order_value',
  'num_orders',
  'status',
];

describe('parseCSV', () => {
  it('lowercases and trims headers so mapping is case-insensitive', () => {
    const { headers } = parseCSV('  Name , PHONE ,Status\nA,1,won');
    expect(headers).toEqual(['name', 'phone', 'status']);
  });

  it('keeps commas inside quoted fields', () => {
    const { rows } = parseCSV('name,phone,status\n"Sharma, Aarav",9876543210,won');
    expect(rows[0]).toEqual(['Sharma, Aarav', '9876543210', 'won']);
  });

  it('unescapes doubled quotes', () => {
    const { rows } = parseCSV('name,note\nRiya,"She said ""yes"" twice"');
    expect(rows[0][1]).toBe('She said "yes" twice');
  });

  it('handles CRLF line endings from Excel exports', () => {
    const { headers, rows } = parseCSV('name,status\r\nRiya,won\r\nAarav,lost');
    expect(headers).toEqual(['name', 'status']);
    expect(rows).toHaveLength(2);
  });

  it('skips blank lines rather than emitting empty leads', () => {
    const { rows } = parseCSV('name,status\nRiya,won\n\n   \nAarav,lost\n');
    expect(rows).toHaveLength(2);
  });

  it('throws on an empty file', () => {
    expect(() => parseCSV('')).toThrow('CSV file is empty');
    expect(() => parseCSV('   \n  ')).toThrow('CSV file is empty');
  });

  // The downloaded template is headers-only; the upload step relies on this
  // producing zero rows rather than throwing.
  it('returns no rows for a header-only file', () => {
    const { headers, rows } = parseCSV('name,phone,status');
    expect(headers).toHaveLength(3);
    expect(rows).toHaveLength(0);
  });
});

describe('normalizeStatus', () => {
  // RESOLVED_STATUSES are underscored, so a CRM exporting "No Response" has to
  // normalise to a trainable outcome instead of looking like an open stage.
  it('maps every realistic spelling of no_response onto one value', () => {
    for (const spelling of [
      'No Response',
      'no-response',
      ' NO_RESPONSE ',
      'no response',
      'No-Response',
      'NO   RESPONSE',
      'no_response',
    ]) {
      expect(normalizeStatus(spelling)).toBe('no_response');
    }
  });

  it('collapses separators to underscores', () => {
    expect(normalizeStatus('Follow-Up')).toBe('follow_up');
    expect(normalizeStatus('follow   up')).toBe('follow_up');
    expect(normalizeStatus('Closed - Won')).toBe('closed_won');
  });

  it('lowercases and trims', () => {
    expect(normalizeStatus('  WON  ')).toBe('won');
    expect(normalizeStatus('Lost')).toBe('lost');
  });

  // "Closed Won" is a real CRM value that does NOT normalise to 'won', so it is
  // treated as an open stage and dropped from training. Documented, not fixed.
  it('does not infer an outcome from a compound stage name', () => {
    expect(RESOLVED_STATUSES).not.toContain(normalizeStatus('Closed Won'));
  });

  it('treats a blank status as unknown', () => {
    expect(normalizeStatus('')).toBe('unknown');
    expect(normalizeStatus('   ')).toBe('unknown');
  });
});

describe('guessColumnMapping', () => {
  it('maps every column of our own template', () => {
    const mapping = guessColumnMapping(TEMPLATE_HEADERS);
    expect(mapping).toEqual({
      lead_id: 'lead_id',
      name: 'name',
      phone: 'phone',
      city: 'city',
      source: 'source',
      created_at: 'created_at',
      last_contacted_at: 'last_contacted_at',
      order_value: 'order_value',
      num_orders: 'num_orders',
      status: 'status',
    });
  });

  it('recognises common CRM aliases', () => {
    const mapping = guessColumnMapping([
      'customer',
      'mobile',
      'channel',
      'town',
      'lead_date',
      'revenue',
      'purchases',
      'outcome',
    ]);
    expect(mapping.name).toBe('customer');
    expect(mapping.phone).toBe('mobile');
    expect(mapping.source).toBe('channel');
    expect(mapping.city).toBe('town');
    expect(mapping.created_at).toBe('lead_date');
    expect(mapping.order_value).toBe('revenue');
    expect(mapping.num_orders).toBe('purchases');
    expect(mapping.status).toBe('outcome');
  });

  it('falls back to the first two columns for name and phone', () => {
    const mapping = guessColumnMapping(['col_a', 'col_b', 'col_c']);
    expect(mapping.name).toBe('col_a');
    expect(mapping.phone).toBe('col_b');
  });

  it('leaves last_contacted_at unmapped when the file has no such column', () => {
    expect(guessColumnMapping(['name', 'phone', 'status']).last_contacted_at).toBeUndefined();
  });

});

/**
 * Characterisation tests: these lock in today's WRONG answers so a future fix
 * has a baseline to diff against. They are not statements of desired behaviour.
 *
 * The cause is in guessColumnMapping's matcher, which scans headers in file
 * order and takes the first header containing ANY candidate substring, rather
 * than scanning candidates in priority order. A decoy column therefore wins
 * whenever it happens to sit to the left of the real one.
 *
 * When this is fixed, every expectation below should flip to the value named in
 * its comment, and these tests will fail until they are updated. That failure is
 * the intended signal.
 */
describe('guessColumnMapping known misfires (current behaviour, not desired)', () => {
  it('picks a "lead origin" decoy over the real "lead source"', () => {
    // Should be 'lead source'.
    expect(guessColumnMapping(['name', 'phone', 'lead origin', 'lead source']).source).toBe(
      'lead origin'
    );
  });

  it('matches "date" inside an unrelated "updates" column', () => {
    // Should be 'created_at'.
    expect(guessColumnMapping(['name', 'phone', 'updates', 'created_at']).created_at).toBe(
      'updates'
    );
  });

  it('matches the bare "id" candidate inside an unrelated column', () => {
    // Should be undefined, or 'lead_id' when one is present.
    expect(guessColumnMapping(['valid_email', 'name', 'phone']).lead_id).toBe('valid_email');
  });

  it('lets an "amount" column win over an explicit "order_value"', () => {
    // Should be 'order_value'.
    expect(
      guessColumnMapping(['name', 'phone', 'discount_amount', 'order_value']).order_value
    ).toBe('discount_amount');
  });
});

describe('mapRowsToLeadsWithHeaders', () => {
  const mapping = guessColumnMapping(TEMPLATE_HEADERS);

  function mapOne(row: string[]): RawLead {
    return mapRowsToLeadsWithHeaders(TEMPLATE_HEADERS, [row], mapping)[0];
  }

  it('maps a well-formed row', () => {
    const result = mapOne([
      'L7',
      'Riya Das',
      '+91 98765 43210',
      'Kochi',
      'Referral',
      '2026-09-01',
      '2026-09-10',
      '1299.50',
      '2',
      'Won',
    ]);
    expect(result).toEqual({
      lead_id: 'L7',
      name: 'Riya Das',
      phone: '+91 98765 43210',
      city: 'Kochi',
      source: 'referral',
      created_at: '2026-09-01T00:00:00.000Z',
      last_contacted_at: '2026-09-10T00:00:00.000Z',
      order_value: 1299.5,
      num_orders: 2,
      status: 'won',
    });
  });

  // This is the crash that reached production: a Yes/No column mapped onto a
  // timestamptz field sent the literal string "No" to Postgres.
  it('never emits an unparseable timestamp', () => {
    const result = mapOne(['L1', 'Riya', '1', 'Kochi', 'fb', 'No', 'No', '0', '0', 'won']);
    expect(Number.isNaN(new Date(result.created_at).getTime())).toBe(false);
    expect(result.last_contacted_at).toBeNull();
  });

  // A 0/1 flag column would otherwise parse as the year 0 or 1.
  it('rejects short numeric values as dates', () => {
    expect(mapOne(['L1', 'R', '1', '', 'fb', '2026-09-01', '0', '0', '0', 'won'])
      .last_contacted_at).toBeNull();
    expect(mapOne(['L1', 'R', '1', '', 'fb', '2026-09-01', '1', '0', '0', 'won'])
      .last_contacted_at).toBeNull();
    expect(mapOne(['L1', 'R', '1', '', 'fb', '2026-09-01', '999', '0', '0', 'won'])
      .last_contacted_at).toBeNull();
  });

  it('strips currency formatting from order value', () => {
    expect(mapOne(['L1', 'R', '1', '', 'fb', '2026-09-01', '', '₹1,299.50', '0', 'won'])
      .order_value).toBe(1299.5);
  });

  it('defaults unparseable numbers to zero rather than NaN', () => {
    const result = mapOne(['L1', 'R', '1', '', 'fb', '2026-09-01', '', 'n/a', 'three', 'won']);
    expect(result.order_value).toBe(0);
    expect(result.num_orders).toBe(0);
  });

  it('fills in defaults for missing values', () => {
    const result = mapOne(['', '', '', '', '', '', '', '', '', '']);
    expect(result.lead_id).toBe('lead_1');
    expect(result.name).toBe('Unknown');
    expect(result.phone).toBe('');
    expect(result.city).toBe('');
    expect(result.source).toBe('other');
    expect(result.status).toBe('unknown');
  });

  it('survives a row with fewer cells than there are headers', () => {
    const result = mapOne(['L1', 'Riya']);
    expect(result.name).toBe('Riya');
    expect(result.source).toBe('other');
    expect(result.order_value).toBe(0);
  });

  it('numbers generated lead ids by row', () => {
    const leads = mapRowsToLeadsWithHeaders(
      TEMPLATE_HEADERS,
      [['', 'A'], ['', 'B'], ['', 'C']],
      mapping
    );
    expect(leads.map((l) => l.lead_id)).toEqual(['lead_1', 'lead_2', 'lead_3']);
  });
});

describe('summarizeStatuses', () => {
  const headers = ['name', 'status'];
  const rows = [
    ['A', 'Won'],
    ['B', 'won'],
    ['C', 'No Response'],
    ['D', 'Follow Up'],
    ['E', 'Follow Up'],
    ['F', 'Follow Up'],
    ['G', ''],
  ];

  it('splits settled outcomes from open stages', () => {
    const summary = summarizeStatuses(headers, rows, 'status');
    expect(summary.trainable).toEqual([
      { value: 'won', count: 2 },
      { value: 'no_response', count: 1 },
    ]);
    expect(summary.open).toEqual([
      { value: 'follow_up', count: 3 },
      { value: 'unknown', count: 1 },
    ]);
    expect(summary.wonCount).toBe(2);
  });

  it('reports nothing when the status column is unmapped or missing', () => {
    const empty = { trainable: [], open: [], wonCount: 0 };
    expect(summarizeStatuses(headers, rows, undefined)).toEqual(empty);
    expect(summarizeStatuses(headers, rows, 'nonexistent')).toEqual(empty);
  });
});

describe('validateLeadsForScoring', () => {
  it('accepts a file with a genuine mix of outcomes', () => {
    const result = validateLeadsForScoring([
      makeLead({ status: 'won' }),
      makeLead({ status: 'lost' }),
      makeLead({ status: 'no_response' }),
    ]);
    expect(result.error).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  // The label is derived from converted status (`won` in CSV), so without one
  // the model trains on an all-zero target and scores every lead identically.
  it('rejects a file with no converted leads', () => {
    const result = validateLeadsForScoring([makeLead({ status: 'lost' }), makeLead({ status: 'new' })]);
    expect(result.error).toContain('No leads are marked as converted');
  });

  it('warns when there are no negative examples to contrast against', () => {
    const result = validateLeadsForScoring([makeLead({ status: 'won' }), makeLead({ status: 'new' })]);
    expect(result.error).toBeNull();
    expect(result.warnings.join(' ')).toContain('no examples of a lead that did not convert');
  });

  it('does not warn when every source is one the model encodes', () => {
    const result = validateLeadsForScoring([
      makeLead({ status: 'won', source: 'fb' }),
      makeLead({ status: 'lost', source: 'ig' }),
      makeLead({ status: 'lost', source: 'google' }),
      makeLead({ status: 'no_response', source: 'referral' }),
      makeLead({ status: 'lost', source: 'walkin' }),
      makeLead({ status: 'lost', source: 'other' }),
    ]);
    expect(result.error).toBeNull();
    expect(result.warnings.join(' ')).not.toMatch(/source/i);
  });

  // Real CRM exports mix "fb" with "Facebook" / "Website Referral". Previously we
  // only warned when EVERY source was unrecognised, so this common case was silent.
  it('warns with the count of unrecognised sources even when some rows are valid', () => {
    const leads = [
      makeLead({ status: 'won', source: 'fb' }),
      makeLead({ status: 'lost', source: 'facebook' }),
      makeLead({ status: 'lost', source: 'referral' }),
      makeLead({ status: 'lost', source: 'website referral' }),
    ];
    const result = validateLeadsForScoring(leads);
    expect(result.error).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('2 of 4 leads (50%)');
    expect(result.warnings[0]).toContain('facebook');
    expect(result.warnings[0]).toContain('website referral');
  });

  it('still warns when every source is unrecognised', () => {
    const result = validateLeadsForScoring([
      makeLead({ status: 'won', source: 'justdial' }),
      makeLead({ status: 'lost', source: 'justdial' }),
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('2 of 2 leads (100%)');
    expect(result.warnings[0]).toContain('justdial');
  });

  it('counts unrecognised sources per row, not per distinct value', () => {
    const result = validateLeadsForScoring([
      makeLead({ status: 'won', source: 'fb' }),
      makeLead({ status: 'lost', source: 'facebook' }),
      makeLead({ status: 'lost', source: 'facebook' }),
      makeLead({ status: 'lost', source: 'referral' }),
    ]);
    expect(result.warnings[0]).toContain('2 of 4 leads (50%)');
    expect(result.warnings[0].match(/facebook/g)).toHaveLength(1);
  });

  it('one-hot encodes unrecognised sources as all zeros without changing valid rows', () => {
    const fb = makeLead({ source: 'fb' });
    const facebook = makeLead({ source: 'facebook' });
    const referral = makeLead({ source: 'referral' });
    const website = makeLead({ source: 'website referral' });

    expect(engineerFeatures(fb, BASE_TIME).slice(6)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(engineerFeatures(referral, BASE_TIME).slice(6)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(engineerFeatures(facebook, BASE_TIME).slice(6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(engineerFeatures(website, BASE_TIME).slice(6)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('generateTemplateCSV', () => {
  it('is the header row on its own, with no example data to delete', () => {
    const csv = generateTemplateCSV();
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toBe(TEMPLATE_HEADERS.join(','));
  });
});

describe('generateSampleCSV', () => {
  const csv = generateSampleCSV();

  it('uses the same columns as the template', () => {
    expect(parseCSV(csv).headers).toEqual(TEMPLATE_HEADERS);
  });

  it('carries 50 demo leads with no ragged rows', () => {
    const { rows } = parseCSV(csv);
    expect(rows).toHaveLength(50);
    for (const row of rows) {
      expect(row).toHaveLength(TEMPLATE_HEADERS.length);
    }
  });

  it('only uses source and status values the scorer understands', () => {
    const { headers, rows } = parseCSV(csv);
    const leads = mapRowsToLeadsWithHeaders(headers, rows, guessColumnMapping(headers));
    for (const l of leads) {
      expect(SOURCES).toContain(l.source);
      expect([...RESOLVED_STATUSES, 'unknown']).toContain(l.status);
    }
  });

  it('round-trips into leads with valid timestamps', () => {
    const { headers, rows } = parseCSV(csv);
    const leads = mapRowsToLeadsWithHeaders(headers, rows, guessColumnMapping(headers));
    expect(leads).toHaveLength(50);
    for (const l of leads) {
      expect(Number.isNaN(new Date(l.created_at).getTime())).toBe(false);
      expect(Number.isFinite(l.order_value)).toBe(true);
    }
  });
});

describe('column constants', () => {
  // ml.ts keeps its own copy of the resolved-status set; a change here without a
  // matching change there silently drops rows from training.
  it('lists the settled outcomes the scorer trains on', () => {
    expect(RESOLVED_STATUSES).toEqual(['won', 'lost', 'no_response']);
  });

  it('lists the sources the model one-hot encodes', () => {
    expect(SOURCES).toEqual(['fb', 'ig', 'google', 'referral', 'walkin', 'other']);
  });
});

describe('ColumnMapping shape', () => {
  it('requires the columns the scorer cannot work without', () => {
    const mapping: ColumnMapping = {
      name: 'name',
      phone: 'phone',
      source: 'source',
      created_at: 'created_at',
      order_value: 'order_value',
      num_orders: 'num_orders',
      status: 'status',
    };
    expect(Object.keys(mapping)).toHaveLength(7);
  });
});
