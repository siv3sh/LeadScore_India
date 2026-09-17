import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/lib/auth';
import AdminPage from '@/pages/AdminPage';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import { ContactPage, PrivacyPage, RefundsPage, TermsPage } from '@/pages/Legal';
import { Loader2, TrendingUp } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();

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

  return (
    <Routes>
      {/* Reachable without an account on purpose: Razorpay verifies these
          before activating live payments, and someone deciding whether to sign
          up needs to read them first. */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refunds" element={<RefundsPage />} />
      <Route path="/contact" element={<ContactPage />} />

      {user ? (
        <>
          {/* An admin account administers the system rather than using it, so
              it lands on the panel instead of the uploading-and-billing
              dashboard. */}
          <Route
            path="/"
            element={profile?.is_admin ? <Navigate to="/admin" replace /> : <Dashboard />}
          />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <Route path="*" element={<AuthPage />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
