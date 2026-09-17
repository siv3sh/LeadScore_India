export interface Workspace {
  id: string;
  user_id: string;
  name: string;
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
  razorpay_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export type UploadStatus = 'processing' | 'completed' | 'failed';

export interface Upload {
  id: string;
  workspace_id: string;
  file_name: string;
  row_count: number;
  status: UploadStatus;
  model_auc: number | null;
  conversion_rate: number | null;
  created_at: string;
}

export type Priority = 'low' | 'medium' | 'high';

export interface Lead {
  id: string;
  upload_id: string;
  workspace_id: string;
  lead_id: string | null;
  name: string | null;
  phone: string | null;
  source: string | null;
  created_at_lead: string | null;
  last_contacted_at: string | null;
  order_value: number;
  num_orders: number;
  status: string | null;
  conversion_probability: number | null;
  score_0_100: number | null;
  priority: Priority | null;
  suggested_action: string | null;
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

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    lead_limit: 100,
    features: ['Up to 100 leads/month', 'Basic scoring', 'CSV export'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 1999,
    lead_limit: 1000,
    features: ['Up to 1,000 leads/month', 'Full ML scoring', 'Priority filters', 'CSV export'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 4999,
    lead_limit: 10000,
    features: ['Up to 10,000 leads/month', 'Full ML scoring', 'Advanced filters', 'CSV export'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9999,
    lead_limit: 50000,
    features: ['Up to 50,000 leads/month', 'Full ML scoring', 'All features', 'Priority support'],
  },
];

export function getPlan(planId: PlanType): PlanInfo {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}
