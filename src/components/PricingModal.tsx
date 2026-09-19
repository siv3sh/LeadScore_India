import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getTrialState, TRIAL_DAYS } from '@/lib/trial';
import { PLANS, getPlan, type PlanType } from '@/types';

/**
 * Plan picker + Razorpay checkout. Mounted from the profile Plans tab, not
 * as a separate overlay.
 */
export default function PricingModal() {
  const { workspace, subscription, refreshWorkspace } = useAuth();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = getPlan(subscription?.plan ?? 'free');
  const trial = getTrialState(subscription);

  /** The free card shows the caller's own trial state when they are on it. */
  function freePlanCaption(): string {
    if (trial.expired) return 'trial ended';
    if (trial.active) return `${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left`;
    return `${TRIAL_DAYS} days`;
  }

  useEffect(() => {
    if (document.querySelector('script[src*="checkout.razorpay"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onerror = () => setError('Failed to load payment SDK. Please refresh the page.');
    document.body.appendChild(script);
  }, []);

  // The edge functions identify the caller from this token; the anon key is
  // public and proves nothing about who is asking.
  async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    return token;
  }

  async function verifyPayment(paymentId: string, planId: PlanType) {
    if (!workspace) return;
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
            workspace_id: workspace.id,
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

  async function handleSubscribe(planId: PlanType) {
    if (planId === 'free' || !workspace) return;
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

      const { order_id, key_id, amount } = await response.json();
      if (!order_id || !key_id) {
        throw new Error('Payment setup returned invalid data');
      }

      const options = {
        key: key_id,
        order_id,
        name: 'LeadScore',
        description: `${plan.name} Plan — ₹${plan.price.toLocaleString('en-IN')}/month`,
        // Server-derived, so the sheet can never show a different price to the
        // one the order was created for.
        amount,
        currency: 'INR',
        handler: (response: { razorpay_payment_id: string }) => {
          void verifyPayment(response.razorpay_payment_id, planId);
        },
        prefill: { name: workspace.name },
        theme: { color: '#2563EB' },
        modal: { ondismiss: () => setLoading(null) },
      };

      const Razorpay = (window as unknown as {
        Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
      }).Razorpay;
      if (!Razorpay) {
        throw new Error('Payment SDK is still loading. Please try again in a moment.');
      }
      new Razorpay(options).open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment');
      setLoading(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan.id;
          const isPopular = plan.id === 'growth';
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-4 flex flex-col ${isPopular ? 'border-blue-600 bg-blue-50/30 shadow-sm' : 'border-slate-200'
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">{plan.name}</h3>
                {isPopular && (
                  <span className="text-[10px] font-bold tracking-wide text-white bg-blue-500 rounded-full px-2 py-0.5">
                    Recommended
                  </span>
                )}
              </div>

              <p className="text-xl font-bold text-slate-900">₹{plan.price.toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-400 mb-3">
                {plan.price === 0 ? freePlanCaption() : 'per month'}
              </p>

              <div className="text-xs text-slate-600 bg-slate-100 rounded-md px-2.5 py-1.5 mb-3 text-center">
                {plan.lead_limit.toLocaleString('en-IN')} leads / month
              </div>

              <ul className="space-y-1.5 mb-4 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-slate-600">
                    <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCurrent || plan.id === 'free' || loading !== null}
                className={`w-full py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${isCurrent
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : plan.id === 'free'
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60'
                  }`}
              >
                {loading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {isCurrent ? 'Current plan' : plan.id === 'free' ? 'Included' : 'Choose plan'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
