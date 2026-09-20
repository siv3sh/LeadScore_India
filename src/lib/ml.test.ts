import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateLeadsForScoring } from './csvParser';
import {
  computeAUC,
  engineerFeatures,
  predict,
  scoreLeads,
  sigmoid,
  trainLogisticRegression,
} from './ml';
import {
  BASE_TIME,
  DAY_MS,
  labelledLeads,
  makeLead,
  separableLeads,
  zeroSignalLeads,
} from './testFixtures';

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
  /**
   * 14 rows, 6 positive and 8 negative, all probabilities distinct.
   *
   * Mann-Whitney U counts, for each positive, the negatives it outranks:
   *   0.95 > all 8                              -> 8
   *   0.80 > .75 .60 .45 .30 .25 .15 .10        -> 7
   *   0.65 > .60 .45 .30 .25 .15 .10            -> 6
   *   0.50 > .45 .30 .25 .15 .10                -> 5
   *   0.35 > .30 .25 .15 .10                    -> 4
   *   0.20 > .15 .10                            -> 2
   *   U = 32,  AUC = 32 / (6 x 8) = 2/3
   */
  it('matches a hand-computed Mann-Whitney U on 14 distinct scores', () => {
    const probabilities = [
      0.95, 0.9, 0.8, 0.75, 0.65, 0.6, 0.5, 0.45, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1,
    ];
    const labels = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0];

    expect(probabilities).toHaveLength(14);
    expect(computeAUC(probabilities, labels)).toBeCloseTo(2 / 3, 12);
  });

  /**
   * 12 rows with deliberate ties, so mid-rank handling is what decides the
   * answer. A tied pair contributes 0.5 instead of 1:
   *   pos 0.7 -> 6 below, 1 tied  -> 6.5
   *   pos 0.5 -> 4 below, 2 tied  -> 5.0
   *   pos 0.5 -> 4 below, 2 tied  -> 5.0
   *   pos 0.3 -> 2 below, 1 tied  -> 2.5
   *   U = 19,  AUC = 19 / (4 x 8) = 0.59375
   */
  it('gives tied scores mid-ranks on a hand-computed 12-row case', () => {
    const probabilities = [0.9, 0.7, 0.7, 0.5, 0.5, 0.5, 0.5, 0.4, 0.3, 0.3, 0.2, 0.1];
    const labels = [0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0];

    expect(probabilities).toHaveLength(12);
    expect(computeAUC(probabilities, labels)).toBeCloseTo(0.59375, 12);
  });

  it('is 1 for a perfect ranking', () => {
    expect(computeAUC([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
  });

  it('is 0 for a perfectly inverted ranking', () => {
    expect(computeAUC([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
  });

  it('matches a hand-computed value on a minimal case', () => {
    expect(computeAUC([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBeCloseTo(0.75, 12);
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
    expect(engineerFeatures(makeLead(), BASE_TIME)).toHaveLength(12);
  });

  it('one-hot encodes a known source', () => {
    expect(engineerFeatures(makeLead({ source: 'referral' }), BASE_TIME).slice(6)).toEqual([
      0, 0, 0, 1, 0, 0,
    ]);
  });

  it('is case- and whitespace-insensitive about source', () => {
    expect(engineerFeatures(makeLead({ source: '  Referral ' }), BASE_TIME).slice(6)).toEqual([
      0, 0, 0, 1, 0, 0,
    ]);
  });

  it('measures age with log1p against the reference time, not the wall clock', () => {
    const tenDaysOld = makeLead({ created_at: new Date(BASE_TIME - 10 * DAY_MS).toISOString() });
    expect(engineerFeatures(tenDaysOld, BASE_TIME)[0]).toBeCloseTo(Math.log1p(10), 12);
  });

  it('never reports a negative age for a lead dated in the future', () => {
    const future = makeLead({ created_at: new Date(BASE_TIME + 5 * DAY_MS).toISOString() });
    expect(engineerFeatures(future, BASE_TIME)[0]).toBe(0);
  });

  it('flags a missing or unparseable date instead of guessing', () => {
    expect(engineerFeatures(makeLead({ created_at: '' }), BASE_TIME)[5]).toBe(1);
    expect(engineerFeatures(makeLead({ created_at: 'No' }), BASE_TIME)[5]).toBe(1);
    expect(engineerFeatures(makeLead(), BASE_TIME)[5]).toBe(0);
  });

  it('keeps cyclical time encodings on the unit circle', () => {
    const [, sinHour, cosHour, sinDay, cosDay] = engineerFeatures(makeLead(), BASE_TIME);
    expect(sinHour ** 2 + cosHour ** 2).toBeCloseTo(1, 12);
    expect(sinDay ** 2 + cosDay ** 2).toBeCloseTo(1, 12);
  });

  // The leakage guard. order_value, num_orders and last_contacted_at are
  // recorded as a consequence of the outcome, so a model trained on them scores
  // ~0.9 in backtest and cannot rank a fresh lead, which has none of them.
  // If this test fails, someone has reintroduced the bug we removed.
  it('ignores the outcome columns entirely', () => {
    const fresh = makeLead({ order_value: 0, num_orders: 0, last_contacted_at: null });
    const converted = makeLead({
      order_value: 45000,
      num_orders: 7,
      last_contacted_at: new Date(BASE_TIME).toISOString(),
    });
    expect(engineerFeatures(converted, BASE_TIME)).toEqual(engineerFeatures(fresh, BASE_TIME));
  });

  it('ignores status, which is the label', () => {
    expect(engineerFeatures(makeLead({ status: 'won' }), BASE_TIME)).toEqual(
      engineerFeatures(makeLead({ status: 'lost' }), BASE_TIME)
    );
  });
});

describe('excluded features have no influence on scoring', () => {
  // Same guard as above, but end to end: the excluded columns must not move a
  // single final score, not merely be absent from the feature vector.
  it('scores two batches identically when only the outcome columns differ', () => {
    const plain = separableLeads(40);
    const embellished = plain.map((lead) =>
      lead.status === 'won'
        ? { ...lead, order_value: 90000, num_orders: 9, last_contacted_at: lead.created_at }
        : lead
    );

    expect(scoreLeads(embellished).scoredLeads.map((l) => l.score_0_100)).toEqual(
      scoreLeads(plain).scoredLeads.map((l) => l.score_0_100)
    );
  });
});

describe('trainLogisticRegression', () => {
  it('learns a separable pattern', () => {
    const model = trainLogisticRegression([[0], [0], [0], [0], [1], [1], [1], [1]], [
      0, 0, 0, 0, 1, 1, 1, 1,
    ]);

    expect(predict(model, [1])).toBeGreaterThan(0.5);
    expect(predict(model, [0])).toBeLessThan(0.5);
  });

  // The bias starts at the base-rate log-odds, so a model with nothing to learn
  // from returns the base rate rather than drifting to 0.5.
  it('is calibrated to the base rate when no feature carries signal', () => {
    const features = Array.from({ length: 10 }, () => [1, 1]);
    const model = trainLogisticRegression(features, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);

    expect(predict(model, [1, 1])).toBeCloseTo(0.3, 6);
  });

  it('does not produce NaN when a feature column is constant', () => {
    const model = trainLogisticRegression([[1, 0], [1, 1], [1, 0], [1, 1]], [0, 1, 0, 1]);

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

describe('priority banding is rank-based, not threshold-based', () => {
  /**
   * The decisive test. Every lead here carries identical features, so every
   * prediction collapses onto the 20% base rate and every score is exactly 20.
   *
   * Any implementation that bands on an absolute score — `score >= 70 = high`,
   * or any other cutoff — must put all 50 leads in the SAME band, because all
   * 50 scores are equal. Only a positional rule can produce three non-empty
   * bands here. This cannot pass by coincidence.
   */
  it('bands by position even when every score is identical', () => {
    const { scoredLeads, metrics } = scoreLeads(zeroSignalLeads({ count: 50, won: 10 }));

    const scores = new Set(scoredLeads.map((l) => l.score_0_100));
    expect(scores).toEqual(new Set([20]));
    expect(Math.max(...scoredLeads.map((l) => l.score_0_100))).toBeLessThan(70);

    const counts = { high: 0, medium: 0, low: 0 };
    for (const scored of scoredLeads) counts[scored.priority]++;
    expect(counts).toEqual({ high: 10, medium: 15, low: 25 });

    // Confirms the trained path ran rather than the heuristic fallback.
    expect(metrics.trainSize).toBe(50);
  });

  it('splits 100 leads 20/30/50 by rank', () => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const scored of scoreLeads(separableLeads(100)).scoredLeads) counts[scored.priority]++;

    expect(counts).toEqual({ high: 20, medium: 30, low: 50 });
  });

  it('never ranks a low-priority lead above a high-priority one', () => {
    const { scoredLeads } = scoreLeads(separableLeads(100));
    const high = scoredLeads.filter((l) => l.priority === 'high').map((l) => l.score_0_100);
    const low = scoredLeads.filter((l) => l.priority === 'low').map((l) => l.score_0_100);

    expect(Math.min(...high)).toBeGreaterThanOrEqual(Math.max(...low));
  });

  it('pairs each priority with its outreach action', () => {
    const { scoredLeads } = scoreLeads(separableLeads());
    const actionFor = (priority: string) =>
      scoredLeads.find((l) => l.priority === priority)?.suggested_action;

    expect(actionFor('high')).toBe('Call today');
    expect(actionFor('medium')).toContain('WhatsApp');
    expect(actionFor('low')).toContain('Nurture');
  });
});

describe('training thresholds', () => {
  // Fallback fires when labelled rows < 10, or either class has < 2 rows.
  // trainSize is 0 on the fallback path and equals the labelled count when a
  // model was actually fitted, which is how these tests tell them apart.
  const trained = (leads: ReturnType<typeof labelledLeads>) => {
    const { metrics, rankingMode } = scoreLeads(leads);
    return { trainSize: metrics.trainSize, rankingMode };
  };

  it('falls back one row below the minimum labelled count', () => {
    expect(trained(labelledLeads({ won: 5, lost: 4 }))).toEqual({ trainSize: 0, rankingMode: 'recency' });
  });

  it('trains at exactly the minimum labelled count', () => {
    expect(trained(labelledLeads({ won: 5, lost: 5 }))).toEqual({ trainSize: 10, rankingMode: 'trained' });
  });

  it('falls back on a single positive even with enough total rows', () => {
    expect(trained(labelledLeads({ won: 1, lost: 11 }))).toEqual({ trainSize: 0, rankingMode: 'recency' });
  });

  it('falls back on a single negative even with enough total rows', () => {
    expect(trained(labelledLeads({ won: 11, lost: 1 }))).toEqual({ trainSize: 0, rankingMode: 'recency' });
  });

  it('trains at exactly two rows in the smaller class', () => {
    expect(trained(labelledLeads({ won: 2, lost: 10 }))).toEqual({ trainSize: 12, rankingMode: 'trained' });
  });

  it('falls back when every settled lead has the same outcome', () => {
    expect(trained(labelledLeads({ won: 20, lost: 0 }))).toEqual({ trainSize: 0, rankingMode: 'recency' });
  });

  // Open rows are scored but never counted toward the training thresholds.
  it('does not let open leads make up the minimum', () => {
    expect(trained(labelledLeads({ won: 4, lost: 4, open: 30 }))).toEqual({
      trainSize: 0,
      rankingMode: 'recency',
    });
  });

  it('still scores every lead on the fallback path', () => {
    const leads = labelledLeads({ won: 1, lost: 2, open: 1 });
    const { scoredLeads } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(4);
    for (const scored of scoredLeads) {
      expect(scored.priority).toBeTruthy();
      expect(Number.isNaN(scored.conversion_probability)).toBe(false);
    }
  });

  it('ranks referrals above paid social in the heuristic fallback', () => {
    const leads = [
      makeLead({ lead_id: 'paid', source: 'fb', status: 'won' }),
      makeLead({ lead_id: 'ref', source: 'referral', status: 'lost' }),
    ];
    const byId = new Map(scoreLeads(leads).scoredLeads.map((l) => [l.lead_id, l.score_0_100]));

    expect(byId.get('ref')!).toBeGreaterThan(byId.get('paid')!);
  });
});

describe('outcome-column leakage detection', () => {
  // NOTE: the detector is data-shape based, not AUC based. It fires when at
  // least 10 leads carry orders and >=99% of those already converted, which is
  // the signature of a CRM export where the order columns record the outcome.
  it('fires when every lead carrying an order has already converted', () => {
    const leads = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeLead({ lead_id: `w${i}`, status: 'won', num_orders: 2, order_value: 4000 })
      ),
      ...Array.from({ length: 10 }, (_, i) => makeLead({ lead_id: `l${i}`, status: 'lost' })),
    ];

    expect(scoreLeads(leads).warnings.join(' ')).toContain('reveal the outcome');
  });

  it('stays quiet when orders appear on won and lost leads alike', () => {
    const leads = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeLead({ lead_id: `w${i}`, status: 'won', num_orders: 2, order_value: 4000 })
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        makeLead({ lead_id: `l${i}`, status: 'lost', num_orders: 1, order_value: 2000 })
      ),
    ];

    expect(scoreLeads(leads).warnings.join(' ')).not.toContain('reveal the outcome');
  });

  it('stays quiet on an honest file with no orders at all', () => {
    const { warnings } = scoreLeads(zeroSignalLeads({ count: 50, won: 10 }));
    expect(warnings.join(' ')).not.toContain('reveal the outcome');
  });

  it('needs at least 10 ordered leads before it will accuse the data', () => {
    const leads = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeLead({ lead_id: `w${i}`, status: 'won', num_orders: 2, order_value: 4000 })
      ),
      ...Array.from({ length: 10 }, (_, i) => makeLead({ lead_id: `l${i}`, status: 'lost' })),
    ];

    expect(scoreLeads(leads).warnings.join(' ')).not.toContain('reveal the outcome');
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
  it('is reproducible across runs', () => {
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

    expect(scoreLeads(separableLeads()).scoredLeads.map((l) => l.score_0_100)).toEqual(before);
  });

  it('ranks a genuine pattern well above chance', () => {
    const { metrics, warnings } = scoreLeads(separableLeads());
    expect(metrics.auc).toBeGreaterThan(0.9);
    expect(metrics.trainSize).toBe(100);
    expect(warnings.join(' ')).not.toContain('no reliable pattern');
  });

  it('warns when there is no pattern to find', () => {
    const { metrics, warnings } = scoreLeads(zeroSignalLeads({ count: 40, won: 20 }));
    expect(metrics.auc).toBe(0.5);
    expect(warnings.join(' ')).toContain('no reliable pattern');
  });

  it('scores open leads but leaves them out of training', () => {
    const leads = [...separableLeads(60), ...labelledLeads({ won: 0, lost: 0, open: 15 })];
    const { scoredLeads, metrics, warnings } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(75);
    expect(metrics.trainSize).toBe(60);
    expect(warnings.join(' ')).toContain('15 leads have no settled outcome');
  });

  it('handles a single lead without crashing', () => {
    const { scoredLeads } = scoreLeads([makeLead({ status: 'won' })]);
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
      makeLead({ lead_id: `L${i}`, created_at: '', status: i % 3 === 0 ? 'won' : 'lost' })
    );
    const { scoredLeads } = scoreLeads(leads);

    expect(scoredLeads).toHaveLength(12);
    for (const scored of scoredLeads) {
      expect(Number.isNaN(scored.conversion_probability)).toBe(false);
    }
  });
});

describe('unrecognised source', () => {
  // Both halves of the contract: the model cannot represent the value, and the
  // upload step tells the user so rather than silently scoring on nothing.
  it('one-hots to all zeros and produces a warning', () => {
    const lead = makeLead({ source: 'justdial', status: 'won' });

    expect(engineerFeatures(lead, BASE_TIME).slice(6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(
      validateLeadsForScoring([lead, makeLead({ source: 'justdial', status: 'lost' })]).warnings.join(
        ' '
      )
    ).toContain('2 of 2 leads (100%)');
  });
});
