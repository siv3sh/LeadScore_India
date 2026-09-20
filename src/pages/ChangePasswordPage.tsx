import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useAuth } from '@/lib/auth';

export default function ChangePasswordPage() {
  const { changePassword, signOut, profile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const forced = profile?.must_change_password === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: changeError } = await changePassword(password);
    if (changeError) {
      setError(changeError);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-[#E8F1FF]/60 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <BrandLogo size={48} />
        </div>
        <div className="card p-5 sm:p-8">
          <h1 className="text-lg font-bold text-slate-900">
            {forced ? 'Set a new password' : 'Change password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {forced
              ? 'Your admin created this login. Choose a password only you know before opening the dashboard.'
              : 'Pick a new password for this account.'}
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-field pl-10"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type it again"
                  className="input-field pl-10"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save password
            </button>
          </form>

          <button
            type="button"
            onClick={() => void signOut()}
            className="block w-full text-center text-xs text-slate-400 hover:text-slate-700 mt-6"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
