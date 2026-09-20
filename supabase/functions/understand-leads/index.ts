import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `You help Indian small businesses decide who to call first from messy lead-form CSVs (often Instagram/Meta ads).

You receive leftover form COLUMN NAMES and a few SAMPLE ROWS of answers.
There is NO converted/won column — do not invent sales outcomes.

Return ONLY valid JSON (no markdown) with this shape:
{
  "summary": "One plain sentence for the shop owner explaining how you ranked.",
  "signals": [
    {
      "column": "exact column name from the input",
      "role": "buying_intent" | "urgency" | "quality" | "ignore",
      "weight": 0.0 to 1.0,
      "value_scores": { "normalised answer text": number from -1 to 1 },
      "why": "short phrase shown on the call list"
    }
  ],
  "use_recency": true,
  "recency_weight": 0.0 to 1.0
}

Rules:
- Understand what each column MEANS from the question text and sample answers. Do not rely on English keywords alone — Malayalam/Hinglish/mixed headers are fine.
- Ignore identity noise: email, phone, ids, campaign, ad, platform, organic flags.
- Prefer buying_intent and urgency questions. Employment/status free-text is usually quality or ignore.
- value_scores must cover the distinct answers you see in samples (normalise lightly: lowercase, spaces).
- Higher score = call sooner. yes/interested/ready ≈ 0.7–1.0; maybe ≈ 0.2–0.4; no/not interested ≈ -0.5 to -1.0.
- Keep at most 6 useful signals. Skip columns with no ranking value.
- summary and why must be plain English a non-technical sales person understands.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Model did not return JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callGemini(userPayload: string): Promise<string> {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent' +
    `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\nFORM DATA:\n${userPayload}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini returned an empty response');
  }
  return text;
}

async function callOpenAI(userPayload: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('OpenAI returned an empty response');
  }
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Boolean-only health check — never returns the key itself.
    if (body && typeof body === 'object' && (body as { ping?: unknown }).ping === true) {
      return json(
        {
          gemini_configured: Boolean(GEMINI_API_KEY),
          openai_configured: Boolean(OPENAI_API_KEY),
          model: 'gemini-3.6-flash',
        },
        200
      );
    }

    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return json(
        {
          error:
            'AI ranking is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY on this project.',
        },
        503
      );
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const columns = Array.isArray((body as { columns?: unknown }).columns)
      ? (body as { columns: unknown[] }).columns.filter(
          (c: unknown): c is string => typeof c === 'string' && c.trim().length > 0
        )
      : [];
    const samples = Array.isArray((body as { samples?: unknown }).samples)
      ? (body as { samples: unknown[] }).samples.slice(0, 8)
      : [];

    if (columns.length === 0 || samples.length === 0) {
      return json({ error: 'Need columns and sample rows' }, 400);
    }

    const userPayload = JSON.stringify({ columns: columns.slice(0, 40), samples });
    const rawText = GEMINI_API_KEY
      ? await callGemini(userPayload)
      : await callOpenAI(userPayload);
    const plan = extractJsonObject(rawText);

    return json({ plan }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
