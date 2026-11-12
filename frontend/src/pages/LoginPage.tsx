import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Lock, Mail, BadgeCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('investigator@forenvision.internal');
  const [password, setPassword] = useState('Investigator@12345!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please provide an authorized email address.');
      return;
    }
    if (!password.trim()) {
      setError('Access passkey or credential is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setError(res.error || 'Authentication failure.');
      }
    } catch {
      setError('Connection to authentication gateway timed out.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-7 shadow-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Examiner Sign In</h2>
        <p className="text-xs text-slate-400 mt-0.5">Authenticate with your forensic clearance credentials</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Authorized Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@forenvision.internal"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Access Passkey
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 px-4 text-xs transition-all shadow-lg shadow-cyan-950/50 active:scale-[0.98] disabled:opacity-50"
        >
          <span>{loading ? 'Authenticating...' : 'Sign In to Terminal'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      {/* Quick Test Credential Selectors */}
      <div className="pt-3 border-t border-slate-800 space-y-2.5">
        <div className="text-[11px] font-semibold text-slate-400 text-center uppercase tracking-wider">
          Quick Clearance Profiles
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fillCredentials('admin@forenvision.internal', 'Admin@12345!')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <BadgeCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>Admin</span>
          </button>
          <button
            type="button"
            onClick={() => fillCredentials('investigator@forenvision.internal', 'Investigator@12345!')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <BadgeCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>Investigator</span>
          </button>
          <button
            type="button"
            onClick={() => fillCredentials('analyst@forenvision.internal', 'Analyst@12345!')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <BadgeCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>Analyst</span>
          </button>
          <button
            type="button"
            onClick={() => fillCredentials('viewer@forenvision.internal', 'Viewer@12345!')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <BadgeCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>Viewer</span>
          </button>
        </div>

        <div className="pt-2 text-center">
          <p className="text-xs text-slate-400">
            Need a clearance badge?{' '}
            <Link to="/register" className="text-cyan-400 hover:underline font-medium">
              Register Examiner
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
