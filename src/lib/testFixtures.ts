import type { RawLead } from './csvParser';

/**
 * Shared lead builders for the test suites. Data only — no scoring, parsing or
 * banding logic lives here, so a test can never accidentally assert against a
 * reimplementation of the thing it is testing.
 *
 * `order_value`, `num_orders` and `last_contacted_at` appear here only because
 * RawLead requires them. They are NOT model features and must never become
 * ones: they are recorded as a consequence of conversion, so training on them
 * scores well in backtest while being unable to rank a fresh lead.
 */

export const DAY_MS = 86400000;

/** Fixed instant so every fixture is reproducible and clock-independent. */
export const BASE_TIME = Date.parse('2026-09-01T09:00:00.000Z');

export function makeLead(overrides: Partial<RawLead> = {}): RawLead {
  return {
    lead_id: 'L1',
    name: 'Aarav Sharma',
    phone: '9876543210',
    city: 'Mumbai',
    source: 'fb',
    created_at: new Date(BASE_TIME).toISOString(),
    last_contacted_at: null,
    order_value: 0,
    num_orders: 0,
    status: 'lost',
    ...overrides,
  };
}

/**
 * Perfectly separable by source: every fifth lead is a referral and converted,
 * the rest came from paid social and did not. Ages fan out one day per lead.
 */
export function separableLeads(count = 100): RawLead[] {
  return Array.from({ length: count }, (_, i) => {
    const isReferral = i % 5 === 0;
    return makeLead({
      lead_id: `L${i + 1}`,
      source: isReferral ? 'referral' : 'fb',
      created_at: new Date(BASE_TIME - i * DAY_MS).toISOString(),
      status: isReferral ? 'won' : 'lost',
    });
  });
}

/**
 * Every lead carries identical features, so nothing is learnable and every
 * prediction collapses onto the base rate. Used to prove banding is positional:
 * when all scores are equal, any score-threshold rule must put every lead in
 * the same band.
 */
export function zeroSignalLeads({ count, won }: { count: number; won: number }): RawLead[] {
  return Array.from({ length: count }, (_, i) =>
    makeLead({
      lead_id: `L${i + 1}`,
      status: i < won ? 'won' : 'lost',
    })
  );
}

/** The canonical template header, matching CSV_COLUMNS in csvParser. */
export const CSV_HEADER =
  'lead_id,name,phone,city,source,created_at,last_contacted_at,order_value,num_orders,status';

/**
 * A CSV whose only interesting variable is the status column, for exercising the
 * upload pipeline's validation. An empty array yields a headers-only file, which
 * is what the downloaded template looks like before anyone fills it in.
 */
export function csvWithStatuses(statuses: string[]): string {
  const rows = statuses.map((status, i) => {
    const day = String((i % 28) + 1).padStart(2, '0');
    return [
      `L${i + 1}`,
      `Lead ${i + 1}`,
      '9876543210',
      'Mumbai',
      i % 2 === 0 ? 'fb' : 'referral',
      `2026-09-${day}T09:00:00.000Z`,
      '',
      '0',
      '0',
      status,
    ].join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}

/** A labelled set of an exact shape, for probing the training thresholds. */
export function labelledLeads({
  won,
  lost,
  open = 0,
}: {
  won: number;
  lost: number;
  open?: number;
}): RawLead[] {
  const leads: RawLead[] = [];
  let n = 0;
  const push = (status: string, source: string) => {
    leads.push({
      ...makeLead({ lead_id: `L${++n}`, status, source }),
      created_at: new Date(BASE_TIME - n * DAY_MS).toISOString(),
    });
  };

  for (let i = 0; i < won; i++) push('won', 'referral');
  for (let i = 0; i < lost; i++) push('lost', 'fb');
  for (let i = 0; i < open; i++) push('new', 'fb');
  return leads;
}
