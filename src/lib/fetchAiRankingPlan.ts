import { supabase } from '@/lib/supabase';
import {
  buildUnderstandRequest,
  parseAiRankingPlan,
  type AiRankingPlan,
} from '@/lib/aiRanking';
import type { RawLead } from '@/lib/csvParser';

/**
 * Asks the understand-leads edge function to read form columns (not keywords)
 * and return a ranking plan. Returns null when AI is unavailable or invalid.
 */
export async function fetchAiRankingPlan(leads: RawLead[]): Promise<AiRankingPlan | null> {
  const request = buildUnderstandRequest(leads);
  if (!request) return null;

  try {
    const { data, error } = await supabase.functions.invoke('understand-leads', {
      body: request,
    });

    if (error) return null;
    if (!data || typeof data !== 'object') return null;

    const body = data as Record<string, unknown>;
    if (typeof body.error === 'string' && body.error.trim()) return null;

    return parseAiRankingPlan(body.plan ?? body);
  } catch {
    return null;
  }
}
