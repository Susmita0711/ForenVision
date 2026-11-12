import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Scan, 
  Target,
  Link2, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  HardDrive,
  Download,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Plus,
  Cpu,
  Lock,
  MapPin,
  ArrowRight
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { StatusBadge } from '../components/common/StatusBadge';
import { ImageViewer } from '../components/common/ImageViewer';
import { Modal } from '../components/common/Modal';
import { 
  fetchEvidenceByIdApi, 
  verifyEvidenceIntegrityApi, 
  downloadEvidenceFileApi,
  fetchEvidencePreviewUrlApi,
  fetchEvidenceCustodyApi,
  fetchEvidenceAnalysesApi,
  associateEvidenceAnalysisApi,
  type AssociatedAnalysis,
  type VerificationResult
} from '../api/evidenceApi';
import { 
  recordCustodyEventApi,
  verifyCustodyChainApi,
  exportCustodyLedgerApi,
  type ChainVerificationResponse
} from '../api/custodyApi';
import type { EvidenceItem, ChainOfCustodyRecord } from '../types';

export const EvidenceDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [evidence, setEvidence] = useState<EvidenceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview object URL (blob-based with bearer auth)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // File integrity verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationOutput, setVerificationOutput] = useState<VerificationResult | null>(null);

  // Custody history & analyses
  const [custodyHistory, setCustodyHistory] = useState<ChainOfCustodyRecord[]>([]);
  const [analyses, setAnalyses] = useState<AssociatedAnalysis[]>([]);

  // Custody event modal & action state
  const [isCustodyModalOpen, setIsCustodyModalOpen] = useState(false);
  const [custodyAction, setCustodyAction] = useState('transferred');
  const [custodyReason, setCustodyReason] = useState('');
  const [custodyLocation, setCustodyLocation] = useState('');
  const [custodyRecipient, setCustodyRecipient] = useState('');
  const [custodyRecipientBadge, setCustodyRecipientBadge] = useState('');
  const [isCorrection, setIsCorrection] = useState(false);
  const [correctedEventId, setCorrectedEventId] = useState('');
  const [isSubmittingCustody, setIsSubmittingCustody] = useState(false);
  const [custodySubmitError, setCustodySubmitError] = useState<string | null>(null);

  // Custody chain verification state
  const [isVerifyingCustodyChain, setIsVerifyingCustodyChain] = useState(false);
  const [custodyChainVerification, setCustodyChainVerification] = useState<ChainVerificationResponse | null>(null);

  // Associate analysis modal
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisType, setAnalysisType] = useState('Error Level Analysis (ELA)');
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [analysisScore, setAnalysisScore] = useState(95);
  const [submittingAnalysis, setSubmittingAnalysis] = useState(false);

  // Load evidence data
  const loadEvidenceData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvidenceByIdApi(id);
      setEvidence(data);
      setCustodyLocation(data.storageLocation || 'Forensic Vault Station B');

      // Concurrently fetch custody & analyses
      fetchEvidenceCustodyApi(id)
        .then((blocks) => setCustodyHistory(blocks || []))
        .catch((err) => console.warn('Failed to load custody records:', err));

      fetchEvidenceAnalysesApi(id)
        .then((items) => setAnalyses(items || []))
        .catch((err) => console.warn('Failed to load analysis reports:', err));

      // Attempt to load preview blob if format is image or PDF
      const isPreviewable = 
        data.detectedMediaType?.startsWith('image/') ||
        data.fileFormat?.toLowerCase() === 'png' ||
        data.fileFormat?.toLowerCase() === 'jpg' ||
        data.fileFormat?.toLowerCase() === 'jpeg' ||
        data.fileFormat?.toLowerCase() === 'tiff' ||
        data.detectedMediaType === 'application/pdf';

      if (isPreviewable) {
        setLoadingPreview(true);
        fetchEvidencePreviewUrlApi(id)
          .then((blobUrl) => setPreviewBlobUrl(blobUrl))
          .catch((err) => console.warn('Preview blob load failed:', err))
          .finally(() => setLoadingPreview(false));
      }
    } catch (err: any) {
      console.error('Failed to load evidence metadata:', err);
      setError(
        err.response?.data?.message ||
        `Evidence record '${id}' could not be retrieved. Ensure you hold clearance to the associated docket.`
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEvidenceData();
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [loadEvidenceData]);

  // Handle on-demand cryptographic verification of file bytes
  const handleVerifyIntegrity = async () => {
    if (!evidence) return;
    setIsVerifying(true);
    setVerificationOutput(null);

    try {
      const result = await verifyEvidenceIntegrityApi(evidence.id);
      setVerificationOutput(result);
      setEvidence((prev) =>
        prev
          ? {
              ...prev,
              integrityStatus: result.integrityStatus,
              lastIntegrityCheck: result.lastIntegrityCheck,
            }
          : prev
      );
    } catch (err: any) {
      console.error('Verification failed:', err);
      alert(`Integrity audit failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle download
  const handleDownload = async () => {
    if (!evidence) return;
    try {
      await downloadEvidenceFileApi(evidence.id, evidence.originalFileName);
    } catch (err: any) {
      alert(`Download failed: ${err.response?.data?.message || 'Access restricted'}`);
    }
  };

  // Handle chain-of-custody event recording
  const handleRecordCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidence || !custodyReason.trim()) {
      setCustodySubmitError('Operational reason / justification is required.');
      return;
    }
    if (isCorrection && !correctedEventId.trim()) {
      setCustodySubmitError('Please specify the ID of the event being corrected.');
      return;
    }

    setIsSubmittingCustody(true);
    setCustodySubmitError(null);

    try {
      const res = await recordCustodyEventApi({
        evidenceId: evidence.id,
        eventType: isCorrection ? 'correction' : custodyAction,
        reason: custodyReason.trim(),
        location: custodyLocation.trim(),
        recipient: custodyRecipient.trim() || undefined,
        newCustodian: custodyRecipient.trim() ? {
          name: custodyRecipient.trim(),
          badge: custodyRecipientBadge.trim() || undefined,
        } : undefined,
        isCorrection,
        correctedEventId: isCorrection ? correctedEventId.trim() : undefined,
        correctionReason: isCorrection ? custodyReason.trim() : undefined,
      });

      setCustodyHistory([res.event, ...custodyHistory]);
      setIsCustodyModalOpen(false);
      setCustodyReason('');
      setCustodyRecipient('');
      setCustodyRecipientBadge('');
      setIsCorrection(false);
      setCorrectedEventId('');
    } catch (err: any) {
      console.error('Failed to log custody event:', err);
      setCustodySubmitError(err.response?.data?.message || err.message || 'Failed to record custody handover.');
    } finally {
      setIsSubmittingCustody(false);
    }
  };

  // Handle chain verification
  const handleVerifyChain = async () => {
    if (!evidence) return;
    setIsVerifyingCustodyChain(true);
    try {
      const res = await verifyCustodyChainApi(evidence.id);
      setCustodyChainVerification(res);
    } catch (err: any) {
      alert(`Chain verification failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsVerifyingCustodyChain(false);
    }
  };

  // Handle export custody ledger
  const handleExportCustody = async (format: 'csv' | 'json' = 'csv') => {
    if (!evidence) return;
    try {
      await exportCustodyLedgerApi(evidence.id, format, evidence.evidenceNumber);
    } catch (err: any) {
      alert(`Export failed: ${err.response?.data?.message || err.message}`);
    }
  };

  // Handle associate new analysis
  const handleAddAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidence || !analysisSummary.trim()) return;
    setSubmittingAnalysis(true);
    try {
      const newAnalysis = await associateEvidenceAnalysisApi(evidence.id, {
        analysisType,
        summary: analysisSummary.trim(),
        integrityScore: Number(analysisScore),
        details: {
          submittedVia: 'Evidence Management Web Inspector',
          timestamp: new Date().toISOString(),
        },
      });
      setAnalyses([newAnalysis, ...analyses]);
      setIsAnalysisModalOpen(false);
      setAnalysisSummary('');
    } catch (err: any) {
      alert(`Failed to associate analysis: ${err.response?.data?.message || err.message}`);
    } finally {
      setSubmittingAnalysis(false);
    }
  };

  const getAnalysisRoute = () => {
    if (!evidence) return '/analysis/image';
    switch (evidence.type) {
      case 'image':
        return `/analysis/image?evidenceId=${encodeURIComponent(evidence.id)}`;
      case 'fingerprint':
        return `/analysis/fingerprint?evidenceId=${encodeURIComponent(evidence.id)}`;
      case 'face':
        return `/analysis/face?evidenceId=${encodeURIComponent(evidence.id)}`;
      case 'sketch':
        return `/analysis/sketch?evidenceId=${encodeURIComponent(evidence.id)}`;
      default:
        return `/analysis/image?evidenceId=${encodeURIComponent(evidence.id)}`;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400 space-y-3">
        <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
        <p className="text-xs font-mono">Retrieving evidence record and checking cryptographic baseline...</p>
      </div>
    );
  }

  if (error || !evidence) {
    return (
      <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-8 text-center space-y-4 max-w-xl mx-auto mt-8">
        <AlertCircle className="h-10 w-10 text-rose-400 mx-auto" />
        <h3 className="text-base font-semibold text-rose-200">Evidence Record Inaccessible</h3>
        <p className="text-xs text-rose-300 leading-relaxed">{error || 'Record does not exist.'}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => navigate('/evidence')}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Back to Evidence Vault
          </button>
          <button
            onClick={loadEvidenceData}
            className="rounded-lg bg-rose-900/60 hover:bg-rose-900 px-4 py-2 text-xs font-semibold text-rose-100"
          >
            Retry Request
          </button>
        </div>
      </div>
    );
  }

  const isPdf = evidence.detectedMediaType === 'application/pdf' || evidence.fileFormat?.toLowerCase() === 'pdf';

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Evidence Vault', path: '/evidence' },
          { label: evidence.evidenceNumber },
        ]}
        title={evidence.name}
        badge={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
              {evidence.evidenceNumber}
            </span>
            <StatusBadge status={evidence.integrityStatus} />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              title="Download original immutable bytes"
            >
              <Download className="h-4 w-4 text-cyan-400" />
              <span>Download</span>
            </button>
            <button
              onClick={() => setIsCustodyModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              title="Log evidence handover or status change"
            >
              <Link2 className="h-4 w-4 text-cyan-400" />
              <span>Log Custody Handover</span>
            </button>
            <button
              onClick={() => navigate(getAnalysisRoute())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
            >
              <Scan className="h-4 w-4" />
              <span>Launch AI Diagnostic</span>
            </button>
            {(evidence.type === 'image' || evidence.detectedMediaType?.startsWith('image/') || evidence.name?.match(/\.(jpg|jpeg|png|tiff|bmp)$/i)) && (
              <button
                onClick={() => navigate(`/analysis/detection?evidenceId=${encodeURIComponent(evidence.id)}`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold transition-all active:scale-95 shadow-sm"
                title="Detect objects using YOLOv4-tiny"
              >
                <Target className="h-4 w-4 text-cyan-400" />
                <span>Detect Objects</span>
              </button>
            )}
            <button
              onClick={handleVerifyIntegrity}
              disabled={isVerifying}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>{isVerifying ? 'Auditing SHA-256...' : 'Audit SHA-256'}</span>
            </button>
          </div>
        }
      />

      {/* Verification Result Banner */}
      {verificationOutput && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 transition-all ${
            verificationOutput.verified
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
              : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
          }`}
        >
          {verificationOutput.verified ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {verificationOutput.verified ? 'Cryptographic File Integrity Confirmed' : 'Integrity Anomaly Identified'}
            </p>
            <p className="text-slate-300">{verificationOutput.message}</p>
            <div className="font-mono text-[10px] text-slate-400 space-y-0.5 pt-1">
              <p className="break-all select-all">Computed Digest: {verificationOutput.computedHash}</p>
              <p className="break-all select-all">Stored Registry Digest: {verificationOutput.storedHash}</p>
            </div>
          </div>
        </div>
      )}

      {/* Custody Chain Verification Banner */}
      {custodyChainVerification && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 transition-all ${
            custodyChainVerification.verified
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
              : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
          }`}
        >
          {custodyChainVerification.verified ? (
            <Lock className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {custodyChainVerification.verified ? 'Chain of Custody Provenance Verified' : 'Custody Chain Break Detected'}
              </p>
              <span className="font-mono text-[10px] text-slate-400">
                {custodyChainVerification.totalEvents} Total Blocks
              </span>
            </div>
            <p className="text-slate-300">{custodyChainVerification.message}</p>
            {custodyChainVerification.latestBlockHash && (
              <p className="font-mono text-[10px] text-cyan-400 pt-0.5 break-all select-all">
                Latest Block Hash: {custodyChainVerification.latestBlockHash}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Forensic Lightbox & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lightbox Canvas (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {loadingPreview ? (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-16 shadow-xl text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-400 mx-auto" />
              <p className="text-xs font-mono text-slate-400">Loading secure preview stream...</p>
            </div>
          ) : previewBlobUrl && !isPdf ? (
            <ImageViewer
              src={previewBlobUrl}
              title={`${evidence.evidenceNumber}: ${evidence.name}`}
              sha256={evidence.sha256Hash}
              metadata={{
                case_docket: evidence.caseNumber,
                file_format: evidence.fileFormat,
                file_size: `${(evidence.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
                intake_by: evidence.capturedBy || 'Authorized Examiner',
                storage_vault: evidence.storageLocation || 'Secure Vault NAS',
              }}
              regionsOfInterest={
                evidence.integrityStatus === 'tampered'
                  ? [
                      { x: -50, y: -20, width: 140, height: 60, confidence: 96, label: 'TAMPER DISCREPANCY' },
                    ]
                  : []
              }
            />
          ) : isPdf && previewBlobUrl ? (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-400" />
                  <span className="font-semibold text-white text-sm">PDF Forensic Document Preview</span>
                </div>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Document</span>
                </button>
              </div>
              <div className="h-96 w-full rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                <iframe
                  src={previewBlobUrl}
                  title="PDF Preview"
                  className="w-full h-full border-none"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-12 shadow-xl text-center space-y-3">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
                <HardDrive className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200">Non-Visual Binary Artifact</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                This artifact is stored securely as raw byte payload ({evidence.fileFormat}). Visual inline rendering is supported for standard image and PDF formats.
              </p>
              <button
                onClick={handleDownload}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-cyan-950/40"
              >
                <Download className="h-4 w-4" />
                <span>Download Binary File</span>
              </button>
            </div>
          )}

          {/* Notes & Analyst Observation */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-cyan-400" />
              <span>Examiner Field Notes</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {evidence.notes || 'Evidence received under standard protocol. Digital baseline calculated upon ingestion.'}
            </p>
          </div>

          {/* Associated AI Analysis Results */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <span>Associated AI Analysis Results ({analyses.length})</span>
              </h4>
              <button
                onClick={() => setIsAnalysisModalOpen(true)}
                className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white px-2.5 py-1 text-xs border border-slate-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Attach Analysis</span>
              </button>
            </div>

            {analyses.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                No automated analysis reports currently associated with this artifact.
              </p>
            ) : (
              <div className="space-y-3">
                {analyses.map((an) => (
                  <div
                    key={an.id}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{an.analysisType}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {an.timestamp ? an.timestamp.substring(0, 10) : 'Recent'}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{an.summary}</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-400">
                      <span>Examiner: {an.performedBy}</span>
                      {an.integrityScore !== undefined && (
                        <span className="text-cyan-400 font-bold">
                          Integrity Score: {an.integrityScore}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Technical Registry Info & Chronological Custody Timeline (1 col) */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Cryptographic Registry
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block font-mono">SHA-256 CHECKSUM</span>
                <p className="mt-1 font-mono text-[10px] text-cyan-300 bg-slate-950 p-2 rounded border border-slate-800 break-all select-all">
                  {evidence.sha256Hash}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Original Filename</span>
                <p className="font-mono text-slate-200 mt-0.5 truncate">{evidence.originalFileName}</p>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Case Docket</span>
                <Link
                  to={`/cases/${evidence.caseId || evidence.caseNumber}`}
                  className="font-mono text-cyan-400 hover:text-cyan-300 mt-0.5 flex items-center gap-1 group"
                >
                  <span>{evidence.caseNumber}</span>
                  <ExternalLink className="h-3 w-3 opacity-70 group-hover:opacity-100" />
                </Link>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Storage Vault Reference</span>
                <p className="font-mono text-[11px] text-slate-300 mt-0.5 flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{evidence.storageLocation || 'vault://secure-storage'}</span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>Intake Officer:</span>
                  <span className="text-slate-300">{evidence.capturedBy || 'Authorized Examiner'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Intake Timestamp:</span>
                  <span className="text-slate-300">
                    {evidence.capturedAt ? evidence.capturedAt.substring(0, 19).replace('T', ' ') : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Hash Audit:</span>
                  <span className="text-emerald-400">
                    {evidence.lastIntegrityCheck ? evidence.lastIntegrityCheck.substring(0, 10) : 'Recent'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chronological Custody Timeline Card */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Link2 className="h-4 w-4 text-cyan-400" />
                <span>Custody Ledger ({custodyHistory.length})</span>
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleVerifyChain}
                  disabled={isVerifyingCustodyChain || custodyHistory.length === 0}
                  className="rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 px-2 py-1 text-[10px] font-mono border border-slate-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Validate SHA-256 block hash chain"
                >
                  <Lock className={`h-3 w-3 ${isVerifyingCustodyChain ? 'animate-spin' : ''}`} />
                  <span>Verify</span>
                </button>
                <button
                  onClick={() => handleExportCustody('csv')}
                  disabled={custodyHistory.length === 0}
                  className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 text-[10px] font-mono border border-slate-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Download CSV report"
                >
                  <Download className="h-3 w-3 text-cyan-400" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Handover Action trigger */}
            <button
              onClick={() => setIsCustodyModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 py-2 text-xs font-semibold transition-all active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Log Custody Handover / Action</span>
            </button>

            {custodyHistory.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                No custody events recorded for this artifact yet.
              </p>
            ) : (
              <div className="space-y-4 pt-1">
                {custodyHistory.map((rec, idx) => (
                  <div
                    key={rec.id}
                    className="relative pl-5 border-l-2 border-slate-800 pb-3 last:pb-0 space-y-1.5"
                  >
                    {/* Circle Node */}
                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />

                    {/* Header: Action & Timestamp */}
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold text-xs px-2 py-0.5 rounded border ${
                        rec.isCorrection
                          ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                          : rec.action === 'Collected'
                          ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
                          : rec.action === 'Returned' || rec.action === 'Stored in Vault'
                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                          : 'bg-slate-900 text-slate-200 border-slate-700'
                      }`}>
                        {rec.action}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {rec.timestamp ? rec.timestamp.substring(0, 19).replace('T', ' ') : 'N/A'}
                      </span>
                    </div>

                    {/* Operational Details */}
                    <p className="text-slate-300 text-[11px] leading-relaxed">{rec.reason}</p>

                    {/* Custodian Transition */}
                    <div className="text-[10px] text-slate-400 font-mono space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Officer:</span>
                        <span className="text-slate-200">{rec.performedBy}</span>
                      </div>
                      {rec.recipient && (
                        <div className="flex items-center gap-1 text-cyan-400">
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span>Recipient: {rec.recipient}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-slate-400 pt-0.5">
                        <MapPin className="h-3 w-3 text-cyan-400 shrink-0" />
                        <span className="truncate">{rec.location}</span>
                      </div>
                    </div>

                    {/* Block Hash Verification */}
                    {rec.blockHash && (
                      <div className="pt-1 font-mono text-[9px] text-slate-500 flex items-center justify-between">
                        <span className="truncate max-w-[190px] select-all">
                          Block: {rec.blockHash.substring(0, 16)}...
                        </span>
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Seq #{rec.sequenceNumber || custodyHistory.length - idx}
                        </span>
                      </div>
                    )}

                    {/* Documented Correction Indicator */}
                    {rec.isCorrection && rec.correctedEventId && (
                      <div className="p-1.5 rounded bg-amber-950/30 border border-amber-800/40 text-[10px] text-amber-300">
                        Amends historical block: <span className="font-mono">{rec.correctedEventId}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Custody Handover Modal */}
      <Modal
        isOpen={isCustodyModalOpen}
        onClose={() => !isSubmittingCustody && setIsCustodyModalOpen(false)}
        title="Log Forensic Custody Event"
        subtitle={`Record verified handover or disposition for ${evidence.evidenceNumber}`}
        footer={
          <>
            <button
              type="button"
              disabled={isSubmittingCustody}
              onClick={() => setIsCustodyModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRecordCustody}
              disabled={isSubmittingCustody || !custodyReason.trim()}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmittingCustody ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Signing Ledger...</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Cryptographically Sign Handover</span>
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {custodySubmitError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{custodySubmitError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Custody Action Type *
            </label>
            <select
              value={custodyAction}
              onChange={(e) => {
                const val = e.target.value;
                setCustodyAction(val);
                setIsCorrection(val === 'correction');
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="transferred">Transferred to Custodian / Examiner</option>
              <option value="checked_out">Checked Out for Laboratory Diagnostics</option>
              <option value="returned">Returned to Evidence Vault</option>
              <option value="stored">Deposited into Cold Storage / Vault Locker</option>
              <option value="sealed">Sealed with Tamper-Evident Tape</option>
              <option value="accessed">Authorized Inspection / Visual Review</option>
              <option value="analysed">Analyzed with AI Model Diagnostic</option>
              <option value="correction">Documented Follow-up Correction</option>
            </select>
          </div>

          {/* Conditional Correction Field */}
          {isCorrection && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                Target Block Identifier (Event ID) *
              </label>
              <input
                type="text"
                value={correctedEventId}
                onChange={(e) => setCorrectedEventId(e.target.value)}
                placeholder="e.g. coc_8f9a21b34c0e"
                className="w-full rounded-lg border border-amber-800/80 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-amber-400/80 mt-1">
                Historic events are immutable. This correction will create a linked follow-up block.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Recipient / Receiving Custodian
              </label>
              <input
                type="text"
                value={custodyRecipient}
                onChange={(e) => setCustodyRecipient(e.target.value)}
                placeholder="e.g. Dr. Marcus Sterling"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Recipient Badge / Agency ID
              </label>
              <input
                type="text"
                value={custodyRecipientBadge}
                onChange={(e) => setCustodyRecipientBadge(e.target.value)}
                placeholder="e.g. FX-9104"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Transfer Physical / Virtual Location *
            </label>
            <input
              type="text"
              value={custodyLocation}
              onChange={(e) => setCustodyLocation(e.target.value)}
              placeholder="e.g. Forensic Optical Lab Station 4"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Operational Justification / Reason *
            </label>
            <textarea
              rows={2}
              value={custodyReason}
              onChange={(e) => setCustodyReason(e.target.value)}
              placeholder="e.g. Relocated to secure optical analysis chamber for ELA scan."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Associate Analysis Modal */}
      <Modal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        title="Associate AI Analysis Report"
        subtitle={`Attach diagnostic results to evidence ${evidence.evidenceNumber}`}
        footer={
          <>
            <button
              type="button"
              disabled={submittingAnalysis}
              onClick={() => setIsAnalysisModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddAnalysis}
              disabled={submittingAnalysis || !analysisSummary.trim()}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {submittingAnalysis ? 'Saving...' : 'Link Analysis Result'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Diagnostic Module
            </label>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="Error Level Analysis (ELA)">Error Level Analysis (ELA)</option>
              <option value="Facial Biometric Cross-Match">Facial Biometric Cross-Match</option>
              <option value="Fingerprint Minutiae Matching">Fingerprint Minutiae Matching</option>
              <option value="Forensic Sketch Synthesis">Forensic Sketch Synthesis</option>
              <option value="Metadata & EXIF Tamper Detection">Metadata & EXIF Tamper Detection</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Integrity Confidence Score (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={analysisScore}
              onChange={(e) => setAnalysisScore(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Findings Summary *
            </label>
            <textarea
              rows={3}
              value={analysisSummary}
              onChange={(e) => setAnalysisSummary(e.target.value)}
              placeholder="e.g. Compression artifact variance in high-contrast edge regions indicates local clone stamp manipulation."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
