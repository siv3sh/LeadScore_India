import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanType, Subscription } from '@/types';
import { TRIAL_DAYS, formatTrialEnd, getTrialState } from './trial';

const NOW = '2026-09-17T12:00:00.000Z';

function subscription(plan: PlanType, trialEndsAt: string | null): Subscription {
  return {
    id: 'sub_1',
    workspace_id: 'ws_1',
    plan,
    status: 'active',
    current_period_end: null,
    trial_ends_at: trialEndsAt,
    razorpay_subscription_id: null,
    plan_source: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TRIAL_DAYS', () => {
  // Changing this without changing the interval in
  // 20260917093000_enforce_free_trial_window.sql makes the UI promise a window
  // the database will not honour.
  it('matches the window the database enforces', () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe('getTrialState', () => {
  it('reports no trial when there is no subscription yet', () => {
    expect(getTrialState(null)).toEqual({
      active: false,
      expired: false,
      daysLeft: 0,
      endsAt: null,
    });
  });

  // Upgrading has to silence every trial message without the stamp being cleared.
  it('reports no trial on a paid plan even if a stamp is left behind', () => {
    const state = getTrialState(subscription('starter', '2026-10-01T12:00:00.000Z'));
    expect(state.active).toBe(false);
    expect(state.expired).toBe(false);
  });

  it('reports no trial on a free plan with no window set', () => {
    expect(getTrialState(subscription('free', null)).active).toBe(false);
  });

  it('reports no trial when the stored date is unparseable', () => {
    const state = getTrialState(subscription('free', 'not-a-date'));
    expect(state).toEqual({ active: false, expired: false, daysLeft: 0, endsAt: null });
  });

  it('is active with the full window remaining on a fresh signup', () => {
    const state = getTrialState(subscription('free', '2026-10-01T12:00:00.000Z'));
    expect(state.active).toBe(true);
    expect(state.expired).toBe(false);
    expect(state.daysLeft).toBe(14);
    expect(state.endsAt?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  // Rounded up so the last hours read as "1 day left" rather than "0 days left".
  it('rounds a part-day up', () => {
    expect(getTrialState(subscription('free', '2026-09-18T00:00:00.000Z')).daysLeft).toBe(1);
    expect(getTrialState(subscription('free', '2026-09-17T12:00:01.000Z')).daysLeft).toBe(1);
  });

  it('is expired once the window has passed', () => {
    const state = getTrialState(subscription('free', '2026-09-10T12:00:00.000Z'));
    expect(state.active).toBe(false);
    expect(state.expired).toBe(true);
    expect(state.daysLeft).toBe(0);
    expect(state.endsAt).toBeInstanceOf(Date);
  });

  // The database rejects inserts at trial_ends_at < now(), so the boundary
  // instant must not still read as active here.
  it('is expired at exactly the boundary instant', () => {
    const state = getTrialState(subscription('free', NOW));
    expect(state.active).toBe(false);
    expect(state.expired).toBe(true);
  });
});

describe('formatTrialEnd', () => {
  it('formats the end date for an Indian audience', () => {
    expect(formatTrialEnd(new Date('2026-10-01T12:00:00.000Z'))).toBe('1 Oct 2026');
  });
});
