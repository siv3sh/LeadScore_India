import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/lib/auth';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import PlansPage from '@/pages/PlansPage';
import { Loader2, TrendingUp } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<'dashboard' | 'plans'>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-700 text-white mb-3">
            <TrendingUp className="w-6 h-6" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (view === 'plans') {
    return <PlansPage onBack={() => setView('dashboard')} />;
  }

  return <DashboardWrapper onShowPlans={() => setView('plans')} />;
}

function DashboardWrapper({ onShowPlans }: { onShowPlans: () => void }) {
  const { subscription } = useAuth();
  const isFreePlan = !subscription || subscription.plan === 'free' || subscription.status !== 'active';

  return (
    <div>
      {isFreePlan && (
        <div className="bg-teal-700 text-white text-sm py-2 px-4 text-center">
          You're on the Free Trial (100 leads/month).{' '}
          <button onClick={onShowPlans} className="underline font-medium hover:text-teal-100">
            Upgrade your plan
          </button>
        </div>
      )}
      <Dashboard onShowPlans={onShowPlans} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
