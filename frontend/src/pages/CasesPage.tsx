import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  RefreshCw, 
  Database, 
  Archive, 
  ShieldAlert, 
  Edit3, 
  Eye 
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { DataTable, type Column } from '../components/common/DataTable';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar, type FilterOption } from '../components/common/FilterBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useNotifications } from '../context/NotificationContext';
import { fetchCasesApi, createCaseApi, updateCaseStatusApi, archiveCaseApi } from '../api/casesApi';
import { useAuth } from '../context/AuthContext';
import type { ForensicCase, CasePriority, CaseStatus } from '../types';

export const CasesPage: React.FC = () => {
  const { user } = useAuth();
  const rawRole = (user?.role || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const canCreateCase = role === 'admin' || role === 'investigator';
  const canMutateCase = role === 'admin' || role === 'investigator';

  const [cases, setCases] = useState<ForensicCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<ForensicCase | null>(null);

  // New Case Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<ForensicCase['incidentType']>('Digital Forgery');
  const [newPriority, setNewPriority] = useState<CasePriority>('high');
  const [newLead, setNewLead] = useState('');
  const [newTags, setNewTags] = useState('Digital Forgery, Active Intake');
  const [isRestricted, setIsRestricted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Status & Archival mutation state
  const [targetStatus, setTargetStatus] = useState<CaseStatus>('in_progress');
  const [statusReason, setStatusReason] = useState('');
  const [mutationLoading, setMutationLoading] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  const navigate = useNavigate();
  const { addNotification } = useNotifications();

  const loadCases = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const result = await fetchCasesApi({
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
      incidentType: incidentTypeFilter !== 'ALL' ? incidentTypeFilter : undefined,
      q: searchQuery.trim() || undefined,
    });

    if (result.success) {
      setCases(result.cases);
    } else {
      setError(result.error || 'Failed to retrieve cases from the secure database.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [statusFilter, priorityFilter, incidentTypeFilter, searchQuery]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Filters configuration for FilterBar
  const filters: FilterOption[] = [
    {
      id: 'status',
      label: 'Status',
      currentValue: statusFilter,
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Open', value: 'open' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Under Review', value: 'under_review' },
        { label: 'Closed', value: 'closed' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      id: 'priority',
      label: 'Priority',
      currentValue: priorityFilter,
      options: [
        { label: 'All Priorities', value: 'ALL' },
        { label: 'Critical', value: 'critical' },
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
      ],
    },
    {
      id: 'incidentType',
      label: 'Classification',
      currentValue: incidentTypeFilter,
      options: [
        { label: 'All Types', value: 'ALL' },
        { label: 'Digital Forgery', value: 'Digital Forgery' },
        { label: 'Cyber Crime', value: 'Cyber Crime' },
        { label: 'Biometric Match', value: 'Biometric Match' },
        { label: 'Identity Theft', value: 'Identity Theft' },
        { label: 'Financial Fraud', value: 'Financial Fraud' },
        { label: 'Homicide / Scene', value: 'Homicide / Scene' },
      ],
    },
  ];

  const handleFilterChange = (filterId: string, value: string) => {
    if (filterId === 'status') setStatusFilter(value);
    if (filterId === 'priority') setPriorityFilter(value);
    if (filterId === 'incidentType') setIncidentTypeFilter(value);
  };

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setIncidentTypeFilter('ALL');
    setSearchQuery('');
  };

  const activeFilterCount = 
    (statusFilter !== 'ALL' ? 1 : 0) + 
    (priorityFilter !== 'ALL' ? 1 : 0) + 
    (incidentTypeFilter !== 'ALL' ? 1 : 0);

  // Client-side instant filter backup for ultra-fast responsiveness
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.caseNumber.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.leadInvestigator && c.leadInvestigator.toLowerCase().includes(q)) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)));

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const matchesPriority = priorityFilter === 'ALL' || c.priority === priorityFilter;
      const matchesType = incidentTypeFilter === 'ALL' || c.incidentType === incidentTypeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesType;
    });
  }, [cases, searchQuery, statusFilter, priorityFilter, incidentTypeFilter]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Case title is required.');
      return;
    }

    setCreateLoading(true);
    setFormError(null);

    const parsedTags = newTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      incidentType: newType,
      priority: newPriority,
      tags: parsedTags.length > 0 ? parsedTags : [newType, 'Active Intake'],
      leadInvestigator: newLead.trim() || undefined,
      is_restricted: isRestricted,
    };

    const res = await createCaseApi(payload);
    setCreateLoading(false);

    if (res.success && res.case) {
      setCases((prev) => [res.case!, ...prev]);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewLead('');
      setIsRestricted(false);
      addNotification({
        title: 'Case Docket Registered',
        message: `Case ${res.case.caseNumber} established with verified chain of custody.`,
        type: 'case',
        priority: 'info',
      });
    } else {
      setFormError(res.error || 'Failed to initialize case in database.');
    }
  };

  const handleQuickStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    setMutationLoading(true);
    const res = await updateCaseStatusApi(selectedCase.id, targetStatus, statusReason.trim() || undefined);
    setMutationLoading(false);

    if (res.success && res.case) {
      setCases((prev) => prev.map((c) => (c.id === selectedCase.id ? res.case! : c)));
      setIsStatusModalOpen(false);
      setSelectedCase(null);
      setStatusReason('');
      addNotification({
        title: 'Status Updated',
        message: `Case ${res.case.caseNumber} transitioned to [${res.case.status.toUpperCase()}].`,
        type: 'case',
        priority: 'info',
      });
    } else {
      addNotification({
        title: 'Status Transition Failed',
        message: res.error || 'Unable to update case status.',
        type: 'system',
        priority: 'warning',
      });
    }
  };

  const handleArchiveConfirm = async () => {
    if (!selectedCase) return;

    setMutationLoading(true);
    const res = await archiveCaseApi(selectedCase.id, archiveReason.trim() || undefined);
    setMutationLoading(false);

    if (res.success && res.case) {
      setCases((prev) => prev.map((c) => (c.id === selectedCase.id ? res.case! : c)));
      setIsArchiveDialogOpen(false);
      setSelectedCase(null);
      setArchiveReason('');
      addNotification({
        title: 'Case Archived',
        message: `Case ${res.case.caseNumber} preserved in historical archive ledger.`,
        type: 'case',
        priority: 'warning',
      });
    } else {
      addNotification({
        title: 'Archival Failed',
        message: res.error || 'Failed to archive case docket.',
        type: 'system',
        priority: 'urgent',
      });
    }
  };

  // DataTable column definitions
  const columns: Column<ForensicCase>[] = [
    {
      key: 'caseNumber',
      header: 'Case ID',
      sortable: true,
      width: '150px',
      render: (item) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-cyan-400">{item.caseNumber}</span>
          {item.is_restricted && (
            <span title="Classified Sensitive Docket">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400 inline" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Incident Title & Narrative',
      sortable: true,
      render: (item) => (
        <div className="max-w-md">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-100 truncate">{item.title}</p>
            {item.is_archived && (
              <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[9px] uppercase text-slate-400 border border-slate-700">
                Archived
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</p>
        </div>
      ),
    },
    {
      key: 'incidentType',
      header: 'Incident Type',
      sortable: true,
      render: (item) => (
        <span className="text-slate-300 font-mono text-[11px]">{item.incidentType}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (item) => <StatusBadge status={item.priority} size="sm" showIcon={false} />,
    },
    {
      key: 'evidenceCount',
      header: 'Evidence',
      sortable: true,
      align: 'center',
      render: (item) => (
        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300 border border-slate-700">
          {item.evidenceCount || 0} items
        </span>
      ),
    },
    {
      key: 'leadInvestigator',
      header: 'Lead Examiner',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-slate-300 truncate max-w-[140px] block">
          {item.leadInvestigator || 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last Update',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-[10px] text-slate-400">
          {item.updatedAt ? item.updatedAt.substring(0, 10) : 'N/A'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div 
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => navigate(`/cases/${item.id}`)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Inspect Case Details"
          >
            <Eye className="h-4 w-4" />
          </button>
          {canMutateCase && (
            <>
              <button
                onClick={() => {
                  setSelectedCase(item);
                  setTargetStatus(item.status);
                  setIsStatusModalOpen(true);
                }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                title="Modify Status"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              {!item.is_archived && (
                <button
                  onClick={() => {
                    setSelectedCase(item);
                    setIsArchiveDialogOpen(true);
                  }}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Archive Docket"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Cases' }]}
        title="Case Management Registry"
        description="Master index of forensic investigations, case files, and chain of custody ledgers."
        badge={
          <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
            <Database className="h-3 w-3" />
            Atlas Database Active
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadCases(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition-all disabled:opacity-50"
              title="Refresh case register"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
            {canCreateCase && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Open New Case</span>
              </button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="py-24">
          <LoadingSpinner size="lg" label="Querying forensic case database..." />
        </div>
      ) : error ? (
        <ErrorState
          title="Database Communication Failure"
          message={error}
          onRetry={() => loadCases()}
        />
      ) : (
        <>
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by Case ID, title, lead, or tag..."
              className="w-full sm:w-80"
            />

            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onResetAll={handleResetFilters}
              activeCount={activeFilterCount}
            />
          </div>

          {/* Cases Content */}
          {filteredCases.length === 0 ? (
            <EmptyState
              title={cases.length === 0 ? "No Forensic Cases Found" : "No Cases Match Filters"}
              description={
                cases.length === 0
                  ? (canCreateCase 
                      ? "Your database currently contains no case dockets. Open a new case to initialize investigation records."
                      : "No active case dockets are currently accessible under your operational clearance.")
                  : "Try clearing your filters or search keywords to view registered dockets."
              }
              actionLabel={cases.length === 0 ? (canCreateCase ? "Initialize First Case" : undefined) : "Reset Filter Parameters"}
              onAction={cases.length === 0 ? (canCreateCase ? () => setIsCreateModalOpen(true) : undefined) : handleResetFilters}
            />
          ) : (
            <DataTable
              columns={columns}
              data={filteredCases}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => navigate(`/cases/${item.id}`)}
              emptyTitle="No Forensic Cases Match"
              emptyDescription="Try adjusting your search criteria or filter tags."
              pageSize={8}
            />
          )}
        </>
      )}

      {/* Create Case Modal Dialog */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setFormError(null);
        }}
        title="Register New Forensic Case"
        subtitle="Establish an official investigation docket and initialize SHA-256 chain of custody"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-case-form"
              disabled={createLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {createLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{createLoading ? 'Initializing...' : 'Initialize Case Docket'}</span>
            </button>
          </>
        }
      >
        <form id="create-case-form" onSubmit={handleCreateCase} className="space-y-4">
          {formError && (
            <p className="text-xs text-rose-400 bg-rose-950/30 p-2.5 rounded border border-rose-800/40">
              {formError}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Case Title / Operation Code *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Operation Spectral Gate: Altered Wire Transfer Receipts"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Incident Classification
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ForensicCase['incidentType'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="Digital Forgery">Digital Forgery</option>
                <option value="Cyber Crime">Cyber Crime</option>
                <option value="Biometric Match">Biometric Match</option>
                <option value="Identity Theft">Identity Theft</option>
                <option value="Financial Fraud">Financial Fraud</option>
                <option value="Homicide / Scene">Homicide / Scene</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Priority Tier
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as CasePriority)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="critical">Critical (Immediate Response)</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Lead Forensic Investigator (Optional)
              </label>
              <input
                type="text"
                value={newLead}
                onChange={(e) => setNewLead(e.target.value)}
                placeholder="Defaults to current user"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Tags (Comma-separated)
              </label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. Wire Fraud, Memory, Tier-1"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Initial Narrative & Preliminary Evidence Notes
            </label>
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Summary of suspected breach, chain-of-custody transfer source, or device hardware tags..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRestricted}
                onChange={(e) => setIsRestricted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-xs text-slate-300">
                Classified / Restricted Docket (Restricts visibility strictly to assigned examiners and admins)
              </span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Quick Status Change Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Transition Investigation Status"
        subtitle={`Update official lifecycle status for ${selectedCase?.caseNumber}`}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="quick-status-form"
              disabled={mutationLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {mutationLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>Commit Status Transition</span>
            </button>
          </>
        }
      >
        <form id="quick-status-form" onSubmit={handleQuickStatusSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Select Target Status
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as CaseStatus)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
            >
              <option value="open">Open (Active Intake)</option>
              <option value="in_progress">In Progress (Lab Processing)</option>
              <option value="under_review">Under Review (Prosecutorial Audit)</option>
              <option value="closed">Closed (Verdict Concluded)</option>
              <option value="archived">Archived (Preserved Record)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Status Transition Rationale (Audit Logged)
            </label>
            <textarea
              rows={2}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="e.g. Preliminary ELA results verified; transitioning to judicial review."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500"
            />
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Archival */}
      <ConfirmationDialog
        isOpen={isArchiveDialogOpen}
        onClose={() => setIsArchiveDialogOpen(false)}
        onConfirm={handleArchiveConfirm}
        title="Archive Investigation Docket"
        message={`Are you sure you want to archive ${selectedCase?.caseNumber}? This case will be preserved for historical audit standards, and active analysis will be locked.`}
        confirmLabel="Archive Docket"
        variant="warning"
        isLoading={mutationLoading}
      />
    </div>
  );
};
