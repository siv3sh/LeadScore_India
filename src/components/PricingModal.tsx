import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getTrialState, TRIAL_DAYS } from '@/lib/trial';
import { PLANS, getPlan, type PlanType } from '@/types';

export default function PricingModal({ onClose }: { onClose: () => void }) {
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
      onClose();
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
        name: 'LeadAI',
        description: `${plan.name} Plan — ₹${plan.price.toLocaleString('en-IN')}/month`,
        // Server-derived, so the sheet can never show a different price to the
        // one the order was created for.
        amount,
        currency: 'INR',
        handler: (response: { razorpay_payment_id: string }) => {
          void verifyPayment(response.razorpay_payment_id, planId);
        },
        prefill: { name: workspace.name },
        theme: { color: '#0f766e' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-7 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Plans built for Indian teams</h2>
            <p className="text-sm text-slate-500 mt-1">
              All prices in INR, inclusive of GST. Pay securely via Razorpay — UPI, cards and netbanking.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-4"
            aria-label="Close pricing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-7 mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-7">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan.id;
            const isPopular = plan.id === 'growth';
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 flex flex-col ${
                  isPopular ? 'border-teal-600 bg-teal-50/30 shadow-sm' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">{plan.name}</h3>
                  {isPopular && (
                    <span className="text-[10px] font-bold tracking-wide text-white bg-indigo-500 rounded-full px-2 py-0.5">
                      POPULAR
                    </span>
                  )}
                </div>

                <p className="text-2xl font-bold text-slate-900">₹{plan.price.toLocaleString('en-IN')}</p>
                <p className="text-xs text-slate-400 mb-4">
                  {plan.price === 0 ? freePlanCaption() : 'per month'}
                </p>

                <div className="text-xs text-slate-600 bg-slate-100 rounded-md px-2.5 py-1.5 mb-4 text-center">
                  {plan.lead_limit.toLocaleString('en-IN')} leads / month
                </div>

                <ul className="space-y-2 mb-5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrent || plan.id === 'free' || loading !== null}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                    isCurrent
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
    </div>
  );
}
