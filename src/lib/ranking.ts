import type { RawLead } from '@/lib/csvParser';

export type RankingMode = 'trained' | 'ai' | 'intent' | 'recency';
export type IntentLevel = 'yes' | 'maybe' | 'no';

/** Header names that usually mean "do you want this?" on Meta / Google forms. */
const INTENT_KEY =
  /interest|intend|likely_to|willing|ready_to|are_you_interested|want_to|looking_to|looking_for|enroll|join|buy|purchase|demo|callback|call_back|book_a|should_we|can_we_call|speak_to/;

/** Meta export / identity fields — never treat these as intent answers. */
const IGNORE_EXTRA_KEY =
  /^(id|email|e_?mail|phone|mobile|whatsapp|name|full_name|platform|campaign|ad(_|$)|adset|form(_|$)|lead_id|lead_status|created|is_organic|retailer|page_id|page_name|which_page)/;

const DAY_MS = 86400000;

export const RANKING_SUMMARY: Record<RankingMode, string> = {
  trained:
    'Ranked from your converted / not converted history (source and how new). High = top of this list.',
  ai:
    'No converted column. An AI read your form columns and ranked by buying interest, then how new. Not trained on past sales.',
  intent:
    'No converted column. Ranked by form answers (interest and similar questions), then how new. Not trained on past sales.',
  recency:
    'No converted column. Ranked by how recently they arrived. Not trained on past sales.',
};

export function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function collectExtraKeys(leads: Array<{ extra?: Record<string, string> }>): string[] {
  const keys = new Set<string>();
  for (const lead of leads) {
    if (!lead.extra) continue;
    for (const key of Object.keys(lead.extra)) keys.add(key);
  }
  return [...keys];
}

function columnHasIntentValues(
  key: string,
  leads: Array<{ extra?: Record<string, string> }>
): boolean {
  return leads.some((lead) => parseIntentValue(lead.extra?.[key] ?? '') !== null);
}

/**
 * True when most filled cells in this column are yes / maybe / no style answers.
 * Catches form questions whose headers do not say "interested".
 */
function columnLooksLikeIntentAnswers(
  key: string,
  leads: Array<{ extra?: Record<string, string> }>
): boolean {
  let filled = 0;
  let intentful = 0;
  for (const lead of leads) {
    const raw = (lead.extra?.[key] ?? '').trim();
    if (!raw) continue;
    filled += 1;
    if (parseIntentValue(raw) !== null) intentful += 1;
  }
  return filled >= 3 && intentful / filled >= 0.5;
}

/**
 * Every leftover column that carries a form interest-style answer.
 * Used together so one "yes" column cannot hide a "no" on another question.
 */
export function detectIntentColumns(
  leads: Array<{ extra?: Record<string, string> }>
): string[] {
  const keys = collectExtraKeys(leads);
  const named = keys.filter((key) => {
    const normalized = normalizeHeaderKey(key);
    if (IGNORE_EXTRA_KEY.test(normalized)) return false;
    return INTENT_KEY.test(normalized) && columnHasIntentValues(key, leads);
  });

  const byValues = keys.filter((key) => {
    const normalized = normalizeHeaderKey(key);
    if (IGNORE_EXTRA_KEY.test(normalized)) return false;
    if (named.includes(key)) return false;
    return columnLooksLikeIntentAnswers(key, leads);
  });

  return [...named, ...byValues];
}

/** First matching column — kept for callers that only need one label. */
export function detectIntentColumn(
  leads: Array<{ extra?: Record<string, string> }>
): string | null {
  return detectIntentColumns(leads)[0] ?? null;
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

export function collectIntentAnswers(
  extra: Record<string, string> | undefined,
  columns: string[]
): IntentLevel[] {
  if (!extra || columns.length === 0) return [];
  const answers: IntentLevel[] = [];
  for (const column of columns) {
    const parsed = parseIntentValue(extra[column] ?? '');
    if (parsed !== null) answers.push(parsed);
  }
  return answers;
}

/**
 * Combines several form answers into one level for call order.
 * Yes outweighs maybe; a clear no pulls the lead down even if another answer is yes.
 */
export function aggregateIntent(answers: IntentLevel[]): IntentLevel | null {
  if (answers.length === 0) return null;
  let score = 0;
  for (const answer of answers) {
    switch (answer) {
      case 'yes':
        score += 1;
        break;
      case 'maybe':
        score += 0.35;
        break;
      case 'no':
        score -= 0.75;
        break;
      default: {
        const exhaustive: never = answer;
        return exhaustive;
      }
    }
  }
  const average = score / answers.length;
  if (average >= 0.4) return 'yes';
  if (average >= -0.15) return 'maybe';
  return 'no';
}

export function fallbackProbability(args: {
  ageDays: number;
  source: string;
  intent: IntentLevel | null;
  useIntent: boolean;
  /** Extra yes answers beyond the first — small bump so multi-yes leads sort higher. */
  extraYesCount?: number;
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
    const extras = Math.max(0, Math.min(3, args.extraYesCount ?? 0));
    score += extras * 0.04;
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

export function intentPhrase(intent: IntentLevel | null, yesCount = 0): string {
  switch (intent) {
    case 'yes':
      return yesCount > 1 ? `said yes on ${yesCount} form questions` : 'said yes on the form';
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
  yesCount?: number;
  /** Short AI-written why for this lead (ai mode only). */
  aiReason?: string;
}): string {
  const when = recencyPhrase(args.ageDays, args.createdAt);
  const source = sourcePhrase(args.source);
  switch (args.mode) {
    case 'trained':
      return `From your past conversions · ${source} · ${when}`;
    case 'ai':
      return args.aiReason?.trim()
        ? `${args.aiReason.trim()} · ${when}`
        : `AI read the form · ${when}`;
    case 'intent':
      return `${intentPhrase(args.intent, args.yesCount ?? 0)} · ${when}`;
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
