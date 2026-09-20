import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import DocumentSeo from '@/components/DocumentSeo';
import { useAuth } from '@/lib/auth';
import { isOrgAdmin, isSuperAdmin } from '@/lib/org';
import AdminPage from '@/pages/AdminPage';
import AuthPage from '@/pages/AuthPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import Dashboard from '@/pages/Dashboard';
import {
  CallListFromExcelGuidePage,
  RankLeadsGoogleSheetGuidePage,
  WhatsAppLeadListGuidePage,
} from '@/pages/Guides';
import LandingPage from '@/pages/LandingPage';
import { ContactPage, PrivacyPage, RefundsPage, TermsPage } from '@/pages/Legal';
import OrgDashboard from '@/pages/OrgDashboard';
import { Loader2, TrendingUp } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-700 text-white mb-3">
            <TrendingUp className="w-6 h-6" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      <DocumentSeo />
      <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refunds" element={<RefundsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/guides/whatsapp-lead-list-india" element={<WhatsAppLeadListGuidePage />} />
        <Route path="/guides/rank-leads-google-sheet" element={<RankLeadsGoogleSheetGuidePage />} />
        <Route path="/guides/call-list-from-excel-india" element={<CallListFromExcelGuidePage />} />

        {user ? (
          profile?.must_change_password ? (
            <>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to="/change-password" replace />} />
            </>
          ) : (
            <>
              <Route
                path="/"
                element={
                  isSuperAdmin(profile) ? (
                    <Navigate to="/admin" replace />
                  ) : isOrgAdmin(profile) ? (
                    <Navigate to="/org" replace />
                  ) : (
                    <Dashboard />
                  )
                }
              />
              <Route
                path="/dashboard"
                element={
                  isSuperAdmin(profile) ? <Navigate to="/admin" replace /> : <Dashboard />
                }
              />
              <Route path="/org" element={<OrgDashboard />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/signup" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )
        ) : (
          <>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </>
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
