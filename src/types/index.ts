export type UserRole = 'super_admin' | 'org_admin' | 'org_user';
export type OrgStatus = 'active' | 'inactive';

export interface Organization {
  id: string;
  name: string;
  seat_limit: number;
  created_by: string | null;
  created_at: string;
  plan: string | null;
  contact_email: string | null;
  status: OrgStatus;
  is_default: boolean;
}

export interface Workspace {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  created_at: string;
  /** Google Sheets link the workspace syncs from (optional). */
  sheet_url: string | null;
  /** Saved column mapping for sheet sync. */
  sheet_mapping: Record<string, string> | null;
  sheet_sync_enabled: boolean;
  sheet_last_synced_at: string | null;
  sheet_last_error: string | null;
}

/**
 * One row per auth user. `is_admin` is set only by direct SQL — the app has no
 * write path to this table, which is what stops privilege escalation.
 */
export interface Profile {
  id: string;
  /** Snapshot taken at signup; the session's email is the live one. */
  email: string;
  is_admin: boolean;
  org_id: string | null;
  role: UserRole;
  must_change_password: boolean;
  /** Public Storage URL. Null until the user uploads a photo. */
  avatar_url: string | null;
  created_at: string;
}

export type PlanType = 'free' | 'starter' | 'growth' | 'pro';
export type SubStatus = 'active' | 'inactive' | 'past_due' | 'cancelled';

export interface Subscription {
  id: string;
  workspace_id: string;
  plan: PlanType;
  status: SubStatus;
  current_period_end: string | null;
  /** When the free plan stops accepting new leads. Null on paid plans. */
  trial_ends_at: string | null;
  razorpay_subscription_id: string | null;
  /** How the plan was granted. Null for an untouched signup row. */
  plan_source: PlanSource | null;
  created_at: string;
  updated_at: string;
}

export type PlanSource = 'razorpay' | 'manual';

/** One immutable entry in the admin audit trail. */
export interface AdminAction {
  id: string;
  admin_user_id: string;
  target_workspace_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string;
  created_at: string;
}

export type UploadStatus = 'processing' | 'completed' | 'failed';

export interface Upload {
  id: string;
  workspace_id: string;
  org_id: string | null;
  file_name: string;
  row_count: number;
  status: UploadStatus;
  model_auc: number | null;
  conversion_rate: number | null;
  /** Why this batch is ordered this way. Absent on uploads scored before this existed. */
  ranking_summary?: string | null;
  created_at: string;
}

export type Priority = 'low' | 'medium' | 'high';

export interface Lead {
  id: string;
  upload_id: string;
  workspace_id: string;
  org_id: string | null;
  lead_id: string | null;
  name: string | null;
  phone: string | null;
  city: string | null;
  source: string | null;
  created_at_lead: string | null;
  last_contacted_at: string | null;
  order_value: number;
  num_orders: number;
  status: string | null;
  /** Leftover CSV columns from this upload. Empty/absent on older rows. */
  extra?: Record<string, string> | null;
  conversion_probability: number | null;
  score_0_100: number | null;
  priority: Priority | null;
  suggested_action: string | null;
  /** One line on the card explaining this lead's place in the call order. */
  score_reason?: string | null;
  /** When in the future, hide from Today's list until then. */
  snoozed_until: string | null;
  created_at: string;
}

export interface PlanInfo {
  id: PlanType;
  name: string;
  price: number;
  lead_limit: number;
  features: string[];
  razorpay_plan_id?: string;
}

// The monthly lead limit is rendered from `lead_limit` on its own, so it is
// deliberately absent from `features`.
export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    lead_limit: 100,
    features: ['Ranked call list', 'CSV export'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 1999,
    lead_limit: 1000,
    features: ['AI-ranked leads', 'Priority filters', 'CSV export'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 4999,
    lead_limit: 10000,
    features: ['AI-ranked leads', 'Advanced filters', 'CSV export'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 6999,
    lead_limit: 50000,
    features: ['AI-ranked leads', 'All filters', 'Priority support'],
  },
];

export function getPlan(planId: PlanType): PlanInfo {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}
