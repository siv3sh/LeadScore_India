import { Shield, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatTrialEnd, getTrialState } from '@/lib/trial';
import { getPlan, type SubStatus } from '@/types';

const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  past_due: 'Payment overdue',
  cancelled: 'Cancelled',
};

interface ProfileModalProps {
  /**
   * Passed in rather than re-queried: the dashboard already has it from
   * getMonthlyLeadCount, whose UTC month boundary matches the database trigger.
   * A second count here could disagree with the quota actually enforced.
   */
  monthlyCount: number;
  onClose: () => void;
}

export default function ProfileModal({ monthlyCount, onClose }: ProfileModalProps) {
  const { user, workspace, subscription, profile } = useAuth();

  const plan = getPlan(subscription?.plan ?? 'free');
  const trial = getTrialState(subscription);
  const overLimit = monthlyCount > plan.lead_limit;
  const usedShare = plan.lead_limit > 0 ? Math.min(1, monthlyCount / plan.lead_limit) : 0;

  function trialCaption(): string {
    if (!trial.endsAt) return 'Not on a trial';
    if (trial.expired) return `Ended ${formatTrialEnd(trial.endsAt)}`;
    return `${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left · ends ${formatTrialEnd(trial.endsAt)}`;
  }

  function statusCaption(): string {
    if (!subscription) return '—';
    // subscriptions.status is a plain text column with no CHECK constraint, so
    // a value outside SubStatus can reach this and must still render.
    return SUB_STATUS_LABELS[subscription.status] ?? subscription.status;
  }

  const rows = [
    // The session carries the live address; profiles.email is a signup snapshot.
    { label: 'Email', value: user?.email ?? profile?.email ?? '—' },
    { label: 'Brand', value: workspace?.name ?? '—' },
    {
      label: 'Plan',
      value:
        plan.price === 0
          ? plan.name
          : `${plan.name} · ₹${plan.price.toLocaleString('en-IN')}/mo`,
    },
    { label: 'Status', value: statusCaption() },
    { label: 'Free trial', value: trialCaption() },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your profile</h2>
            <p className="text-sm text-slate-500 mt-1">
              Account and plan details for this workspace.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-4"
            aria-label="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {profile?.is_admin && (
          <div className="mx-7 mt-3 flex items-center gap-2 text-xs font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Admin — you can view and manage every workspace.</span>
          </div>
        )}

        <div className="px-7 py-5 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <span className="text-xs text-slate-500 shrink-0">{row.label}</span>
              <span className="text-sm text-slate-800 font-medium text-right break-words min-w-0">
                {row.value}
              </span>
            </div>
          ))}

          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className="text-xs text-slate-500">Leads this month</span>
              <span
                className={`text-sm font-medium ${overLimit ? 'text-amber-700' : 'text-slate-800'}`}
              >
                {monthlyCount.toLocaleString('en-IN')} of {plan.lead_limit.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${overLimit ? 'bg-amber-500' : 'bg-teal-600'}`}
                style={{ width: `${usedShare * 100}%` }}
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 pt-2">
            Read-only. To change your plan, use Pricing.
          </p>
        </div>
      </div>
    </div>
  );
}
