import { describe, expect, it } from 'vitest';
import {
  buildOrgDashboardStats,
  buildOrgMemberActivity,
  isOrgAdmin,
  isSuperAdmin,
  roleLabel,
  startOfUtcMonth,
  startOfUtcWeek,
  validateCreateOrganization,
} from './org';
import type { Lead, Profile, Upload, Workspace } from '@/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    email: 'owner@brand.com',
    is_admin: false,
    org_id: 'org1',
    role: 'org_user',
    must_change_password: false,
    avatar_url: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 'up1',
    workspace_id: 'w1',
    org_id: 'org1',
    file_name: 'leads.csv',
    row_count: 2,
    status: 'completed',
    model_auc: null,
    conversion_rate: null,
    created_at: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    user_id: 'u1',
    org_id: 'org1',
    name: 'Sunrise Interiors',
    created_at: '2026-09-01T00:00:00.000Z',
    sheet_url: null,
    sheet_mapping: null,
    sheet_sync_enabled: false,
    sheet_last_synced_at: null,
    sheet_last_error: null,
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    upload_id: 'up1',
    workspace_id: 'w1',
    org_id: 'org1',
    lead_id: 'L-1',
    name: 'Asha',
    phone: '9000000000',
    city: 'Kochi',
    source: 'google',
    created_at_lead: null,
    last_contacted_at: null,
    order_value: 0,
    num_orders: 0,
    status: 'unknown',
    conversion_probability: 0.5,
    score_0_100: 50,
    priority: 'medium',
    suggested_action: 'Call today',
    snoozed_until: null,
    created_at: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('role helpers', () => {
  it('treats is_admin as super admin so the existing flag still works', () => {
    expect(isSuperAdmin(makeProfile({ is_admin: true, role: 'org_user' }))).toBe(true);
    expect(isSuperAdmin(makeProfile({ role: 'super_admin', is_admin: false }))).toBe(true);
    expect(isSuperAdmin(makeProfile())).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });

  it('identifies org admins only by role', () => {
    expect(isOrgAdmin(makeProfile({ role: 'org_admin' }))).toBe(true);
    expect(isOrgAdmin(makeProfile({ role: 'super_admin', is_admin: true }))).toBe(false);
  });

  it('labels every role', () => {
    expect(roleLabel('super_admin')).toBe('Super admin');
    expect(roleLabel('org_admin')).toBe('Org admin');
    expect(roleLabel('org_user')).toBe('User');
  });
});

describe('validateCreateOrganization', () => {
  const valid = {
    name: 'Nair Stores',
    seat_limit: 5,
    contact_email: 'owner@nair.com',
    plan: 'starter',
  };

  it('accepts a complete org', () => {
    expect(validateCreateOrganization(valid)).toBeNull();
  });

  it('rejects a blank name', () => {
    expect(validateCreateOrganization({ ...valid, name: '  ' })).toBe(
      'Enter an organization name.'
    );
  });

  it('rejects a non-integer or tiny seat limit', () => {
    expect(validateCreateOrganization({ ...valid, seat_limit: 0 })).toMatch(/at least 1/);
    expect(validateCreateOrganization({ ...valid, seat_limit: 1.5 })).toMatch(/whole number/);
  });
});

describe('buildOrgDashboardStats', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');

  it('counts members, pending passwords, and leads in UTC week/month windows', () => {
    const stats = buildOrgDashboardStats(
      [
        makeProfile({ id: 'a', role: 'org_admin' }),
        makeProfile({ id: 'b', role: 'org_user', must_change_password: true }),
        makeProfile({ id: 'c', role: 'super_admin', is_admin: true }),
      ],
      [
        makeLead({ id: '1', created_at: '2026-09-16T00:00:00.000Z', status: 'won' }),
        makeLead({ id: '2', created_at: '2026-08-01T00:00:00.000Z', status: 'lost' }),
      ],
      [makeUpload()],
      now
    );

    expect(stats.userCount).toBe(2);
    expect(stats.pendingPasswordCount).toBe(1);
    expect(stats.activeUserCount).toBe(1);
    expect(stats.leadsTotal).toBe(2);
    expect(stats.leadsThisWeek).toBe(1);
    expect(stats.leadsThisMonth).toBe(1);
    expect(stats.convertedCount).toBe(1);
    expect(stats.conversionRatePct).toBe(50);
    expect(stats.highPriorityOpen).toBe(0);
    expect(stats.uploadsTotal).toBe(1);
  });

  it('counts high-priority leads that are still open', () => {
    const stats = buildOrgDashboardStats(
      [makeProfile()],
      [
        makeLead({ id: 'open', priority: 'high', status: 'unknown' }),
        makeLead({ id: 'won', priority: 'high', status: 'won' }),
      ],
      [],
      now
    );
    expect(stats.highPriorityOpen).toBe(1);
    expect(stats.convertedCount).toBe(1);
    expect(stats.conversionRatePct).toBe(50);
  });

  it('reports no conversion rate when there are no leads', () => {
    const stats = buildOrgDashboardStats([], [], [], now);
    expect(stats.conversionRatePct).toBeNull();
    expect(stats.highPriorityOpen).toBe(0);
  });
});

describe('buildOrgMemberActivity', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');

  it('attributes leads to the member who owns the workspace, not another user', () => {
    const rows = buildOrgMemberActivity(
      [
        makeProfile({ id: 'demo', email: 'demo@sivesh-pb.com', role: 'org_admin' }),
        makeProfile({ id: 'worker', email: 'worker@gmail.com', role: 'org_user' }),
        makeProfile({ id: 'boss', email: 'hello@sivesh-pb.com', role: 'super_admin', is_admin: true }),
      ],
      [
        makeWorkspace({ id: 'w-demo', user_id: 'demo', name: 'Sunrise Interiors' }),
        makeWorkspace({ id: 'w-worker', user_id: 'worker', name: 'test' }),
      ],
      [
        makeLead({ id: '1', workspace_id: 'w-demo', created_at: '2026-09-16T00:00:00.000Z', status: 'won' }),
        makeLead({ id: '2', workspace_id: 'w-demo', created_at: '2026-08-01T00:00:00.000Z', status: 'lost' }),
        makeLead({ id: '3', workspace_id: 'w-worker', created_at: '2026-09-18T00:00:00.000Z', status: 'unknown' }),
      ],
      now
    );

    expect(rows.map((r) => r.email)).toEqual(['demo@sivesh-pb.com', 'worker@gmail.com']);
    expect(rows[0]).toMatchObject({
      workspaceName: 'Sunrise Interiors',
      leadsTotal: 2,
      leadsThisMonth: 1,
      convertedCount: 1,
    });
    expect(rows[1]).toMatchObject({
      workspaceName: 'test',
      leadsTotal: 1,
      leadsThisMonth: 1,
      convertedCount: 0,
    });
  });
});

describe('UTC boundaries', () => {
  it('starts the week on Monday 00:00 UTC', () => {
    expect(startOfUtcWeek(new Date('2026-09-20T12:00:00.000Z'))).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('starts the month on day 1 00:00 UTC', () => {
    expect(startOfUtcMonth(new Date('2026-09-20T12:00:00.000Z'))).toBe(
      '2026-09-01T00:00:00.000Z'
    );
  });
});
