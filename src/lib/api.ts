import { supabase } from '@/lib/supabase';
import type { Upload, Lead } from '@/types';
import { scoreLeads, type TrainingMetrics } from '@/lib/ml';
import {
  mapRowsToLeadsWithHeaders,
  parseCSV,
  validateLeadsForScoring,
  type ColumnMapping,
} from '@/lib/csvParser';

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

  const { scoredLeads, metrics, warnings: modelWarnings } = scoreLeads(rawLeads);
  warnings.push(...modelWarnings);

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
    source: lead.source,
    created_at_lead: lead.created_at,
    last_contacted_at: lead.last_contacted_at,
    order_value: lead.order_value,
    num_orders: lead.num_orders,
    status: lead.status,
    conversion_probability: lead.conversion_probability,
    score_0_100: lead.score_0_100,
    priority: lead.priority,
    suggested_action: lead.suggested_action,
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

export async function deleteUpload(uploadId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (error) throw error;
}

export function exportLeadsToCSV(leads: Lead[]): string {
  const headers = [
    'name',
    'phone',
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

  const rows = leads.map((l) =>
    [
      escapeVal(l.name),
      escapeVal(l.phone),
      escapeVal(l.source),
      escapeVal(l.order_value),
      escapeVal(l.num_orders),
      escapeVal(l.status),
      escapeVal(l.score_0_100),
      escapeVal(l.priority),
      escapeVal(l.suggested_action),
      escapeVal(l.conversion_probability?.toFixed(4)),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
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

export async function getMonthlyLeadCount(workspaceId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('uploads')
    .select('row_count')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonth.toISOString());

  if (error || !data) return 0;
  return data.reduce((sum, u) => sum + (u.row_count || 0), 0);
}


