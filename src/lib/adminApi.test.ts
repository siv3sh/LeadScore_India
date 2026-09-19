import { describe, expect, it } from 'vitest';
import {
  buildAdminStats,
  buildAdminUserRows,
  expiryFromDays,
  filterAdminUsers,
  validatePlanOverride,
  type AdminUserRow,
  type PlanOverrideInput,
} from './adminApi';
import type { Profile, Subscription, Workspace } from '@/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    email: 'owner@brand.com',
    is_admin: false,
    avatar_url: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    user_id: 'u1',
    name: 'Brand',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    workspace_id: 'w1',
    plan: 'growth',
    status: 'active',
    current_period_end: null,
    trial_ends_at: null,
    razorpay_subscription_id: null,
    plan_source: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildAdminUserRows', () => {
  it('joins a profile to its workspace, subscription and usage', () => {
    const [row] = buildAdminUserRows(
      [makeProfile()],
      [makeWorkspace()],
      [makeSubscription({ trial_ends_at: '2026-09-20T00:00:00.000Z' })],
      new Map([['w1', 250]])
    );

    expect(row).toEqual({
      userId: 'u1',
      email: 'owner@brand.com',
      isAdmin: false,
      workspaceId: 'w1',
      workspaceName: 'Brand',
      signedUpAt: '2026-09-01T00:00:00.000Z',
      plan: 'growth',
      status: 'active',
      trialEndsAt: '2026-09-20T00:00:00.000Z',
      periodEndsAt: null,
      planSource: null,
      leadsThisMonth: 250,
      leadLimit: 10000,
    });
  });

  // The signup trigger guarantees a workspace, so this is the "something is
  // wrong" case: the account still has to appear in the list rather than vanish.
  it('keeps a profile that has no workspace', () => {
    const [row] = buildAdminUserRows([makeProfile()], [], [], new Map());

    expect(row.workspaceId).toBeNull();
    expect(row.workspaceName).toBe('—');
    expect(row.signedUpAt).toBeNull();
    expect(row.leadsThisMonth).toBe(0);
  });

  it('falls back to the free plan when there is no subscription row', () => {
    const [row] = buildAdminUserRows([makeProfile()], [makeWorkspace()], [], new Map());

    expect(row.plan).toBe('free');
    expect(row.status).toBe('—');
    expect(row.leadLimit).toBe(100);
  });

  // subscriptions.plan is a text column with no CHECK constraint.
  it('shows an unrecognised plan verbatim but limits it like free', () => {
    const [row] = buildAdminUserRows(
      [makeProfile()],
      [makeWorkspace()],
      [makeSubscription({ plan: 'enterprise' as Subscription['plan'] })],
      new Map()
    );

    expect(row.plan).toBe('enterprise');
    expect(row.leadLimit).toBe(100);
  });

  it('reports zero usage for a workspace with no counted leads', () => {
    const [row] = buildAdminUserRows(
      [makeProfile()],
      [makeWorkspace()],
      [makeSubscription()],
      new Map()
    );

    expect(row.leadsThisMonth).toBe(0);
  });

  it('does not attribute one workspace usage to another', () => {
    const rows = buildAdminUserRows(
      [makeProfile({ id: 'u1' }), makeProfile({ id: 'u2', email: 'two@brand.com' })],
      [makeWorkspace({ id: 'w1', user_id: 'u1' }), makeWorkspace({ id: 'w2', user_id: 'u2' })],
      [makeSubscription({ workspace_id: 'w1' }), makeSubscription({ id: 's2', workspace_id: 'w2', plan: 'pro' })],
      new Map([['w1', 5], ['w2', 90]])
    );

    expect(rows.map((r) => [r.email, r.plan, r.leadsThisMonth])).toEqual(
      expect.arrayContaining([
        ['owner@brand.com', 'growth', 5],
        ['two@brand.com', 'pro', 90],
      ])
    );
  });

  it('lists the newest signup first', () => {
    const rows = buildAdminUserRows(
      [
        makeProfile({ id: 'old', email: 'old@brand.com' }),
        makeProfile({ id: 'new', email: 'new@brand.com' }),
      ],
      [
        makeWorkspace({ id: 'w-old', user_id: 'old', created_at: '2026-01-01T00:00:00.000Z' }),
        makeWorkspace({ id: 'w-new', user_id: 'new', created_at: '2026-09-15T00:00:00.000Z' }),
      ],
      [],
      new Map()
    );

    expect(rows.map((r) => r.email)).toEqual(['new@brand.com', 'old@brand.com']);
  });

  it('returns nothing for no profiles', () => {
    expect(buildAdminUserRows([], [], [], new Map())).toEqual([]);
  });
});

describe('filterAdminUsers', () => {
  const rows = buildAdminUserRows(
    [
      makeProfile({ id: 'u1', email: 'Aarav@Brand.com' }),
      makeProfile({ id: 'u2', email: 'riya@shop.in' }),
      makeProfile({ id: 'u3', email: 'admin@leadscore.in', is_admin: true }),
    ],
    [
      makeWorkspace({ id: 'w1', user_id: 'u1' }),
      makeWorkspace({ id: 'w2', user_id: 'u2' }),
      makeWorkspace({ id: 'w3', user_id: 'u3' }),
    ],
    [
      makeSubscription({ workspace_id: 'w1', plan: 'growth' }),
      makeSubscription({ id: 's2', workspace_id: 'w2', plan: 'pro' }),
      makeSubscription({ id: 's3', workspace_id: 'w3', plan: 'free' }),
    ],
    new Map()
  );

  const emailsOf = (result: AdminUserRow[]) => result.map((r) => r.email).sort();

  it('returns everything when nothing is filtered', () => {
    expect(filterAdminUsers(rows, { search: '', plan: 'all' })).toHaveLength(3);
  });

  it('matches part of an email regardless of case', () => {
    expect(emailsOf(filterAdminUsers(rows, { search: 'AARAV', plan: 'all' }))).toEqual([
      'Aarav@Brand.com',
    ]);
    expect(emailsOf(filterAdminUsers(rows, { search: 'shop', plan: 'all' }))).toEqual([
      'riya@shop.in',
    ]);
  });

  it('ignores surrounding whitespace in the search', () => {
    expect(filterAdminUsers(rows, { search: '   riya  ', plan: 'all' })).toHaveLength(1);
    expect(filterAdminUsers(rows, { search: '   ', plan: 'all' })).toHaveLength(3);
  });

  it('filters by plan', () => {
    expect(emailsOf(filterAdminUsers(rows, { search: '', plan: 'pro' }))).toEqual([
      'riya@shop.in',
    ]);
  });

  it('applies search and plan together', () => {
    expect(filterAdminUsers(rows, { search: 'riya', plan: 'growth' })).toEqual([]);
    expect(filterAdminUsers(rows, { search: 'riya', plan: 'pro' })).toHaveLength(1);
  });

  it('returns nothing when no email matches', () => {
    expect(filterAdminUsers(rows, { search: 'nobody@example.com', plan: 'all' })).toEqual([]);
  });

  it('leaves the original list untouched', () => {
    filterAdminUsers(rows, { search: 'riya', plan: 'all' });
    expect(rows).toHaveLength(3);
  });
});

describe('buildAdminStats', () => {
  const NOW = Date.parse('2026-09-17T00:00:00.000Z');
  const DAY = 86400000;

  function makeRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
    return {
      userId: 'u1',
      email: 'a@b.com',
      isAdmin: false,
      workspaceId: 'w1',
      workspaceName: 'Brand',
      signedUpAt: '2026-09-01T00:00:00.000Z',
      plan: 'free',
      status: 'active',
      trialEndsAt: null,
      periodEndsAt: null,
      planSource: null,
      leadsThisMonth: 0,
      leadLimit: 100,
      ...overrides,
    };
  }

  it('counts accounts, admins, paid plans and manual grants', () => {
    const stats = buildAdminStats(
      [
        makeRow({ userId: '1', isAdmin: true }),
        makeRow({ userId: '2', plan: 'pro', planSource: 'manual' }),
        makeRow({ userId: '3', plan: 'growth', planSource: 'razorpay' }),
      ],
      NOW
    );

    expect(stats.totalAccounts).toBe(3);
    expect(stats.admins).toBe(1);
    expect(stats.paidAccounts).toBe(2);
    expect(stats.manualGrants).toBe(1);
  });

  it('sums leads across every account', () => {
    const stats = buildAdminStats(
      [makeRow({ userId: '1', leadsThisMonth: 40 }), makeRow({ userId: '2', leadsThisMonth: 2 })],
      NOW
    );

    expect(stats.leadsThisMonth).toBe(42);
  });

  // The boundary matters: a window closing exactly now is not yet expired.
  it('counts only free trials whose window has already closed', () => {
    const stats = buildAdminStats(
      [
        makeRow({ userId: 'past', trialEndsAt: new Date(NOW - DAY).toISOString() }),
        makeRow({ userId: 'exactly-now', trialEndsAt: new Date(NOW).toISOString() }),
        makeRow({ userId: 'future', trialEndsAt: new Date(NOW + DAY).toISOString() }),
        makeRow({ userId: 'no-window', trialEndsAt: null }),
        // A paid plan is not on trial, however stale its stamp.
        makeRow({ userId: 'paid', plan: 'pro', trialEndsAt: new Date(NOW - DAY).toISOString() }),
      ],
      NOW
    );

    expect(stats.expiredTrials).toBe(1);
  });

  it('ignores an unparseable trial date rather than counting it as expired', () => {
    const stats = buildAdminStats([makeRow({ trialEndsAt: 'not-a-date' })], NOW);
    expect(stats.expiredTrials).toBe(0);
  });

  it('reports every known plan, including ones nobody is on', () => {
    const stats = buildAdminStats([makeRow({ plan: 'pro' })], NOW);

    expect(stats.byPlan).toEqual([
      { plan: 'free', label: 'Free Trial', count: 0 },
      { plan: 'starter', label: 'Starter', count: 0 },
      { plan: 'growth', label: 'Growth', count: 0 },
      { plan: 'pro', label: 'Pro', count: 1 },
    ]);
  });

  it('surfaces an unrecognised plan instead of dropping it', () => {
    const stats = buildAdminStats([makeRow({ plan: 'enterprise' })], NOW);

    expect(stats.byPlan).toContainEqual({ plan: 'enterprise', label: 'enterprise', count: 1 });
    expect(stats.paidAccounts).toBe(1);
  });

  it('handles an empty system', () => {
    const stats = buildAdminStats([], NOW);

    expect(stats.totalAccounts).toBe(0);
    expect(stats.leadsThisMonth).toBe(0);
    expect(stats.expiredTrials).toBe(0);
  });
});

describe('validatePlanOverride', () => {
  function input(overrides: Partial<PlanOverrideInput> = {}): PlanOverrideInput {
    return { plan: 'pro', status: 'active', durationDays: 30, note: 'Agreed on call', ...overrides };
  }

  it('accepts a complete override', () => {
    expect(validatePlanOverride(input())).toBeNull();
  });

  // The note is the whole point of the audit row, and the database rejects a
  // blank one too, so the form must not let it get that far.
  it('rejects a missing or whitespace-only note', () => {
    expect(validatePlanOverride(input({ note: '' }))).toContain('note');
    expect(validatePlanOverride(input({ note: '   ' }))).toContain('note');
    expect(validatePlanOverride(input({ note: 'ok' }))).toContain('note');
  });

  it('accepts a note at exactly the minimum length', () => {
    expect(validatePlanOverride(input({ note: 'abc' }))).toBeNull();
    expect(validatePlanOverride(input({ note: '  abc  ' }))).toBeNull();
  });

  it('rejects a duration below one day', () => {
    expect(validatePlanOverride(input({ durationDays: 0 }))).toContain('at least 1 day');
    expect(validatePlanOverride(input({ durationDays: -5 }))).toContain('at least 1 day');
  });

  it('accepts the boundary durations', () => {
    expect(validatePlanOverride(input({ durationDays: 1 }))).toBeNull();
    expect(validatePlanOverride(input({ durationDays: 3650 }))).toBeNull();
  });

  it('rejects a duration beyond the maximum', () => {
    expect(validatePlanOverride(input({ durationDays: 3651 }))).toContain('cannot exceed');
  });

  it('rejects a fractional or non-numeric duration', () => {
    expect(validatePlanOverride(input({ durationDays: 1.5 }))).toContain('whole number');
    expect(validatePlanOverride(input({ durationDays: NaN }))).toContain('whole number');
  });
});

describe('expiryFromDays', () => {
  const FROM = Date.parse('2026-09-17T09:00:00.000Z');

  it('adds whole days to the starting instant', () => {
    expect(expiryFromDays(30, FROM)).toBe('2026-10-17T09:00:00.000Z');
    expect(expiryFromDays(1, FROM)).toBe('2026-09-18T09:00:00.000Z');
  });

  it('crosses a year boundary correctly', () => {
    expect(expiryFromDays(365, FROM)).toBe('2027-09-17T09:00:00.000Z');
  });
});
