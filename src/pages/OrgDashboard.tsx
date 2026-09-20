import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle, Loader2, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import CreateUserModal from '@/components/CreateUserModal';
import LeadCharts from '@/components/LeadCharts';
import { useAuth } from '@/lib/auth';
import {
  buildOrgDashboardStats,
  buildOrgMemberActivity,
  fetchOrganizations,
  fetchOrgLeads,
  fetchOrgProfiles,
  fetchOrgUploads,
  fetchOrgWorkspaces,
  isOrgAdmin,
  isSuperAdmin,
  roleLabel,
} from '@/lib/org';
import type { Lead, Organization, Profile, Upload, Workspace } from '@/types';

export default function OrgDashboard() {
  const { profile, user, signOut, loading: authLoading } = useAuth();
  const superAdmin = isSuperAdmin(profile);
  const orgAdmin = isOrgAdmin(profile);
  const allowed = superAdmin || orgAdmin;

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(profile?.org_id ?? '');
  const [orgProfiles, setOrgProfiles] = useState<Profile[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

  const load = useCallback(async (orgId: string) => {
    if (!orgId) {
      setOrgProfiles([]);
      setWorkspaces([]);
      setLeads([]);
      setUploads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextProfiles, nextWorkspaces, nextLeads, nextUploads] = await Promise.all([
        fetchOrgProfiles(orgId),
        fetchOrgWorkspaces(orgId),
        fetchOrgLeads(orgId),
        fetchOrgUploads(orgId),
      ]);
      setOrgProfiles(nextProfiles);
      setWorkspaces(nextWorkspaces);
      setLeads(nextLeads);
      setUploads(nextUploads);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this organization.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      if (superAdmin) {
        try {
          const list = await fetchOrganizations();
          if (cancelled) return;
          setOrgs(list);
          setSelectedOrgId((current) => current || list[0]?.id || '');
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Could not load organizations.');
            setLoading(false);
          }
        }
        return;
      }
      if (profile?.org_id) {
        try {
          const list = await fetchOrganizations();
          if (!cancelled) setOrgs(list);
        } catch {
          if (!cancelled) setOrgs([]);
        }
        setSelectedOrgId(profile.org_id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, superAdmin, profile?.org_id]);

  useEffect(() => {
    if (!allowed) return;
    if (selectedOrgId) void load(selectedOrgId);
  }, [allowed, selectedOrgId, load]);

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) ?? null,
    [orgs, selectedOrgId]
  );
  const stats = useMemo(
    () => buildOrgDashboardStats(orgProfiles, leads, uploads),
    [orgProfiles, leads, uploads]
  );
  const members = useMemo(
    () => buildOrgMemberActivity(orgProfiles, workspaces, leads),
    [orgProfiles, workspaces, leads]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  const summaryCards = [
    { label: 'Users', value: stats.userCount.toLocaleString('en-IN') },
    { label: 'Leads scored', value: stats.leadsTotal.toLocaleString('en-IN') },
    { label: 'Converted', value: stats.convertedCount.toLocaleString('en-IN') },
    {
      label: 'Conversion',
      value: stats.conversionRatePct === null ? '—' : `${stats.conversionRatePct}%`,
    },
    { label: 'Leads this week', value: stats.leadsThisWeek.toLocaleString('en-IN') },
    { label: 'High priority to call', value: stats.highPriorityOpen.toLocaleString('en-IN') },
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
                  {selectedOrg?.name ?? 'Organization'}
                </h1>
                <p className="text-[11px] text-slate-400 leading-tight truncate">
                  {user?.email ?? 'Signed in'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {superAdmin && (
                <Link to="/admin" className="btn-header">
                  All accounts
                </Link>
              )}
              {!superAdmin && (
                <Link to="/dashboard" className="btn-header">
                  My leads
                </Link>
              )}
              <button onClick={() => void load(selectedOrgId)} disabled={loading} className="btn-header">
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

        {superAdmin && (
          <div className="mb-5 flex flex-col sm:flex-row gap-3">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              aria-label="View as organization"
              className="input-field sm:max-w-sm"
            >
              {orgs.length === 0 && <option value="">No organizations yet</option>}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 self-center">
              View as this org — support only. You still cannot see another org from an org-admin
              login.
            </p>
          </div>
        )}

        {selectedOrg && (
          <p className="text-xs text-slate-500 mb-4">
            {members.length} of {selectedOrg.seat_limit} seats used
            {selectedOrg.plan ? ` · ${selectedOrg.plan}` : ''}
            {selectedOrg.status !== 'active' ? ' · inactive' : ''}
          </p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          {summaryCards.map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-[11px] text-slate-500">{card.label}</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{card.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
          </div>
        ) : (
          <>
            <LeadCharts leads={leads} />

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">How the team is working</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Leads each person scored this month, and how many converted.
                    {stats.pendingPasswordCount > 0
                      ? ` ${stats.pendingPasswordCount} still need to set a password.`
                      : ''}
                  </p>
                </div>
                {selectedOrg && (
                  <button onClick={() => setShowAddUser(true)} className="btn-header">
                    <UserPlus className="w-3.5 h-3.5" />
                    Add user
                  </button>
                )}
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-slate-500 px-4 py-8 text-center">
                  No users in this organization yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">Email</th>
                        <th className="text-left font-medium px-4 py-3">Workspace</th>
                        <th className="text-left font-medium px-4 py-3">Role</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-right font-medium px-4 py-3">Leads scored</th>
                        <th className="text-right font-medium px-4 py-3">This month</th>
                        <th className="text-right font-medium px-4 py-3">Converted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {members.map((row) => (
                        <tr key={row.userId}>
                          <td className="px-4 py-3 text-slate-800">{row.email || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.workspaceName}</td>
                          <td className="px-4 py-3 text-slate-600">{roleLabel(row.role)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-bold tracking-wide rounded-full px-1.5 py-0.5 border ${
                                row.mustChangePassword
                                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              }`}
                            >
                              {row.mustChangePassword ? 'Pending password change' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {row.leadsTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {row.leadsThisMonth.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {row.convertedCount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAddUser && selectedOrg && (
        <CreateUserModal
          org={selectedOrg}
          onClose={() => setShowAddUser(false)}
          onCreated={() => {
            setShowAddUser(false);
            void load(selectedOrg.id);
          }}
        />
      )}
    </div>
  );
}
