import type { Subscription } from '@/types';

/**
 * Must match the interval in 20260917093000_enforce_free_trial_window.sql. The
 * database is what actually enforces the window; this constant only labels it.
 */
export const TRIAL_DAYS = 14;

export interface TrialState {
  /** Free plan, inside a window the database will enforce. */
  active: boolean;
  expired: boolean;
  /** Whole days remaining, rounded up so the final hours read as "1 day left". */
  daysLeft: number;
  endsAt: Date | null;
}

const NOT_ON_TRIAL: TrialState = { active: false, expired: false, daysLeft: 0, endsAt: null };
const DAY_MS = 86400000;

/**
 * Paid plans and rows without a window are not on trial, so upgrading silences
 * every trial message without needing the stamp cleared.
 */
export function getTrialState(subscription: Subscription | null): TrialState {
  if (!subscription || subscription.plan !== 'free' || !subscription.trial_ends_at) {
    return NOT_ON_TRIAL;
  }

  const endsAt = new Date(subscription.trial_ends_at);
  if (isNaN(endsAt.getTime())) return NOT_ON_TRIAL;

  // Both sides are absolute instants, so no timezone conversion is involved.
  const remaining = endsAt.getTime() - Date.now();
  if (remaining <= 0) return { active: false, expired: true, daysLeft: 0, endsAt };

  return { active: true, expired: false, daysLeft: Math.ceil(remaining / DAY_MS), endsAt };
}

export function formatTrialEnd(endsAt: Date): string {
  return endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
