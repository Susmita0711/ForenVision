import React from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  change?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
  };
  accentColor?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  fixtureLabel?: boolean;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  change,
  accentColor = 'cyan',
  fixtureLabel = false,
  onClick,
  className = '',
}) => {
  const colorMap = {
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      text: 'text-cyan-400',
      glow: 'shadow-cyan-500/5',
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      glow: 'shadow-emerald-500/5',
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      glow: 'shadow-amber-500/5',
    },
    rose: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      text: 'text-rose-400',
      glow: 'shadow-rose-500/5',
    },
    slate: {
      bg: 'bg-slate-800',
      border: 'border-slate-700',
      text: 'text-slate-300',
      glow: 'shadow-none',
    },
  };

  const currentTheme = colorMap[accentColor];

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border border-slate-800/90 bg-[#0F172A] p-5 shadow-lg transition-all duration-200 hover:border-slate-700 ${
        onClick ? 'cursor-pointer hover:bg-slate-900/60' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
            {fixtureLabel && (
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                DEV FIXTURE
              </span>
            )}
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 border ${currentTheme.bg} ${currentTheme.border} ${currentTheme.text} shadow-sm ${currentTheme.glow}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {(subtitle || change) && (
        <div className="mt-3.5 flex items-center justify-between text-xs pt-3 border-t border-slate-800/60">
          {subtitle && <span className="text-slate-400 truncate">{subtitle}</span>}
          {change && (
            <span
              className={`inline-flex items-center gap-1 font-mono font-medium ${
                change.trend === 'up'
                  ? 'text-emerald-400'
                  : change.trend === 'down'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              {change.trend === 'up' && <TrendingUp className="h-3.5 w-3.5" />}
              {change.trend === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
              {change.trend === 'neutral' && <Minus className="h-3.5 w-3.5" />}
              {change.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
