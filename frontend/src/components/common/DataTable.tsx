import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (item: T) => void;
  pageSize?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No Forensic Records Found',
  emptyDescription = 'There are no items matching the requested criteria.',
  onRowClick,
  pageSize = 10,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aVal = (a as any)[sortKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bVal = (b as any)[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(String(bVal))
          : String(bVal).localeCompare(aVal);
      }

      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }, [data, sortKey, sortDirection]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (effectiveCurrentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A] shadow-xl ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    tabIndex={col.sortable ? 0 : undefined}
                    aria-sort={
                      col.sortable
                        ? isSorted
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                    className={`px-4 py-3.5 font-medium ${
                      col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.sortable ? 'cursor-pointer select-none hover:text-cyan-300 focus:outline-none focus:text-cyan-300' : ''} ${
                      col.className || ''
                    }`}
                    onClick={() => col.sortable && handleSort(col.key)}
                    onKeyDown={(e) => {
                      if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleSort(col.key);
                      }
                    }}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-500">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="h-3 w-3 text-cyan-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-cyan-400" />
                            )
                          ) : (
                            <div className="flex flex-col opacity-30">
                              <ChevronUp className="h-2 w-2" />
                              <ChevronDown className="h-2 w-2 -mt-1" />
                            </div>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <LoadingSpinner label="Querying Secure Forensic Ledger..." />
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const key = keyExtractor(item, startIndex + index);
                return (
                  <tr
                    key={key}
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    onClick={() => onRowClick && onRowClick(item)}
                    onKeyDown={(e) => {
                      if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onRowClick(item);
                      }
                    }}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-slate-800/50 focus:bg-slate-800/60 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/50' : 'hover:bg-slate-800/25'
                    }`}
                  >
                    {columns.map((col) => {
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3.5 align-middle ${
                            col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                          } ${col.className || ''}`}
                        >
                          {col.render
                            ? col.render(item, startIndex + index)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            : String((item as any)[col.key] ?? '—')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && sortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
          <div className="font-mono text-[11px]">
            Showing <span className="text-slate-200">{startIndex + 1}</span> to{' '}
            <span className="text-slate-200">
              {Math.min(startIndex + pageSize, sortedData.length)}
            </span>{' '}
            of <span className="text-slate-200">{sortedData.length}</span> entries
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={effectiveCurrentPage === 1}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="First page"
              aria-label="Go to first page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={effectiveCurrentPage === 1}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Previous page"
              aria-label="Go to previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-2 font-mono text-[11px] text-slate-300">
              Page {effectiveCurrentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={effectiveCurrentPage === totalPages}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Next page"
              aria-label="Go to next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={effectiveCurrentPage === totalPages}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Last page"
              aria-label="Go to last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
