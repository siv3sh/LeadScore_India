import { useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  Upload as UploadIcon,
  Download,
  Trash2,
  TrendingUp,
  Users,
  Target,
  Gauge,
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
  UserCircle,
  Moon,
  Link2,
  RefreshCw,
  ClipboardCopy,
  ChevronDown,
  Languages,
  RotateCcw,
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
  updateLeadOutreach,
  syncWorkspaceGoogleSheet,
  type UploadResult,
} from '@/lib/api';
import {
  parseCSV,
  guessColumnMapping,
  generateSampleCSV,
  generateTemplateCSV,
  summarizeStatuses,
  RESOLVED_STATUSES,
  REQUIRED_COLUMNS,
  OPTIONAL_COLUMNS,
  SOURCES,
  type ColumnMapping,
} from '@/lib/csvParser';
import { readUploadAsCsv } from '@/lib/spreadsheet';
import {
  formatINR,
  formatSource,
  formatStatus,
  GRID_STATUS_OPTIONS,
  gridStatusAppearance,
  isGridStatusActive,
  isSettledOutreachStatus,
  isSnoozed,
  isSnoozedOpen,
  DATE_FILTER_PRESETS,
  dateFilterLabel,
  isCalendarDayFilter,
  leadMatchesDateFilter,
  localDateKey,
  normalizeLeadStatus,
  PRIORITY_STYLES,
  snoozeUntilTomorrowMorning,
  telLink,
  whatsappHref,
  type GridStatusValue,
} from '@/lib/display';
import {
  buildSheetOutcomeTsv,
  copyTextToClipboard,
  leadsWithOutreachLogged,
  loadOutreachLang,
  OUTREACH_LANG_OPTIONS,
  saveOutreachLang,
  uiLabel,
  WA_TEMPLATE_OPTIONS,
  whatsappTemplateMessage,
  type OutreachLang,
  type WaTemplateId,
} from '@/lib/outreach';
import {
  DEFAULT_LIST_FILTERS,
  filtersAreDefault,
  loadCustomStatuses,
  loadListFilters,
  parseCustomStatusLabel,
  rememberCustomStatus,
  saveListFilters,
  CUSTOM_STATUS_MAX_LEN,
  type CustomStatus,
} from '@/lib/userPrefs';
import { shouldAutoSyncSheet } from '@/lib/googleSheet';
import { formatTrialEnd, getTrialState } from '@/lib/trial';
import LeadCharts from '@/components/LeadCharts';
import BrandLogo from '@/components/BrandLogo';
import MenuDropdown from '@/components/MenuDropdown';
import DayPicker from '@/components/DayPicker';
import ProfileModal from '@/components/ProfileModal';
import SheetSyncModal from '@/components/SheetSyncModal';
import TiltCard from '@/components/TiltCard';
import { getPlan, type Priority } from '@/types';
import type { Upload, Lead } from '@/types';

export default function Dashboard() {
  const { workspace, subscription, signOut, refreshWorkspace, user, profile } = useAuth();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<Upload | null>(null);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileSection, setProfileSection] = useState<'account' | 'plans'>('account');
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>(DEFAULT_LIST_FILTERS.priority);
  const [sourceFilter, setSourceFilter] = useState(DEFAULT_LIST_FILTERS.source);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_LIST_FILTERS.status);
  const [scoreFirst, setScoreFirst] = useState(DEFAULT_LIST_FILTERS.scoreFirst);
  const [dateFilter, setDateFilter] = useState(DEFAULT_LIST_FILTERS.date);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [showSheetSync, setShowSheetSync] = useState(false);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [outreachLang, setOutreachLang] = useState<OutreachLang>(() => loadOutreachLang());
  const [waTemplate, setWaTemplate] = useState<WaTemplateId>('follow_up');
  const [copyNote, setCopyNote] = useState<string | null>(null);
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

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setFiltersHydrated(false);
      return;
    }
    const saved = loadListFilters(userId);
    setPriorityFilter(saved.priority);
    setSourceFilter(saved.source);
    setStatusFilter(saved.status);
    setScoreFirst(saved.scoreFirst);
    setDateFilter(saved.date);
    setCustomStatuses(loadCustomStatuses(userId));
    setFiltersHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || !filtersHydrated) return;
    saveListFilters(userId, {
      priority: priorityFilter,
      source: sourceFilter,
      status: statusFilter,
      scoreFirst,
      date: dateFilter,
    });
  }, [user?.id, filtersHydrated, priorityFilter, sourceFilter, statusFilter, scoreFirst, dateFilter]);

  function resetFilters() {
    setPriorityFilter(DEFAULT_LIST_FILTERS.priority);
    setSourceFilter(DEFAULT_LIST_FILTERS.source);
    setStatusFilter(DEFAULT_LIST_FILTERS.status);
    setScoreFirst(DEFAULT_LIST_FILTERS.scoreFirst);
    setDateFilter(DEFAULT_LIST_FILTERS.date);
  }

  // Auto-pull a connected Google Sheet when the dashboard opens and data is stale.
  useEffect(() => {
    if (!workspace || autoSyncAttempted || loadingData) return;
    const mapping = workspace.sheet_mapping as ColumnMapping | null;
    if (
      !shouldAutoSyncSheet({
        enabled: workspace.sheet_sync_enabled,
        lastSyncedAt: workspace.sheet_last_synced_at,
        hasMapping: Boolean(mapping?.name && mapping?.phone),
        hasUrl: Boolean(workspace.sheet_url),
      })
    ) {
      setAutoSyncAttempted(true);
      return;
    }

    setAutoSyncAttempted(true);
    setSheetSyncing(true);
    void syncWorkspaceGoogleSheet(
      workspace.id,
      workspace.sheet_url!,
      mapping!,
      plan.lead_limit
    )
      .then(async () => {
        await refreshWorkspace();
        await loadData();
      })
      .catch((err) => {
        setActionError(
          err instanceof Error ? err.message : 'Automatic Sheet sync failed — try Sync now.'
        );
      })
      .finally(() => setSheetSyncing(false));
  }, [
    workspace,
    autoSyncAttempted,
    loadingData,
    plan.lead_limit,
    loadData,
    refreshWorkspace,
  ]);

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
    const todayKey = localDateKey(new Date());
    const rows = leads.filter((l) => {
      if (priorityFilter !== 'all' && l.priority !== priorityFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (statusFilter !== 'all') {
        const snoozedOpen = isSnoozedOpen(l.status, l.snoozed_until);
        if (statusFilter === 'tomorrow') {
          if (!snoozedOpen) return false;
        } else if (snoozedOpen || normalizeLeadStatus(l.status) !== statusFilter) {
          return false;
        }
      }
      if (!leadMatchesDateFilter(l, dateFilter, todayKey)) return false;
      if (query) {
        const haystack = [l.name, l.phone, l.city, l.lead_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return rows.slice().sort((a, b) => {
      if (scoreFirst) {
        return (b.score_0_100 ?? 0) - (a.score_0_100 ?? 0);
      }
      const aTime = a.created_at_lead || a.created_at;
      const bTime = b.created_at_lead || b.created_at;
      return bTime.localeCompare(aTime);
    });
  }

  async function applyLeadPatch(
    leadId: string,
    patch: {
      status?: string | null;
      last_contacted_at?: string | null;
      snoozed_until?: string | null;
    }
  ) {
    setActionError(null);
    const previous = leads;
    setLeads((curr) => curr.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    try {
      await updateLeadOutreach(leadId, patch);
    } catch (err) {
      setLeads(previous);
      setActionError(err instanceof Error ? err.message : 'Could not update that lead');
    }
  }

  function markContacted(leadId: string) {
    void applyLeadPatch(leadId, {
      status: 'contacted',
      last_contacted_at: new Date().toISOString(),
      snoozed_until: null,
    });
  }

  function markNoAnswer(leadId: string) {
    void applyLeadPatch(leadId, {
      status: 'no_response',
      last_contacted_at: new Date().toISOString(),
      snoozed_until: null,
    });
  }

  function markConverted(leadId: string) {
    void applyLeadPatch(leadId, {
      status: 'won',
      last_contacted_at: new Date().toISOString(),
      snoozed_until: null,
    });
  }

  function markNotConverted(leadId: string) {
    void applyLeadPatch(leadId, {
      status: 'lost',
      last_contacted_at: new Date().toISOString(),
      snoozed_until: null,
    });
  }

  function setGridStatus(leadId: string, value: GridStatusValue) {
    switch (value) {
      case 'new':
      case 'follow_up':
        void applyLeadPatch(leadId, { status: value, snoozed_until: null });
        return;
      case 'contacted':
        markContacted(leadId);
        return;
      case 'no_response':
        markNoAnswer(leadId);
        return;
      case 'tomorrow':
        snoozeLead(leadId);
        return;
      case 'won':
        markConverted(leadId);
        return;
      case 'lost':
        markNotConverted(leadId);
        return;
      default: {
        const _never: never = value;
        return _never;
      }
    }
  }

  function applyCustomGridStatus(leadId: string, slug: string) {
    void applyLeadPatch(leadId, { status: slug, snoozed_until: null });
  }

  function addCustomGridStatus(leadId: string, raw: string): string | null {
    if (!user?.id) return 'Sign in to save a custom status.';
    const parsed = parseCustomStatusLabel(raw);
    if ('error' in parsed) return parsed.error;
    const remembered = rememberCustomStatus(user.id, parsed);
    if ('error' in remembered) return remembered.error;
    setCustomStatuses(remembered);
    applyCustomGridStatus(leadId, parsed.slug);
    return null;
  }

  function snoozeLead(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    void applyLeadPatch(leadId, {
      snoozed_until: snoozeUntilTomorrowMorning(),
      ...(lead && isSettledOutreachStatus(lead.status) ? { status: 'new' } : {}),
    });
  }

  function setLang(lang: OutreachLang) {
    setOutreachLang(lang);
    saveOutreachLang(lang);
  }

  async function copySheetOutcomes() {
    setCopyNote(null);
    const rows = leadsWithOutreachLogged(leads);
    if (rows.length === 0) {
      setActionError(
        'Log Call / No answer / Converted on some leads first, then copy for your Sheet.'
      );
      return;
    }
    try {
      await copyTextToClipboard(buildSheetOutcomeTsv(rows));
      setActionError(null);
      setCopyNote(uiLabel(outreachLang, 'copied'));
      window.setTimeout(() => setCopyNote(null), 3500);
    } catch {
      setActionError('Could not copy. Try again or use Export CSV.');
    }
  }

  function handleDownloadTemplate() {
    downloadCSV(generateTemplateCSV(), 'leadscore_template.csv');
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
  const todayKey = localDateKey(new Date());
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5 sm:grid sm:h-16 sm:grid-cols-[1fr_minmax(0,24rem)_1fr] sm:items-center sm:gap-3 sm:py-0">
            <div className="flex items-center min-w-0 order-1">
              <BrandLogo size={32} />
            </div>

            <div className="relative w-full min-w-0 order-3 basis-full sm:order-2 sm:basis-auto sm:max-w-md sm:justify-self-center">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search name, phone, city…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-header"
                aria-label="Search leads"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1 shrink-0 order-2 ml-auto sm:order-3 sm:ml-0 sm:justify-self-end">
              <MenuDropdown
                ariaLabel="Upload file"
                triggerClassName="inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:h-auto sm:w-auto sm:px-3 sm:py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
                trigger={
                  <>
                    <UploadIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload file</span>
                    <ChevronDown className="hidden sm:inline w-3.5 h-3.5 opacity-80" />
                  </>
                }
                items={[
                  {
                    id: 'template',
                    label: 'CSV template',
                    icon: <FileText className="w-4 h-4 text-slate-400" />,
                    onSelect: handleDownloadTemplate,
                  },
                  {
                    id: 'sheet',
                    label: 'Live Sheet',
                    icon: sheetSyncing ? (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : workspace.sheet_url ? (
                      <RefreshCw className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Link2 className="w-4 h-4 text-slate-400" />
                    ),
                    onSelect: () => setShowSheetSync(true),
                  },
                  {
                    id: 'upload',
                    label: 'Upload CSV',
                    icon: <UploadIcon className="w-4 h-4 text-slate-400" />,
                    onSelect: () => setShowUploadModal(true),
                  },
                ]}
              />
              <button
                onClick={() => {
                  setProfileSection('account');
                  setShowProfile(true);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                title="Your profile"
                aria-label="Your profile"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <UserCircle className="w-5 h-5" />
                )}
              </button>
              <MenuDropdown
                ariaLabel="More actions"
                items={[
                  {
                    id: 'export',
                    label: 'Export CSV',
                    icon: <Download className="w-4 h-4 text-slate-400" />,
                    onSelect: handleExport,
                    disabled: leads.length === 0,
                  },
                  ...(selectedUpload
                    ? [
                      {
                        id: 'delete-upload',
                        label: 'Delete upload',
                        icon: <Trash2 className="w-4 h-4 text-red-500" />,
                        onSelect: () => void handleDeleteUpload(selectedUpload.id),
                        danger: true,
                      },
                    ]
                    : []),
                  {
                    id: 'signout',
                    label: 'Sign out',
                    icon: <LogOut className="w-4 h-4 text-slate-400" />,
                    onSelect: () => void signOut(),
                    danger: true,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </header>

      {(trial.active || trial.expired) && trial.endsAt && (
        <div
          className={`text-sm py-2.5 px-4 text-center ${trial.expired ? 'bg-amber-100 text-amber-900' : 'bg-blue-700 text-white'
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
            onClick={() => {
              setProfileSection('plans');
              setShowProfile(true);
            }}
            className="underline font-medium hover:opacity-80"
          >
            See plans
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <div id="overview" className="mb-5 sm:mb-6 scroll-mt-20">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Your list at a glance</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Scores, sources, and what this batch could be worth — then the call list below.
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
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs border transition ${selectedUpload?.id === upload.id
                  ? 'border-blue-600 bg-blue-50 text-blue-800 font-medium'
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
              hint="On this list"
            />
            <StatCard
              icon={Target}
              label="High priority"
              value={highPriority.toLocaleString('en-IN')}
              hint="Call these first"
            />
            <StatCard
              icon={TrendingUp}
              label="Predicted conversion"
              value={`${Math.round(predictedConversion * 100)}%`}
              hint="Average chance they buy"
            />
            <StatCard
              icon={Gauge}
              label="Average score"
              value={avgScore.toString()}
              hint="Out of 100"
            />
            <TiltCard className="p-4 col-span-2 lg:col-span-1">
              <p className="text-xs font-medium text-slate-500">Plan usage</p>
              <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {Math.round(quotaShare * 100)}%
              </p>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${quotaShare >= 0.9 ? 'bg-red-500' : quotaShare >= 0.7 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                  style={{ width: `${Math.min(100, Math.max(quotaShare * 100, 1))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {monthlyCount.toLocaleString('en-IN')} of {plan.lead_limit.toLocaleString('en-IN')} this month
              </p>
            </TiltCard>
          </div>
        )}

        <div className="flex flex-col">
        <div id="charts" className="order-3 md:order-2 scroll-mt-20">
          <LeadCharts leads={leads} />
        </div>

        <div className="order-2 md:order-3">
        {loadingData ? (
          <div className="card p-8 sm:p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : leads.length === 0 ? (
          <div className="card p-8 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-4">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">No leads yet</h3>
            <p className="text-sm text-slate-500 mb-4">
              Upload a CSV/Excel file, connect a live Google Sheet, or paste rows from Sheets.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => setShowUploadModal(true)} className="btn-primary inline-flex items-center gap-2">
                <UploadIcon className="w-4 h-4" />
                Upload Your First File
              </button>
              <button
                onClick={() => setShowSheetSync(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Link2 className="w-4 h-4" />
                Connect Google Sheet
              </button>
            </div>
          </div>
        ) : (
          <div id="call-list" className="card scroll-mt-20">
            <div className="p-4 flex flex-col gap-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <ScoreFirstToggle on={scoreFirst} onChange={setScoreFirst} />

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={filtersAreDefault({
                      priority: priorityFilter,
                      source: sourceFilter,
                      status: statusFilter,
                      scoreFirst,
                      date: dateFilter,
                    })}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Reset filters"
                    aria-label="Reset filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <MenuDropdown
                    ariaLabel="Language"
                    triggerClassName="select-toolbar px-2 sm:px-3"
                    trigger={
                      <>
                        <Languages className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">
                          {OUTREACH_LANG_OPTIONS.find((o) => o.id === outreachLang)?.label ?? 'EN'}
                        </span>
                        <ChevronDown className="hidden sm:inline w-3.5 h-3.5 text-slate-400" />
                      </>
                    }
                    items={OUTREACH_LANG_OPTIONS.map((opt) => ({
                      id: `lang-${opt.id}`,
                      label: opt.label,
                      active: outreachLang === opt.id,
                      onSelect: () => setLang(opt.id),
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => void copySheetOutcomes()}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shrink-0"
                    title={uiLabel(outreachLang, 'sheetUpdate')}
                    aria-label={uiLabel(outreachLang, 'sheetUpdate')}
                  >
                    <ClipboardCopy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {actionError && (
                <p className="text-xs flex items-center gap-1.5 text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {actionError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <ToolbarFilter
                    ariaLabel="Filter by date"
                    value={dateFilter}
                    label={dateFilterLabel(dateFilter)}
                    onChange={setDateFilter}
                    options={DATE_FILTER_PRESETS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                  <DayPicker
                    value={isCalendarDayFilter(dateFilter) ? dateFilter : null}
                    max={todayKey}
                    onChange={setDateFilter}
                  />
                </div>
                <ToolbarFilter
                  ariaLabel="Filter by priority"
                  value={priorityFilter}
                  onChange={(value) => setPriorityFilter(value as 'all' | Priority)}
                  options={[
                    { value: 'all', label: 'All priorities' },
                    {
                      value: 'high',
                      label: 'High',
                      icon: <span className={`w-2 h-2 rounded-full ${PRIORITY_STYLES.high.dot}`} />,
                    },
                    {
                      value: 'medium',
                      label: 'Medium',
                      icon: <span className={`w-2 h-2 rounded-full ${PRIORITY_STYLES.medium.dot}`} />,
                    },
                    {
                      value: 'low',
                      label: 'Low',
                      icon: <span className={`w-2 h-2 rounded-full ${PRIORITY_STYLES.low.dot}`} />,
                    },
                  ]}
                />
                <ToolbarFilter
                  ariaLabel="Filter by source"
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={[
                    { value: 'all', label: 'All sources' },
                    ...sources.map((s) => ({ value: s, label: formatSource(s) })),
                  ]}
                />
                <ToolbarFilter
                  ariaLabel="Filter by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All statuses' },
                    ...GRID_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      icon: <span className={`w-2 h-2 rounded-full ${option.dot}`} />,
                      tone:
                        option.value === 'won'
                          ? ('success' as const)
                          : option.value === 'lost'
                            ? ('danger' as const)
                            : undefined,
                    })),
                    ...customStatuses.map((option) => ({
                      value: option.slug,
                      label: option.label,
                      icon: <span className="w-2 h-2 rounded-full bg-teal-500" />,
                    })),
                  ]}
                />
                <MenuDropdown
                  ariaLabel={uiLabel(outreachLang, 'waTemplate')}
                  align="left"
                  triggerClassName="select-toolbar w-auto justify-between min-w-[9.5rem] shrink-0"
                  trigger={
                    <>
                      <span className="truncate">
                        {WA_TEMPLATE_OPTIONS.find((t) => t.id === waTemplate)?.labels[outreachLang] ??
                          'Follow-up'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </>
                  }
                  items={WA_TEMPLATE_OPTIONS.map((t) => ({
                    id: `tpl-${t.id}`,
                    label: t.labels[outreachLang],
                    active: waTemplate === t.id,
                    onSelect: () => setWaTemplate(t.id),
                  }))}
                />
              </div>
            </div>

            {filteredLeads.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-800 mb-1">
                  No leads match these filters
                </p>
                <p className="text-xs text-slate-500">
                  Try Today or Last 7 days, or tap reset.
                </p>
              </div>
            ) : (
              <>
                <ul className="md:hidden divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <LeadMobileCard
                      key={lead.id}
                      lead={lead}
                      selected={selectedIds.has(lead.id)}
                      onToggle={() => toggleLead(lead.id)}
                      customStatuses={customStatuses}
                      waTemplate={waTemplate}
                      outreachLang={outreachLang}
                      onSetGridStatus={setGridStatus}
                      onApplyCustom={applyCustomGridStatus}
                      onAddCustom={addCustomGridStatus}
                      onContact={markContacted}
                    />
                  ))}
                </ul>
                <div className="hidden md:block overflow-x-auto">
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
                              <p className="font-semibold text-slate-800 text-[13px] truncate max-w-[220px] flex items-center gap-1.5">
                                <span className="truncate">{lead.name || '—'}</span>
                                {isSnoozed(lead.snoozed_until) && (
                                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    <Moon className="w-3 h-3" />
                                    {uiLabel(outreachLang, 'tomorrow')}
                                  </span>
                                )}
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
                              <LeadStatusMenu
                                lead={lead}
                                customStatuses={customStatuses}
                                onSetGridStatus={setGridStatus}
                                onApplyCustom={applyCustomGridStatus}
                                onAddCustom={addCustomGridStatus}
                              />
                            </td>
                            <td className="px-3 py-3 pr-4">
                              <LeadOutreachActions
                                lead={lead}
                                waTemplate={waTemplate}
                                outreachLang={outreachLang}
                                onContact={markContacted}
                                variant="icons"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 flex items-center gap-3">
              <label className="md:hidden inline-flex items-center gap-2 text-slate-600 shrink-0">
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
                All
              </label>
              <span className="min-w-0">
                {`Showing ${filteredLeads.length} of ${leads.length} leads`}
                {selectedVisible > 0 && ` · ${selectedVisible} selected for export`}
              </span>
            </div>
          </div>
        )}
        </div>
        </div>
      </div>

      {copyNote && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 sm:bottom-5 z-50 flex items-center gap-2.5 max-w-sm rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-lg shadow-slate-900/10"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{copyNote}</span>
          <button
            type="button"
            onClick={() => setCopyNote(null)}
            className="ml-1 -mr-1 p-1 rounded-lg text-emerald-600/70 hover:text-emerald-900 hover:bg-emerald-50 transition"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showProfile && (
        <ProfileModal
          monthlyCount={monthlyCount}
          initialSection={profileSection}
          onClose={() => setShowProfile(false)}
        />
      )}

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
      {showSheetSync && (
        <SheetSyncModal
          workspace={workspace}
          planLimit={plan.lead_limit}
          onClose={() => setShowSheetSync(false)}
          onSynced={async () => {
            await refreshWorkspace();
            await loadData();
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
    <TiltCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50">
          <Icon className="w-3.5 h-3.5 text-slate-400" />
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
    </TiltCard>
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
  // Reading an Excel file fetches the parser and decodes the workbook, so it is
  // slow enough to need feedback where reading a CSV was effectively instant.
  const [readingFile, setReadingFile] = useState(false);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');

  function goToMapping(text: string, name: string, notice: string | null = null) {
    const parsed = parseCSV(text);
    if (parsed.rows.length === 0) {
      setError(
        'No lead rows found — include a header row and at least one lead underneath.'
      );
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessColumnMapping(parsed.headers));
    setCsvText(text);
    setFileName(name);
    setSheetNotice(notice);
    setStep('mapping');
  }

  function handlePasteFromSheet() {
    setError(null);
    const text = pasteText.trim();
    if (!text) {
      setError('Paste your Google Sheet rows first (include the header row).');
      return;
    }
    try {
      goToMapping(text, 'google-sheets-paste.tsv', 'Imported from a Google Sheets paste.');
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not read that paste. Copy the header row and lead rows from Sheets, then try again.'
      );
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setReadingFile(true);
    try {
      // Excel is converted to CSV text at this boundary, so every step after
      // this one is identical for both formats.
      const { csvText: text, sheetName, skippedSheets } = await readUploadAsCsv(file);
      goToMapping(
        text,
        file.name,
        skippedSheets.length > 0 && sheetName
          ? `Read sheet "${sheetName}". This workbook also has ${skippedSheets.join(', ')} — only one sheet is read at a time.`
          : null
      );
    } catch (err) {
      // readUploadAsCsv explains what is wrong with the file; parseCSV does not.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not read that file. Please check the format and try again.'
      );
    } finally {
      setReadingFile(false);
    }
  }

  function handleDownloadTemplate() {
    downloadCSV(generateTemplateCSV(), 'leadscore_template.csv');
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Upload Lead Data</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
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
                className={`border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition ${readingFile
                  ? 'border-slate-200 cursor-wait'
                  : 'border-slate-300 hover:border-blue-500 cursor-pointer'
                  }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (readingFile) return;
                  const file = e.dataTransfer.files[0];
                  // A dropped file bypasses the accept filter, so the type is
                  // validated inside handleFile rather than trusted here.
                  if (file) void handleFile(file);
                }}
                onClick={() => {
                  if (!readingFile) document.getElementById('csv-input')?.click();
                }}
              >
                {readingFile ? (
                  <>
                    <Loader2 className="w-10 h-10 text-slate-400 mx-auto mb-3 animate-spin" />
                    <p className="text-sm font-medium text-slate-700">Reading your file…</p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">
                      Drop your CSV or Excel file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      .csv, .xlsx or .xls — up to {planLimit.toLocaleString('en-IN')} leads
                    </p>
                  </>
                )}
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    // Chrome skips the change event when the same path is picked
                    // again, which would strand anyone who fills in the template
                    // and re-selects the same filename.
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium text-slate-600 mb-1.5">
                  Or paste from Google Sheets
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="In Sheets: select header + rows → Copy → paste here"
                  className="input-field w-full text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handlePasteFromSheet}
                  className="mt-2 btn-secondary text-sm"
                >
                  Use pasted rows
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <button
                  onClick={handleDownloadTemplate}
                  className="text-sm text-blue-700 hover:underline flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  Download template
                </button>
                <button
                  onClick={handleDownloadSample}
                  className="text-sm text-slate-500 hover:text-slate-700 hover:underline flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Download 50-row sample
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                The template is the column headers on their own — add your leads underneath, using
                the values listed below. The sample is filled with demo leads if you just want to
                see how scoring works.
              </p>

              <div className="mt-4 p-4 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-2.5">
                <div>
                  <p className="font-medium text-slate-600 mb-0.5">Required columns</p>
                  <p>{REQUIRED_COLUMNS.join(', ')}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-600 mb-0.5">Optional columns</p>
                  <p>{OPTIONAL_COLUMNS.join(', ')}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-600 mb-0.5">Accepted source values</p>
                  <p>{SOURCES.join(', ')} — any other value is ignored when scoring</p>
                </div>
                <div>
                  <p className="font-medium text-slate-600 mb-0.5">Accepted status values</p>
                  <p>
                    Settled outcomes the model learns from:{' '}
                    <span className="font-medium">converted</span>,{' '}
                    <span className="font-medium">not converted</span>, and{' '}
                    <span className="font-medium">no response</span> (CSV values:{' '}
                    {RESOLVED_STATUSES.join(', ')}). At least one converted lead is required. Open
                    stages such as new, contacted, or unknown are scored but not used for training.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'mapping' && mapping && (
            <div>
              {sheetNotice && (
                <div className="mb-4 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{sheetNotice}</span>
                </div>
              )}
              <p className="text-sm text-slate-600 mb-4">
                Map your columns to LeadScore fields. We've auto-detected the mapping — adjust if needed.
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
              <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
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
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
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
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
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
    entries.map((e) => `${formatStatus(e.value).label} (${e.count})`).join(', ');

  const hasNegatives = summary.trainable.some((e) => e.value !== 'won');

  return (
    <div className="ml-[172px] text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
      <p className="text-slate-600">
        The model trains only on settled outcomes: converted, not converted, and no response.
      </p>
      {summary.trainable.length > 0 && (
        <p className="text-green-700">Trains on: {describe(summary.trainable)}</p>
      )}
      {summary.open.length > 0 && (
        <p className="text-slate-500">
          Scored but not trained on: {describe(summary.open)}
        </p>
      )}
      {summary.wonCount === 0 && (
        <p className="text-amber-700">
          Nothing is marked as converted, so there is no outcome to learn. Map a column that
          includes converted leads, or set those rows to{' '}
          <span className="font-medium">converted</span> / CSV value{' '}
          <span className="font-medium">won</span> before uploading.
        </p>
      )}
      {summary.wonCount > 0 && !hasNegatives && (
        <p className="text-amber-700">
          Every settled lead is converted, so the model has no contrast cases. Include not
          converted or no-response leads for a real ranking model.
        </p>
      )}
    </div>
  );
}

function StepIndicator({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${done
        ? 'bg-green-100 text-green-700'
        : active
          ? 'bg-blue-700 text-white'
          : 'bg-slate-100 text-slate-400'
        }`}
    >
      {label}
    </span>
  );
}

function AddCustomStatusField({
  onAdd,
}: {
  onAdd: (raw: string) => string | null;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="px-2 pb-1.5 pt-0.5"
      onSubmit={(event) => {
        event.preventDefault();
        const nextError = onAdd(value);
        if (nextError) {
          setError(nextError);
          return;
        }
        setValue('');
        setError(null);
      }}
    >
      <input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        maxLength={CUSTOM_STATUS_MAX_LEN}
        placeholder="Add status…"
        aria-label="Add a custom status"
        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
      />
      {error ? <p className="text-[11px] text-red-600 mt-1 px-0.5">{error}</p> : null}
    </form>
  );
}

function LeadStatusMenu({
  lead,
  customStatuses,
  onSetGridStatus,
  onApplyCustom,
  onAddCustom,
}: {
  lead: Lead;
  customStatuses: CustomStatus[];
  onSetGridStatus: (leadId: string, value: GridStatusValue) => void;
  onApplyCustom: (leadId: string, slug: string) => void;
  onAddCustom: (leadId: string, raw: string) => string | null;
}) {
  const status = gridStatusAppearance(lead.status, lead.snoozed_until);
  return (
    <MenuDropdown
      ariaLabel={`Status for ${lead.name ?? 'lead'}`}
      align="left"
      triggerClassName={`inline-flex items-center gap-1.5 whitespace-nowrap pl-2 pr-1.5 py-0.5 rounded-full text-[11px] font-medium border ${status.className}`}
      trigger={
        <>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {customStatuses.find((option) => option.slug === normalizeLeadStatus(lead.status))?.label ??
            status.label}
          <ChevronDown className="w-3 h-3 opacity-50" aria-hidden="true" />
        </>
      }
      items={[
        ...GRID_STATUS_OPTIONS.map((option) => ({
          id: option.value,
          label: option.label,
          icon: <span className={`w-2 h-2 rounded-full ${option.dot}`} />,
          active: isGridStatusActive(option.value, lead.status, lead.snoozed_until),
          tone:
            option.value === 'won'
              ? ('success' as const)
              : option.value === 'lost'
                ? ('danger' as const)
                : undefined,
          onSelect: () => onSetGridStatus(lead.id, option.value),
        })),
        ...customStatuses.map((option) => ({
          id: `custom-${option.slug}`,
          label: option.label,
          icon: <span className="w-2 h-2 rounded-full bg-teal-500" />,
          active:
            !isSnoozedOpen(lead.status, lead.snoozed_until) &&
            normalizeLeadStatus(lead.status) === option.slug,
          onSelect: () => onApplyCustom(lead.id, option.slug),
        })),
      ]}
      footer={(close) => (
        <AddCustomStatusField
          onAdd={(raw) => {
            const error = onAddCustom(lead.id, raw);
            if (!error) close();
            return error;
          }}
        />
      )}
    />
  );
}

function LeadOutreachActions({
  lead,
  waTemplate,
  outreachLang,
  onContact,
  variant,
}: {
  lead: Lead;
  waTemplate: WaTemplateId;
  outreachLang: OutreachLang;
  onContact: (leadId: string) => void;
  variant: 'icons' | 'buttons';
}) {
  const waHref = whatsappHref(
    lead.phone,
    whatsappTemplateMessage(waTemplate, outreachLang, lead.name)
  );
  const callHref = telLink(lead.phone);
  const waLabel = uiLabel(outreachLang, 'whatsapp');
  const callLabel = uiLabel(outreachLang, 'call');

  if (variant === 'buttons') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onContact(lead.id)}
            className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-green-50 text-green-800 text-sm font-medium border border-green-200"
          >
            <MessageCircle className="w-4 h-4" />
            {waLabel}
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-slate-50 text-slate-300 text-sm font-medium border border-slate-100">
            <MessageCircle className="w-4 h-4" />
            {waLabel}
          </span>
        )}
        {callHref ? (
          <a
            href={callHref}
            onClick={() => onContact(lead.id)}
            className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium border border-slate-200"
          >
            <Phone className="w-4 h-4" />
            {callLabel}
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-slate-50 text-slate-300 text-sm font-medium border border-slate-100">
            <Phone className="w-4 h-4" />
            {callLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onContact(lead.id)}
          className="p-2 rounded-lg text-green-700 hover:bg-green-50 transition"
          title={waLabel}
          aria-label={waLabel}
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      ) : (
        <span className="p-2 text-slate-300" title="No phone number" aria-hidden="true">
          <MessageCircle className="w-4 h-4" />
        </span>
      )}
      {callHref ? (
        <a
          href={callHref}
          onClick={() => onContact(lead.id)}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          title={callLabel}
          aria-label={callLabel}
        >
          <Phone className="w-4 h-4" />
        </a>
      ) : null}
    </div>
  );
}

function LeadMobileCard({
  lead,
  selected,
  onToggle,
  customStatuses,
  waTemplate,
  outreachLang,
  onSetGridStatus,
  onApplyCustom,
  onAddCustom,
  onContact,
}: {
  lead: Lead;
  selected: boolean;
  onToggle: () => void;
  customStatuses: CustomStatus[];
  waTemplate: WaTemplateId;
  outreachLang: OutreachLang;
  onSetGridStatus: (leadId: string, value: GridStatusValue) => void;
  onApplyCustom: (leadId: string, slug: string) => void;
  onAddCustom: (leadId: string, raw: string) => string | null;
  onContact: (leadId: string) => void;
}) {
  const priority = lead.priority ?? 'low';
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 rounded border-slate-300"
          aria-label={`Select ${lead.name ?? 'lead'}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <span className="truncate">{lead.name || '—'}</span>
                {isSnoozed(lead.snoozed_until) && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <Moon className="w-3 h-3" />
                    {uiLabel(outreachLang, 'tomorrow')}
                  </span>
                )}
              </p>
              <p className="text-[12px] text-slate-500 truncate mt-0.5">
                {lead.phone || 'No phone'}
                {lead.city ? ` · ${lead.city}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {lead.score_0_100 ?? 0}
              </p>
              <span
                className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${PRIORITY_STYLES[priority].className}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_STYLES[priority].dot}`} />
                {PRIORITY_STYLES[priority].label}
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 truncate">
            {formatSource(lead.source)}
            {lead.order_value > 0 ? ` · ${formatINR(lead.order_value)}` : ''}
          </p>
          <div className="mt-2.5">
            <LeadStatusMenu
              lead={lead}
              customStatuses={customStatuses}
              onSetGridStatus={onSetGridStatus}
              onApplyCustom={onApplyCustom}
              onAddCustom={onAddCustom}
            />
          </div>
          <div className="mt-2.5">
            <LeadOutreachActions
              lead={lead}
              waTemplate={waTemplate}
              outreachLang={outreachLang}
              onContact={onContact}
              variant="buttons"
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function ScoreFirstToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Highest scores first"
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2.5 min-w-0 text-left"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-blue-700' : 'bg-slate-300'
          }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4' : 'translate-x-0'
            }`}
        />
      </span>
      <span className="text-xs text-slate-600 min-w-0">
        <span className="sm:hidden">{on ? 'Highest scores first' : 'Newest first'}</span>
        <span className="hidden sm:inline">
          {on
            ? 'Highest scores first — call or WhatsApp these today.'
            : 'Newest first — by the day they arrived.'}
        </span>
      </span>
    </button>
  );
}

function ToolbarFilter({
  ariaLabel,
  value,
  label,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  label?: string;
  options: Array<{
    value: string;
    label: string;
    icon?: ReactNode;
    tone?: 'success' | 'danger';
  }>;
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <MenuDropdown
      ariaLabel={ariaLabel}
      align="left"
      triggerClassName="select-toolbar w-auto justify-between min-w-[9.5rem] shrink-0"
      trigger={
        <>
          {current?.icon}
          <span className="truncate">{label ?? current?.label ?? ariaLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </>
      }
      items={options.map((option) => ({
        id: option.value || 'all',
        label: option.label,
        icon: option.icon,
        active: option.value === value,
        tone: option.tone,
        onSelect: () => onChange(option.value),
      }))}
    />
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
  const options = [
    { value: '', label: '— Not mapped —' },
    ...headers.map((header) => ({ value: header, label: header })),
  ];
  const current = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className="text-sm font-medium text-slate-600 sm:w-40 shrink-0">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <MenuDropdown
        ariaLabel={label}
        align="left"
        className="flex-1 min-w-0"
        triggerClassName="input-field py-2 w-full justify-between"
        trigger={
          <>
            <span className="truncate">{current?.label ?? '— Not mapped —'}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </>
        }
        items={options.map((option) => ({
          id: option.value || 'unmapped',
          label: option.label,
          active: option.value === value,
          onSelect: () => onChange(option.value),
        }))}
      />
    </div>
  );
}
