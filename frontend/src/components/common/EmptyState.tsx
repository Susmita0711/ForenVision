import React from 'react';
import { FolderSearch, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FolderSearch,
  title = 'No Records Discovered',
  description = 'No forensic artifacts or case files match your query parameters.',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`rounded-xl border border-slate-800 bg-[#0F172A]/50 p-10 text-center ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-400 mb-4">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <button
            onClick={onAction}
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};
