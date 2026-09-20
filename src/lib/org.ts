import { supabase } from '@/lib/supabase';
import type { Lead, Organization, Profile, Upload, UserRole, Workspace } from '@/types';

/** Seeded platform owner. Matched case-insensitively by the backfill script. */
export const SUPER_ADMIN_EMAILS = ['hello@sivesh-pb.com', 'hello@sivesh'] as const;

export function isSuperAdmin(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === 'super_admin' || profile.is_admin === true;
}

export function isOrgAdmin(profile: Profile | null | undefined): boolean {
  return profile?.role === 'org_admin';
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin';
    case 'org_admin':
      return 'Org admin';
    case 'org_user':
      return 'User';
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export interface CreateOrganizationInput {
  name: string;
  seat_limit: number;
  contact_email: string;
  plan: string;
}

export function validateCreateOrganization(input: CreateOrganizationInput): string | null {
  if (!input.name.trim()) return 'Enter an organization name.';
  if (!Number.isInteger(input.seat_limit) || input.seat_limit < 1) {
    return 'Seat limit must be a whole number of at least 1.';
  }
  if (input.seat_limit > 500) return 'Seat limit cannot exceed 500.';
  if (input.contact_email.trim() && !input.contact_email.includes('@')) {
    return 'Enter a valid contact email, or leave it blank.';
  }
  return null;
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load organizations: ${error.message}`);
  return (data ?? []) as Organization[];
}

export async function createOrganization(
  input: CreateOrganizationInput,
  createdBy: string
): Promise<Organization> {
  const problem = validateCreateOrganization(input);
  if (problem) throw new Error(problem);

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name.trim(),
      seat_limit: input.seat_limit,
      contact_email: input.contact_email.trim() || null,
      plan: input.plan.trim() || null,
      status: 'active',
      created_by: createdBy,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not create the organization.');
  }
  return data as Organization;
}

export async function updateOrganizationSeats(orgId: string, seatLimit: number): Promise<void> {
  if (!Number.isInteger(seatLimit) || seatLimit < 1) {
    throw new Error('Seat limit must be a whole number of at least 1.');
  }
  const { error } = await supabase
    .from('organizations')
    .update({ seat_limit: seatLimit })
    .eq('id', orgId);
  if (error) throw new Error(`Could not update seats: ${error.message}`);
}

export async function setOrgAdmin(targetUserId: string, makeAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_org_admin', {
    target_user_id: targetUserId,
    make_admin: makeAdmin,
  });
  if (error) throw new Error(error.message);
}

export type CredentialMode = 'generate' | 'email';

export interface CreateOrgUserInput {
  org_id: string;
  credential_mode: CredentialMode;
  email?: string;
  workspace_name?: string;
}

export interface CreatedOrgUser {
  user_id: string;
  email: string;
  password: string;
  email_stubbed: boolean;
}

export async function createOrgUser(input: CreateOrgUserInput): Promise<CreatedOrgUser> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session has expired. Sign in again.');
  }

  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/org-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'create_user', ...input }),
  });

  const body = (await res.json().catch(() => ({}))) as CreatedOrgUser & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Could not create the user (${res.status})`);
  }
  if (!body.email || !body.password || !body.user_id) {
    throw new Error('User was created but login details were not returned. Check the server logs.');
  }
  return {
    user_id: body.user_id,
    email: body.email,
    password: body.password,
    email_stubbed: Boolean(body.email_stubbed),
  };
}

export async function completePasswordChange(): Promise<void> {
  const { error } = await supabase.rpc('complete_password_change');
  if (error) throw new Error(error.message);
}

export interface OrgDashboardStats {
  userCount: number;
  pendingPasswordCount: number;
  activeUserCount: number;
  leadsTotal: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  uploadsTotal: number;
  convertedCount: number;
  /** 0–100. Null when there are no leads yet. */
  conversionRatePct: number | null;
  highPriorityOpen: number;
}

export interface OrgMemberActivity {
  userId: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  workspaceName: string;
  leadsTotal: number;
  leadsThisMonth: number;
  convertedCount: number;
}

export function startOfUtcWeek(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start.toISOString();
}

export function startOfUtcMonth(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function buildOrgDashboardStats(
  profiles: Profile[],
  leads: Lead[],
  uploads: Upload[],
  now: Date = new Date()
): OrgDashboardStats {
  const weekStart = startOfUtcWeek(now);
  const monthStart = startOfUtcMonth(now);
  const members = profiles.filter((p) => p.role !== 'super_admin');
  const convertedCount = leads.filter((l) => (l.status ?? '').toLowerCase() === 'won').length;
  const highPriorityOpen = leads.filter((l) => {
    const status = (l.status ?? '').toLowerCase();
    const settled = status === 'won' || status === 'lost';
    return l.priority === 'high' && !settled;
  }).length;

  return {
    userCount: members.length,
    pendingPasswordCount: members.filter((p) => p.must_change_password).length,
    activeUserCount: members.filter((p) => !p.must_change_password).length,
    leadsTotal: leads.length,
    leadsThisWeek: leads.filter((l) => l.created_at >= weekStart).length,
    leadsThisMonth: leads.filter((l) => l.created_at >= monthStart).length,
    uploadsTotal: uploads.length,
    convertedCount,
    conversionRatePct: leads.length === 0 ? null : Math.round((convertedCount / leads.length) * 100),
    highPriorityOpen,
  };
}

/**
 * One row per org member (not the platform super admin), with that person's
 * workspace lead counts so an org admin can see who is working the list.
 */
export function buildOrgMemberActivity(
  profiles: Profile[],
  workspaces: Workspace[],
  leads: Lead[],
  now: Date = new Date()
): OrgMemberActivity[] {
  const monthStart = startOfUtcMonth(now);
  const workspaceByUser = new Map(workspaces.map((w) => [w.user_id, w]));
  const leadsByWorkspace = new Map<string, Lead[]>();
  for (const lead of leads) {
    const bucket = leadsByWorkspace.get(lead.workspace_id) ?? [];
    bucket.push(lead);
    leadsByWorkspace.set(lead.workspace_id, bucket);
  }

  return profiles
    .filter((p) => p.role !== 'super_admin')
    .map((profile) => {
      const workspace = workspaceByUser.get(profile.id) ?? null;
      const userLeads = workspace ? leadsByWorkspace.get(workspace.id) ?? [] : [];
      return {
        userId: profile.id,
        email: profile.email,
        role: profile.role,
        mustChangePassword: profile.must_change_password,
        workspaceName: workspace?.name ?? '—',
        leadsTotal: userLeads.length,
        leadsThisMonth: userLeads.filter((l) => l.created_at >= monthStart).length,
        convertedCount: userLeads.filter((l) => (l.status ?? '').toLowerCase() === 'won').length,
      };
    })
    .sort((a, b) => b.leadsTotal - a.leadsTotal || a.email.localeCompare(b.email));
}

export async function fetchOrgLeads(orgId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('org_id', orgId)
    .order('score_0_100', { ascending: false });
  if (error) throw new Error(`Could not load org leads: ${error.message}`);
  return (data ?? []) as Lead[];
}

export async function fetchOrgUploads(orgId: string): Promise<Upload[]> {
  const { data, error } = await supabase
    .from('uploads')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load org uploads: ${error.message}`);
  return (data ?? []) as Upload[];
}

export async function fetchOrgProfiles(orgId: string): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').eq('org_id', orgId);
  if (error) throw new Error(`Could not load org users: ${error.message}`);
  return (data ?? []) as Profile[];
}

export async function fetchOrgWorkspaces(orgId: string): Promise<Workspace[]> {
  const { data, error } = await supabase.from('workspaces').select('*').eq('org_id', orgId);
  if (error) throw new Error(`Could not load org workspaces: ${error.message}`);
  return (data ?? []) as Workspace[];
}
