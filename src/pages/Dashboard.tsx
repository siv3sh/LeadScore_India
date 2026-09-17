import { useState, useCallback, useEffect } from 'react';
import {
  Upload as UploadIcon,
  Download,
  Filter,
  Trash2,
  TrendingUp,
  Users,
  Target,
  Award,
  FileText,
  X,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
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
  type ColumnMapping,
} from '@/lib/csvParser';
import LeadCharts from '@/components/LeadCharts';
import { getPlan, type Priority } from '@/types';
import { getPriorityColor } from '@/lib/ml';
import type { Upload, Lead } from '@/types';

export default function Dashboard({ onShowPlans }: { onShowPlans: () => void }) {
  const { workspace, subscription, signOut, refreshWorkspace } = useAuth();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const plan = getPlan(subscription?.plan ?? 'free');

  const loadData = useCallback(async () => {
    if (!workspace) return;
    setLoadingData(true);
    setError(null);
    try {
      const ups = await fetchUploads(workspace.id);
      setUploads(ups);
      if (ups.length > 0 && !selectedUpload) {
        setSelectedUpload(ups[0]);
        const ls = await fetchLeads(workspace.id, ups[0].id);
        setLeads(ls);
      } else if (selectedUpload) {
        const ls = await fetchLeads(workspace.id, selectedUpload.id);
        setLeads(ls);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  }, [workspace, selectedUpload]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSelectUpload(upload: Upload) {
    if (!workspace) return;
    setSelectedUpload(upload);
    try {
      const ls = await fetchLeads(workspace.id, upload.id);
      setLeads(ls);
    } catch {
      setLeads([]);
    }
  }

  async function handleDeleteUpload(uploadId: string) {
    if (!workspace) return;
    if (!confirm('Delete this upload and all its leads? This cannot be undone.')) return;
    try {
      await deleteUpload(uploadId);
      const ups = uploads.filter((u) => u.id !== uploadId);
      setUploads(ups);
      if (selectedUpload?.id === uploadId) {
        setSelectedUpload(ups[0] ?? null);
        if (ups[0]) {
          const ls = await fetchLeads(workspace.id, ups[0].id);
          setLeads(ls);
        } else {
          setLeads([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete upload');
    }
  }

  function handleExport() {
    const filtered = getFilteredLeads();
    const csv = exportLeadsToCSV(filtered);
    downloadCSV(csv, `leads_${selectedUpload?.file_name ?? 'export'}.csv`);
  }

  function getFilteredLeads(): Lead[] {
    return leads.filter((l) => {
      if (priorityFilter !== 'all' && l.priority !== priorityFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !l.name?.toLowerCase().includes(q) &&
          !l.phone?.toLowerCase().includes(q) &&
          !l.source?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }

  const filteredLeads = getFilteredLeads();
  const sources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[];

  const stats = {
    total: leads.length,
    highPriority: leads.filter((l) => l.priority === 'high').length,
    avgScore: leads.length > 0 ? Math.round(leads.reduce((s, l) => s + (l.score_0_100 ?? 0), 0) / leads.length) : 0,
    conversionRate: selectedUpload?.conversion_rate ?? 0,
  };

  // Guaranteed by the on_auth_user_created trigger, so reaching this means
  // something is genuinely wrong — say so rather than crashing on workspace!.id.
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
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">LeadScore India</h1>
                <p className="text-xs text-slate-500 leading-tight">{workspace?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                <span className={`w-2 h-2 rounded-full ${subscription?.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {plan.name} Plan
              </div>
              <button onClick={onShowPlans} className="text-sm text-teal-700 font-medium hover:text-teal-800 transition">
                Plans
              </button>
              <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-900 transition">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Lead Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {uploads.length} upload{uploads.length !== 1 ? 's' : ''} · {leads.length} leads loaded
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowUploadModal(true)} className="btn-primary flex items-center gap-2">
              <UploadIcon className="w-4 h-4" />
              Upload New Data
            </button>
          </div>
        </div>

        {/* Uploads list */}
        {uploads.length > 0 && (
          <div className="card p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Past Uploads
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uploads.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUpload(u)}
                  className={`shrink-0 px-4 py-2.5 rounded-lg border text-left transition ${
                    selectedUpload?.id === u.id
                      ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate max-w-[160px]">
                      {u.file_name}
                    </span>
                    {u.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {u.status === 'processing' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    {u.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {u.row_count} leads · {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {leads.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Users} label="Total Leads" value={stats.total.toLocaleString('en-IN')} color="text-slate-700" bg="bg-slate-100" />
            <StatCard
              icon={Target}
              label="High Priority"
              value={`${stats.total > 0 ? Math.round((stats.highPriority / stats.total) * 100) : 0}%`}
              color="text-emerald-700"
              bg="bg-emerald-50"
            />
            <StatCard icon={Award} label="Avg Score" value={stats.avgScore.toString()} color="text-teal-700" bg="bg-teal-50" />
            <StatCard
              icon={TrendingUp}
              label="Conversion Rate"
              value={`${(stats.conversionRate * 100).toFixed(1)}%`}
              color="text-amber-700"
              bg="bg-amber-50"
            />
          </div>
        )}

        {/* Charts summarise the whole upload, matching the stat cards above rather
            than the filtered table below. */}
        <LeadCharts leads={leads} />

        {/* Model metrics */}
        {selectedUpload && selectedUpload.model_auc !== null && selectedUpload.model_auc > 0 && (
          <div className="card p-4 mb-6">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Model AUC:</span>
              <span className="font-mono text-teal-700">{selectedUpload.model_auc.toFixed(3)}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-slate-500 text-xs">
                {selectedUpload.model_auc >= 0.7
                  ? 'Good — the ranking is clearly better than chance'
                  : selectedUpload.model_auc >= 0.6
                  ? 'Moderate — a usable signal, but a weak one'
                  : selectedUpload.model_auc >= 0.55
                  ? 'Weak — barely better than random ordering'
                  : 'No signal — this data cannot predict conversion (0.50 is guessing)'}
              </span>
            </div>
          </div>
        )}

        {/* Lead table */}
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
          <>
            {/* Filters */}
            <div className="card p-4 mb-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
                  <Filter className="w-4 h-4" />
                  Filters:
                </div>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
                  className="input-field py-2 w-auto"
                >
                  <option value="all">All Priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="input-field py-2 w-auto"
                >
                  <option value="all">All Sources</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search name, phone, source..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field py-2 flex-1"
                />
                <button onClick={handleExport} className="btn-secondary flex items-center gap-2 shrink-0">
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
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
              <div className="text-xs text-slate-400 mt-2">
                Showing {filteredLeads.length} of {leads.length} leads
              </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium text-right">Order Value</th>
                      <th className="px-4 py-3 font-medium text-center">Orders</th>
                      <th className="px-4 py-3 font-medium text-center">Score</th>
                      <th className="px-4 py-3 font-medium">Priority</th>
                      <th className="px-4 py-3 font-medium">Suggested Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3 font-medium text-slate-800">{lead.name || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{lead.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                            {lead.source || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {lead.order_value > 0 ? `₹${lead.order_value.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{lead.num_orders}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 font-bold text-sm text-slate-700">
                            {lead.score_0_100}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(
                              lead.priority ?? 'low'
                            )}`}
                          >
                            {lead.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{lead.suggested_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

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
  color,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
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
        setMapping(guessColumnMapping(parsed.headers));
        setCsvText(text);
        setFileName(file.name);
        setStep('mapping');
      } catch {
        setError('Could not parse this CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  }

  function handleDownloadSample() {
    const sample = generateSampleCSV();
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'leadscore_sample_leads.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleProcess() {
    if (!mapping) return;
    setStep('processing');
    setError(null);

    try {
      const monthlyCount = await getMonthlyLeadCount(workspaceId);
      const { rows } = parseCSV(csvText);
      if (monthlyCount + rows.length > planLimit) {
        setError(
          `This upload would exceed your plan limit (${planLimit.toLocaleString('en-IN')} leads/month). You've used ${monthlyCount.toLocaleString('en-IN')} this month. Please upgrade your plan.`
        );
        setStep('mapping');
        return;
      }

      const res = await processCSVUpload(workspaceId, fileName, csvText, mapping);
      setResult(res);
      setTimeout(() => {
        onSuccess();
      }, 1500);
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
          {/* Step indicator */}
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
                <p className="text-xs text-slate-400 mt-1">CSV files only, up to {planLimit.toLocaleString('en-IN')} leads</p>
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
              <div className="mt-4 flex items-center justify-between">
                <button onClick={handleDownloadSample} className="text-sm text-teal-700 hover:underline flex items-center gap-1.5">
                  <Download className="w-4 h-4" />
                  Download sample CSV template
                </button>
              </div>
              <div className="mt-4 p-4 bg-slate-50 rounded-lg text-xs text-slate-500">
                <p className="font-medium text-slate-600 mb-1">Required columns:</p>
                <p>name, phone, source, created_at, order_value, num_orders, status</p>
                <p className="font-medium text-slate-600 mt-2 mb-1">Optional columns:</p>
                <p>lead_id, last_contacted_at</p>
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
                <MappingField label="Lead ID (optional)" value={mapping.lead_id ?? ''} headers={headers} onChange={(v) => setMapping({ ...mapping, lead_id: v || undefined })} />
                <MappingField label="Last Contacted (optional)" value={mapping.last_contacted_at ?? ''} headers={headers} onChange={(v) => setMapping({ ...mapping, last_contacted_at: v || undefined })} />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('upload')} className="btn-secondary">
                  Back
                </button>
                <button onClick={handleProcess} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Score {parseCSV(csvText).rows.length} Leads
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
