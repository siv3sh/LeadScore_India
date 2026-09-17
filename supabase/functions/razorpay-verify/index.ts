import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

const PLAN_DURATIONS: Record<string, number> = {
  starter: 30,
  growth: 30,
  pro: 30,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { payment_id, plan_id, workspace_id } = await req.json();

    if (!payment_id || !plan_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Razorpay keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const verifyRes = await fetch(`https://api.razorpay.com/v1/payments/${payment_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Payment verification failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payment = await verifyRes.json();

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return new Response(
        JSON.stringify({ error: `Payment not captured (status: ${payment.status})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (PLAN_DURATIONS[plan_id] ?? 30));

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('subscriptions')
        .update({
          plan: plan_id,
          status: 'active',
          current_period_end: periodEnd.toISOString(),
          razorpay_subscription_id: payment_id,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspace_id);
    } else {
      await supabase.from('subscriptions').insert({
        workspace_id,
        plan: plan_id,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
        razorpay_subscription_id: payment_id,
      });
    }

    return new Response(
      JSON.stringify({ success: true, plan: plan_id, status: 'active' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
