import { useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, X } from 'lucide-react';
import { createOrgUser, type CredentialMode, type CreatedOrgUser } from '@/lib/org';
import type { Organization } from '@/types';

interface CreateUserModalProps {
  org: Organization;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateUserModal({ org, onClose, onCreated }: CreateUserModalProps) {
  const [mode, setMode] = useState<CredentialMode>('generate');
  const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedOrgUser | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await createOrgUser({
        org_id: org.id,
        credential_mode: mode,
        email: mode === 'email' ? email : undefined,
        workspace_name: workspaceName || org.name,
      });
      setCreated(result);
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user.');
      setSaving(false);
    }
  }

  async function copyCredentials() {
    if (!created) return;
    const text = `Email: ${created.email}\nPassword: ${created.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the fields and copy them yourself.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Add user</h2>
            <p className="text-sm text-slate-500 mt-1 truncate">{org.name}</p>
          </div>
          <button
            onClick={() => {
              if (created) onCreated();
              onClose();
            }}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-4 disabled:opacity-40"
            aria-label="Close add user"
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

        {created ? (
          <div className="px-7 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              Copy these now. The password is not shown again.
            </p>
            {created.email_stubbed && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Email sending is not wired up yet, so nothing was mailed. Share this password
                yourself.
              </p>
            )}
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Email / username</p>
              <p className="text-sm font-medium text-slate-900 break-all">{created.email}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Temporary password</p>
              <p className="text-sm font-medium text-slate-900 font-mono">{created.password}</p>
            </div>
            <p className="text-[11px] text-slate-400">
              They will be asked to change this password on first login.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void copyCredentials()}
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreated();
                  onClose();
                }}
                className="btn-primary flex-1"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-7 py-5 space-y-4">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode('generate')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition ${
                    mode === 'generate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Generate login
                </button>
                <button
                  type="button"
                  onClick={() => setMode('email')}
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition ${
                    mode === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Email temp password
                </button>
              </div>

              {mode === 'generate' ? (
                <p className="text-xs text-slate-500">
                  We create an email and password now. Copy them and send them on WhatsApp or
                  write them down — nothing is mailed.
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="new-user-email"
                    className="block text-xs font-medium text-slate-600 mb-1.5"
                  >
                    Their personal email
                  </label>
                  <input
                    id="new-user-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@brand.com"
                    className="input-field"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Email sending is stubbed until a provider is connected. You will still see
                    the password to copy.
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="new-user-workspace"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Workspace name (optional)
                </label>
                <input
                  id="new-user-workspace"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={org.name}
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
                disabled={saving || (mode === 'email' && !email.trim())}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create user
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
