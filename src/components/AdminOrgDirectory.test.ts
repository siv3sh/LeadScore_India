import { describe, expect, it } from 'vitest';
import { usersInOrganization } from '@/components/AdminOrgDirectory';
import type { AdminUserRow } from '@/lib/adminApi';

function row(overrides: Partial<AdminUserRow>): AdminUserRow {
  return {
    userId: 'u1',
    email: 'a@b.com',
    isAdmin: false,
    role: 'org_user',
    orgId: 'org1',
    mustChangePassword: false,
    workspaceId: 'w1',
    workspaceName: 'Brand',
    signedUpAt: null,
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

describe('usersInOrganization', () => {
  const rows = [
    row({ userId: 'demo', email: 'demo@sivesh-pb.com', role: 'org_admin', orgId: 'org1' }),
    row({ userId: 'worker', email: 'worker@gmail.com', orgId: 'org1' }),
    row({ userId: 'other', email: 'other@brand.com', orgId: 'org2' }),
    row({
      userId: 'boss',
      email: 'hello@sivesh-pb.com',
      role: 'super_admin',
      isAdmin: true,
      orgId: 'org1',
    }),
  ];

  it('lists members of that org and hides the platform super admin', () => {
    expect(usersInOrganization(rows, 'org1').map((r) => r.email)).toEqual([
      'demo@sivesh-pb.com',
      'worker@gmail.com',
    ]);
  });

  it('does not leak users from another org', () => {
    expect(usersInOrganization(rows, 'org2').map((r) => r.email)).toEqual(['other@brand.com']);
  });
});
