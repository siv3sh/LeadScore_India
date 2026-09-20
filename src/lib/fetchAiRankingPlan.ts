import { supabase } from '@/lib/supabase';
import {
  buildUnderstandRequest,
  parseAiRankingPlan,
  type AiRankingPlan,
} from '@/lib/aiRanking';
import type { RawLead } from '@/lib/csvParser';

export type AiRankingFetchResult = {
  plan: AiRankingPlan | null;
  /** Set when we tried AI and it failed — show this so fallback is not silent. */
  error: string | null;
};

/**
 * Asks the understand-leads edge function to read form columns (not keywords)
 * and return a ranking plan.
 */
export async function fetchAiRankingPlan(leads: RawLead[]): Promise<AiRankingFetchResult> {
  const request = buildUnderstandRequest(leads);
  if (!request) {
    return { plan: null, error: null };
  }

  try {
    const { data, error } = await supabase.functions.invoke('understand-leads', {
      body: request,
    });

    if (error) {
      // Functions often put the JSON body on error.context when status is non-2xx.
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = (await context.json()) as { error?: string };
          if (typeof body?.error === 'string' && body.error.trim()) {
            return { plan: null, error: body.error.trim().slice(0, 200) };
          }
        } catch {
          // fall through
        }
      }
      return { plan: null, error: error.message || 'AI ranking request failed' };
    }

    if (!data || typeof data !== 'object') {
      return { plan: null, error: 'AI ranking returned an empty response' };
    }

    const body = data as Record<string, unknown>;
    if (typeof body.error === 'string' && body.error.trim()) {
      return { plan: null, error: body.error.trim().slice(0, 200) };
    }

    const plan = parseAiRankingPlan(body.plan ?? body);
    if (!plan) {
      return { plan: null, error: 'AI ranking returned a plan we could not use' };
    }

    return { plan, error: null };
  } catch (err) {
    return {
      plan: null,
      error: err instanceof Error ? err.message : 'AI ranking failed',
    };
  }
}
