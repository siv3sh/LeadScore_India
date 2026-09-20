import type { RawLead } from '@/lib/csvParser';
import { ageDaysFor, RANKING_SUMMARY, scoreReason, type RankingMode } from '@/lib/ranking';

export type AiSignalRole = 'buying_intent' | 'urgency' | 'quality' | 'ignore';

export interface AiRankingSignal {
  column: string;
  role: AiSignalRole;
  /** 0–1 relative importance among signals. */
  weight: number;
  /**
   * Maps a normalised answer string to a score in [-1, 1].
   * Higher = more worth calling soon.
   */
  value_scores: Record<string, number>;
  why?: string;
}

export interface AiRankingPlan {
  summary: string;
  signals: AiRankingSignal[];
  use_recency: boolean;
  /** 0–1 how hard recency pulls vs form answers. */
  recency_weight: number;
}

export interface UnderstandLeadsRequest {
  columns: string[];
  /** Up to ~8 sample rows of leftover form fields only. */
  samples: Array<Record<string, string>>;
}

const MAX_SAMPLE_ROWS = 8;
const MAX_VALUE_CHARS = 80;
const MAX_COLUMNS = 40;

const ROLE_SET = new Set<AiSignalRole>(['buying_intent', 'urgency', 'quality', 'ignore']);

function normalizeAnswerKey(raw: string): string {
  return raw.toLowerCase().trim().replace(/[/_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds the payload for the understand-leads edge function from mapped leads.
 * Only leftover form columns — never phones or names in bulk.
 */
export function buildUnderstandRequest(leads: RawLead[]): UnderstandLeadsRequest | null {
  const keyCounts = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.extra) continue;
    for (const [key, value] of Object.entries(lead.extra)) {
      if (!key.trim() || !String(value ?? '').trim()) continue;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }

  const columns = [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .slice(0, MAX_COLUMNS);

  if (columns.length === 0) return null;

  const samples: Array<Record<string, string>> = [];
  for (const lead of leads) {
    if (samples.length >= MAX_SAMPLE_ROWS) break;
    const row: Record<string, string> = {};
    let filled = 0;
    for (const column of columns) {
      const raw = (lead.extra?.[column] ?? '').trim();
      if (!raw) continue;
      row[column] = raw.slice(0, MAX_VALUE_CHARS);
      filled += 1;
    }
    if (filled === 0) continue;
    samples.push(row);
  }

  if (samples.length === 0) return null;
  return { columns, samples };
}

function parseSignal(raw: unknown): AiRankingSignal | null {
  if (!isRecord(raw)) return null;
  const column = typeof raw.column === 'string' ? raw.column.trim() : '';
  if (!column) return null;

  const roleRaw = typeof raw.role === 'string' ? raw.role.trim() : 'ignore';
  const role: AiSignalRole = ROLE_SET.has(roleRaw as AiSignalRole)
    ? (roleRaw as AiSignalRole)
    : 'ignore';

  const weight =
    typeof raw.weight === 'number' && Number.isFinite(raw.weight)
      ? clamp(raw.weight, 0, 1)
      : 0;

  const value_scores: Record<string, number> = {};
  if (isRecord(raw.value_scores)) {
    for (const [key, value] of Object.entries(raw.value_scores)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const normalized = normalizeAnswerKey(key);
      if (!normalized) continue;
      value_scores[normalized] = clamp(value, -1, 1);
    }
  }

  const why = typeof raw.why === 'string' ? raw.why.trim().slice(0, 120) : undefined;
  return { column, role, weight, value_scores, why };
}

/** Rejects malformed model JSON so we never score on garbage. */
export function parseAiRankingPlan(raw: unknown): AiRankingPlan | null {
  if (!isRecord(raw)) return null;

  const signalsRaw = Array.isArray(raw.signals) ? raw.signals : null;
  if (!signalsRaw || signalsRaw.length === 0) return null;

  const signals: AiRankingSignal[] = [];
  for (const item of signalsRaw) {
    const signal = parseSignal(item);
    if (!signal) continue;
    if (signal.role === 'ignore') continue;
    if (signal.weight <= 0) continue;
    if (Object.keys(signal.value_scores).length === 0) continue;
    signals.push(signal);
  }

  if (signals.length === 0) return null;

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim().slice(0, 280)
      : RANKING_SUMMARY.ai;

  const use_recency = raw.use_recency !== false;
  const recency_weight =
    typeof raw.recency_weight === 'number' && Number.isFinite(raw.recency_weight)
      ? clamp(raw.recency_weight, 0, 1)
      : 0.35;

  return { summary, signals, use_recency, recency_weight };
}

function lookupValueScore(raw: string, valueScores: Record<string, number>): number | null {
  const key = normalizeAnswerKey(raw);
  if (!key) return null;
  if (key in valueScores) return valueScores[key];

  // Soft match: answer contains a known key, or a known key contains the answer.
  let best: { score: number; len: number } | null = null;
  for (const [known, score] of Object.entries(valueScores)) {
    if (key.includes(known) || known.includes(key)) {
      if (!best || known.length > best.len) best = { score, len: known.length };
    }
  }
  return best?.score ?? null;
}

function recencyDelta(ageDays: number, weight: number): number {
  let base = 0;
  if (ageDays <= 7) base = 0.12;
  else if (ageDays <= 30) base = 0.06;
  else if (ageDays > 90) base = -0.15;
  return base * weight;
}

function sourceDelta(source: string): number {
  if (source === 'referral') return 0.08;
  if (source === 'walkin') return 0.05;
  return 0;
}

export interface AiLeadScore {
  probability: number;
  reason: string;
}

/**
 * Applies an AI-written column plan to one lead. Deterministic — the model
 * only decides which columns matter and how answers map to scores.
 */
export function scoreLeadWithAiPlan(
  lead: RawLead,
  plan: AiRankingPlan,
  referenceTime: number
): AiLeadScore {
  let score = 0.5;
  const contributors: Array<{ label: string; delta: number }> = [];

  for (const signal of plan.signals) {
    const raw = lead.extra?.[signal.column] ?? '';
    const mapped = lookupValueScore(raw, signal.value_scores);
    if (mapped === null) continue;
    const delta = signal.weight * mapped * 0.32;
    score += delta;
    if (Math.abs(delta) >= 0.04) {
      const shortAnswer = normalizeAnswerKey(raw).slice(0, 40) || 'answered';
      contributors.push({
        label: signal.why?.trim() || `${signal.column}: ${shortAnswer}`,
        delta,
      });
    }
  }

  const ageDays = ageDaysFor(lead, referenceTime);
  if (plan.use_recency) {
    score += recencyDelta(ageDays, plan.recency_weight);
  }
  score += sourceDelta(lead.source);

  contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = contributors.slice(0, 2).map((c) => c.label);
  const aiReason = top.length > 0 ? top.join(' · ') : 'form answers';

  return {
    probability: clamp(score, 0.05, 0.95),
    reason: scoreReason({
      mode: 'ai',
      source: lead.source,
      ageDays,
      createdAt: lead.created_at,
      intent: null,
      aiReason,
    }),
  };
}

export function rankingModeForAi(): RankingMode {
  return 'ai';
}
