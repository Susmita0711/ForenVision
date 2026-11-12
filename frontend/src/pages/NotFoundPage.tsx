import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-6 shadow-xl shadow-rose-950/20">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-400 mb-2">
        ERROR 404 &bull; ADMISSIBILITY EXCEPTION
      </span>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
        Forensic Endpoint Not Found
      </h1>

      <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
        The requested case docket, evidence block, or forensic tool does not exist on this ledger node or has been restricted under classification rules.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 text-xs font-semibold transition-all active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return Back</span>
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
        >
          <Home className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>
    </div>
  );
};
