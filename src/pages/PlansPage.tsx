import { useState, useEffect } from 'react';
import { Check, Loader2, TrendingUp, CreditCard, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PLANS, getPlan, type PlanType } from '@/types';

export default function PlansPage({ onBack }: { onBack: () => void }) {
  const { workspace, subscription, refreshWorkspace } = useAuth();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  const currentPlan = getPlan(subscription?.plan ?? 'free');

  // The edge functions identify the caller from this token; the anon key is
  // public and proves nothing about who is asking.
  async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    return token;
  }

  useEffect(() => {
    const existing = document.querySelector('script[src*="checkout.razorpay"]');
    if (existing) {
      setRazorpayLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => setError('Failed to load payment SDK. Please refresh the page.');
    document.body.appendChild(script);
  }, []);

  async function handleSubscribe(planId: PlanType) {
    if (planId === 'free') return;
    if (!workspace) return;
    setLoading(planId);
    setError(null);

    const plan = getPlan(planId);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getAccessToken()}`,
          },
          body: JSON.stringify({
            plan_id: planId,
            workspace_id: workspace.id,
            workspace_name: workspace.name,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Payment setup failed' }));
        throw new Error(err.error || 'Payment setup failed');
      }

      const { order_id, key_id } = await response.json();

      if (!order_id || !key_id) {
        throw new Error('Payment setup returned invalid data');
      }

      const options = {
        key: key_id,
        order_id: order_id,
        name: 'LeadScore India',
        description: `${plan.name} Plan — ${plan.price.toLocaleString('en-IN')}/month`,
        amount: plan.price * 100,
        currency: 'INR',
        handler: async (response: { razorpay_payment_id: string }) => {
          await verifyPayment(response.razorpay_payment_id, planId);
        },
        prefill: {
          name: workspace.name,
        },
        theme: { color: '#0f766e' },
        modal: {
          ondismiss: () => setLoading(null),
        },
      };

      const rzp = new (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment');
      setLoading(null);
    }
  }

  async function verifyPayment(paymentId: string, planId: PlanType) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getAccessToken()}`,
          },
          body: JSON.stringify({
            payment_id: paymentId,
            plan_id: planId,
            workspace_id: workspace!.id,
          }),
        }
      );

      if (!response.ok) {
        // The function returns specific reasons (amount mismatch, wrong
        // workspace, reused payment) that the user needs to see.
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Payment verification failed');
      }

      await refreshWorkspace();
      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment verification failed');
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h1 className="text-base font-bold text-slate-900">Subscription Plans</h1>
          </div>
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900 transition">
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium mb-3">
            <CreditCard className="w-3.5 h-3.5" />
            Current Plan: {currentPlan.name}
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Choose Your Plan</h2>
          <p className="text-sm text-slate-500 mt-1">Scale your lead scoring as you grow. Cancel anytime.</p>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.filter((p) => p.id !== 'free').map((plan) => {
            const isCurrent = subscription?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`card p-6 flex flex-col relative ${
                  plan.id === 'growth' ? 'ring-2 ring-teal-600' : ''
                }`}
              >
                {plan.id === 'growth' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-700 text-white text-xs font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-slate-900">
                    ₹{plan.price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-sm text-slate-500">/month</span>
                </div>
                <div className="text-sm text-slate-600 mb-4 pb-4 border-b border-slate-100">
                  Up to {plan.lead_limit.toLocaleString('en-IN')} leads/month
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrent || loading !== null || !razorpayLoaded}
                  className={`w-full py-2.5 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : plan.id === 'growth'
                      ? 'bg-teal-700 hover:bg-teal-800 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {loading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCurrent ? 'Current Plan' : loading === plan.id ? 'Processing...' : `Subscribe to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            Payments processed securely via Razorpay. Test mode available during development.
          </p>
        </div>
      </div>
    </div>
  );
}
