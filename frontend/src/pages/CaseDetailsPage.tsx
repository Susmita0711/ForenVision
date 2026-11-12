import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Briefcase, 
  Database, 
  Link2, 
  Plus, 
  Check, 
  Tag, 
  Edit3, 
  Archive, 
  ShieldAlert, 
  Cpu, 
  RefreshCw,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';
import { FileUpload } from '../components/common/FileUpload';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useNotifications } from '../context/NotificationContext';
import { 
  fetchCaseByIdApi, 
  updateCaseApi, 
  updateCaseStatusApi, 
  archiveCaseApi, 
  fetchCaseEvidenceApi, 
  attachCaseEvidenceApi,
  fetchCaseAnalysesApi,
  fetchCaseAuditApi
} from '../api/casesApi';
import type { 
  ForensicCase, 
  EvidenceItem, 
  CaseStatus, 
  CasePriority, 
  BaseAnalysisResult, 
  ActivityLog 
} from '../types';

export const CaseDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { user } = useAuth();

  const rawRole = (user?.role || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const canMutateCase = role === 'admin' || role === 'investigator';
  const canUploadEvidence = role === 'admin' || role === 'investigator';
  const isViewer = role === 'viewer';

  // Case & Subsystem data
  const [currentCase, setCurrentCase] = useState<ForensicCase | null>(null);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [analysisList, setAnalysisList] = useState<BaseAnalysisResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<ActivityLog[]>([]);

  // Page state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Edit Case Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<CasePriority>('medium');
  const [editType, setEditType] = useState<ForensicCase['incidentType']>('Digital Forgery');
  const [editLead, setEditLead] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editRestricted, setEditRestricted] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Status Change State
  const [targetStatus, setTargetStatus] = useState<CaseStatus>('open');
  const [statusReason, setStatusReason] = useState('');
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  // Archival Dialog State
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Attach Evidence Modal State
  const [isAddEvidenceOpen, setIsAddEvidenceOpen] = useState(false);
  const [evidenceName, setEvidenceName] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceItem['type']>('image');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedHash, setUploadedHash] = useState<string>('');
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'evidence' | 'analyses' | 'audit'>('evidence');

  const loadCaseData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const caseRes = await fetchCaseByIdApi(id);
    if (!caseRes.success || !caseRes.case) {
      setError(caseRes.error || 'Case docket not found or access restricted.');
      setLoading(false);
      return;
    }

    setCurrentCase(caseRes.case);
    setTargetStatus(caseRes.case.status);

    // Fetch related evidence, analyses, and audit logs in parallel
    const [evRes, anRes, auRes] = await Promise.all([
      fetchCaseEvidenceApi(caseRes.case.id),
      fetchCaseAnalysesApi(caseRes.case.id),
      fetchCaseAuditApi(caseRes.case.id),
    ]);

    if (evRes.success) setEvidenceList(evRes.evidence);
    if (anRes.success) setAnalysisList(anRes.analyses);
    if (auRes.success) setAuditLogs(auRes.auditLogs);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadCaseData();
  }, [loadCaseData]);

  // Open Edit Modal with initialized data
  const handleOpenEdit = () => {
    if (!currentCase) return;
    setEditTitle(currentCase.title);
    setEditDescription(currentCase.description || '');
    setEditPriority(currentCase.priority);
    setEditType(currentCase.incidentType);
    setEditLead(currentCase.leadInvestigator || '');
    setEditTags(currentCase.tags?.join(', ') || '');
    setEditRestricted(Boolean(currentCase.is_restricted));
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit Case
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCase) return;
    if (!editTitle.trim()) {
      setEditError('Case title is required.');
      return;
    }

    setEditLoading(true);
    setEditError(null);

    const parsedTags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await updateCaseApi(currentCase.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      priority: editPriority,
      incidentType: editType,
      leadInvestigator: editLead.trim() || undefined,
      tags: parsedTags,
      is_restricted: editRestricted,
    });

    setEditLoading(false);
    if (res.success && res.case) {
      setCurrentCase(res.case);
      setIsEditModalOpen(false);
      addNotification({
        title: 'Case Docket Updated',
        message: `Changes recorded in audit ledger for ${res.case.caseNumber}.`,
        type: 'case',
        priority: 'info',
      });
      // Refresh audit logs
      fetchCaseAuditApi(res.case.id).then((r) => r.success && setAuditLogs(r.auditLogs));
    } else {
      setEditError(res.error || 'Failed to submit modifications.');
    }
  };

  // Handle workflow status change
  const handleStatusSelectChange = (newStatus: CaseStatus) => {
    if (!currentCase) return;
    setTargetStatus(newStatus);

    // If changing to closed or archived, prompt with confirmation
    if (newStatus === 'closed' || newStatus === 'archived') {
      setIsStatusDialogOpen(true);
    } else {
      executeStatusChange(newStatus);
    }
  };

  const executeStatusChange = async (newStatus: CaseStatus, reason?: string) => {
    if (!currentCase) return;
    setStatusLoading(true);

    const res = await updateCaseStatusApi(currentCase.id, newStatus, reason);
    setStatusLoading(false);
    setIsStatusDialogOpen(false);
    setStatusReason('');

    if (res.success && res.case) {
      setCurrentCase(res.case);
      setTargetStatus(res.case.status);
      setStatusMessage(`Case status updated to [${newStatus.toUpperCase()}]. Ledger updated.`);
      setTimeout(() => setStatusMessage(null), 4000);
      addNotification({
        title: 'Status Updated',
        message: `Case ${res.case.caseNumber} transitioned to [${newStatus.toUpperCase()}].`,
        type: 'case',
        priority: 'info',
      });
      fetchCaseAuditApi(res.case.id).then((r) => r.success && setAuditLogs(r.auditLogs));
    } else {
      addNotification({
        title: 'Status Transition Failed',
        message: res.error || 'Could not update status.',
        type: 'system',
        priority: 'warning',
      });
    }
  };

  // Archive Docket Confirmation
  const handleArchiveConfirm = async () => {
    if (!currentCase) return;
    setArchiveLoading(true);

    const res = await archiveCaseApi(currentCase.id, archiveReason.trim() || undefined);
    setArchiveLoading(false);
    setIsArchiveDialogOpen(false);
    setArchiveReason('');

    if (res.success && res.case) {
      setCurrentCase(res.case);
      setTargetStatus('archived');
      addNotification({
        title: 'Docket Archived',
        message: `Case ${res.case.caseNumber} marked as archived and locked for review.`,
        type: 'case',
        priority: 'warning',
      });
      fetchCaseAuditApi(res.case.id).then((r) => r.success && setAuditLogs(r.auditLogs));
    } else {
      addNotification({
        title: 'Archival Failed',
        message: res.error || 'Unable to archive case.',
        type: 'system',
        priority: 'urgent',
      });
    }
  };

  // Attach Evidence
  const handleAttachEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCase || !uploadedFile || !uploadedHash) return;

    setAttachLoading(true);
    setAttachError(null);

    const payload = {
      name: evidenceName.trim() || uploadedFile.name,
      type: evidenceType,
      fileFormat: uploadedFile.name.split('.').pop()?.toUpperCase() || 'BIN',
      fileSizeBytes: uploadedFile.size,
      sha256Hash: uploadedHash,
      originalFileName: uploadedFile.name,
      tags: [evidenceType.toUpperCase(), 'Case Evidence'],
      notes: `Cryptographic SHA-256 intake: ${uploadedHash.substring(0, 16)}...`,
      thumbnailUrl:
        evidenceType === 'image'
          ? URL.createObjectURL(uploadedFile)
          : undefined,
    };

    const res = await attachCaseEvidenceApi(currentCase.id, payload);
    setAttachLoading(false);

    if (res.success && res.evidence) {
      setEvidenceList([res.evidence, ...evidenceList]);
      setCurrentCase({
        ...currentCase,
        evidenceCount: currentCase.evidenceCount + 1,
        chainOfCustodyCount: currentCase.chainOfCustodyCount + 1,
      });
      setIsAddEvidenceOpen(false);
      setEvidenceName('');
      setUploadedFile(null);
      setUploadedHash('');
      addNotification({
        title: 'Evidence Attached',
        message: `Artifact ${res.evidence.evidenceNumber} registered under Case ${currentCase.caseNumber}.`,
        type: 'evidence',
        priority: 'info',
      });
      fetchCaseAuditApi(currentCase.id).then((r) => r.success && setAuditLogs(r.auditLogs));
    } else {
      setAttachError(res.error || 'Failed to attach evidence artifact.');
    }
  };

  if (loading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Retrieving authenticated case dossier & audit ledger..." />
      </div>
    );
  }

  if (error || !currentCase) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Cases', path: '/cases' },
            { label: 'Record Lookup' },
          ]}
          title="Forensic Docket Lookup"
        />
        <ErrorState
          title="Case Dossier Unavailable"
          message={error || 'The requested forensic case could not be discovered.'}
          onRetry={() => navigate('/cases')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Cases', path: '/cases' },
          { label: currentCase.caseNumber },
        ]}
        title={currentCase.title}
        badge={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
              {currentCase.caseNumber}
            </span>
            <StatusBadge status={currentCase.status} />
            <StatusBadge status={currentCase.priority} showIcon={false} />
            {currentCase.is_restricted && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-400 border border-amber-500/30">
                <ShieldAlert className="h-3 w-3" />
                Classified
              </span>
            )}
            {currentCase.is_archived && (
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-400 border border-slate-700">
                Archived Record
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {isViewer && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 font-mono text-xs">
                <Lock className="h-3.5 w-3.5" />
                Read-Only Docket
              </span>
            )}
            {canMutateCase && (
              <button
                onClick={handleOpenEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
              >
                <Edit3 className="h-4 w-4 text-cyan-400" />
                <span>Edit Docket</span>
              </button>
            )}
            {canUploadEvidence && (
              <button
                onClick={() => setIsAddEvidenceOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Attach Evidence</span>
              </button>
            )}
            {canMutateCase && !currentCase.is_archived && (
              <button
                onClick={() => setIsArchiveDialogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/60 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95"
              >
                <Archive className="h-4 w-4 text-rose-400" />
                <span>Archive</span>
              </button>
            )}
          </div>
        }
      />

      {statusMessage && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Grid: Case Overview & Detailed Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Incident Narrative & Tabbed Subsystems */}
        <div className="lg:col-span-2 space-y-6">
          {/* Narrative Card */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-cyan-400" />
                <span>Incident Classification & Narrative</span>
              </h3>
              <span className="font-mono text-xs text-slate-400">{currentCase.incidentType}</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {currentCase.description || 'No initial incident narrative recorded for this docket.'}
            </p>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
              {currentCase.tags && currentCase.tags.length > 0 ? (
                currentCase.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300"
                  >
                    <Tag className="h-3 w-3 text-cyan-400" />
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-mono text-slate-500">No categorization tags registered.</span>
              )}
            </div>
          </div>

          {/* Subsystems Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('evidence')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'evidence'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>Evidence Artifacts ({evidenceList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('analyses')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'analyses'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>AI Analysis Results ({analysisList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'audit'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Audit Trail Ledger ({auditLogs.length})</span>
            </button>
          </div>

          {/* Tab 1: Associated Evidence Items */}
          {activeTab === 'evidence' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <span>Associated Evidence Vault</span>
                  </h3>
                  <p className="text-xs text-slate-400">Cryptographically verified forensic assets</p>
                </div>

                <button
                  onClick={() => setIsAddEvidenceOpen(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Intake Artifact</span>
                </button>
              </div>

              {evidenceList.length === 0 ? (
                <EmptyState
                  title="No Evidence Attached"
                  description="No physical or digital evidence registered under this docket yet."
                  actionLabel="Attach First Evidence Item"
                  onAction={() => setIsAddEvidenceOpen(true)}
                />
              ) : (
                <div className="space-y-3">
                  {evidenceList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => navigate(`/evidence/${item.id}`)}
                      className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="h-12 w-12 rounded-lg object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                            <Database className="h-6 w-6" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-400">
                              {item.evidenceNumber}
                            </span>
                            <StatusBadge status={item.integrityStatus} size="sm" />
                          </div>
                          <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">{item.name}</p>
                          <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                            SHA-256: {item.sha256Hash?.substring(0, 24)}...
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-[10px] font-mono text-slate-400 uppercase px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                          {item.fileFormat}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Saved AI Analysis Results */}
          {activeTab === 'analyses' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-purple-400" />
                    <span>Saved AI Forensic Analyses</span>
                  </h3>
                  <p className="text-xs text-slate-400">Automated ELA, noise inconsistency, and neural verifications</p>
                </div>
              </div>

              {analysisList.length === 0 ? (
                <EmptyState
                  title="No Analyses Recorded"
                  description="No AI forensic investigations have been executed on evidence for this case yet."
                  actionLabel="Launch Image Analysis"
                  onAction={() => navigate('/analysis/image')}
                />
              ) : (
                <div className="space-y-3">
                  {analysisList.map((an) => (
                    <div
                      key={an.analysisId}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-cyan-400 uppercase">
                          {an.category.replace('_', ' ')}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {an.timestamp.substring(0, 19).replace('T', ' ')} UTC
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">Model: {an.modelEngine} ({an.modelVersion})</span>
                        <span className="font-semibold text-emerald-400">
                          Confidence: {an.confidenceScore}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Case Audit Trail Ledger */}
          {activeTab === 'audit' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-cyan-400" />
                  <span>Immutable Case Audit Ledger</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {auditLogs.length} Verified Entries
                </span>
              </div>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No explicit audit entries recorded for this case identifier.
                </p>
              ) : (
                <div className="space-y-4 border-l border-cyan-500/30 pl-4">
                  {auditLogs.map((log) => {
                    const actorName = typeof log.actor === 'object' && log.actor !== null
                      ? (log.actor.name || log.actor.email || 'Examiner')
                      : String(log.actor || 'Forensic System');
                    const actorBadge = typeof log.actor === 'object' && log.actor !== null
                      ? (log.actor.badge || log.actor.badge_number || log.badge || 'N/A')
                      : (log.badge || 'N/A');
                    return (
                      <div key={log.id} className="relative space-y-1">
                        <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-cyan-400 ring-4 ring-slate-900" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {log.action}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {log.timestamp?.substring(0, 19).replace('T', ' ')} UTC
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-slate-500">
                          Actor: {actorName} ({actorBadge}) &bull; Target: {log.target} &bull; IP: {log.ipAddress}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Forensic Metadata & Workflow Controller */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>Dossier Control</span>
              {canMutateCase && (
                <button
                  onClick={handleOpenEdit}
                  className="text-cyan-400 hover:text-cyan-300 font-normal lowercase flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>edit</span>
                </button>
              )}
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px] mb-1">Lifecycle Workflow Status</span>
                {canMutateCase ? (
                  <select
                    value={currentCase.status}
                    onChange={(e) => handleStatusSelectChange(e.target.value as CaseStatus)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-2.5 text-xs text-white focus:border-cyan-500"
                  >
                    <option value="open">Open (Active Investigation)</option>
                    <option value="in_progress">In Progress (Lab Analysis)</option>
                    <option value="under_review">Under Review (Prosecutorial Audit)</option>
                    <option value="closed">Closed (Verdict Concluded)</option>
                    <option value="archived">Archived (Historical Record)</option>
                  </select>
                ) : (
                  <div className="w-full rounded-lg border border-slate-800 bg-slate-900/80 py-1.5 px-2.5 text-xs text-slate-300">
                    <StatusBadge status={currentCase.status} size="sm" />
                  </div>
                )}
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Priority Tier</span>
                <div className="mt-1">
                  <StatusBadge status={currentCase.priority} showIcon={false} />
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Lead Examiner</span>
                <p className="font-medium text-slate-200 mt-0.5">{currentCase.leadInvestigator || 'Unassigned'}</p>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Assigned Personnel</span>
                <div className="mt-1 space-y-1">
                  {currentCase.assignedExaminers && currentCase.assignedExaminers.length > 0 ? (
                    currentCase.assignedExaminers.map((examiner) => (
                      <p key={examiner} className="font-mono text-[11px] text-slate-300 bg-slate-900/60 p-1 rounded border border-slate-800">
                        {examiner}
                      </p>
                    ))
                  ) : (
                    <p className="font-mono text-[11px] text-slate-500">None assigned</p>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="text-slate-300">{currentCase.createdAt?.substring(0, 10)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Audit:</span>
                  <span className="text-slate-300">{currentCase.updatedAt?.substring(0, 10)}</span>
                </div>
                {currentCase.closedAt && (
                  <div className="flex justify-between">
                    <span>Closed:</span>
                    <span className="text-slate-300">{currentCase.closedAt.substring(0, 10)}</span>
                  </div>
                )}
                {currentCase.archivedAt && (
                  <div className="flex justify-between">
                    <span>Archived:</span>
                    <span className="text-slate-300">{currentCase.archivedAt.substring(0, 10)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Case Modal Dialog */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Case Docket"
        subtitle={`Modify investigation metadata for ${currentCase.caseNumber}`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-case-form"
              disabled={editLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {editLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>Save Modifications</span>
            </button>
          </>
        }
      >
        <form id="edit-case-form" onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <p className="text-xs text-rose-400 bg-rose-950/30 p-2.5 rounded border border-rose-800/40">
              {editError}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Case Title / Operation Code *
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Incident Classification
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as ForensicCase['incidentType'])}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
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
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as CasePriority)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
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
                Lead Examiner
              </label>
              <input
                type="text"
                value={editLead}
                onChange={(e) => setEditLead(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Tags (Comma-separated)
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Incident Narrative & Notes
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editRestricted}
                onChange={(e) => setEditRestricted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-xs text-slate-300">
                Classified / Restricted Docket (Restricts access to assigned examiners)
              </span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Attach Evidence Modal with Real FileUpload & SHA-256 */}
      <Modal
        isOpen={isAddEvidenceOpen}
        onClose={() => setIsAddEvidenceOpen(false)}
        title="Intake & Attach Evidence Artifact"
        subtitle={`Generate tamper-proof cryptographic baseline for Case ${currentCase.caseNumber}`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddEvidenceOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAttachEvidence}
              disabled={!uploadedFile || !uploadedHash || attachLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {attachLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>Record into Chain of Custody</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {attachError && (
            <p className="text-xs text-rose-400 bg-rose-950/30 p-2.5 rounded border border-rose-800/40">
              {attachError}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Evidence Label / Description *
            </label>
            <input
              type="text"
              value={evidenceName}
              onChange={(e) => setEvidenceName(e.target.value)}
              placeholder="e.g. Forged Wire Transfer Scan #4"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Evidence Modality
            </label>
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as EvidenceItem['type'])}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500"
            >
              <option value="image">Image (Photograph / Scan / Document)</option>
              <option value="fingerprint">Fingerprint Lift (1000 DPI)</option>
              <option value="face">Facial Frame / CCTV Still</option>
              <option value="sketch">Artist Composite Sketch</option>
              <option value="digital_artifact">Raw Binary / Forensic Disk Dump</option>
            </select>
          </div>

          <FileUpload
            onFileSelect={(file, sha256) => {
              setUploadedFile(file);
              setUploadedHash(sha256);
            }}
          />
        </div>
      </Modal>

      {/* Status Change Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isStatusDialogOpen}
        onClose={() => {
          setIsStatusDialogOpen(false);
          setTargetStatus(currentCase.status);
        }}
        onConfirm={() => executeStatusChange(targetStatus, statusReason)}
        title={`Confirm Status Transition: [${targetStatus.toUpperCase()}]`}
        message={`Are you sure you want to transition ${currentCase.caseNumber} to ${targetStatus}? This will be recorded in the permanent audit ledger.`}
        confirmLabel="Confirm Transition"
        variant={targetStatus === 'closed' || targetStatus === 'archived' ? 'warning' : 'info'}
        isLoading={statusLoading}
      />

      {/* Archival Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isArchiveDialogOpen}
        onClose={() => setIsArchiveDialogOpen(false)}
        onConfirm={handleArchiveConfirm}
        title="Archive Forensic Docket"
        message={`Confirm soft-deletion and archival of ${currentCase.caseNumber}. The docket and all cryptographic evidence hashes will remain preserved in the ledger for historical verification.`}
        confirmLabel="Archive Docket"
        variant="warning"
        isLoading={archiveLoading}
      />
    </div>
  );
};
