import { useRef, useState } from 'react';
import { Camera, Loader2, Shield, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import PricingModal from '@/components/PricingModal';
import {
  AVATAR_ACCEPT,
  AVATAR_BUCKET,
  avatarObjectPath,
  profileInitials,
  validateAvatarFile,
} from '@/lib/avatar';
import { supabase } from '@/lib/supabase';
import { formatTrialEnd, getTrialState } from '@/lib/trial';
import { getPlan, type SubStatus } from '@/types';

const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  past_due: 'Payment overdue',
  cancelled: 'Cancelled',
};

type ProfileSection = 'account' | 'plans';

interface ProfileModalProps {
  /**
   * Passed in rather than re-queried: the dashboard already has it from
   * getMonthlyLeadCount, whose UTC month boundary matches the database trigger.
   * A second count here could disagree with the quota actually enforced.
   */
  monthlyCount: number;
  /** Trial banner "See plans" opens on the plan cards; the header opens account. */
  initialSection?: ProfileSection;
  onClose: () => void;
}

export default function ProfileModal({
  monthlyCount,
  initialSection = 'account',
  onClose,
}: ProfileModalProps) {
  const { user, workspace, subscription, profile, refreshWorkspace } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<ProfileSection>(initialSection);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const plan = getPlan(subscription?.plan ?? 'free');
  const trial = getTrialState(subscription);
  const overLimit = monthlyCount > plan.lead_limit;
  const usedShare = plan.lead_limit > 0 ? Math.min(1, monthlyCount / plan.lead_limit) : 0;
  const email = user?.email ?? profile?.email ?? '';
  const initials = profileInitials(workspace?.name, email);

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
    { label: 'Email', value: email || '—' },
    { label: 'Brand', value: workspace?.name ?? '—' },
    { label: 'Status', value: statusCaption() },
    { label: 'Free trial', value: trialCaption() },
  ];

  const planValue =
    plan.price === 0
      ? plan.name
      : `${plan.name} · ₹${plan.price.toLocaleString('en-IN')}/mo`;

  async function persistAvatarUrl(url: string | null): Promise<void> {
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
    if (error) throw new Error(error.message);
    await refreshWorkspace();
  }

  async function handleAvatarFile(file: File): Promise<void> {
    if (!user) {
      setAvatarError('Your session has expired. Please sign in again.');
      return;
    }
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setAvatarError(invalid);
      return;
    }

    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const path = avatarObjectPath(user.id);
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      });
      if (uploadError) throw new Error(uploadError.message);

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      if (!data.publicUrl) throw new Error('Could not read the photo URL. Please try again.');
      await persistAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not save the photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar(): Promise<void> {
    if (!user || !profile?.avatar_url) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const { error: removeError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([avatarObjectPath(user.id)]);
      if (removeError) throw new Error(removeError.message);
      await persistAvatarUrl(null);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove the photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  function renderSection(current: ProfileSection) {
    switch (current) {
      case 'account':
        return (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4">
                <span className="text-xs text-slate-500 shrink-0">{row.label}</span>
                <span className="text-sm text-slate-800 font-medium text-right break-words min-w-0">
                  {row.value}
                </span>
              </div>
            ))}

            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-start justify-between gap-4 mb-2">
                <span className="text-xs text-slate-500 shrink-0">Current plan</span>
                <span className="text-sm text-slate-800 font-medium text-right break-words min-w-0">
                  {planValue}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <span className="text-xs text-slate-500">Leads this month</span>
                <span
                  className={`text-sm font-medium ${overLimit ? 'text-amber-700' : 'text-slate-800'}`}
                >
                  {monthlyCount.toLocaleString('en-IN')} of {plan.lead_limit.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full ${overLimit ? 'bg-amber-500' : 'bg-blue-600'}`}
                  style={{ width: `${usedShare * 100}%` }}
                />
              </div>
              <button type="button" onClick={() => setSection('plans')} className="btn-primary w-full">
                View plans
              </button>
            </div>
          </div>
        );
      case 'plans':
        return (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              All prices in INR, inclusive of GST. Pay via Razorpay — UPI, cards and netbanking.
            </p>
            <PricingModal />
          </div>
        );
      default: {
        const _exhaustive: never = current;
        return _exhaustive;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your profile</h2>
            <p className="text-sm text-slate-500 mt-1">
              Photo and account details for this workspace.
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
          <div className="mx-7 mt-3 flex items-center gap-2 text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Admin — you can view and manage every workspace.</span>
          </div>
        )}

        <div className="px-7 pt-5 pb-2 flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleAvatarFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
            aria-label={profile?.avatar_url ? 'Change profile photo' : 'Upload profile photo'}
          >
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-lg font-semibold text-slate-600">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-slate-900 text-white shadow-sm">
              {avatarBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {workspace?.name ?? 'Your workspace'}
            </p>
            <p className="text-xs text-slate-500 truncate">{email || '—'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 disabled:opacity-60"
              >
                {profile?.avatar_url ? 'Change photo' : 'Upload photo'}
              </button>
              {profile?.avatar_url && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={avatarBusy}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">JPG, PNG or WebP · up to 2 MB</p>
          </div>
        </div>

        {avatarError && (
          <p className="mx-7 mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {avatarError}
          </p>
        )}

        <div className="px-7 pt-4">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSection('account')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                section === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => setSection('plans')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                section === 'plans' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Plans
            </button>
          </div>
        </div>

        <div className="px-7 py-5">{renderSection(section)}</div>
      </div>
    </div>
  );
}
