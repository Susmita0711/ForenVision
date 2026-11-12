import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Forensic System Exception',
  message = 'An unexpected anomaly occurred while communicating with the cryptographic subsystem.',
  onRetry,
  className = '',
}) => {
  return (
    <div className={`rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center backdrop-blur ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-4 shadow-lg shadow-rose-900/20">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-100 tracking-tight">{title}</h3>
      <p className="mt-1.5 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:border-slate-600 active:scale-95"
        >
          <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
