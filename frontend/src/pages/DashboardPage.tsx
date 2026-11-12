import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Briefcase, 
  Database, 
  Activity, 
  Clock, 
  Plus, 
  Scan, 
  ArrowUpRight, 
  History,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  FolderPlus,
  Layers,
  ScrollText,
  Users,
  ShieldAlert,
  Link2,
  Target,
  Fingerprint,
  Eye,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/common/StatCard';
import { ChartCard } from '../components/common/ChartCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { 
  fetchDashboardSummary, 
  type DashboardSummaryResponse 
} from '../api/dashboardApi';
import { createCaseApi } from '../api/casesApi';
import type { CasePriority } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Derive normalized role and permissions
  const rawRole = (user?.role || summary?.metadata?.userRole || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const isAdmin = role === 'admin';
  const isInvestigator = role === 'investigator';
  const isAnalyst = role === 'analyst';
  const isViewer = role === 'viewer';

  const canCreateCase = isAdmin || isInvestigator;

  // Quick Create Case Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('Digital Forgery');
  const [newPriority, setNewPriority] = useState<CasePriority>('high');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const res = await fetchDashboardSummary();
    if (res.success && res.data) {
      setSummary(res.data);
      setError(null);
    } else {
      // Do not silently fabricate data when the API fails
      setError(res.error || 'Failed to retrieve telemetry from backend.');
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Case title is required.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    const res = await createCaseApi({
      title: newTitle.trim(),
      description: newDescription.trim() || 'Initial intake narrative.',
      incidentType: newType,
      priority: newPriority,
      tags: [newType, 'Active Intake'],
    });

    setCreateLoading(false);

    if (res.success && res.case) {
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      // Refresh dashboard so newly created case & audit feed appear immediately
      await loadData(true);
    } else {
      setCreateError(res.error || 'Failed to initialize case in database.');
    }
  };

  // Full-page Loading State
  if (loading && !summary) {
    return (
      <div className="py-24">
        <LoadingSpinner label="Authenticating Telemetry & Querying MongoDB Database..." />
      </div>
    );
  }

  // Full-page Error State (never returns fabricated data silently)
  if (error && !summary) {
    return (
      <div className="py-12 space-y-6">
        <Breadcrumbs
          items={[{ label: 'Investigation Dashboard' }]}
          title="Forensic Operations Console"
          description="Real-time telemetry across open cases, cryptographic evidence chains, and AI analysis pipelines."
        />
        <ErrorState
          title="Database Telemetry Unavailable"
          message={error}
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  const metrics = summary?.metrics || {
    totalCases: 0,
    activeCases: 0,
    closedCases: 0,
    underReviewCases: 0,
    totalEvidence: 0,
    pendingAnalyses: 0,
    analysisQueueAvailable: false,
  };

  const caseStatusData = summary?.caseStatusDistribution || [];
  const evidenceTypeData = summary?.evidenceDistribution || [];
  const recentCases = summary?.recentCases || [];
  const recentActivity = summary?.recentActivity || [];
  const isDbConnected = summary?.metadata?.isDatabaseConnected ?? false;

  const roleDisplayConfig = {
    admin: {
      label: 'ROLE: ADMINISTRATOR (FULL ORG CLEARANCE)',
      badgeClass: 'bg-rose-950/60 border-rose-800/60 text-rose-300',
    },
    investigator: {
      label: 'ROLE: INVESTIGATOR (CASE & EVIDENCE OPERATIONS)',
      badgeClass: 'bg-blue-950/60 border-blue-800/60 text-blue-300',
    },
    analyst: {
      label: 'ROLE: FORENSIC ANALYST (AI PIPELINES)',
      badgeClass: 'bg-cyan-950/60 border-cyan-800/60 text-cyan-300',
    },
    viewer: {
      label: 'ROLE: READ-ONLY VIEWER (INSPECTION ONLY)',
      badgeClass: 'bg-slate-800 border-slate-700 text-slate-300',
    },
  }[role] || {
    label: `ROLE: ${role.toUpperCase()}`,
    badgeClass: 'bg-slate-800 border-slate-700 text-slate-300',
  };

  return (
    <div className="space-y-6">
      {/* Telemetry Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 shrink-0 ${isDbConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="font-mono font-semibold text-slate-200">
            {isDbConnected ? 'DATABASE STATUS: MONGODB ATLAS CONNECTED' : 'DATABASE STATUS: LOCAL IN-MEMORY REPOSITORY'}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${roleDisplayConfig.badgeClass}`}>
            {roleDisplayConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <span className="text-[11px] text-cyan-400 font-mono animate-pulse flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Synchronizing...
            </span>
          )}
          <span className="text-[11px] text-slate-400 font-mono">
            Authorized Case Records: <strong className="text-white">{metrics.totalCases}</strong>
          </span>
        </div>
      </div>

      {/* Read-Only Restriction Banner */}
      {isViewer && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-300">
          <Eye className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Read-Only Clearance Active:</strong> You have authorization to inspect open case records, examine evidence metadata, and review chain-of-custody ledger events and reports. Case creation, evidence modification, and forensic analyses are restricted.
          </span>
        </div>
      )}

      {/* Header with Role-Specific Actions */}
      <Breadcrumbs
        items={[{ label: 'Investigation Dashboard' }]}
        title="Forensic Operations Console"
        description="Comprehensive real-time telemetry across open cases, cryptographic evidence chains, and AI analysis pipelines."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              title="Refresh Telemetry"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Case</span>
                </button>
                <button
                  onClick={() => navigate('/users')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Users className="h-4 w-4 text-purple-400" />
                  <span>User Directory</span>
                </button>
                <button
                  onClick={() => navigate('/audit-logs')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <span>Audit Logs</span>
                </button>
              </>
            )}

            {isInvestigator && (
              <>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Case</span>
                </button>
                <button
                  onClick={() => navigate('/evidence')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Database className="h-4 w-4 text-amber-400" />
                  <span>Evidence Vault</span>
                </button>
                <button
                  onClick={() => navigate('/chain-of-custody')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Link2 className="h-4 w-4 text-cyan-400" />
                  <span>Chain of Custody</span>
                </button>
              </>
            )}

            {isAnalyst && (
              <>
                <button
                  onClick={() => navigate('/analysis/image')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
                >
                  <Scan className="h-4 w-4" />
                  <span>Run ELA Analysis</span>
                </button>
                <button
                  onClick={() => navigate('/analysis/detection')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Target className="h-4 w-4 text-emerald-400" />
                  <span>Object Detection</span>
                </button>
                <button
                  onClick={() => navigate('/analysis/fingerprint')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Fingerprint className="h-4 w-4 text-cyan-400" />
                  <span>Fingerprint AFIS</span>
                </button>
              </>
            )}

            {isViewer && (
              <>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs font-mono">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Read-Only Mode</span>
                </div>
                <button
                  onClick={() => navigate('/cases')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Briefcase className="h-4 w-4 text-cyan-400" />
                  <span>Browse Cases</span>
                </button>
                <button
                  onClick={() => navigate('/evidence')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
                >
                  <Database className="h-4 w-4 text-amber-400" />
                  <span>Evidence Vault</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Refresh Failure Warning Banner (if refreshed while keeping previous data) */}
      {error && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(true)}
            className="text-xs text-cyan-400 hover:underline font-mono ml-4 shrink-0"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Cases"
          value={metrics.totalCases}
          icon={Briefcase}
          subtitle="All recorded incident files"
          change={{
            value: metrics.totalCases === 0 ? 'Empty repository' : `${metrics.totalCases} authorized`,
            trend: 'neutral',
          }}
          accentColor="cyan"
          onClick={() => navigate('/cases')}
        />
        <StatCard
          title="Active Cases"
          value={metrics.activeCases}
          icon={Activity}
          subtitle="Open & In Progress investigations"
          change={{
            value: metrics.activeCases > 0 ? `${metrics.activeCases} under scrutiny` : 'No active casework',
            trend: metrics.activeCases > 0 ? 'up' : 'neutral',
          }}
          accentColor="emerald"
          onClick={() => navigate('/cases')}
        />
        <StatCard
          title="Evidence Items"
          value={metrics.totalEvidence}
          icon={Database}
          subtitle={metrics.totalEvidence > 0 ? 'SHA-256 registered artifacts' : 'Awaiting forensic intake'}
          change={{
            value: metrics.totalEvidence > 0 ? `${metrics.totalEvidence} verified` : '0 registered',
            trend: metrics.totalEvidence > 0 ? 'up' : 'neutral',
          }}
          accentColor="amber"
          onClick={() => navigate('/evidence')}
        />
        <StatCard
          title="Pending Analyses"
          value={metrics.pendingAnalyses}
          icon={Clock}
          subtitle={metrics.analysisQueueAvailable ? 'Biometric & ELA queue' : 'Analysis queue idle'}
          change={{
            value: metrics.pendingAnalyses > 0 ? `${metrics.pendingAnalyses} in pipeline` : 'No queued tasks',
            trend: 'neutral',
          }}
          accentColor="rose"
          onClick={() => navigate(isViewer ? '/reports' : '/analysis/image')}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Case Status Distribution */}
        <ChartCard
          title="Case Status Distribution"
          subtitle="Casework categorized by operational phase"
          icon={Briefcase}
          height={260}
        >
          {metrics.totalCases === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={Briefcase}
                title="No Casework in Database"
                description={
                  canCreateCase
                    ? 'Create a case to visualize operational status distribution.'
                    : 'No authorized case records found within your operational clearance.'
                }
                actionLabel={canCreateCase ? 'Create First Case' : undefined}
                onAction={canCreateCase ? () => setIsCreateModalOpen(true) : undefined}
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={caseStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={4}
                >
                  {caseStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0F172A" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '11px',
                    color: '#F8FAFC',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => <span className="text-xs text-slate-300 font-mono">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Evidence Classification Chart */}
        <ChartCard
          title="Evidence Classification"
          subtitle="Forensic evidence items categorized by modality"
          icon={Database}
          height={260}
        >
          {evidenceTypeData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={Layers}
                title="No Evidence Ingested"
                description="Registered evidence artifacts will appear here categorized by modality."
                actionLabel="Open Evidence Vault"
                onAction={() => navigate('/evidence')}
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evidenceTypeData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis
                  dataKey="type"
                  tick={{ fill: '#94A3B8', fontSize: 10 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    fontSize: '11px',
                    color: '#F8FAFC',
                  }}
                />
                <Bar dataKey="count" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Dual Column: Recent Cases & Real-Time Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Cases (2 columns) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Recent Investigations</h3>
              <p className="text-xs text-slate-400">Latest active cases and their priority clearances</p>
            </div>
            <button
              onClick={() => navigate('/cases')}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
            >
              <span>View All</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentCases.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="No Active Investigations Found"
              description={
                canCreateCase
                  ? 'The database currently contains no case records. Initialize your first forensic file to begin custody logging.'
                  : 'No active investigation records are currently assigned or accessible under your clearance.'
              }
              actionLabel={canCreateCase ? 'Create Investigation Case' : undefined}
              onAction={canCreateCase ? () => setIsCreateModalOpen(true) : undefined}
            />
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recentCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/50 px-2 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{c.caseNumber}</span>
                      <StatusBadge status={c.status} size="sm" />
                      <StatusBadge status={c.priority} size="sm" showIcon={false} />
                    </div>
                    <p className="text-xs font-medium text-slate-200 mt-1 truncate max-w-md">{c.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Lead: {c.leadInvestigator} &bull; {c.evidenceCount} Evidence Items
                    </p>
                  </div>
                  <div className="text-right sm:self-center shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Real-Time Custody & Activity Log (1 column) */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Custody & Audit Feed</h3>
              <p className="text-xs text-slate-400">Verified database ledger events</p>
            </div>
            <History className="h-4 w-4 text-cyan-400" />
          </div>

          {recentActivity.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No Audit Records"
              description="Actions performed in the system will automatically appear in this immutable audit feed."
            />
          ) : (
            <div className="space-y-3.5">
              {recentActivity.map((log) => {
                const actorName = typeof log.actor === 'object' && log.actor !== null
                  ? (log.actor.name || log.actor.email || 'Examiner')
                  : String(log.actor || 'Forensic System');
                const actorBadge = typeof log.actor === 'object' && log.actor !== null
                  ? (log.actor.badge || log.actor.badge_number || log.badge || 'N/A')
                  : (log.badge || 'N/A');
                return (
                  <div key={log.id} className="relative pl-4 border-l border-cyan-500/30 space-y-1">
                    <div className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-cyan-400" />
                    <p className="text-xs font-semibold text-slate-200 leading-snug">{log.action}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Target: <span className="font-mono text-slate-300">{log.target}</span>
                    </p>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{actorName} ({actorBadge})</span>
                      <span>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Create Case Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Initialize Forensic Investigation"
        subtitle="Register a new digital case file into the cryptographic registry"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="dashboard-create-case-form"
              disabled={createLoading}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {createLoading ? 'Registering...' : 'Initialize Case'}
            </button>
          </>
        }
      >
        <form id="dashboard-create-case-form" onSubmit={handleCreateCase} className="space-y-4">
          {createError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Case Title / Incident Name *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Operation Spectral Gate: Altered Wire Receipts"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Incident Classification
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500"
              >
                <option value="Digital Forgery">Digital Forgery</option>
                <option value="Cyber Crime">Cyber Crime</option>
                <option value="Biometric Match">Biometric Match</option>
                <option value="Financial Fraud">Financial Fraud</option>
                <option value="Identity Theft">Identity Theft</option>
                <option value="Homicide / Scene">Homicide / Scene</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Operational Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as CasePriority)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Incident Summary & Narrative
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              placeholder="Provide preliminary summary and evidentiary context for this case..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
