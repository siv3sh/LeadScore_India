import { supabase } from '@/lib/supabase';
import { getMonthlyLeadCount } from '@/lib/api';
import {
  PLANS,
  getPlan,
  type AdminAction,
  type PlanSource,
  type PlanType,
  type Profile,
  type SubStatus,
  type Subscription,
  type UserRole,
  type Workspace,
} from '@/types';

/** One row of the admin user list: an account plus its workspace and plan. */
export interface AdminUserRow {
  userId: string;
  email: string;
  isAdmin: boolean;
  role: UserRole;
  orgId: string | null;
  mustChangePassword: boolean;
  workspaceId: string | null;
  workspaceName: string;
  /** Workspace creation time, which is when the account actually signed up. */
  signedUpAt: string | null;
  /** Raw value from the database, which is a text column and may be unrecognised. */
  plan: string;
  status: string;
  trialEndsAt: string | null;
  /** When the current plan lapses. Recorded for paid plans, not enforced. */
  periodEndsAt: string | null;
  planSource: PlanSource | null;
  leadsThisMonth: number;
  leadLimit: number;
}

export interface AdminUserFilters {
  /** Matched against email, case-insensitively. Empty means no filtering. */
  search: string;
  /** A plan id, or 'all'. */
  plan: string;
}

/**
 * Joins the three admin-readable tables into display rows.
 *
 * Kept pure and separate from the fetching so the join, the fallbacks for a
 * missing workspace or subscription, and the plan limit lookup can be tested
 * without a database.
 */
export function buildAdminUserRows(
  profiles: Profile[],
  workspaces: Workspace[],
  subscriptions: Subscription[],
  leadCountsByWorkspace: Map<string, number>
): AdminUserRow[] {
  const workspaceByUser = new Map(workspaces.map((w) => [w.user_id, w]));
  const subscriptionByWorkspace = new Map(subscriptions.map((s) => [s.workspace_id, s]));

  const rows = profiles.map((profile) => {
    const workspace = workspaceByUser.get(profile.id) ?? null;
    const subscription = workspace
      ? subscriptionByWorkspace.get(workspace.id) ?? null
      : null;

    // No subscription row means no paid entitlement, which is what the lead
    // limit trigger also falls back to.
    const plan = subscription?.plan ?? 'free';

    return {
      userId: profile.id,
      email: profile.email,
      isAdmin: profile.is_admin,
      role: profile.role,
      orgId: profile.org_id,
      mustChangePassword: profile.must_change_password,
      workspaceId: workspace?.id ?? null,
      workspaceName: workspace?.name ?? '—',
      signedUpAt: workspace?.created_at ?? null,
      plan,
      status: subscription?.status ?? '—',
      trialEndsAt: subscription?.trial_ends_at ?? null,
      periodEndsAt: subscription?.current_period_end ?? null,
      planSource: subscription?.plan_source ?? null,
      leadsThisMonth: workspace ? leadCountsByWorkspace.get(workspace.id) ?? 0 : 0,
      // getPlan falls back to the free plan for a value outside PlanType, so an
      // unrecognised plan string still yields a usable limit.
      leadLimit: getPlan(plan as PlanType).lead_limit,
    };
  });

  return rows.sort((a, b) => (b.signedUpAt ?? '').localeCompare(a.signedUpAt ?? ''));
}

/** Customer accounts only — admins operate the panel and are not billed users. */
export function customerAdminRows(rows: AdminUserRow[]): AdminUserRow[] {
  return rows.filter((row) => !row.isAdmin);
}

export function filterAdminUsers(
  rows: AdminUserRow[],
  { search, plan }: AdminUserFilters
): AdminUserRow[] {
  const needle = search.trim().toLowerCase();

  return customerAdminRows(rows).filter((row) => {
    if (plan !== 'all' && row.plan !== plan) return false;
    if (needle && !row.email.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * Reads every account. This only returns rows for an admin — the cross-workspace
 * SELECT policies are the enforcement, so a non-admin caller gets their own row
 * back rather than an error.
 */
export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const [profilesResult, workspacesResult, subscriptionsResult] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('workspaces').select('*'),
    supabase.from('subscriptions').select('*'),
  ]);

  const failure = profilesResult.error ?? workspacesResult.error ?? subscriptionsResult.error;
  if (failure) {
    throw new Error(`Could not load the user list: ${failure.message}`);
  }

  const workspaces = (workspacesResult.data ?? []) as Workspace[];

  // One count per workspace, reusing getMonthlyLeadCount so the figure here and
  // the quota the database enforces come from the same UTC month boundary.
  // Fine at this scale; if the customer count grows past a few hundred this
  // should become a single grouped query behind an RPC.
  const counts = await Promise.all(
    workspaces.map(async (workspace) => [
      workspace.id,
      await getMonthlyLeadCount(workspace.id),
    ] as const)
  );

  return buildAdminUserRows(
    (profilesResult.data ?? []) as Profile[],
    workspaces,
    (subscriptionsResult.data ?? []) as Subscription[],
    new Map(counts)
  );
}

export interface AdminStats {
  totalAccounts: number;
  admins: number;
  /** Accounts on anything other than the free plan. */
  paidAccounts: number;
  /** Plans an admin granted rather than a payment. */
  manualGrants: number;
  /** Free accounts whose window has closed, so ingestion is already blocked. */
  expiredTrials: number;
  leadsThisMonth: number;
  byPlan: { plan: string; label: string; count: number }[];
}

/** `now` is injected so the expired-trial count is testable without the clock. */
export function buildAdminStats(rows: AdminUserRow[], now: number = Date.now()): AdminStats {
  // Stats and plan breakdowns are for customer accounts only.
  const customers = customerAdminRows(rows);

  const counts = new Map<string, number>();
  for (const row of customers) {
    counts.set(row.plan, (counts.get(row.plan) ?? 0) + 1);
  }

  // Known plans first and in pricing order, then anything unrecognised, so a
  // stray plan value is visible rather than silently dropped.
  const knownIds = PLANS.map((plan) => plan.id as string);
  const byPlan = [
    ...PLANS.map((plan) => ({ plan: plan.id as string, label: plan.name, count: counts.get(plan.id) ?? 0 })),
    ...[...counts.keys()]
      .filter((plan) => !knownIds.includes(plan))
      .map((plan) => ({ plan, label: plan, count: counts.get(plan) ?? 0 })),
  ];

  const isExpiredTrial = (row: AdminUserRow): boolean => {
    if (row.plan !== 'free' || !row.trialEndsAt) return false;
    const endsAt = new Date(row.trialEndsAt).getTime();
    return !isNaN(endsAt) && endsAt < now;
  };

  return {
    totalAccounts: customers.length,
    admins: rows.filter((row) => row.isAdmin).length,
    paidAccounts: customers.filter((row) => row.plan !== 'free').length,
    manualGrants: customers.filter((row) => row.planSource === 'manual').length,
    expiredTrials: customers.filter(isExpiredTrial).length,
    leadsThisMonth: customers.reduce((total, row) => total + row.leadsThisMonth, 0),
    byPlan,
  };
}

export interface PlanOverrideInput {
  plan: PlanType;
  status: SubStatus;
  /** How long the admin is granting the plan for, in whole days. */
  durationDays: number;
  note: string;
}

/** Matches the note CHECK constraint on admin_actions. */
const MIN_NOTE_LENGTH = 3;
const MAX_DURATION_DAYS = 3650;

/**
 * Returns a message describing why the override cannot be saved, or null when
 * it is valid. The database enforces the note separately; this exists so the
 * admin sees the problem before a round trip.
 */
export function validatePlanOverride(input: PlanOverrideInput): string | null {
  if (input.note.trim().length < MIN_NOTE_LENGTH) {
    return `Add a note of at least ${MIN_NOTE_LENGTH} characters explaining why this plan is changing.`;
  }
  if (!Number.isInteger(input.durationDays)) {
    return 'Duration must be a whole number of days.';
  }
  if (input.durationDays < 1) {
    return 'Duration must be at least 1 day.';
  }
  if (input.durationDays > MAX_DURATION_DAYS) {
    return `Duration cannot exceed ${MAX_DURATION_DAYS} days.`;
  }
  return null;
}

/** End of a grant that starts now and runs for `durationDays`. */
export function expiryFromDays(durationDays: number, from: number = Date.now()): string {
  return new Date(from + durationDays * 86400000).toISOString();
}

/**
 * Applies a manual plan change and records why.
 *
 * The subscription is written first and the audit entry second, because a trail
 * describing a change that did not happen is worse than a change whose trail
 * failed — and the second case is reported loudly rather than swallowed.
 */
export async function applyPlanOverride(
  row: AdminUserRow,
  input: PlanOverrideInput,
  adminUserId: string
): Promise<void> {
  const problem = validatePlanOverride(input);
  if (problem) throw new Error(problem);

  if (row.isAdmin) {
    throw new Error('Admin accounts are not managed as customer plans.');
  }

  if (!row.workspaceId) {
    throw new Error('This account has no workspace, so its plan cannot be changed.');
  }

  const expiresAt = expiryFromDays(input.durationDays);

  const fields: Record<string, string | null> = {
    plan: input.plan,
    status: input.status,
    current_period_end: expiresAt,
    plan_source: 'manual',
    updated_at: new Date().toISOString(),
  };

  // Only the free plan has an enforced window: enforce_monthly_lead_limit reads
  // trial_ends_at. Setting it for a paid plan would do nothing.
  if (input.plan === 'free') {
    fields.trial_ends_at = expiresAt;
  }

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update(fields)
    .eq('workspace_id', row.workspaceId);

  if (updateError) {
    throw new Error(`Could not change the plan: ${updateError.message}`);
  }

  const { error: auditError } = await supabase.from('admin_actions').insert({
    admin_user_id: adminUserId,
    target_workspace_id: row.workspaceId,
    action: 'plan_override',
    old_value: { plan: row.plan, status: row.status, plan_source: row.planSource },
    new_value: { plan: input.plan, status: input.status, expires_at: expiresAt, plan_source: 'manual' },
    note: input.note.trim(),
  });

  if (auditError) {
    throw new Error(
      `The plan was changed to ${input.plan}, but the audit entry failed to save: ${auditError.message}. ` +
        'Record this change manually.'
    );
  }
}

export async function fetchAdminActions(limit = 20): Promise<AdminAction[]> {
  const { data, error } = await supabase
    .from('admin_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load the audit trail: ${error.message}`);
  }
  return (data ?? []) as AdminAction[];
}
