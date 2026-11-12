import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
  id?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search by case ID, hash, or keyword...',
  onClear,
  className = '',
  id = 'global-search-input',
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search className="h-4 w-4 text-slate-500" />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700/80 bg-slate-900/90 py-2 pl-9 pr-9 text-xs text-slate-200 placeholder-slate-500 transition-colors focus:border-cyan-500/60 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 hover:text-slate-300"
          aria-label="Clear search query"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
