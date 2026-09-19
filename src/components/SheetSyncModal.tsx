import { useState } from 'react';
import { ChevronDown, ExternalLink, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import MenuDropdown from '@/components/MenuDropdown';
import {
  clearWorkspaceSheetConnection,
  deleteSheetSyncUploads,
  fetchSheetCsvViaProxy,
  getMonthlyLeadCount,
  markSheetSyncResult,
  processCSVUpload,
  saveWorkspaceSheetConnection,
  syncWorkspaceGoogleSheet,
} from '@/lib/api';
import {
  guessColumnMapping,
  parseCSV,
  REQUIRED_COLUMNS,
  type ColumnMapping,
} from '@/lib/csvParser';
import { SHEET_SYNC_FILE_PREFIX, toGoogleSheetCsvExportUrl } from '@/lib/googleSheet';
import type { Workspace } from '@/types';

type Step = 'link' | 'mapping' | 'working';

export default function SheetSyncModal({
  workspace,
  planLimit,
  onClose,
  onSynced,
}: {
  workspace: Workspace;
  planLimit: number;
  onClose: () => void;
  onSynced: () => Promise<void>;
}) {
  const existingUrl = workspace.sheet_url ?? '';
  const existingMapping = (workspace.sheet_mapping as ColumnMapping | null) ?? null;

  const [step, setStep] = useState<Step>('link');
  const [urlInput, setUrlInput] = useState(existingUrl);
  const [autoSync, setAutoSync] = useState(workspace.sheet_sync_enabled ?? true);
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(existingMapping);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function previewSheet() {
    setError(null);
    setBusy(true);
    try {
      const exportUrl = toGoogleSheetCsvExportUrl(urlInput);
      const text = await fetchSheetCsvViaProxy(exportUrl);
      const parsed = parseCSV(text);
      if (parsed.rows.length === 0) {
        throw new Error('Sheet has headers but no lead rows yet.');
      }
      setCsvText(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(existingMapping ?? guessColumnMapping(parsed.headers));
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that Sheet');
    } finally {
      setBusy(false);
    }
  }

  async function saveAndSync() {
    if (!mapping) return;
    setError(null);
    setBusy(true);
    setStep('working');
    try {
      await saveWorkspaceSheetConnection(workspace.id, {
        sheet_url: urlInput.trim(),
        sheet_mapping: mapping,
        sheet_sync_enabled: autoSync,
      });

      await deleteSheetSyncUploads(workspace.id);
      const monthlyCount = await getMonthlyLeadCount(workspace.id);
      if (monthlyCount + rows.length > planLimit) {
        throw new Error(
          `This Sheet has ${rows.length.toLocaleString('en-IN')} rows, which would exceed your plan limit.`
        );
      }

      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      await processCSVUpload(
        workspace.id,
        `${SHEET_SYNC_FILE_PREFIX} ${stamp}.csv`,
        csvText,
        mapping
      );
      await markSheetSyncResult(workspace.id, { ok: true });
      await onSynced();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      await markSheetSyncResult(workspace.id, { ok: false, error: message });
      setError(message);
      setStep('mapping');
    } finally {
      setBusy(false);
    }
  }

  async function syncExisting() {
    if (!existingUrl || !existingMapping) {
      setError('Connect and map columns once before Sync now.');
      return;
    }
    setError(null);
    setBusy(true);
    setStep('working');
    try {
      await syncWorkspaceGoogleSheet(workspace.id, existingUrl, existingMapping, planLimit);
      await onSynced();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setStep('link');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this Google Sheet? Your existing leads stay in LeadScore.')) return;
    setBusy(true);
    try {
      await clearWorkspaceSheetConnection(workspace.id);
      await onSynced();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">Live Google Sheet</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {step === 'link' && (
            <>
              <p className="text-sm text-slate-600 leading-relaxed">
                Keep leads in a Google Sheet. LeadScore pulls the latest rows when you sync — or
                automatically when you open the app (every 6 hours).
              </p>
              <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
                <li>Open your Sheet → Share → Anyone with the link → Viewer</li>
                <li>Paste the link below</li>
                <li>Map columns once — Sync keeps using that mapping</li>
              </ol>
              <p className="text-xs text-slate-500 leading-relaxed">
                WhatsApp or email lists: paste new rows into this Sheet. One live source — no inbox
                setup.
              </p>

              <label className="block text-xs font-medium text-slate-600 mb-1">Sheet link</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="input-field w-full text-sm"
              />

              <label className="flex items-center gap-2 text-xs text-slate-600 mt-2">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Auto-sync when I open the dashboard (if older than 6 hours)
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy || !urlInput.trim()}
                  onClick={() => void previewSheet()}
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                  {existingMapping ? 'Update mapping' : 'Connect Sheet'}
                </button>
                {existingUrl && existingMapping && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void syncExisting()}
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Sync now
                  </button>
                )}
                {existingUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disconnect()}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {workspace.sheet_last_synced_at && (
                <p className="text-[11px] text-slate-400">
                  Last synced {new Date(workspace.sheet_last_synced_at).toLocaleString('en-IN')}
                </p>
              )}
              {workspace.sheet_last_error && (
                <p className="text-[11px] text-amber-700">Last error: {workspace.sheet_last_error}</p>
              )}
            </>
          )}

          {step === 'mapping' && mapping && (
            <>
              <p className="text-sm text-slate-600">
                Found {rows.length.toLocaleString('en-IN')} rows. Confirm columns, then save &amp;
                sync.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {REQUIRED_COLUMNS.map((field) => (
                  <label key={field} className="block text-xs">
                    <span className="font-medium text-slate-600 capitalize">
                      {field.replace(/_/g, ' ')}
                    </span>
                    <MenuDropdown
                      ariaLabel={field.replace(/_/g, ' ')}
                      align="left"
                      className="mt-1 w-full"
                      triggerClassName="input-field w-full py-1.5 justify-between"
                      trigger={
                        <>
                          <span className="truncate">{mapping[field] || '— Not mapped —'}</span>
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        </>
                      }
                      items={headers.map((header) => ({
                        id: `${field}-${header}`,
                        label: header,
                        active: mapping[field] === header,
                        onSelect: () => setMapping({ ...mapping, [field]: header }),
                      }))}
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setStep('link')} className="btn-secondary text-sm">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAndSync()}
                  className="btn-primary text-sm inline-flex items-center gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save & sync
                </button>
              </div>
            </>
          )}

          {step === 'working' && (
            <div className="py-10 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-800">Syncing your Sheet…</p>
              <p className="text-xs text-slate-500 mt-1">Scoring leads and updating today&apos;s list</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
