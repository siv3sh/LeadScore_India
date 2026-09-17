import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { applyPlanOverride, expiryFromDays, type AdminUserRow } from '@/lib/adminApi';
import { formatTrialEnd } from '@/lib/trial';
import { PLANS, getPlan, type PlanType, type SubStatus } from '@/types';

const STATUS_OPTIONS: { value: SubStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'past_due', label: 'Payment overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const DURATION_PRESETS = [30, 90, 180, 365];

interface PlanOverrideModalProps {
  row: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}

export default function PlanOverrideModal({ row, onClose, onSaved }: PlanOverrideModalProps) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>(
    (PLANS.find((p) => p.id === row.plan)?.id ?? 'free') as PlanType
  );
  const [status, setStatus] = useState<SubStatus>(
    (STATUS_OPTIONS.find((s) => s.value === row.status)?.value ?? 'active') as SubStatus
  );
  const [durationDays, setDurationDays] = useState(30);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors what applyPlanOverride will store, so the admin sees the date they
  // are actually granting before committing to it.
  const previewExpiry = Number.isInteger(durationDays) && durationDays > 0
    ? formatTrialEnd(new Date(expiryFromDays(durationDays)))
    : '—';

  async function handleSave() {
    if (!user) {
      setError('Your session has expired. Sign in again.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await applyPlanOverride(row, { plan, status, durationDays, note }, user.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Change plan</h2>
            <p className="text-sm text-slate-500 mt-1 truncate">
              {row.email} · {row.workspaceName}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-4 disabled:opacity-40"
            aria-label="Close plan override"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-7 mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="px-7 py-5 space-y-4">
          <div>
            <label htmlFor="override-plan" className="block text-xs font-medium text-slate-600 mb-1.5">
              Plan
            </label>
            <select
              id="override-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
              className="input-field"
            >
              {PLANS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.lead_limit.toLocaleString('en-IN')} leads/mo
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="override-status" className="block text-xs font-medium text-slate-600 mb-1.5">
              Status
            </label>
            <select
              id="override-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SubStatus)}
              className="input-field"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {status !== 'active' && (
              <p className="text-[11px] text-amber-700 mt-1.5">
                Only an active subscription grants its plan limit. This account will be held to the
                free limit of {getPlan('free').lead_limit.toLocaleString('en-IN')} leads a month.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="override-days" className="block text-xs font-medium text-slate-600 mb-1.5">
              Grant for
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DURATION_PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(days)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                    durationDays === days
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
            <input
              id="override-days"
              type="number"
              min={1}
              max={3650}
              value={Number.isNaN(durationDays) ? '' : durationDays}
              onChange={(e) => setDurationDays(parseInt(e.target.value, 10))}
              className="input-field"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Ends {previewExpiry}.{' '}
              {plan === 'free'
                ? 'Enforced — lead uploads stop after this date.'
                : 'Recorded only — paid plans are not cut off automatically yet.'}
            </p>
          </div>

          <div>
            <label htmlFor="override-note" className="block text-xs font-medium text-slate-600 mb-1.5">
              Why is this changing? <span className="text-red-500">*</span>
            </label>
            <textarea
              id="override-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Agreed 3 months free during onboarding"
              className="input-field resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Saved to the audit trail with your name and cannot be edited later.
            </p>
          </div>
        </div>

        <div className="flex gap-2 px-7 pb-6">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save change
          </button>
        </div>
      </div>
    </div>
  );
}
