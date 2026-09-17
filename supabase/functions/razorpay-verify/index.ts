import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Amounts in paise. Must stay in sync with PLANS in src/types/index.ts — the
// price cannot be trusted from the client, and the two runtimes can't share a
// module. Moving prices into a table would remove this duplication.
const PLAN_AMOUNTS: Record<string, number> = {
  starter: 199900,
  growth: 499900,
  pro: 699900,
};

const PLAN_DURATION_DAYS = 30;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Authenticate before anything else, so unauthenticated callers learn
    // nothing about how the project is configured.
    // The anon key is public and would let anyone activate any plan, so identity
    // has to come from a real user access token.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }
    const userId = userData.user.id;

    const { payment_id, plan_id, workspace_id } = await req.json();
    if (!payment_id || !plan_id || !workspace_id) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const expectedAmount = PLAN_AMOUNTS[plan_id];
    if (!expectedAmount) {
      return json({ error: `Unknown or unpurchasable plan: ${plan_id}` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Without this, any signed-in user could upgrade someone else's workspace.
    const { data: workspace } = await admin
      .from('workspaces')
      .select('id')
      .eq('id', workspace_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!workspace) {
      return json({ error: 'Workspace not found for this account' }, 403);
    }

    // Operational concern, checked only after the caller has been authenticated
    // and authorized for this workspace.
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return json({ error: 'Razorpay keys not configured' }, 500);
    }

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const verifyRes = await fetch(`https://api.razorpay.com/v1/payments/${payment_id}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!verifyRes.ok) {
      return json({ error: 'Payment verification failed' }, 400);
    }

    const payment = await verifyRes.json();

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return json({ error: `Payment not captured (status: ${payment.status})` }, 400);
    }

    // The core check: paying for Starter must not activate Pro.
    if (payment.currency !== 'INR' || payment.amount !== expectedAmount) {
      return json(
        {
          error: `Payment of ${payment.amount} ${payment.currency} does not match the ${plan_id} plan price of ${expectedAmount} INR paise`,
        },
        400
      );
    }

    // One payment must not activate plans on multiple workspaces.
    const { data: alreadyUsed } = await admin
      .from('subscriptions')
      .select('workspace_id')
      .eq('razorpay_subscription_id', payment_id)
      .maybeSingle();
    if (alreadyUsed && alreadyUsed.workspace_id !== workspace_id) {
      return json({ error: 'This payment has already been used' }, 409);
    }

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + PLAN_DURATION_DAYS);

    const { data: existing } = await admin
      .from('subscriptions')
      .select('id')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    const fields = {
      plan: plan_id,
      status: 'active',
      current_period_end: periodEnd.toISOString(),
      razorpay_subscription_id: payment_id,
      // Marks the plan as paid for, so a manual admin grant stays
      // distinguishable from one a payment activated.
      plan_source: 'razorpay',
    };

    const { error: writeError } = existing
      ? await admin
          .from('subscriptions')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspace_id)
      : await admin.from('subscriptions').insert({ workspace_id, ...fields });

    if (writeError) {
      return json({ error: `Payment verified but activation failed: ${writeError.message}` }, 500);
    }

    return json({ success: true, plan: plan_id, status: 'active' }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
