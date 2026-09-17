import { useState, useCallback, useEffect } from 'react';
import {
  Upload as UploadIcon,
  Download,
  Trash2,
  TrendingUp,
  Users,
  Target,
  Gauge,
  Activity,
  FileText,
  X,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Search,
  MessageCircle,
  Phone,
  LogOut,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  processCSVUpload,
  fetchUploads,
  fetchLeads,
  deleteUpload,
  exportLeadsToCSV,
  downloadCSV,
  getMonthlyLeadCount,
  type UploadResult,
} from '@/lib/api';
import {
  parseCSV,
  guessColumnMapping,
  generateSampleCSV,
  summarizeStatuses,
  RESOLVED_STATUSES,
  type ColumnMapping,
} from '@/lib/csvParser';
import {
  formatINR,
  formatSource,
  formatStatus,
  PRIORITY_STYLES,
  telLink,
  whatsappNumber,
} from '@/lib/display';
import { formatTrialEnd, getTrialState } from '@/lib/trial';
import LeadCharts from '@/components/LeadCharts';
import PricingModal from '@/components/PricingModal';
import { getPlan, type Priority } from '@/types';
import type { Upload, Lead } from '@/types';

export default function Dashboard() {
  const { workspace, subscription, signOut, refreshWorkspace } = useAuth();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const plan = getPlan(subscription?.plan ?? 'free');
  const trial = getTrialState(subscription);

  const loadData = useCallback(async () => {
    if (!workspace) return;
    setLoadingData(true);
    setError(null);
    try {
      const [ups, used] = await Promise.all([
        fetchUploads(workspace.id),
        getMonthlyLeadCount(workspace.id),
      ]);
      setUploads(ups);
      setMonthlyCount(used);

      const latest = ups[0] ?? null;
      setSelectedUpload(latest);
      setLeads(latest ? await fetchLeads(workspace.id, latest.id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your leads');
    } finally {
      setLoadingData(false);
    }
  }, [workspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSelectUpload(upload: Upload) {
    if (!workspace) return;
    setSelectedUpload(upload);
    setSelectedIds(new Set());
    try {
      setLeads(await fetchLeads(workspace.id, upload.id));
    } catch {
      setLeads([]);
    }
  }

  async function handleDeleteUpload(uploadId: string) {
    if (!workspace) return;
    if (!confirm('Delete this upload and all its leads? This cannot be undone.')) return;
    try {
      await deleteUpload(uploadId);
      setSelectedIds(new Set());
      const remaining = uploads.filter((u) => u.id !== uploadId);
      setUploads(remaining);
      setMonthlyCount(await getMonthlyLeadCount(workspace.id));
      if (selectedUpload?.id === uploadId) {
        const next = remaining[0] ?? null;
        setSelectedUpload(next);
        setLeads(next ? await fetchLeads(workspace.id, next.id) : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete upload');
    }
  }

  function getFilteredLeads(): Lead[] {
    const query = searchQuery.toLowerCase().trim();
    return leads.filter((l) => {
      if (priorityFilter !== 'all' && l.priority !== priorityFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (query) {
        const haystack = [l.name, l.phone, l.city, l.lead_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function handleDownloadTemplate() {
    downloadCSV(generateSampleCSV(), 'leadscore_template.csv');
  }

  function handleExport() {
    const filtered = getFilteredLeads();
    // Exporting the ticked rows is the only reason to tick them.
    const rows = selectedIds.size > 0 ? filtered.filter((l) => selectedIds.has(l.id)) : filtered;
    downloadCSV(exportLeadsToCSV(rows), `leads_${selectedUpload?.file_name ?? 'export'}.csv`);
  }

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredLeads = getFilteredLeads();
  const sources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[];
  const statuses = Array.from(new Set(leads.map((l) => l.status).filter(Boolean))) as string[];
  // Selections survive a filter change, but only visible ones are exported, so
  // the count shown has to match that rather than the raw set size.
  const selectedVisible = filteredLeads.filter((l) => selectedIds.has(l.id)).length;
  const allVisibleSelected = filteredLeads.length > 0 && selectedVisible === filteredLeads.length;

  const highPriority = leads.filter((l) => l.priority === 'high').length;
  const avgScore =
    leads.length > 0
      ? Math.round(leads.reduce((s, l) => s + (l.score_0_100 ?? 0), 0) / leads.length)
      : 0;
  const predictedConversion =
    leads.length > 0
      ? leads.reduce((s, l) => s + (l.conversion_probability ?? 0), 0) / leads.length
      : 0;
  const quotaShare = plan.lead_limit > 0 ? monthlyCount / plan.lead_limit : 0;

  // Guaranteed by the on_auth_user_created trigger, so reaching this means
  // something is genuinely wrong — say so rather than crashing on workspace.id.
  if (!workspace) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">No workspace found</h2>
          <p className="text-sm text-slate-500 mb-5">
            Your account exists but has no workspace attached, so there's nothing to load. Signing out
            and back in usually fixes this.
          </p>
          <button onClick={signOut} className="btn-primary">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 leading-tight truncate">
                  LeadScore India
                </h1>
                <p className="text-[11px] text-slate-400 leading-tight truncate">
                  Predictive lead scoring
                  {selectedUpload?.model_auc
                    ? ` · Model AUC ${selectedUpload.model_auc.toFixed(2)}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Labels collapse below sm, so each button needs its own name. */}
              <button onClick={handleDownloadTemplate} className="btn-header" aria-label="Download CSV template">
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Template</span>
              </button>
              <button
                onClick={handleExport}
                disabled={leads.length === 0}
                className="btn-header"
                aria-label="Export leads to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button onClick={() => setShowPricing(true)} className="btn-header" aria-label="View pricing plans">
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pricing</span>
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition"
              >
                <UploadIcon className="w-3.5 h-3.5" />
                Upload CSV
              </button>
              <button
                onClick={signOut}
                className="p-2 text-slate-400 hover:text-slate-700 transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {(trial.active || trial.expired) && trial.endsAt && (
        <div
          className={`text-sm py-2.5 px-4 text-center ${
            trial.expired ? 'bg-amber-100 text-amber-900' : 'bg-teal-700 text-white'
          }`}
        >
          {trial.expired ? (
            <>
              Your free trial ended on {formatTrialEnd(trial.endsAt)}. Your leads stay available to
              view and export, but adding more needs a paid plan.
            </>
          ) : (
            <>
              {trial.daysLeft} day{trial.daysLeft === 1 ? '' : 's'} left in your free trial ·{' '}
              {plan.lead_limit.toLocaleString('en-IN')} leads/month
            </>
          )}{' '}
          <button
            onClick={() => setShowPricing(true)}
            className="underline font-medium hover:opacity-80"
          >
            See plans
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">Lead intelligence overview</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Every lead scored, ranked and ready for 1-click outreach.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {uploads.length > 1 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
            <span className="text-xs text-slate-400 shrink-0">Uploads:</span>
            {uploads.map((upload) => (
              <button
                key={upload.id}
                onClick={() => handleSelectUpload(upload)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs border transition ${
                  selectedUpload?.id === upload.id
                    ? 'border-teal-600 bg-teal-50 text-teal-800 font-medium'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {upload.file_name}
                <span className="text-slate-400 ml-1.5">{upload.row_count}</span>
              </button>
            ))}
          </div>
        )}

        {leads.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              icon={Users}
              label="Total leads"
              value={leads.length.toLocaleString('en-IN')}
              hint="Scored this month"
            />
            <StatCard
              icon={Target}
              label="High priority"
              value={highPriority.toLocaleString('en-IN')}
              hint="Top 20% by score"
            />
            <StatCard
              icon={TrendingUp}
              label="Predicted conversion"
              value={`${Math.round(predictedConversion * 100)}%`}
              hint="Model estimate"
            />
            <StatCard
              icon={Gauge}
              label="Average lead score"
              value={avgScore.toString()}
              hint="Across all leads"
            />
            <div className="card p-4">
              <div className="flex items-start justify-between">
                <p className="text-xs text-slate-500">Monthly quota usage</p>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {Math.round(quotaShare * 100)}%
              </p>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${
                    quotaShare >= 0.9 ? 'bg-red-500' : quotaShare >= 0.7 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(quotaShare * 100, 1))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {monthlyCount.toLocaleString('en-IN')} / {plan.lead_limit.toLocaleString('en-IN')} leads
              </p>
            </div>
          </div>
        )}

        <LeadCharts leads={leads} />

        {loadingData ? (
          <div className="card p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : leads.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-4">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">No leads yet</h3>
            <p className="text-sm text-slate-500 mb-4">Upload a CSV file to start scoring your leads.</p>
            <button onClick={() => setShowUploadModal(true)} className="btn-primary inline-flex items-center gap-2">
              <UploadIcon className="w-4 h-4" />
              Upload Your First CSV
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="p-4 flex flex-col lg:flex-row gap-3 border-b border-slate-100">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, phone, city or lead ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field py-2 pl-9 w-full"
                />
              </div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
                className="input-field py-2 w-auto"
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="input-field py-2 w-auto"
              >
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {formatSource(s)}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field py-2 w-auto"
              >
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {formatStatus(s).label}
                  </option>
                ))}
              </select>
              {selectedUpload && (
                <button
                  onClick={() => handleDeleteUpload(selectedUpload.id)}
                  className="btn-danger flex items-center gap-2 shrink-0"
                  title="Delete this upload"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="pl-4 pr-2 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked ? new Set(filteredLeads.map((l) => l.id)) : new Set()
                          )
                        }
                        className="rounded border-slate-300"
                        aria-label="Select all visible leads"
                      />
                    </th>
                    <th className="px-2 py-3 font-medium min-w-[190px]">Lead</th>
                    <th className="px-3 py-3 font-medium">Score</th>
                    <th className="px-3 py-3 font-medium">Priority</th>
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th className="px-3 py-3 font-medium text-right">Value</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right pr-4">Outreach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLeads.map((lead) => {
                    const priority = lead.priority ?? 'low';
                    const status = formatStatus(lead.status);
                    const waNumber = whatsappNumber(lead.phone);
                    const callHref = telLink(lead.phone);
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/60 transition">
                        <td className="pl-4 pr-2 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleLead(lead.id)}
                            className="rounded border-slate-300"
                            aria-label={`Select ${lead.name ?? 'lead'}`}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <p className="font-semibold text-slate-800 text-[13px] truncate max-w-[220px]">
                            {lead.name || '—'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                            {lead.phone || 'No phone'}
                            {lead.city ? ` · ${lead.city}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 text-[13px] w-6">
                              {lead.score_0_100 ?? 0}
                            </span>
                            <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${PRIORITY_STYLES[priority].dot}`}
                                style={{ width: `${lead.score_0_100 ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium border ${PRIORITY_STYLES[priority].className}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_STYLES[priority].dot}`} />
                            {PRIORITY_STYLES[priority].label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 text-[13px] whitespace-nowrap">
                          {formatSource(lead.source)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700 text-[13px] whitespace-nowrap">
                          {lead.order_value > 0 ? formatINR(lead.order_value) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-md text-[11px] font-medium border ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {waNumber ? (
                              <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-medium hover:bg-emerald-50 transition"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                WhatsApp
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-300 px-2.5">No number</span>
                            )}
                            {callHref && (
                              <a
                                href={callHref}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 transition"
                                title={`Call ${lead.phone}`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
              Showing {filteredLeads.length} of {leads.length} leads
              {selectedVisible > 0 && ` · ${selectedVisible} selected for export`}
            </div>
          </div>
        )}
      </div>

      {showPricing && <PricingModal onClose={() => setShowPricing(false)} />}

      {showUploadModal && (
        <UploadModal
          workspaceId={workspace.id}
          planLimit={plan.lead_limit}
          onClose={() => setShowUploadModal(false)}
          onSuccess={async () => {
            setShowUploadModal(false);
            await loadData();
            await refreshWorkspace();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon className="w-4 h-4 text-slate-300" />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function UploadModal({
  workspaceId,
  planLimit,
  onClose,
  onSuccess,
}: {
  workspaceId: string;
  planLimit: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'processing'>('upload');
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  // Kept alongside the raw text so the mapping step never re-parses on render.
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = parseCSV(text);
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setMapping(guessColumnMapping(parsed.headers));
        setCsvText(text);
        setFileName(file.name);
        setStep('mapping');
      } catch {
        setError('Could not parse this CSV file. Please check the format.');
      }
    };
    reader.onerror = () => setError('Could not read that file. Please try again.');
    reader.readAsText(file);
  }

  function handleDownloadSample() {
    downloadCSV(generateSampleCSV(), 'leadscore_sample_leads.csv');
  }

  async function handleProcess() {
    if (!mapping) return;
    setStep('processing');
    setError(null);

    try {
      const monthlyCount = await getMonthlyLeadCount(workspaceId);
      if (monthlyCount + rows.length > planLimit) {
        setError(
          `This upload would exceed your plan limit (${planLimit.toLocaleString('en-IN')} leads/month). You've used ${monthlyCount.toLocaleString('en-IN')} this month. Please upgrade your plan.`
        );
        setStep('mapping');
        return;
      }

      const res = await processCSVUpload(workspaceId, fileName, csvText, mapping);
      setResult(res);
      setTimeout(onSuccess, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process upload');
      setStep('mapping');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Upload Lead Data</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-6 text-sm">
            <StepIndicator active={step === 'upload'} done={step !== 'upload'} label="Upload" />
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <StepIndicator active={step === 'mapping'} done={step === 'processing'} label="Map Columns" />
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <StepIndicator active={step === 'processing'} done={false} label="Score" />
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-teal-500 transition cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
                onClick={() => document.getElementById('csv-input')?.click()}
              >
                <UploadIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">Drop your CSV here, or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">
                  CSV files only, up to {planLimit.toLocaleString('en-IN')} leads
                </p>
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
              <div className="mt-4">
                <button onClick={handleDownloadSample} className="text-sm text-teal-700 hover:underline flex items-center gap-1.5">
                  <Download className="w-4 h-4" />
                  Download sample CSV template
                </button>
              </div>
              <div className="mt-4 p-4 bg-slate-50 rounded-lg text-xs text-slate-500">
                <p className="font-medium text-slate-600 mb-1">Required columns:</p>
                <p>name, phone, source, created_at, order_value, num_orders, status</p>
                <p className="font-medium text-slate-600 mt-2 mb-1">Optional columns:</p>
                <p>lead_id, city, last_contacted_at</p>
              </div>
            </div>
          )}

          {step === 'mapping' && mapping && (
            <div>
              <p className="text-sm text-slate-600 mb-4">
                Map your CSV columns to LeadScore fields. We've auto-detected the mapping — adjust if needed.
              </p>
              <div className="space-y-3">
                <MappingField label="Name" value={mapping.name} headers={headers} onChange={(v) => setMapping({ ...mapping, name: v })} required />
                <MappingField label="Phone" value={mapping.phone} headers={headers} onChange={(v) => setMapping({ ...mapping, phone: v })} required />
                <MappingField label="Source" value={mapping.source} headers={headers} onChange={(v) => setMapping({ ...mapping, source: v })} required />
                <MappingField label="Created At" value={mapping.created_at} headers={headers} onChange={(v) => setMapping({ ...mapping, created_at: v })} required />
                <MappingField label="Order Value" value={mapping.order_value} headers={headers} onChange={(v) => setMapping({ ...mapping, order_value: v })} required />
                <MappingField label="Num Orders" value={mapping.num_orders} headers={headers} onChange={(v) => setMapping({ ...mapping, num_orders: v })} required />
                <MappingField label="Status" value={mapping.status} headers={headers} onChange={(v) => setMapping({ ...mapping, status: v })} required />
                <StatusGuidance headers={headers} rows={rows} statusColumn={mapping.status} />
                <MappingField label="City (optional)" value={mapping.city ?? ''} headers={headers} onChange={(v) => setMapping({ ...mapping, city: v || undefined })} />
                <MappingField label="Lead ID (optional)" value={mapping.lead_id ?? ''} headers={headers} onChange={(v) => setMapping({ ...mapping, lead_id: v || undefined })} />
                <MappingField label="Last Contacted (optional)" value={mapping.last_contacted_at ?? ''} headers={headers} onChange={(v) => setMapping({ ...mapping, last_contacted_at: v || undefined })} />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('upload')} className="btn-secondary">
                  Back
                </button>
                <button onClick={handleProcess} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Score {rows.length} Leads
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-12 text-center">
              {result ? (
                <>
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mb-4">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Scoring Complete!</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    {result.leadCount} leads scored · Model AUC: {result.metrics.auc.toFixed(3)}
                  </p>
                  <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <p className="text-xs text-slate-500">Accuracy</p>
                      <p className="font-bold text-slate-800">{(result.metrics.accuracy * 100).toFixed(0)}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <p className="text-xs text-slate-500">Precision (top 20%)</p>
                      <p className="font-bold text-slate-800">{(result.metrics.precision * 100).toFixed(0)}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <p className="text-xs text-slate-500">Recall (top 20%)</p>
                      <p className="font-bold text-slate-800">{(result.metrics.recall * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="mt-4 max-w-sm mx-auto text-left space-y-2">
                      {result.warnings.map((warning) => (
                        <div
                          key={warning}
                          className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                        >
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Scoring your leads...</h3>
                  <p className="text-sm text-slate-500">Training model and computing conversion probabilities</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The model learns only from settled outcomes, so a file of pipeline stages
 * trains on nothing. Showing that here — against the user's own values — beats
 * failing after they press Score.
 */
function StatusGuidance({
  headers,
  rows,
  statusColumn,
}: {
  headers: string[];
  rows: string[][];
  statusColumn: string;
}) {
  const summary = summarizeStatuses(headers, rows, statusColumn);
  if (summary.trainable.length === 0 && summary.open.length === 0) return null;

  const describe = (entries: { value: string; count: number }[]) =>
    entries.map((e) => `${e.value} (${e.count})`).join(', ');

  const hasNegatives = summary.trainable.some((e) => e.value !== 'won');

  return (
    <div className="ml-[172px] text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
      <p className="text-slate-600">
        The model trains only on settled outcomes:{' '}
        <span className="font-medium">{RESOLVED_STATUSES.join(', ')}</span>.
      </p>
      {summary.trainable.length > 0 && (
        <p className="text-emerald-700">Trains on: {describe(summary.trainable)}</p>
      )}
      {summary.open.length > 0 && (
        <p className="text-slate-500">
          Scored but not trained on: {describe(summary.open)}
        </p>
      )}
      {summary.wonCount === 0 && (
        <p className="text-amber-700">
          Nothing is marked <span className="font-medium">won</span>, so there is no outcome to
          learn. Map a column whose values include won, or rename your converted status to
          "won" before uploading.
        </p>
      )}
      {summary.wonCount > 0 && !hasNegatives && (
        <p className="text-amber-700">
          Every settled lead is won, so the model has no failed example to contrast against and
          will fall back to a simple source-and-recency ranking. Include lost or no_response
          leads for a real model.
        </p>
      )}
    </div>
  );
}

function StepIndicator({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        done
          ? 'bg-emerald-100 text-emerald-700'
          : active
          ? 'bg-teal-700 text-white'
          : 'bg-slate-100 text-slate-400'
      }`}
    >
      {label}
    </span>
  );
}

function MappingField({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-slate-600 w-40 shrink-0">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field py-2 flex-1">
        <option value="">— Not mapped —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}
