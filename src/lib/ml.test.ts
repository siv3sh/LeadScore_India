import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawLead } from './csvParser';
import {
  computeAUC,
  engineerFeatures,
  predict,
  scoreLeads,
  sigmoid,
  trainLogisticRegression,
} from './ml';

const DAY_MS = 86400000;
const BASE = Date.parse('2026-09-01T09:00:00.000Z');

function lead(overrides: Partial<RawLead> = {}): RawLead {
  return {
    lead_id: 'L1',
    name: 'Aarav Sharma',
    phone: '9876543210',
    city: 'Mumbai',
    source: 'fb',
    created_at: new Date(BASE).toISOString(),
    last_contacted_at: null,
    order_value: 0,
    num_orders: 0,
    status: 'lost',
    ...overrides,
  };
}

/** Perfectly separable: referrals convert, everything else does not. */
function separableLeads(count = 100): RawLead[] {
  return Array.from({ length: count }, (_, i) => {
    const isReferral = i % 5 === 0;
    return lead({
      lead_id: `L${i + 1}`,
      source: isReferral ? 'referral' : 'fb',
      created_at: new Date(BASE - i * DAY_MS).toISOString(),
      status: isReferral ? 'won' : 'lost',
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sigmoid', () => {
  it('is 0.5 at zero', () => {
    expect(sigmoid(0)).toBe(0.5);
  });

  it('is symmetric about zero', () => {
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 12);
  });

  // The two-branch form exists to stop Math.exp overflowing to Infinity.
  it('saturates without overflowing', () => {
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(Number.isNaN(sigmoid(-1000))).toBe(false);
    expect(Number.isNaN(sigmoid(1000))).toBe(false);
  });
});

describe('computeAUC', () => {
  it('is 1 for a perfect ranking', () => {
    expect(computeAUC([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
  });

  it('is 0 for a perfectly inverted ranking', () => {
    expect(computeAUC([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
  });

  it('matches a hand-computed value', () => {
    expect(computeAUC([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBeCloseTo(0.75, 10);
  });

  // Mid-ranks for ties are the whole reason a degenerate model reports 0.50
  // rather than looking like a perfect ranking.
  it('is 0.5 when every prediction is identical', () => {
    expect(computeAUC([0.3, 0.3, 0.3, 0.3, 0.3, 0.3], [1, 0, 1, 0, 1, 0])).toBe(0.5);
  });

  it('is 0.5 for a single tied pair', () => {
    expect(computeAUC([0.5, 0.5], [1, 0])).toBe(0.5);
  });

  it('is 0.5 when only one class is present', () => {
    expect(computeAUC([0.1, 0.9], [1, 1])).toBe(0.5);
    expect(computeAUC([0.1, 0.9], [0, 0])).toBe(0.5);
  });
});

describe('engineerFeatures', () => {
  it('produces the documented feature vector: 6 signals plus 6 one-hot sources', () => {
    expect(engineerFeatures(lead(), BASE)).toHaveLength(12);
  });

  it('one-hot encodes a known source', () => {
    const features = engineerFeatures(lead({ source: 'referral' }), BASE);
    expect(features.slice(6)).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it('is case- and whitespace-insensitive about source', () => {
    expect(engineerFeatures(lead({ source: '  Referral ' }), BASE).slice(6)).toEqual([
      0, 0, 0, 1, 0, 0,
    ]);
  });

  it('encodes an unrecognised source as all zeros', () => {
    expect(engineerFeatures(lead({ source: 'justdial' }), BASE).slice(6)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('measures age against the reference time, not the wall clock', () => {
    const tenDaysOld = lead({ created_at: new Date(BASE - 10 * DAY_MS).toISOString() });
    expect(engineerFeatures(tenDaysOld, BASE)[0]).toBeCloseTo(Math.log1p(10), 10);
  });

  it('never reports a negative age for a lead dated in the future', () => {
    const future = lead({ created_at: new Date(BASE + 5 * DAY_MS).toISOString() });
    expect(engineerFeatures(future, BASE)[0]).toBe(0);
  });

  it('flags a missing or unparseable date instead of guessing', () => {
    expect(engineerFeatures(lead({ created_at: '' }), BASE)[5]).toBe(1);
    expect(engineerFeatures(lead({ created_at: 'No' }), BASE)[5]).toBe(1);
    expect(engineerFeatures(lead(), BASE)[5]).toBe(0);
  });

  it('keeps cyclical time encodings on the unit circle', () => {
    const [, sinHour, cosHour, sinDay, cosDay] = engineerFeatures(lead(), BASE);
    expect(sinHour ** 2 + cosHour ** 2).toBeCloseTo(1, 10);
    expect(sinDay ** 2 + cosDay ** 2).toBeCloseTo(1, 10);
  });

  // The leakage guard. order_value, num_orders and last_contacted_at are
  // recorded as a consequence of the outcome, so a model trained on them scores
  // ~0.9 in backtest and cannot rank a fresh lead, which has none of them.
  // If this test fails, someone has reintroduced the bug we removed.
  it('ignores the outcome columns entirely', () => {
    const fresh = lead({ order_value: 0, num_orders: 0, last_contacted_at: null });
    const converted = lead({
      order_value: 45000,
      num_orders: 7,
      last_contacted_at: new Date(BASE).toISOString(),
    });
    expect(engineerFeatures(converted, BASE)).toEqual(engineerFeatures(fresh, BASE));
  });

  it('ignores status, which is the label', () => {
    expect(engineerFeatures(lead({ status: 'won' }), BASE)).toEqual(
      engineerFeatures(lead({ status: 'lost' }), BASE)
    );
  });
});

describe('trainLogisticRegression', () => {
  it('learns a separable pattern', () => {
    const features = [[0], [0], [0], [0], [1], [1], [1], [1]];
    const labels = [0, 0, 0, 0, 1, 1, 1, 1];
    const model = trainLogisticRegression(features, labels);

    expect(predict(model, [1])).toBeGreaterThan(0.5);
    expect(predict(model, [0])).toBeLessThan(0.5);
  });

  // The bias starts at the base-rate log-odds, so a model with nothing to learn
  // from returns the base rate rather than drifting to 0.5.
  it('is calibrated to the base rate when no feature carries signal', () => {
    const features = Array.from({ length: 10 }, () => [1, 1]);
    const labels = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
    const model = trainLogisticRegression(features, labels);

    expect(predict(model, [1, 1])).toBeCloseTo(0.3, 6);
  });

  it('does not produce NaN when a feature column is constant', () => {
    const features = [[1, 0], [1, 1], [1, 0], [1, 1]];
    const model = trainLogisticRegression(features, [0, 1, 0, 1]);

    expect(model.weights.every((w) => Number.isFinite(w))).toBe(true);
    expect(Number.isFinite(model.bias)).toBe(true);
    expect(Number.isNaN(predict(model, [1, 1]))).toBe(false);
  });

  it('returns probabilities inside [0, 1]', () => {
    const model = trainLogisticRegression([[0], [1], [2], [3]], [0, 0, 1, 1]);
    for (const x of [-100, 0, 1.5, 100]) {
      const p = predict(model, [x]);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoreLeads', () => {
  it('scores every lead and keeps the input order', () => {
    const leads = separableLeads();
    const { scoredLeads } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(leads.length);
    expect(scoredLeads.map((l) => l.lead_id)).toEqual(leads.map((l) => l.lead_id));
  });

  it('produces a whole-number score in range with an action for each lead', () => {
    for (const scored of scoreLeads(separableLeads()).scoredLeads) {
      expect(Number.isInteger(scored.score_0_100)).toBe(true);
      expect(scored.score_0_100).toBeGreaterThanOrEqual(0);
      expect(scored.score_0_100).toBeLessThanOrEqual(100);
      expect(scored.conversion_probability).toBeGreaterThanOrEqual(0);
      expect(scored.conversion_probability).toBeLessThanOrEqual(1);
      expect(scored.suggested_action.length).toBeGreaterThan(0);
    }
  });

  // Re-uploading the same file must not reshuffle someone's call list, which is
  // why the fold shuffle is seeded.
  it('is deterministic across runs', () => {
    const first = scoreLeads(separableLeads()).scoredLeads.map((l) => l.score_0_100);
    const second = scoreLeads(separableLeads()).scoredLeads.map((l) => l.score_0_100);
    expect(second).toEqual(first);
  });

  // Age is measured against the newest lead in the file, so scores must not
  // drift as the calendar moves.
  it('does not depend on the current date', () => {
    const before = scoreLeads(separableLeads()).scoredLeads.map((l) => l.score_0_100);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2029-01-01T00:00:00.000Z'));
    const after = scoreLeads(separableLeads()).scoredLeads.map((l) => l.score_0_100);

    expect(after).toEqual(before);
  });

  // Bands are relative to the batch: 20% high, 30% medium, the rest low.
  it('assigns priorities by rank, not by absolute score', () => {
    const { scoredLeads } = scoreLeads(separableLeads(100));
    const counts = { high: 0, medium: 0, low: 0 };
    for (const scored of scoredLeads) counts[scored.priority]++;

    expect(counts).toEqual({ high: 20, medium: 30, low: 50 });
  });

  it('gives the highest scores the high-priority band', () => {
    const { scoredLeads } = scoreLeads(separableLeads(100));
    const high = scoredLeads.filter((l) => l.priority === 'high');
    const low = scoredLeads.filter((l) => l.priority === 'low');

    expect(Math.min(...high.map((l) => l.score_0_100))).toBeGreaterThanOrEqual(
      Math.max(...low.map((l) => l.score_0_100))
    );
  });

  it('pairs each priority with its outreach action', () => {
    const { scoredLeads } = scoreLeads(separableLeads());
    const actionFor = (priority: string) =>
      scoredLeads.find((l) => l.priority === priority)?.suggested_action;

    expect(actionFor('high')).toBe('Call today');
    expect(actionFor('medium')).toContain('WhatsApp');
    expect(actionFor('low')).toContain('Nurture');
  });

  it('ranks a genuine pattern well above chance', () => {
    const { metrics, warnings } = scoreLeads(separableLeads());
    expect(metrics.auc).toBeGreaterThan(0.9);
    expect(metrics.trainSize).toBe(100);
    expect(warnings.join(' ')).not.toContain('no reliable pattern');
  });

  it('scores open leads but leaves them out of training', () => {
    const leads = [...separableLeads(60), ...Array.from({ length: 15 }, () => lead({ status: 'new' }))];
    const { scoredLeads, metrics, warnings } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(75);
    expect(metrics.trainSize).toBe(60);
    expect(warnings.join(' ')).toContain('15 leads have no settled outcome');
  });

  it('warns and says so when there is no pattern to find', () => {
    // Identical features with alternating labels: nothing is learnable, so every
    // prediction ties and the AUC lands exactly on chance.
    const leads = Array.from({ length: 40 }, (_, i) =>
      lead({ lead_id: `L${i + 1}`, status: i % 2 === 0 ? 'won' : 'lost' })
    );
    const { metrics, warnings } = scoreLeads(leads);

    expect(metrics.auc).toBe(0.5);
    expect(warnings.join(' ')).toContain('no reliable pattern');
  });

  it('falls back to a heuristic when there is too little labelled data', () => {
    const leads = [
      lead({ lead_id: 'L1', source: 'referral', status: 'won' }),
      lead({ lead_id: 'L2', source: 'fb', status: 'lost' }),
      lead({ lead_id: 'L3', source: 'fb', status: 'new' }),
    ];
    const { scoredLeads, metrics, warnings } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(3);
    expect(metrics.trainSize).toBe(0);
    expect(warnings.join(' ')).toContain('too few to train on');
    for (const scored of scoredLeads) {
      expect(scored.priority).toBeTruthy();
    }
  });

  it('falls back when every settled lead has the same outcome', () => {
    const leads = Array.from({ length: 20 }, (_, i) => lead({ lead_id: `L${i}`, status: 'won' }));
    const { metrics, warnings } = scoreLeads(leads);

    expect(metrics.trainSize).toBe(0);
    expect(warnings.join(' ')).toContain('too few to train on');
  });

  it('ranks referrals above paid social in the heuristic fallback', () => {
    const leads = [
      lead({ lead_id: 'paid', source: 'fb', status: 'won' }),
      lead({ lead_id: 'ref', source: 'referral', status: 'lost' }),
    ];
    const byId = new Map(scoreLeads(leads).scoredLeads.map((l) => [l.lead_id, l.score_0_100]));

    expect(byId.get('ref')!).toBeGreaterThan(byId.get('paid')!);
  });

  it('explains why the order columns were ignored when they encode the outcome', () => {
    const leads = [
      ...Array.from({ length: 12 }, (_, i) =>
        lead({ lead_id: `w${i}`, status: 'won', num_orders: 2, order_value: 4000 })
      ),
      ...Array.from({ length: 10 }, (_, i) => lead({ lead_id: `l${i}`, status: 'lost' })),
    ];

    expect(scoreLeads(leads).warnings.join(' ')).toContain('reveal the outcome');
  });

  it('stays quiet about the order columns when they do not give the answer away', () => {
    const leads = [
      ...Array.from({ length: 12 }, (_, i) =>
        lead({ lead_id: `w${i}`, status: 'won', num_orders: 2, order_value: 4000 })
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        lead({ lead_id: `l${i}`, status: 'lost', num_orders: 1, order_value: 2000 })
      ),
    ];

    expect(scoreLeads(leads).warnings.join(' ')).not.toContain('reveal the outcome');
  });

  it('handles a single lead without crashing', () => {
    const { scoredLeads } = scoreLeads([lead({ status: 'won' })]);
    expect(scoredLeads).toHaveLength(1);
    expect(scoredLeads[0].priority).toBe('high');
  });

  it('handles an empty file without crashing', () => {
    const result = scoreLeads([]);
    expect(result.scoredLeads).toEqual([]);
    expect(Number.isFinite(result.metrics.auc)).toBe(true);
  });

  it('handles leads with no usable dates', () => {
    const leads = Array.from({ length: 12 }, (_, i) =>
      lead({ lead_id: `L${i}`, created_at: '', status: i % 3 === 0 ? 'won' : 'lost' })
    );
    const { scoredLeads } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(12);
    for (const scored of scoredLeads) {
      expect(Number.isNaN(scored.conversion_probability)).toBe(false);
    }
  });
});
