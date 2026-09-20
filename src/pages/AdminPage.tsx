import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  LogOut,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import BrandLogo from '@/components/BrandLogo';
import CreateOrgModal from '@/components/CreateOrgModal';
import CreateUserModal from '@/components/CreateUserModal';
import {
  buildAdminStats,
  fetchAdminActions,
  fetchAdminUsers,
  filterAdminUsers,
  type AdminUserRow,
} from '@/lib/adminApi';
import {
  fetchOrganizations,
  isSuperAdmin,
  roleLabel,
  setOrgAdmin,
  updateOrganizationSeats,
} from '@/lib/org';
import PlanOverrideModal from '@/components/PlanOverrideModal';
import { formatTrialEnd } from '@/lib/trial';
import { PLANS, type AdminAction, type Organization } from '@/types';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '—' : formatTrialEnd(parsed);
}

export default function AdminPage() {
  const { profile, user, signOut, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [addingUserOrg, setAddingUserOrg] = useState<Organization | null>(null);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [seatEdits, setSeatEdits] = useState<Record<string, string>>({});

  const isAdmin = isSuperAdmin(profile);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The audit trail is secondary: a failure there must not hide the user
      // list, so it is settled separately from the accounts themselves.
      const [users, trail, organizations] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminActions().catch(() => [] as AdminAction[]),
        fetchOrganizations().catch(() => [] as Organization[]),
      ]);
      setRows(users);
      setActions(trail);
      setOrgs(organizations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function handleRoleToggle(row: AdminUserRow, makeAdmin: boolean) {
    setRoleBusyId(row.userId);
    setError(null);
    try {
      await setOrgAdmin(row.userId, makeAdmin);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the org admin.');
    } finally {
      setRoleBusyId(null);
    }
  }

  async function handleSeatSave(org: Organization) {
    const parsed = parseInt(seatEdits[org.id] ?? String(org.seat_limit), 10);
    setError(null);
    try {
      await updateOrganizationSeats(org.id, parsed);
      setSeatEdits((current) => {
        const next = { ...current };
        delete next[org.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update seats.');
    }
  }

  // Admin-ness is unknown until the session resolves; redirecting now would
  // bounce the admin off their own page on every refresh.
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // Convenience only. The cross-workspace RLS policies are the real boundary.
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  // List + plan stats are customer accounts only; keep full `rows` for audit emails.
  const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));
  const visible = filterAdminUsers(rows, { search, plan: planFilter }).filter((row) => {
    if (orgFilter === 'all') return true;
    if (orgFilter === 'none') return !row.orgId;
    return row.orgId === orgFilter;
  });
  const stats = buildAdminStats(
    orgFilter === 'all' ? rows : rows.filter((row) => row.orgId === orgFilter)
  );
  const customerCount = stats.totalAccounts;
  const emailByUserId = new Map(rows.map((row) => [row.userId, row.email]));
  const brandByWorkspaceId = new Map(
    rows
      .filter((row) => !row.isAdmin && row.workspaceId)
      .map((row) => [row.workspaceId, row.workspaceName])
  );

  const summaryCards = [
    { label: 'Accounts', value: stats.totalAccounts.toLocaleString('en-IN') },
    { label: 'On a paid plan', value: stats.paidAccounts.toLocaleString('en-IN') },
    { label: 'Manual grants', value: stats.manualGrants.toLocaleString('en-IN') },
    { label: 'Expired trials', value: stats.expiredTrials.toLocaleString('en-IN') },
    { label: 'Leads this month', value: stats.leadsThisMonth.toLocaleString('en-IN') },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo size={36} showWordmark={false} />
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 leading-tight truncate">
                  Administrator
                </h1>
                <p className="text-[11px] text-slate-400 leading-tight truncate">
                  {user?.email ?? 'Signed in'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link to="/org" className="btn-header">
                Org dashboard
              </Link>
              <button onClick={() => void load()} disabled={loading} className="btn-header">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={signOut}
                className="p-2 text-slate-400 hover:text-slate-700 transition"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-5 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="card mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Organizations</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Click an organization to see who logs in there. Set seats, then add users.
              </p>
            </div>
            <button onClick={() => setShowCreateOrg(true)} className="btn-header">
              <Building2 className="w-3.5 h-3.5" />
              New org
            </button>
          </div>
          {orgs.length === 0 ? (
            <p className="text-sm text-slate-500 px-4 py-6 text-center">
              No organizations yet. Create one to start adding users.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Name</th>
                    <th className="text-left font-medium px-4 py-3">Plan</th>
                    <th className="text-left font-medium px-4 py-3">Contact</th>
                    <th className="text-left font-medium px-4 py-3">Seats</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgs.map((org) => {
                    const used = rows.filter(
                      (row) => row.orgId === org.id && row.role !== 'super_admin'
                    ).length;
                    return (
                      <tr
                        key={org.id}
                        className={orgFilter === org.id ? 'bg-blue-50/70' : undefined}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setOrgFilter(org.id);
                              document
                                .getElementById('admin-accounts')
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className="text-left text-slate-800 font-medium hover:text-blue-800"
                          >
                            {org.name}
                          </button>
                          {org.is_default && (
                            <span className="ml-2 text-[10px] font-bold tracking-wide text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5">
                              DEFAULT
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{org.plan ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{org.contact_email ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 tabular-nums">{used} /</span>
                            <input
                              type="number"
                              min={1}
                              max={500}
                              aria-label={`Seat limit for ${org.name}`}
                              value={seatEdits[org.id] ?? org.seat_limit}
                              onChange={(e) =>
                                setSeatEdits((current) => ({ ...current, [org.id]: e.target.value }))
                              }
                              className="input-field w-20 py-1 px-2"
                            />
                            {seatEdits[org.id] !== undefined &&
                              seatEdits[org.id] !== String(org.seat_limit) && (
                                <button
                                  type="button"
                                  onClick={() => void handleSeatSave(org)}
                                  className="text-xs font-medium text-blue-700 hover:text-blue-800"
                                >
                                  Save
                                </button>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setAddingUserOrg(org)}
                            className="btn-header"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Add user
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-[11px] text-slate-500">{card.label}</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="card p-4 mb-6">
          <p className="text-[11px] text-slate-500 mb-2">Accounts by plan</p>
          <div className="flex flex-wrap gap-2">
            {stats.byPlan.map((entry) => (
              <span
                key={entry.plan}
                className="text-xs text-slate-700 bg-slate-100 rounded-md px-2.5 py-1"
              >
                {entry.label}: <span className="font-semibold">{entry.count}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email"
              aria-label="Search accounts by email"
              className="input-field pl-9"
            />
          </div>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            aria-label="View as organization"
            className="input-field sm:w-56"
          >
            <option value="all">All organizations</option>
            <option value="none">No organization</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label="Filter by plan"
            className="input-field sm:w-48"
          >
            <option value="all">All plans</option>
            {PLANS.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>

        <div id="admin-accounts" className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">
              {orgFilter === 'all'
                ? 'Users'
                : orgFilter === 'none'
                  ? 'Users with no organization'
                  : `Users in ${orgNameById.get(orgFilter) ?? 'this organization'}`}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              People who log in under the selected organization. This admin account does not upload leads.
            </p>
          </div>
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-500">
                {customerCount === 0
                  ? 'No customer accounts yet.'
                  : 'No accounts match this search or plan.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Email</th>
                    <th className="text-left font-medium px-4 py-3">Brand</th>
                    <th className="text-left font-medium px-4 py-3">Organization</th>
                    <th className="text-left font-medium px-4 py-3">Role</th>
                    <th className="text-left font-medium px-4 py-3">Plan</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-left font-medium px-4 py-3">Source</th>
                    <th className="text-left font-medium px-4 py-3">Expires</th>
                    <th className="text-left font-medium px-4 py-3">Signed up</th>
                    <th className="text-right font-medium px-4 py-3">Leads this month</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((row) => {
                    const overLimit = row.leadsThisMonth > row.leadLimit;
                    // Free plans expire on trial_ends_at, which is enforced;
                    // paid plans only record current_period_end.
                    const expiry = row.plan === 'free' ? row.trialEndsAt : row.periodEndsAt;
                    return (
                      <tr key={row.userId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800">{row.email || '—'}</span>
                            {row.isAdmin && (
                              <span className="text-[10px] font-bold tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                                ADMIN
                              </span>
                            )}
                            {row.mustChangePassword && (
                              <span className="text-[10px] font-bold tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                                SET PASSWORD
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.workspaceName}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.orgId ? orgNameById.get(row.orgId) ?? '—' : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{roleLabel(row.role)}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{row.plan}</td>
                        <td className="px-4 py-3 text-slate-600">{row.status}</td>
                        <td className="px-4 py-3">
                          {row.planSource === 'manual' ? (
                            <span className="text-[10px] font-bold tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                              MANUAL
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">
                              {row.planSource ?? 'signup'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(expiry)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.signedUpAt)}</td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            overLimit ? 'text-amber-700 font-medium' : 'text-slate-600'
                          }`}
                        >
                          {row.leadsThisMonth.toLocaleString('en-IN')} /{' '}
                          {row.leadLimit.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.orgId && row.role !== 'super_admin' && !row.isAdmin && (
                              <button
                                type="button"
                                disabled={roleBusyId === row.userId}
                                onClick={() =>
                                  void handleRoleToggle(row, row.role !== 'org_admin')
                                }
                                className="btn-header"
                              >
                                {roleBusyId === row.userId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : null}
                                <span className="hidden sm:inline">
                                  {row.role === 'org_admin' ? 'Remove Org Admin' : 'Make Org Admin'}
                                </span>
                              </button>
                            )}
                            <button
                              onClick={() => setEditing(row)}
                              disabled={!row.workspaceId}
                              className="btn-header"
                              title={
                                row.workspaceId
                                  ? 'Change plan'
                                  : 'This account has no workspace to change'
                              }
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Plan</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card mt-6">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Recent admin actions</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Every manual plan change, with who made it and why. Cannot be edited or deleted.
            </p>
          </div>
          {actions.length === 0 ? (
            <p className="text-sm text-slate-500 px-4 py-6 text-center">No changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {actions.map((entry) => (
                <li key={entry.id} className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
                    <span className="font-medium text-slate-800">
                      {emailByUserId.get(entry.admin_user_id) ?? 'Unknown admin'}
                    </span>
                    <span>changed</span>
                    <span className="font-medium text-slate-800">
                      {brandByWorkspaceId.get(entry.target_workspace_id) ?? 'a deleted workspace'}
                    </span>
                    <span className="text-slate-400">{formatDate(entry.created_at)}</span>
                  </div>
                  <p className="text-slate-500 mt-1">
                    {String(entry.old_value?.plan ?? '—')} → {String(entry.new_value?.plan ?? '—')} ·{' '}
                    {entry.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <PlanOverrideModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {showCreateOrg && (
        <CreateOrgModal
          onClose={() => setShowCreateOrg(false)}
          onCreated={() => {
            setShowCreateOrg(false);
            void load();
          }}
        />
      )}
      {addingUserOrg && (
        <CreateUserModal
          org={addingUserOrg}
          onClose={() => setAddingUserOrg(null)}
          onCreated={() => {
            setAddingUserOrg(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
