import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { createOrganization, type CreateOrganizationInput } from '@/lib/org';
import { PLANS, type PlanType } from '@/types';

interface CreateOrgModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [plan, setPlan] = useState<PlanType>('starter');
  const [seatLimit, setSeatLimit] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user) {
      setError('Your session has expired. Sign in again.');
      return;
    }
    setSaving(true);
    setError(null);
    const input: CreateOrganizationInput = {
      name,
      seat_limit: seatLimit,
      contact_email: contactEmail,
      plan,
    };
    try {
      await createOrganization(input, user.id);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the organization.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New organization</h2>
            <p className="text-sm text-slate-500 mt-1">
              Seats cap how many people can log in under this brand.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-4 disabled:opacity-40"
            aria-label="Close create organization"
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
            <label htmlFor="org-name" className="block text-xs font-medium text-slate-600 mb-1.5">
              Organization name
            </label>
            <input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nair Stores"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="org-email" className="block text-xs font-medium text-slate-600 mb-1.5">
              Contact email
            </label>
            <input
              id="org-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="owner@brand.com"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="org-plan" className="block text-xs font-medium text-slate-600 mb-1.5">
              Plan / tier
            </label>
            <select
              id="org-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
              className="input-field"
            >
              {PLANS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="org-seats" className="block text-xs font-medium text-slate-600 mb-1.5">
              Allowed users (seats)
            </label>
            <input
              id="org-seats"
              type="number"
              min={1}
              max={500}
              value={Number.isNaN(seatLimit) ? '' : seatLimit}
              onChange={(e) => setSeatLimit(parseInt(e.target.value, 10))}
              className="input-field"
            />
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
            Create organization
          </button>
        </div>
      </div>
    </div>
  );
}
