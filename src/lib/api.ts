import { supabase } from '@/lib/supabase';
import type { Upload, Lead } from '@/types';
import { scoreLeads, scoreLeadsWithAiPlan, type TrainingMetrics } from '@/lib/ml';
import { fetchAiRankingPlan } from '@/lib/fetchAiRankingPlan';
import {
  collectExtraKeys,
  mapRowsToLeadsWithHeaders,
  parseCSV,
  parseLeadExtra,
  validateLeadsForScoring,
  type ColumnMapping,
} from '@/lib/csvParser';
import {
  isSheetSyncUploadName,
  SHEET_SYNC_FILE_PREFIX,
  toGoogleSheetCsvExportUrl,
} from '@/lib/googleSheet';

export interface UploadResult {
  upload: Upload;
  metrics: TrainingMetrics;
  leadCount: number;
  warnings: string[];
}

export async function processCSVUpload(
  workspaceId: string,
  fileName: string,
  csvText: string,
  mapping: ColumnMapping
): Promise<UploadResult> {
  const { headers, rows } = parseCSV(csvText);
  const rawLeads = mapRowsToLeadsWithHeaders(headers, rows, mapping);

  if (rawLeads.length === 0) {
    throw new Error('No leads found in the CSV file.');
  }

  // Runs before the upload row is created so unusable files cost no quota.
  const validation = validateLeadsForScoring(rawLeads);
  if (validation.error) {
    throw new Error(validation.error);
  }
  const warnings = [...validation.warnings];

  let scored = scoreLeads(rawLeads);

  // When there is no converted history to train on, ask AI to read the form
  // columns (meaning, not keywords). Falls back to local ranking if AI is down.
  if (scored.rankingMode !== 'trained') {
    const { plan, error: aiError } = await fetchAiRankingPlan(rawLeads);
    if (plan) {
      scored = scoreLeadsWithAiPlan(rawLeads, plan, validation.warnings);
    } else if (aiError) {
      warnings.push(
        `AI ranking was busy or unavailable (${aiError}). Used form answers / recency instead — try upload again in a minute.`
      );
    }
  }

  const { scoredLeads, metrics, rankingSummary } = scored;
  warnings.push(...scored.warnings);

  // Matches the model's target exactly, so the headline rate and the thing the
  // model predicts can never drift apart again.
  const conversionRate = rawLeads.filter((l) => l.status === 'won').length / rawLeads.length;

  // Catches any remaining degenerate fit, whatever its cause.
  if (new Set(scoredLeads.map((l) => l.score_0_100)).size === 1) {
    warnings.push(
      `Every lead scored ${scoredLeads[0].score_0_100}, meaning the data holds no signal the model can separate. Check your column mapping.`
    );
  }

  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .insert({
      workspace_id: workspaceId,
      file_name: fileName,
      row_count: rawLeads.length,
      status: 'completed',
      model_auc: metrics.auc,
      conversion_rate: conversionRate,
      ranking_summary: rankingSummary,
    })
    .select()
    .single();

  if (uploadError || !upload) {
    throw new Error('Failed to create upload record.');
  }

  const leadRows = scoredLeads.map((lead) => ({
    upload_id: upload.id,
    workspace_id: workspaceId,
    lead_id: lead.lead_id,
    name: lead.name,
    phone: lead.phone,
    city: lead.city || null,
    source: lead.source,
    created_at_lead: lead.created_at,
    last_contacted_at: lead.last_contacted_at,
    order_value: lead.order_value,
    num_orders: lead.num_orders,
    status: lead.status,
    extra: lead.extra ?? {},
    conversion_probability: lead.conversion_probability,
    score_0_100: lead.score_0_100,
    priority: lead.priority,
    suggested_action: lead.suggested_action,
    score_reason: lead.score_reason,
  }));

  const BATCH_SIZE = 500;
  for (let i = 0; i < leadRows.length; i += BATCH_SIZE) {
    const batch = leadRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('leads').insert(batch);
    if (error) {
      // Otherwise the upload row survives as 'completed' with a row_count that
      // getMonthlyLeadCount keeps charging against the plan limit.
      await supabase.from('uploads').delete().eq('id', upload.id);
      throw new Error(`Failed to save leads: ${error.message}`);
    }
  }

  return {
    upload: upload as Upload,
    metrics,
    leadCount: rawLeads.length,
    warnings,
  };
}

export async function fetchUploads(workspaceId: string): Promise<Upload[]> {
  const { data, error } = await supabase
    .from('uploads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Upload[];
}

export async function fetchLeads(
  workspaceId: string,
  uploadId?: string
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score_0_100', { ascending: false });

  if (uploadId) {
    query = query.eq('upload_id', uploadId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Lead[];
}

/** Updates outreach fields on a single lead (status / last contact / snooze). */
export async function updateLeadOutreach(
  leadId: string,
  patch: {
    status?: string | null;
    last_contacted_at?: string | null;
    snoozed_until?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from('leads').update(patch).eq('id', leadId);
  if (error) throw error;
}

export async function deleteUpload(uploadId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (error) throw error;
}

/** Removes previous google-sheet-sync uploads so re-sync replaces rows instead of stacking quota. */
export async function deleteSheetSyncUploads(workspaceId: string): Promise<void> {
  const { data, error } = await supabase
    .from('uploads')
    .select('id, file_name')
    .eq('workspace_id', workspaceId);

  if (error) throw error;

  const ids = (data ?? [])
    .filter((u) => isSheetSyncUploadName(u.file_name))
    .map((u) => u.id);

  for (const id of ids) {
    await deleteUpload(id);
  }
}

export async function fetchSheetCsvViaProxy(exportUrl: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please sign in again to sync your Sheet.');
  }

  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/fetch-sheet-csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ export_url: exportUrl }),
  });

  const body = (await res.json().catch(() => ({}))) as { csv_text?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Sheet download failed (${res.status})`);
  }
  if (!body.csv_text?.trim()) {
    throw new Error('Sheet download returned no data.');
  }
  return body.csv_text;
}

export async function saveWorkspaceSheetConnection(
  workspaceId: string,
  args: {
    sheet_url: string;
    sheet_mapping: ColumnMapping;
    sheet_sync_enabled: boolean;
  }
): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .update({
      sheet_url: args.sheet_url,
      sheet_mapping: args.sheet_mapping,
      sheet_sync_enabled: args.sheet_sync_enabled,
      sheet_last_error: null,
    })
    .eq('id', workspaceId);

  if (error) throw new Error(`Could not save Sheet connection: ${error.message}`);
}

export async function clearWorkspaceSheetConnection(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .update({
      sheet_url: null,
      sheet_mapping: null,
      sheet_sync_enabled: false,
      sheet_last_error: null,
    })
    .eq('id', workspaceId);

  if (error) throw new Error(`Could not disconnect Sheet: ${error.message}`);
}

export async function markSheetSyncResult(
  workspaceId: string,
  result: { ok: true } | { ok: false; error: string }
): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .update(
      result.ok
        ? { sheet_last_synced_at: new Date().toISOString(), sheet_last_error: null }
        : { sheet_last_error: result.error.slice(0, 500) }
    )
    .eq('id', workspaceId);

  if (error) {
    // Non-fatal for the caller — sync itself already finished or failed.
    console.error('Could not update sheet sync metadata', error.message);
  }
}

/**
 * Downloads the connected Sheet, replaces the previous sync upload, and re-scores.
 * Requires a saved column mapping on the workspace.
 */
export async function syncWorkspaceGoogleSheet(
  workspaceId: string,
  sheetUrl: string,
  mapping: ColumnMapping,
  planLimit: number
): Promise<UploadResult> {
  const exportUrl = toGoogleSheetCsvExportUrl(sheetUrl);
  const csvText = await fetchSheetCsvViaProxy(exportUrl);
  const { rows } = parseCSV(csvText);
  if (rows.length === 0) {
    throw new Error('The Sheet has a header row but no lead rows yet.');
  }

  await deleteSheetSyncUploads(workspaceId);

  const monthlyCount = await getMonthlyLeadCount(workspaceId);
  if (monthlyCount + rows.length > planLimit) {
    throw new Error(
      `This Sheet has ${rows.length.toLocaleString('en-IN')} rows, which would exceed your plan limit (${planLimit.toLocaleString('en-IN')}/month). You've used ${monthlyCount.toLocaleString('en-IN')} this month.`
    );
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const result = await processCSVUpload(
      workspaceId,
      `${SHEET_SYNC_FILE_PREFIX} ${stamp}.csv`,
      csvText,
      mapping
    );
    await markSheetSyncResult(workspaceId, { ok: true });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sheet sync failed';
    await markSheetSyncResult(workspaceId, { ok: false, error: message });
    throw err;
  }
}

export function exportLeadsToCSV(leads: Lead[]): string {
  const headers = [
    'name',
    'phone',
    'city',
    'source',
    'order_value',
    'num_orders',
    'status',
    'score_0_100',
    'priority',
    'suggested_action',
    'conversion_probability',
  ];

  const escapeVal = (v: unknown): string => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const extraKeys = collectExtraKeys(leads);
  const allHeaders = [...headers, ...extraKeys];

  const rows = leads.map((l) => {
    const extra = parseLeadExtra(l.extra);
    return [
      escapeVal(l.name),
      escapeVal(l.phone),
      escapeVal(l.city),
      escapeVal(l.source),
      escapeVal(l.order_value),
      escapeVal(l.num_orders),
      escapeVal(l.status),
      escapeVal(l.score_0_100),
      escapeVal(l.priority),
      escapeVal(l.suggested_action),
      escapeVal(l.conversion_probability?.toFixed(4)),
      ...extraKeys.map((key) => escapeVal(extra[key])),
    ].join(',');
  });

  return [allHeaders.join(','), ...rows].join('\n');
}

export function downloadCSV(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Deliberately mirrors enforce_monthly_lead_limit: it counts `leads` rows from
 * date_trunc('month', now()), which is UTC. Building the boundary in local time
 * would shift it by the browser's offset — 5.5 hours in IST — so the quota
 * shown and the quota enforced would disagree around month end. Summing
 * uploads.row_count instead of counting rows had the same problem: it counts
 * what a file claimed rather than what was stored.
 */
export async function getMonthlyLeadCount(workspaceId: string): Promise<number> {
  const now = new Date();
  const startOfMonthUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // head + exact: the count comes back without transferring any rows, and
  // idx_leads_workspace_created makes it an index scan.
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonthUTC.toISOString());

  if (error) {
    throw new Error(`Could not check your monthly usage: ${error.message}`);
  }
  return count ?? 0;
}


