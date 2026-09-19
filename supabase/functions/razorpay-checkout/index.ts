import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Amounts in paise. Must stay in sync with PLANS in src/types/index.ts and with
// razorpay-verify, which re-checks the paid amount against the same table.
const PLAN_AMOUNTS: Record<string, number> = {
  starter: 199900,
  growth: 499900,
  pro: 699900,
};

type AdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Prefer Edge Function secrets; fall back to vault via private.get_razorpay_keys(). */
async function resolveRazorpayKeys(
  admin: AdminClient
): Promise<{ keyId: string; keySecret: string } | null> {
  const envId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
  const envSecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (envId && envSecret) {
    return { keyId: envId, keySecret: envSecret };
  }

  // public.service_get_razorpay_keys is callable via PostgREST; private schema is not exposed.
  const { data, error } = await admin.rpc('service_get_razorpay_keys');
  if (error) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const keyId = row?.key_id ?? '';
  const keySecret = row?.key_secret ?? '';
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Authenticate before anything else, so unauthenticated callers learn
    // nothing about how the project is configured.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const { plan_id, workspace_id, workspace_name } = await req.json();
    if (!plan_id || !workspace_id) {
      return json({ error: 'Missing required fields' }, 400);
    }

    // Derived here, never taken from the request, so the client cannot order a
    // ₹1 Pro plan.
    const amount = PLAN_AMOUNTS[plan_id];
    if (!amount) {
      return json({ error: `Unknown or unpurchasable plan: ${plan_id}` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: workspace } = await admin
      .from('workspaces')
      .select('id')
      .eq('id', workspace_id)
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (!workspace) {
      return json({ error: 'Workspace not found for this account' }, 403);
    }

    // Operational concern, checked only after the caller has been authenticated
    // and authorized for this workspace.
    const keys = await resolveRazorpayKeys(admin);
    if (!keys) {
      return json(
        {
          error:
            'Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in edge function secrets (or vault).',
        },
        500
      );
    }

    const auth = btoa(`${keys.keyId}:${keys.keySecret}`);
    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `ls_${workspace_id.slice(0, 8)}_${Date.now()}`,
        notes: { plan_id, workspace_id, workspace_name: workspace_name || '' },
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      return json({ error: `Razorpay order creation failed: ${errText}` }, 502);
    }

    const order = await orderRes.json();

    return json(
      {
        order_id: order.id,
        key_id: keys.keyId,
        amount: order.amount,
        currency: order.currency,
      },
      200
    );
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
