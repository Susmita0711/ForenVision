import React from 'react';
import { Filter, X } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  currentValue: string;
}

interface FilterBarProps {
  filters: FilterOption[];
  onFilterChange: (filterId: string, value: string) => void;
  onResetAll?: () => void;
  activeCount?: number;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onResetAll,
  activeCount = 0,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 py-1 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1">
        <Filter className="h-3.5 w-3.5 text-cyan-400" />
        <span className="font-mono uppercase text-[11px] font-semibold text-slate-300">Filters</span>
        {activeCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            {activeCount}
          </span>
        )}
      </div>

      {filters.map((filter) => (
        <div key={filter.id} className="relative">
          <select
            value={filter.currentValue}
            onChange={(e) => onFilterChange(filter.id, e.target.value)}
            className="appearance-none rounded-lg border border-slate-700/80 bg-slate-900/90 py-1.5 pl-3 pr-7 text-xs text-slate-200 hover:border-slate-600 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 cursor-pointer"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                {filter.label}: {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-500 text-[10px]">
            ▼
          </div>
        </div>
      ))}

      {activeCount > 0 && onResetAll && (
        <button
          onClick={onResetAll}
          type="button"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition-colors"
        >
          <X className="h-3 w-3 text-rose-400" />
          <span>Reset</span>
        </button>
      )}
    </div>
  );
};
