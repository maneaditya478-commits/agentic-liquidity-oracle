import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import TreasuryOverview from './pages/TreasuryOverview';
import RiskAnalytics from './pages/RiskAnalytics';
import BlockchainMonitor from './pages/BlockchainMonitor';
import AuditLogs from './pages/AuditLogs';
import Login from './pages/Login';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store/useStore';

// ─── Protected Route ────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('treasury_token') || useStore.getState().token;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─── App Shell (protected layout) ───────────────────────────────────────────
function AppShell() {
  const location = useLocation();
  useWebSocket();

  return (
    <div className="min-h-screen" style={{ background: '#050914' }}>
      {/* Background ambient orbs */}
      <div className="bg-orb-1" />
      <div className="bg-orb-2" />
      <div className="bg-orb-3" />

      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />

      <Navbar />

      <main className="relative z-10 pt-20 pb-10 px-4 sm:px-6 lg:px-8 max-w-screen-2xl mx-auto">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<TreasuryOverview />} />
            <Route path="/risk" element={<RiskAnalytics />} />
            <Route path="/blockchain" element={<BlockchainMonitor />} />
            <Route path="/audit" element={<AuditLogs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
