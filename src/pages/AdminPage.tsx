import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertCircle,
  LogOut,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  buildAdminStats,
  fetchAdminActions,
  fetchAdminUsers,
  filterAdminUsers,
  type AdminUserRow,
} from '@/lib/adminApi';
import PlanOverrideModal from '@/components/PlanOverrideModal';
import { formatTrialEnd } from '@/lib/trial';
import { PLANS, type AdminAction } from '@/types';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '—' : formatTrialEnd(parsed);
}

export default function AdminPage() {
  const { profile, user, signOut, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const isAdmin = profile?.is_admin === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The audit trail is secondary: a failure there must not hide the user
      // list, so it is settled separately from the accounts themselves.
      const [users, trail] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminActions().catch(() => [] as AdminAction[]),
      ]);
      setRows(users);
      setActions(trail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

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

  const visible = filterAdminUsers(rows, { search, plan: planFilter });
  const stats = buildAdminStats(rows);
  const emailByUserId = new Map(rows.map((row) => [row.userId, row.email]));
  const brandByWorkspaceId = new Map(
    rows.filter((row) => row.workspaceId).map((row) => [row.workspaceId, row.workspaceName])
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
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
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

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-500">
                {rows.length === 0
                  ? 'No accounts found.'
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
                              <span className="text-[10px] font-bold tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">
                                ADMIN
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.workspaceName}</td>
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
    </div>
  );
}
