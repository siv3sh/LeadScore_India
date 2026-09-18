import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/lib/auth';
import AdminPage from '@/pages/AdminPage';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import LandingPage from '@/pages/LandingPage';
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
      {/* Public: legal pages and marketing. Reachable without an account so
          Razorpay and prospective customers can read them first. */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refunds" element={<RefundsPage />} />
      <Route path="/contact" element={<ContactPage />} />

      {user ? (
        <>
          <Route
            path="/"
            element={profile?.is_admin ? <Navigate to="/admin" replace /> : <Dashboard />}
          />
          <Route path="/admin" element={<AdminPage />} />
          {/* Signed-in users who hit the marketing auth URLs go to the app. */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
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
