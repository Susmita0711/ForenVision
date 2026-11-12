import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  ShieldAlert, 
  Archive, 
  Activity,
  FileCheck
} from 'lucide-react';

export type StatusVariant = 
  | 'open' 
  | 'in_progress' 
  | 'under_review' 
  | 'closed' 
  | 'archived'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'verified'
  | 'tampered'
  | 'unverified'
  | 'processing'
  | 'active'
  | 'suspended'
  | 'draft'
  | 'finalized';

interface StatusBadgeProps {
  status: StatusVariant | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const normalized = status.toLowerCase().replace(/[\s-]/g, '_');

  const getConfig = () => {
    switch (normalized) {
      case 'open':
        return {
          label: 'Open',
          classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          icon: Activity
        };
      case 'in_progress':
        return {
          label: 'In Progress',
          classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          icon: Clock
        };
      case 'under_review':
        return {
          label: 'Under Review',
          classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          icon: Clock
        };
      case 'closed':
        return {
          label: 'Closed',
          classes: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
          icon: FileCheck
        };
      case 'archived':
        return {
          label: 'Archived',
          classes: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: Archive
        };
      case 'critical':
        return {
          label: 'Critical',
          classes: 'bg-rose-500/15 text-rose-400 border-rose-500/40 animate-pulse',
          icon: ShieldAlert
        };
      case 'high':
        return {
          label: 'High',
          classes: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
          icon: AlertTriangle
        };
      case 'medium':
        return {
          label: 'Medium',
          classes: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
          icon: Activity
        };
      case 'low':
        return {
          label: 'Low',
          classes: 'bg-slate-700/30 text-slate-400 border-slate-700',
          icon: Activity
        };
      case 'verified':
      case 'active':
      case 'finalized':
        return {
          label: normalized === 'active' ? 'Active' : normalized === 'finalized' ? 'Finalized' : 'Verified (SHA-256)',
          classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          icon: CheckCircle2
        };
      case 'tampered':
      case 'suspended':
        return {
          label: normalized === 'suspended' ? 'Suspended' : 'Tampered / Discrepancy',
          classes: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
          icon: XCircle
        };
      case 'processing':
      case 'unverified':
      case 'draft':
        return {
          label: normalized === 'draft' ? 'Draft' : normalized === 'processing' ? 'Processing' : 'Unverified',
          classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          icon: Clock
        };
      default:
        return {
          label: status,
          classes: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Activity
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${padding} ${config.classes} ${className}`}
    >
      {showIcon && <Icon className={`${iconSize} shrink-0`} />}
      <span className="tracking-wide uppercase text-[10px] font-mono font-semibold">{config.label}</span>
    </span>
  );
};
