import type { RawLead } from '@/lib/csvParser';

export type RankingMode = 'trained' | 'intent' | 'recency';
export type IntentLevel = 'yes' | 'maybe' | 'no';

const INTENT_KEY = /interest|intend|likely_to|willing_to|ready_to_buy|are_you_interested/;

const DAY_MS = 86400000;

export const RANKING_SUMMARY: Record<RankingMode, string> = {
  trained:
    'Ranked from your converted / not converted history (source and how new). High = top of this list.',
  intent:
    'No converted column. Ranked by form interest, then how new. Not trained on past sales.',
  recency:
    'No converted column. Ranked by how recently they arrived. Not trained on past sales.',
};

export function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

export function detectIntentColumn(leads: Array<{ extra?: Record<string, string> }>): string | null {
  const keys = new Set<string>();
  for (const lead of leads) {
    if (!lead.extra) continue;
    for (const key of Object.keys(lead.extra)) keys.add(key);
  }
  const matches = [...keys].filter((key) => INTENT_KEY.test(normalizeHeaderKey(key)));
  if (matches.length === 0) return null;

  const withValues = matches.filter((key) =>
    leads.some((lead) => parseIntentValue(lead.extra?.[key] ?? '') !== null)
  );
  return (withValues[0] ?? matches[0]) ?? null;
}

export function parseIntentValue(raw: string): IntentLevel | null {
  const value = raw.toLowerCase().trim().replace(/[/_\-]+/g, ' ').replace(/\s+/g, ' ');
  if (!value) return null;
  if (/\bmaybe\b|\bneed more\b|\bnot sure\b|\blater\b/.test(value)) return 'maybe';
  if (/^(no|n|false|0)$/.test(value) || /\bnot interested\b/.test(value) || /^no\b/.test(value)) {
    return 'no';
  }
  if (/^(yes|y|true|1)$/.test(value) || /\byes\b/.test(value) || value === 'interested') return 'yes';
  return null;
}

export function fallbackProbability(args: {
  ageDays: number;
  source: string;
  intent: IntentLevel | null;
  useIntent: boolean;
}): number {
  let score = 0.5;
  if (args.source === 'referral') score += 0.12;
  else if (args.source === 'walkin') score += 0.08;
  if (args.ageDays <= 7) score += 0.12;
  else if (args.ageDays <= 30) score += 0.06;
  else if (args.ageDays > 90) score -= 0.15;

  if (args.useIntent) {
    if (args.intent === 'yes') score += 0.28;
    else if (args.intent === 'maybe') score += 0.1;
    else if (args.intent === 'no') score -= 0.2;
  }

  return Math.min(0.95, Math.max(0.05, score));
}

function sourcePhrase(source: string): string {
  switch (source) {
    case 'fb':
      return 'Facebook Ads';
    case 'ig':
      return 'Instagram';
    case 'google':
      return 'Google Search';
    case 'referral':
      return 'Referral';
    case 'walkin':
      return 'Walk-in';
    default:
      return source || 'Unknown source';
  }
}

export function recencyPhrase(ageDays: number, createdAt: string): string {
  if (ageDays < 1) return 'filled today';
  if (ageDays <= 7) return 'filled this week';
  if (ageDays <= 30) return `filled ${Math.round(ageDays)} days ago`;
  const parsed = new Date(createdAt);
  if (!isNaN(parsed.getTime())) {
    return `filled ${parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  }
  return 'older lead';
}

export function intentPhrase(intent: IntentLevel | null): string {
  switch (intent) {
    case 'yes':
      return 'said yes on the form';
    case 'maybe':
      return 'maybe / needs more info';
    case 'no':
      return 'said no on the form';
    case null:
      return 'no form answer';
    default: {
      const exhaustive: never = intent;
      return exhaustive;
    }
  }
}

export function scoreReason(args: {
  mode: RankingMode;
  source: string;
  ageDays: number;
  createdAt: string;
  intent: IntentLevel | null;
}): string {
  const when = recencyPhrase(args.ageDays, args.createdAt);
  const source = sourcePhrase(args.source);
  switch (args.mode) {
    case 'trained':
      return `From your past conversions · ${source} · ${when}`;
    case 'intent':
      return `${intentPhrase(args.intent)} · ${when}`;
    case 'recency':
      return `Newest first · ${when}`;
    default: {
      const exhaustive: never = args.mode;
      return exhaustive;
    }
  }
}

export function ageDaysFor(lead: Pick<RawLead, 'created_at'>, referenceTime: number): number {
  const parsed = new Date(lead.created_at).getTime();
  if (isNaN(parsed)) return 0;
  return Math.max(0, (referenceTime - parsed) / DAY_MS);
}
