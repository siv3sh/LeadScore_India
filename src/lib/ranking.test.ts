import { describe, expect, it } from 'vitest';
import { makeLead } from './testFixtures';
import { scoreLeads } from './ml';
import {
  RANKING_SUMMARY,
  aggregateIntent,
  detectIntentColumn,
  detectIntentColumns,
  fallbackProbability,
  parseIntentValue,
} from './ranking';

const INTEREST = 'are_you_interested_in_our_course?';
const CALLBACK = 'can_we_call_you_this_week?';
const EMPLOYMENT = 'what_is_your_current_employment_status';

describe('parseIntentValue', () => {
  it('reads Meta form answers', () => {
    expect(parseIntentValue('yes')).toBe('yes');
    expect(parseIntentValue('maybe_/_need_more_information')).toBe('maybe');
    expect(parseIntentValue('no')).toBe('no');
    expect(parseIntentValue('currently_working')).toBeNull();
  });
});

describe('detectIntentColumns', () => {
  it('picks interest and callback columns and ignores employment', () => {
    const cols = detectIntentColumns([
      makeLead({
        extra: {
          [EMPLOYMENT]: 'student',
          [INTEREST]: 'yes',
          [CALLBACK]: 'yes',
          email: 'a@b.com',
        },
      }),
      makeLead({
        extra: {
          [EMPLOYMENT]: 'working',
          [INTEREST]: 'no',
          [CALLBACK]: 'maybe',
          email: 'b@c.com',
        },
      }),
      makeLead({
        extra: {
          [EMPLOYMENT]: 'student',
          [INTEREST]: 'yes',
          [CALLBACK]: 'no',
          email: 'c@d.com',
        },
      }),
    ]);
    expect(cols).toContain(INTEREST);
    expect(cols).toContain(CALLBACK);
    expect(cols).not.toContain(EMPLOYMENT);
    expect(cols).not.toContain('email');
  });

  it('detectIntentColumn still returns the first match', () => {
    const col = detectIntentColumn([
      makeLead({
        extra: {
          [EMPLOYMENT]: 'student',
          [INTEREST]: 'yes',
          email: 'a@b.com',
        },
      }),
    ]);
    expect(col).toBe(INTEREST);
  });
});

describe('aggregateIntent', () => {
  it('keeps a clear yes when one answer is yes and another is maybe', () => {
    expect(aggregateIntent(['yes', 'maybe'])).toBe('yes');
  });

  it('pulls a mixed yes+no down from a pure yes', () => {
    expect(aggregateIntent(['yes', 'no'])).toBe('maybe');
  });

  it('returns no when answers are mostly negative', () => {
    expect(aggregateIntent(['no', 'no', 'maybe'])).toBe('no');
  });
});

describe('fallbackProbability', () => {
  it('ranks a stale yes above a fresh no', () => {
    const yesOld = fallbackProbability({ ageDays: 40, source: 'ig', intent: 'yes', useIntent: true });
    const noNew = fallbackProbability({ ageDays: 1, source: 'ig', intent: 'no', useIntent: true });
    expect(yesOld).toBeGreaterThan(noNew);
  });

  it('ranks two yes answers above a single yes at the same age', () => {
    const oneYes = fallbackProbability({
      ageDays: 2,
      source: 'ig',
      intent: 'yes',
      useIntent: true,
      extraYesCount: 0,
    });
    const twoYes = fallbackProbability({
      ageDays: 2,
      source: 'ig',
      intent: 'yes',
      useIntent: true,
      extraYesCount: 1,
    });
    expect(twoYes).toBeGreaterThan(oneYes);
  });
});

describe('scoreLeads without converted outcomes', () => {
  it('uses form interest then recency, and explains each row', () => {
    const newest = '2026-08-19T10:00:00.000Z';
    const older = '2026-07-18T10:00:00.000Z';
    const result = scoreLeads([
      makeLead({
        lead_id: 'yes-old',
        source: 'ig',
        status: 'unknown',
        created_at: older,
        extra: { [INTEREST]: 'yes' },
      }),
      makeLead({
        lead_id: 'maybe-new',
        source: 'ig',
        status: 'unknown',
        created_at: newest,
        extra: { [INTEREST]: 'maybe_/_need_more_information' },
      }),
      makeLead({
        lead_id: 'no-new',
        source: 'fb',
        status: 'unknown',
        created_at: newest,
        extra: { [INTEREST]: 'no' },
      }),
    ]);

    expect(result.rankingMode).toBe('intent');
    expect(result.rankingSummary).toBe(RANKING_SUMMARY.intent);

    const byId = new Map(result.scoredLeads.map((lead) => [lead.lead_id, lead]));
    expect(byId.get('yes-old')!.score_0_100).toBeGreaterThan(byId.get('no-new')!.score_0_100);
    expect(byId.get('yes-old')!.score_reason).toContain('said yes');
    expect(byId.get('maybe-new')!.score_reason).toContain('maybe');
    expect(byId.get('no-new')!.score_reason).toContain('said no');
  });

  it('combines multiple form columns when ranking', () => {
    const when = '2026-08-19T10:00:00.000Z';
    const result = scoreLeads([
      makeLead({
        lead_id: 'double-yes',
        source: 'ig',
        status: 'unknown',
        created_at: when,
        extra: { [INTEREST]: 'yes', [CALLBACK]: 'yes' },
      }),
      makeLead({
        lead_id: 'yes-no',
        source: 'ig',
        status: 'unknown',
        created_at: when,
        extra: { [INTEREST]: 'yes', [CALLBACK]: 'no' },
      }),
      makeLead({
        lead_id: 'single-yes',
        source: 'ig',
        status: 'unknown',
        created_at: when,
        extra: { [INTEREST]: 'yes', [CALLBACK]: '' },
      }),
    ]);

    expect(result.rankingMode).toBe('intent');
    const byId = new Map(result.scoredLeads.map((lead) => [lead.lead_id, lead]));
    expect(byId.get('double-yes')!.score_0_100).toBeGreaterThan(byId.get('single-yes')!.score_0_100);
    expect(byId.get('double-yes')!.score_0_100).toBeGreaterThan(byId.get('yes-no')!.score_0_100);
    expect(byId.get('double-yes')!.score_reason).toContain('2 form questions');
  });

  it('falls back to newest-first when there is no form intent', () => {
    const result = scoreLeads([
      makeLead({ lead_id: 'old', source: 'ig', status: 'unknown', created_at: '2026-07-01T00:00:00.000Z' }),
      makeLead({ lead_id: 'new', source: 'ig', status: 'unknown', created_at: '2026-08-19T00:00:00.000Z' }),
    ]);
    expect(result.rankingMode).toBe('recency');
    const byId = new Map(result.scoredLeads.map((lead) => [lead.lead_id, lead]));
    expect(byId.get('new')!.score_0_100).toBeGreaterThan(byId.get('old')!.score_0_100);
    expect(byId.get('new')!.score_reason).toContain('Newest first');
  });
});
