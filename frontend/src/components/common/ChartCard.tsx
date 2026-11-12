import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  metric?: string;
  metricLabel?: string;
  fixtureLabel?: boolean;
  children: React.ReactNode;
  height?: number | string;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  action,
  metric,
  metricLabel,
  fixtureLabel = false,
  children,
  height = 300,
  className = '',
}) => {
  return (
    <div className={`rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4 mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-cyan-400" />}
            <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
            {fixtureLabel && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                DEV FIXTURE
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {metric && (
            <div className="text-right">
              <span className="text-lg font-bold font-mono text-cyan-400">{metric}</span>
              {metricLabel && (
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{metricLabel}</p>
              )}
            </div>
          )}
          {action}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div style={{ height: typeof height === 'number' ? `${height}px` : height }} className="w-full relative">
        {children}
      </div>
    </div>
  );
};
