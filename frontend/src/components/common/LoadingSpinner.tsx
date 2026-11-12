import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-6 ${className}`}>
      <div className="relative">
        <Loader2 className={`${sizeMap[size]} text-cyan-400 animate-spin`} />
        <div className="absolute inset-0 rounded-full blur-sm bg-cyan-500/20 pointer-events-none" />
      </div>
      {label && (
        <p className="text-xs font-mono uppercase tracking-wider text-slate-400 animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
};
