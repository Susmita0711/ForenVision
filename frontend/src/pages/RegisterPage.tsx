import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Mail, Lock, User, Building, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Digital Forensics & Incident Response');
  const [role, setRole] = useState<UserRole>('analyst');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !badgeNumber.trim() || !email.trim()) {
      setError('Please provide all required identification fields.');
      return;
    }

    if (password.length < 6) {
      setError('Access passkey must be at least 6 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Access passkey confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        badgeNumber,
        name,
        email,
        role,
        department,
        password,
      });

      if (res.success) {
        navigate('/dashboard');
      } else {
        setError(res.error || 'Registration failed.');
      }
    } catch {
      setError('Error communicating with enrollment registry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-7 shadow-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Examiner Enrollment</h2>
        <p className="text-xs text-slate-400 mt-0.5">Register for terminal clearance and custody signing access</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Full Name *
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent John Doe"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Badge / ID Code *
            </label>
            <div className="relative">
              <Shield className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={badgeNumber}
                onChange={(e) => setBadgeNumber(e.target.value)}
                placeholder="FX-9900"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono uppercase"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
            Official Email Address *
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent.name@forenvision.internal"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Department
            </label>
            <div className="relative">
              <Building className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Clearance Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="analyst">Analyst</option>
              <option value="investigator">Investigator</option>
              <option value="lead_examiner">Lead Examiner</option>
              <option value="technician">Technician</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Passkey *
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Confirm Passkey *
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 px-4 text-xs transition-all shadow-lg shadow-cyan-950/50 active:scale-[0.98] disabled:opacity-50"
        >
          <span>{loading ? 'Creating Credentials...' : 'Enroll Examiner'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="pt-2 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Already have verified credentials?{' '}
          <Link to="/login" className="text-cyan-400 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};
