import { describe, expect, it } from 'vitest';
import {
  buildUnderstandRequest,
  parseAiRankingPlan,
  scoreLeadWithAiPlan,
} from './aiRanking';
import { makeLead } from './testFixtures';

const INTEREST = 'are_you_interested_in_our_course?';
const CALLBACK = 'കോൾ ചെയ്യാമോ ഈ ആഴ്ച?';

describe('buildUnderstandRequest', () => {
  it('sends leftover columns and sample answers, not empty files', () => {
    const req = buildUnderstandRequest([
      makeLead({
        extra: { [INTEREST]: 'yes', [CALLBACK]: 'അതെ', email: 'a@b.com' },
      }),
      makeLead({
        extra: { [INTEREST]: 'no', [CALLBACK]: 'ഇല്ല', email: 'b@c.com' },
      }),
    ]);
    expect(req).not.toBeNull();
    expect(req!.columns).toEqual(expect.arrayContaining([INTEREST, CALLBACK, 'email']));
    expect(req!.samples.length).toBeGreaterThan(0);
    expect(req!.samples[0][INTEREST]).toBeTruthy();
  });

  it('returns null when there are no extras', () => {
    expect(buildUnderstandRequest([makeLead({ extra: {} })])).toBeNull();
  });
});

describe('parseAiRankingPlan', () => {
  it('accepts a valid plan and drops ignore / empty signals', () => {
    const plan = parseAiRankingPlan({
      summary: 'Call people who said yes on the Malayalam callback question.',
      signals: [
        {
          column: CALLBACK,
          role: 'urgency',
          weight: 0.9,
          value_scores: { അതെ: 1, ഇല്ല: -0.8 },
          why: 'said yes to a call this week',
        },
        {
          column: 'email',
          role: 'ignore',
          weight: 1,
          value_scores: { 'a@b.com': 0 },
        },
      ],
      use_recency: true,
      recency_weight: 0.4,
    });
    expect(plan).not.toBeNull();
    expect(plan!.signals).toHaveLength(1);
    expect(plan!.signals[0].column).toBe(CALLBACK);
  });

  it('rejects empty plans', () => {
    expect(parseAiRankingPlan({ summary: 'x', signals: [] })).toBeNull();
    expect(parseAiRankingPlan(null)).toBeNull();
  });
});

describe('scoreLeadWithAiPlan', () => {
  it('ranks from AI value_scores without English keywords in the column name', () => {
    const plan = parseAiRankingPlan({
      summary: 'Ranked by the Malayalam callback answer, then how new.',
      signals: [
        {
          column: CALLBACK,
          role: 'urgency',
          weight: 1,
          value_scores: { അതെ: 1, ഇല്ല: -1 },
          why: 'open to a call this week',
        },
      ],
      use_recency: true,
      recency_weight: 0.2,
    })!;

    const when = Date.parse('2026-08-19T10:00:00.000Z');
    const yes = scoreLeadWithAiPlan(
      makeLead({
        lead_id: 'y',
        created_at: '2026-08-19T10:00:00.000Z',
        extra: { [CALLBACK]: 'അതെ' },
      }),
      plan,
      when
    );
    const no = scoreLeadWithAiPlan(
      makeLead({
        lead_id: 'n',
        created_at: '2026-08-19T10:00:00.000Z',
        extra: { [CALLBACK]: 'ഇല്ല' },
      }),
      plan,
      when
    );

    expect(yes.probability).toBeGreaterThan(no.probability);
    expect(yes.reason).toMatch(/call this week|AI read the form/i);
  });
});
