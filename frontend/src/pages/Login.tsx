import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { login } from '../api/client';
import { useStore } from '../store/useStore';

// ── Demo credentials (offline / no-backend mode) ─────────────────────────
const DEMO_USERS: Record<string, { password: string; role: 'admin' | 'analyst' | 'viewer' }> = {
  admin:    { password: 'Admin@Oracle2026', role: 'admin'   },
  analyst:  { password: 'Analyst@2026',     role: 'analyst' },
  analysis: { password: 'Analyst@2026',     role: 'analyst' },
  viewer:   { password: 'Viewer@2026',      role: 'viewer'  },
};

function makeDemoToken(username: string, role: string): string {
  // A simple non-verifiable mock token that looks like a JWT so guards pass
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: username, role, exp: Date.now() / 1000 + 86400 }));
  return `${header}.${payload}.demo-signature`;
}

export default function Login() {
  const navigate = useNavigate();
  const { setToken, setUser } = useStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const tokens = await login(username, password);
      const role = (tokens.role?.toLowerCase() ?? 'viewer') as 'admin' | 'analyst' | 'viewer';
      setToken(tokens.access_token);
      setUser({ id: '0', username, email: '', role });
      localStorage.setItem('treasury_token', tokens.access_token);
      localStorage.setItem('treasury_user', JSON.stringify({ id: '0', username, email: '', role }));
      navigate('/', { replace: true });
    } catch (err: any) {
      // Network error → backend offline → try demo credentials
      const isNetworkError = !err?.response;
      if (isNetworkError) {
        const demo = DEMO_USERS[username.toLowerCase()];
        if (demo && demo.password === password) {
          const token = makeDemoToken(username, demo.role);
          setToken(token);
          setUser({ id: '0', username, email: `${username}@demo.local`, role: demo.role });
          localStorage.setItem('treasury_token', token);
          localStorage.setItem('treasury_user', JSON.stringify({ id: '0', username, email: `${username}@demo.local`, role: demo.role }));
          setIsDemo(true);
          navigate('/', { replace: true });
          return;
        }
        setError('Backend is offline. Use demo credentials: admin / Admin@Oracle2026 or analyst / Analyst@2026');
      } else {
        setError(err?.response?.data?.detail ?? 'Invalid credentials. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050914] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="glass-card p-8 rounded-2xl border border-white/10 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30"
            >
              <Shield className="w-9 h-9 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold gradient-text">Treasury Oracle</h1>
            <p className="text-white/50 text-sm mt-1">AI Risk Management Platform</p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5 text-red-400 text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Username</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/60 focus:bg-white/8 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/60 focus:bg-white/8 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <motion.button
              id="login-submit"
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 mt-2"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Authenticating…
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Sign In
                </>
              )}
            </motion.button>
          </form>

          {/* Hint */}
          <p className="text-center text-white/30 text-xs mt-6 flex flex-col gap-1">
            <span>Admin: <span className="text-white/50 font-mono">admin</span> / <span className="text-white/50 font-mono">Admin@Oracle2026</span></span>
            <span>Analyst: <span className="text-white/50 font-mono">analyst</span> (or <span className="text-white/50 font-mono">analysis</span>) / <span className="text-white/50 font-mono">Analyst@2026</span></span>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-4">
          🔐 Protected by JWT · Role-Based Access Control · AES-256
        </p>
        <p className="text-center text-indigo-400/60 text-xs mt-2">
          ✦ Demo mode available offline — backend not required
        </p>
      </motion.div>
    </div>
  );
}
