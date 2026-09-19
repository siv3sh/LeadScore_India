import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAllowedGoogleHost(hostname: string): boolean {
  return (
    hostname === 'docs.google.com' ||
    hostname === 'spreadsheets.google.com' ||
    hostname.endsWith('.google.com')
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const body = await req.json();
    const exportUrl = typeof body?.export_url === 'string' ? body.export_url.trim() : '';
    if (!exportUrl) {
      return json({ error: 'Missing export_url' }, 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(exportUrl);
    } catch {
      return json({ error: 'Invalid export_url' }, 400);
    }

    if (!isAllowedGoogleHost(parsed.hostname)) {
      return json({ error: 'Only Google Sheets URLs are allowed' }, 400);
    }

    if (!parsed.pathname.includes('/export') && !parsed.pathname.includes('/pub')) {
      return json({ error: 'URL must be a Sheets CSV export or published CSV link' }, 400);
    }

    const sheetRes = await fetch(exportUrl, {
      redirect: 'follow',
      headers: { Accept: 'text/csv,text/plain,*/*' },
    });

    if (!sheetRes.ok) {
      return json(
        {
          error:
            'Could not download the Sheet. Share it as “Anyone with the link can view”, then try again.',
          status: sheetRes.status,
        },
        502
      );
    }

    const csvText = await sheetRes.text();
    if (!csvText.trim()) {
      return json({ error: 'The Sheet downloaded empty.' }, 502);
    }

    // Google sometimes returns an HTML login/interstitial page instead of CSV.
    const head = csvText.slice(0, 200).toLowerCase();
    if (head.includes('<!DOCTYPE html') || head.includes('<html')) {
      return json(
        {
          error:
            'Google returned a login page instead of CSV. Set sharing to “Anyone with the link: Viewer”.',
        },
        502
      );
    }

    return json({ csv_text: csvText }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
