import { ChevronRight } from 'lucide-react';
import { roleLabel } from '@/lib/org';
import type { AdminUserRow } from '@/lib/adminApi';
import type { Organization } from '@/types';

export function usersInOrganization(rows: AdminUserRow[], orgId: string): AdminUserRow[] {
  return rows
    .filter((row) => row.orgId === orgId && row.role !== 'super_admin')
    .sort((a, b) => a.email.localeCompare(b.email));
}

interface AdminOrgDirectoryProps {
  orgs: Organization[];
  users: AdminUserRow[];
  selectedOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
  /** Compact list for the profile modal; full table is the admin page. */
  compact?: boolean;
}

export default function AdminOrgDirectory({
  orgs,
  users,
  selectedOrgId,
  onSelectOrg,
  compact = false,
}: AdminOrgDirectoryProps) {
  const selected = orgs.find((org) => org.id === selectedOrgId) ?? null;
  const members = selected ? usersInOrganization(users, selected.id) : [];

  if (orgs.length === 0) {
    return <p className="text-sm text-slate-500">No organizations yet.</p>;
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
        {orgs.map((org) => {
          const count = usersInOrganization(users, org.id).length;
          const active = org.id === selectedOrgId;
          return (
            <li key={org.id}>
              <button
                type="button"
                onClick={() => onSelectOrg(org.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                  active ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900 truncate">
                    {org.name}
                    {org.is_default ? (
                      <span className="ml-2 text-[10px] font-bold tracking-wide text-slate-500">
                        DEFAULT
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {count} {count === 1 ? 'user' : 'users'}
                    {org.plan ? ` · ${org.plan}` : ''}
                  </span>
                </span>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-300'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Users in {selected.name}</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            People who log in under this organization. This admin account does not upload leads.
          </p>
          {members.length === 0 ? (
            <p className="text-sm text-slate-500 border border-slate-200 rounded-lg px-4 py-6 text-center">
              No users in this organization yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {members.map((row) => (
                <li key={row.userId} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{row.email || '—'}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {row.workspaceName !== '—' ? row.workspaceName : 'No workspace'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-600">{roleLabel(row.role)}</p>
                    {row.mustChangePassword && (
                      <p className="text-[10px] font-medium text-amber-700">Set password</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
