import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  title,
  description,
  actions,
  badge,
  className = '',
}) => {
  return (
    <div className={`mb-6 space-y-2 ${className}`}>
      {/* Navigation Hierarchy */}
      <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-400 font-mono">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          <span>ForenVision</span>
        </Link>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <ChevronRight className="h-3 w-3 mx-1.5 text-slate-600 shrink-0" />
              {item.path && !isLast ? (
                <Link
                  to={item.path}
                  className="hover:text-cyan-400 transition-colors truncate max-w-[200px]"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-200 font-medium truncate max-w-[240px]">
                  {item.label}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Page Title & Contextual Header */}
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
              {badge}
            </div>
            {description && <p className="mt-1 text-xs sm:text-sm text-slate-400">{description}</p>}
          </div>

          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
    </div>
  );
};
