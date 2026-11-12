import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Filter, 
  FileCheck2, 
  AlertTriangle, 
  UserCheck, 
  Sliders, 
  Database,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { getAuditLogs, getPermissionMatrix, type AuditLogEntry, type PermissionMatrixResponse } from '../api/auditApi';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'logs' | 'matrix'>('logs');

  // Permission Matrix State
  const [matrix, setMatrix] = useState<PermissionMatrixResponse | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState<boolean>(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
        actor: searchTerm || undefined,
      });
      if (res.success) {
        setLogs(res.logs);
        setTotal(res.total);
        setTotalPages(Math.max(1, Math.ceil(res.total / limit)));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load security audit logs.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, actionFilter, searchTerm]);

  const fetchMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const res = await getPermissionMatrix();
      if (res.success) {
        setMatrix(res);
      }
    } catch {
      // Ignore matrix failure
    } finally {
      setLoadingMatrix(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (activeTab === 'matrix' && !matrix) {
      fetchMatrix();
    }
  }, [activeTab, matrix, fetchMatrix]);

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('AUTH') || act.includes('FAILURE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/30">
          <AlertTriangle className="h-3 w-3" />
          {action}
        </span>
      );
    }
    if (act.includes('ROLE') || act.includes('STATUS')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <UserCheck className="h-3 w-3" />
          {action}
        </span>
      );
    }
    if (act.includes('SETTINGS')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
          <Sliders className="h-3 w-3" />
          {action}
        </span>
      );
    }
    if (act.includes('ANALYSIS') || act.includes('CASE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <FileCheck2 className="h-3 w-3" />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-700/30 text-slate-300 border border-slate-600/30">
        <Database className="h-3 w-3" />
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <ShieldAlert className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Security Audit Logs
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 font-normal">
                  TAMPER-EVIDENT
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Immutable, append-only forensic event ledger recording all privileged actions and clearance events.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div role="tablist" aria-label="Audit log views" className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-1">
          <button
            role="tab"
            aria-selected={activeTab === 'logs'}
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit Ledger ({total})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              activeTab === 'matrix'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Permission Matrix
          </button>
        </div>
      </div>

      {activeTab === 'logs' ? (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search actor badge or email..."
                aria-label="Search audit records by actor badge or email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label="Clear actor search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Action Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <select
                aria-label="Filter audit records by action type"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40"
              >
                <option value="">All Action Types</option>
                <option value="AUTHORIZATION_FAILURE">Authorization Failures</option>
                <option value="ROLE_CHANGED">Role Modifications</option>
                <option value="STATUS_CHANGED">Account Activation/Deactivation</option>
                <option value="USER_CREATED">Account Provisioning</option>
                <option value="CASE_ASSIGNED">Case Examiner Assignments</option>
                <option value="ANALYSIS_EXECUTED">Analysis Runs</option>
                <option value="SETTINGS_UPDATED">Security Settings Mutated</option>
              </select>
            </div>

            {/* Refresh Button */}
            <div className="flex items-center justify-end">
              <button
                onClick={fetchLogs}
                disabled={isLoading}
                aria-label="Refresh audit ledger records"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
                Refresh Ledger
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Table Container */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 font-mono text-[11px] text-slate-400">
                    <th className="py-3 px-4 font-semibold">TIMESTAMP (UTC)</th>
                    <th className="py-3 px-4 font-semibold">ACTION</th>
                    <th className="py-3 px-4 font-semibold">ACTOR</th>
                    <th className="py-3 px-4 font-semibold">TARGET RESOURCE</th>
                    <th className="py-3 px-4 font-semibold">IP ADDRESS</th>
                    <th className="py-3 px-4 font-semibold">METADATA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2 font-mono text-xs text-cyan-400">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Querying immutable audit vault...
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-xs">
                        No security audit records found matching query criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const actorBadge = log.actor?.badge_number || log.actor?.name || 'SYSTEM';
                      const actorRole = log.actor?.role || 'internal';
                      return (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                            {log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19) : 'N/A'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {getActionBadge(log.action)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-200">{actorBadge}</div>
                            <div className="text-[10px] text-slate-400 font-mono uppercase">{actorRole}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-cyan-300">{log.target}</span>
                            <span className="ml-1.5 text-[10px] text-slate-500 font-mono">[{log.target_type}]</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                            {log.ip_address}
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate">
                            {log.details ? (
                              <span className="font-mono text-[11px] text-slate-400" title={JSON.stringify(log.details)}>
                                {JSON.stringify(log.details)}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400">
              <span className="font-mono text-[11px]">
                Showing page {page} of {totalPages} ({total} audit events logged)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-750"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-mono text-[11px] font-semibold text-slate-200">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-750"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Permission Matrix View */
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              Role-Based Access Control (RBAC) Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative clearance mapping across system operations. Fully enforced server-side on every protected Flask endpoint.
            </p>
          </div>

          {loadingMatrix ? (
            <div className="py-12 text-center font-mono text-xs text-cyan-400">
              Loading security matrix...
            </div>
          ) : matrix ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/90 font-mono text-[11px] text-slate-300">
                    <th className="py-3 px-4 font-semibold">PERMISSION / OPERATION</th>
                    <th className="py-3 px-4 font-semibold text-center text-purple-400">ADMINISTRATOR</th>
                    <th className="py-3 px-4 font-semibold text-center text-cyan-400">INVESTIGATOR</th>
                    <th className="py-3 px-4 font-semibold text-center text-amber-400">ANALYST</th>
                    <th className="py-3 px-4 font-semibold text-center text-slate-400">READ-ONLY VIEWER</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {matrix.permissions.map((perm) => {
                    const hasAdmin = matrix.role_permissions['admin']?.includes(perm);
                    const hasInv = matrix.role_permissions['investigator']?.includes(perm);
                    const hasAnalyst = matrix.role_permissions['analyst']?.includes(perm);
                    const hasViewer = matrix.role_permissions['viewer']?.includes(perm);

                    return (
                      <tr key={perm} className="hover:bg-slate-850/40 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-200">
                          {perm}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold">
                          {hasAdmin ? (
                            <span className="text-emerald-400">ALLOW</span>
                          ) : (
                            <span className="text-red-500/60">DENY</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold">
                          {hasInv ? (
                            <span className="text-emerald-400">ALLOW</span>
                          ) : (
                            <span className="text-red-500/60">DENY</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold">
                          {hasAnalyst ? (
                            <span className="text-emerald-400">ALLOW</span>
                          ) : (
                            <span className="text-red-500/60">DENY</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold">
                          {hasViewer ? (
                            <span className="text-emerald-400">ALLOW</span>
                          ) : (
                            <span className="text-red-500/60">DENY</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 font-mono text-xs">
              Unable to load permission matrix.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default AuditLogsPage;
