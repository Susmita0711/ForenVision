import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ShieldCheck, 
  Printer, 
  Eye, 
  Lock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { DataTable, type Column } from '../components/common/DataTable';
import { SearchInput } from '../components/common/SearchInput';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { 
  fetchReportsApi, 
  generateReportApi, 
  downloadReportPdfApi, 
  getReportDetailsApi,
  type ForensicReportDocument 
} from '../api/reportsApi';
import { fetchCasesApi } from '../api/casesApi';
import { useAuth } from '../context/AuthContext';
import type { ForensicCase } from '../types';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const rawRole = (user?.role || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const canGenerateReport = role === 'admin' || role === 'investigator';

  const [reports, setReports] = useState<ForensicReportDocument[]>([]);
  const [cases, setCases] = useState<ForensicCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('ALL');

  // Modal States
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [classification, setClassification] = useState('OFFICIAL COURT EXHIBIT');
  const [investigatorNotes, setInvestigatorNotes] = useState('');

  // Dossier Preview Modal State
  const [previewReport, setPreviewReport] = useState<ForensicReportDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Notifications
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reportsData, casesResponse] = await Promise.all([
        fetchReportsApi(),
        fetchCasesApi({ limit: 100 }),
      ]);
      setReports(reportsData);
      const activeCases = casesResponse.cases || [];
      setCases(activeCases);
      if (activeCases.length > 0 && !selectedCaseId) {
        setSelectedCaseId(activeCases[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load reports and cases:', err);
      setFeedbackMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to connect to forensic reporting service.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) {
      setFeedbackMessage({ type: 'error', text: 'Please select an authorized case docket.' });
      return;
    }

    setGenerating(true);
    setFeedbackMessage(null);
    try {
      const generated = await generateReportApi({
        caseId: selectedCaseId,
        title: reportTitle.trim() || undefined,
        classification,
        investigatorNotes: investigatorNotes.trim() || undefined,
      });

      setReports((prev) => [generated, ...prev]);
      setIsGenerateOpen(false);
      setReportTitle('');
      setInvestigatorNotes('');
      setFeedbackMessage({
        type: 'success',
        text: `Dossier ${generated.reportNumber} compiled and sealed with SHA-256 digest.`,
      });
      // Automatically open the printable view of the freshly generated report
      setPreviewReport(generated);
      setIsPreviewOpen(true);
    } catch (err: any) {
      console.error('Report generation error:', err);
      setFeedbackMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Report generation failed. Please check permissions.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (report: ForensicReportDocument) => {
    setDownloadingId(report.reportId || report.id);
    try {
      await downloadReportPdfApi(report.reportId || report.id, report.pdf?.filename);
      setFeedbackMessage({
        type: 'success',
        text: `Exported court-admissible PDF for ${report.reportNumber}. Digital integrity verified.`,
      });
      setTimeout(() => setFeedbackMessage(null), 5000);
    } catch (err: any) {
      console.error('PDF download error:', err);
      setFeedbackMessage({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to download report PDF. Access may be restricted.',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = async (report: ForensicReportDocument) => {
    setLoadingPreview(true);
    setIsPreviewOpen(true);
    try {
      const fullDoc = await getReportDetailsApi(report.reportId || report.id);
      setPreviewReport(fullDoc);
    } catch (err: any) {
      console.error('Failed to load full report details:', err);
      // Fallback to existing record
      setPreviewReport(report);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredReports = reports.filter((r) => {
    const term = searchQuery.toLowerCase();
    const matchesSearch =
      (r.reportNumber || '').toLowerCase().includes(term) ||
      (r.title || '').toLowerCase().includes(term) ||
      (r.caseNumber || '').toLowerCase().includes(term) ||
      (r.author?.name || '').toLowerCase().includes(term) ||
      (r.digitalDigest?.sha256_pdf || r.pdf?.sha256 || '').toLowerCase().includes(term);

    const matchesClass =
      classificationFilter === 'ALL' || r.classification === classificationFilter;

    return matchesSearch && matchesClass;
  });

  const columns: Column<ForensicReportDocument>[] = [
    {
      key: 'reportNumber',
      header: 'Report Docket',
      sortable: true,
      width: '150px',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-bold text-cyan-400">
            {item.reportNumber || item.id}
          </span>
          <div className="text-[10px] text-slate-500 font-mono">
            {item.reportVersion || item.version || 'v1.0'}
          </div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Report Title & Case',
      sortable: true,
      render: (item) => (
        <div className="max-w-md">
          <p 
            onClick={() => handleOpenPreview(item)}
            className="font-semibold text-slate-100 hover:text-cyan-400 cursor-pointer transition-colors truncate"
          >
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono text-cyan-300">Case: {item.caseNumber}</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-[10px] text-slate-400">{item.evidenceCount ?? item.evidenceInventory?.length ?? 0} exhibits</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-[10px] text-slate-400">{item.custodyEventsCount ?? item.chainOfCustody?.length ?? 0} custody events</span>
          </div>
        </div>
      ),
    },
    {
      key: 'classification',
      header: 'Classification Level',
      sortable: true,
      render: (item) => {
        const cls = item.classification || 'OFFICIAL COURT EXHIBIT';
        const isCourt = cls.includes('COURT');
        const isRestricted = cls.includes('RESTRICTED');
        return (
          <span
            className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${
              isCourt
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : isRestricted
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {cls}
          </span>
        );
      },
    },
    {
      key: 'author',
      header: 'Certifying Examiner',
      sortable: true,
      render: (item) => (
        <div>
          <p className="text-slate-200 text-xs font-medium">{item.author?.name || 'Authorized Investigator'}</p>
          <p className="text-[10px] text-slate-400 font-mono">
            {item.author?.role?.toUpperCase() || 'INVESTIGATOR'} &bull; Badge: {item.author?.badge || 'N/A'}
          </p>
        </div>
      ),
    },
    {
      key: 'digitalDigest',
      header: 'Integrity Digest',
      render: (item) => {
        const hash = item.digitalDigest?.sha256_pdf || item.pdf?.sha256;
        const sizeBytes = item.pdf?.fileSizeBytes || 0;
        return (
          <div className="font-mono text-[10px]">
            <div className="flex items-center gap-1 text-slate-400" title={hash}>
              <ShieldCheck className="h-3 w-3 text-emerald-400 flex-shrink-0" />
              <span>{hash ? `${hash.substring(0, 10)}...` : 'UNVERIFIED'}</span>
            </div>
            <div className="text-slate-500 mt-0.5">
              {sizeBytes > 0 ? `${(sizeBytes / 1024).toFixed(1)} KB (PDF)` : 'Pending'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => <StatusBadge status={item.status || 'finalized'} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPreview(item);
            }}
            className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 text-xs text-slate-200 transition-colors"
            title="Open Printable View"
          >
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span>View</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(item);
            }}
            disabled={downloadingId === (item.reportId || item.id)}
            className="inline-flex items-center gap-1 rounded bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/60 px-2.5 py-1 text-xs text-cyan-300 transition-colors disabled:opacity-50"
            title="Download Sealed PDF Exhibit"
          >
            {downloadingId === (item.reportId || item.id) ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>PDF</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Reports' }]}
        title="Forensic Reports & Admissibility Dossiers"
        description="Formal, cryptographically sealed case exhibits prepared for prosecution, judicial review, and independent forensic audits."
        badge={
          <span className="rounded bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            <span>REPORTLAB ENGINE ACTIVE</span>
          </span>
        }
        actions={
          canGenerateReport ? (
            <button
              onClick={() => setIsGenerateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Generate New Report</span>
            </button>
          ) : undefined
        }
      />

      {feedbackMessage && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Forensic Reporting Rules Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-[#0F172A] border border-slate-800 text-xs flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 mt-0.5">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Perspective Separation</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Strictly delineates Section A (Empirical Facts), Section B (Algorithmic Diagnostics), and Section C (Human Interpretation).
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#0F172A] border border-slate-800 text-xs flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 mt-0.5">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Selective Module Inclusion</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Face, fingerprint, and sketch sections appear ONLY when verified actual results exist on docket. Zero artificial findings.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#0F172A] border border-slate-800 text-xs flex items-start gap-2.5">
          <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-0.5">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Cryptographic Sealing</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              PDFs are generated with ReportLab, hashed with SHA-256, and stored with non-executable 0640 vault permissions.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by Report ID, case docket, title, or certifying examiner..."
            className="w-full sm:w-80"
          />

          <select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="ALL">All Classifications</option>
            <option value="OFFICIAL COURT EXHIBIT">Court Exhibits</option>
            <option value="CONFIDENTIAL">Confidential</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <button
            onClick={loadData}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Report Repository"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <span>
            Total Exhibits: <strong className="text-cyan-400 font-bold">{filteredReports.length}</strong>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-[#0F172A] rounded-xl border border-slate-800">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-400 font-mono">Querying authorized forensic reports repository...</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredReports}
          keyExtractor={(item) => item.reportId || item.id}
          pageSize={10}
        />
      )}

      {/* Generate Report Modal */}
      <Modal
        isOpen={isGenerateOpen}
        onClose={() => !generating && setIsGenerateOpen(false)}
        title="Generate Court-Admissible Forensic Dossier"
        subtitle="Compile evidence inventory, cryptographic hashes, ELA scans, and chain of custody logs into a certified document"
        size="lg"
        footer={
          <>
            <button
              type="button"
              disabled={generating}
              onClick={() => setIsGenerateOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="generate-report-form"
              disabled={generating || !selectedCaseId}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50"
            >
              {generating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{generating ? 'Compiling & Signing Dossier...' : 'Compile & Sign Dossier'}</span>
            </button>
          </>
        }
      >
        <form id="generate-report-form" onSubmit={handleGenerateReport} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Associated Case Docket *
            </label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="" disabled>Select an authorized case docket...</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} &mdash; {c.title} ({c.status.toUpperCase()})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">
              Only cases assigned to your investigator badge or agency clearance level are listed.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Dossier Title
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="e.g. Formal Cryptographic Audit & Multi-Module Forensic Exhibit Dossier"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Evidentiary Classification
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="OFFICIAL COURT EXHIBIT">OFFICIAL COURT EXHIBIT (State / Federal Admissible)</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL (Law Enforcement Only)</option>
              <option value="RESTRICTED">RESTRICTED (Security Clearance Level 3+ Required)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Investigator Review Notes & Qualitative Synthesis
            </label>
            <textarea
              rows={3}
              value={investigatorNotes}
              onChange={(e) => setInvestigatorNotes(e.target.value)}
              placeholder="Enter examiner synthesis, cross-referenced exhibit notes, or ACE-V qualitative observations to be recorded in Section C..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Forensic Integrity Guarantee</span>
            </div>
            <p>
              The engine will pull real immutable records from MongoDB and the secure vault. Missing metadata or gaps will be transparently audited in the report's limitation block. No findings are fabricated.
            </p>
          </div>
        </form>
      </Modal>

      {/* Printable Report View Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Printable Forensic Examination Dossier"
        subtitle={previewReport ? `${previewReport.reportNumber} &bull; Case ${previewReport.caseNumber}` : 'Loading...'}
        size="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Digital Digest: {previewReport?.digitalDigest?.sha256_pdf?.substring(0, 16)}...</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors"
              >
                <Printer className="h-3.5 w-3.5 text-cyan-400" />
                <span>Print Dossier</span>
              </button>

              {previewReport && (
                <button
                  type="button"
                  onClick={() => handleDownload(previewReport)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF Dossier</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {loadingPreview ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-2">
            <LoadingSpinner size="lg" />
            <p className="text-xs font-mono text-slate-400">Rendering high-resolution forensic dossier preview...</p>
          </div>
        ) : previewReport ? (
          <div className="space-y-6 text-slate-200 printable-dossier-content max-h-[70vh] overflow-y-auto pr-2">
            {/* Classification & Agency Header */}
            <div className="text-center pb-4 border-b border-slate-800">
              <div className="inline-block px-3 py-0.5 rounded font-mono text-xs font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-2">
                {previewReport.classification || 'OFFICIAL COURT EXHIBIT'}
              </div>
              <h1 className="text-base font-bold text-white tracking-wide">
                FORENVISION AI FORENSIC LABORATORY
              </h1>
              <p className="text-xs text-slate-400">
                DIVISION OF DIGITAL FORENSICS & BIOMETRIC IDENTIFICATION
              </p>
              <div className="mt-2 text-xs font-mono text-cyan-400 font-semibold">
                Dossier Identifier: {previewReport.reportNumber} &bull; {previewReport.version || 'v1.0'}
              </div>
            </div>

            {/* Case & Examiner Metadata Table */}
            <div className="bg-[#0B0F19] rounded-lg border border-slate-800 p-3.5 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Case Docket #</span>
                  <span className="font-mono font-bold text-cyan-300">{previewReport.caseNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Investigation Status</span>
                  <span className="font-semibold text-slate-200">{previewReport.caseMetadata?.status || 'ACTIVE'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Certifying Examiner</span>
                  <span className="font-semibold text-slate-200">{previewReport.author?.name || 'Authorized Investigator'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Sealing Timestamp</span>
                  <span className="font-mono text-slate-300">{previewReport.createdAt?.substring(0, 19).replace('T', ' ')} UTC</span>
                </div>
              </div>

              {previewReport.title && (
                <div className="mt-3 pt-2.5 border-t border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Formal Dossier Title</span>
                  <span className="text-slate-200 font-medium">{previewReport.title}</span>
                </div>
              )}
            </div>

            {/* SECTION A: OBSERVATIONS */}
            <div className="space-y-3">
              <div className="border-b border-slate-800 pb-1 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  SECTION A: Objective Physical & Digital Observations
                </h2>
                <span className="text-[10px] font-mono text-slate-500">
                  {previewReport.evidenceInventory?.length || 0} Evidence Items
                </span>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Empirical physical inventory and verifiable cryptographic hash digests recorded upon ingestion into evidence vault.
              </p>

              {/* Evidence Inventory */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-800 rounded">
                  <thead className="bg-slate-900 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-1.5 px-2.5">Evidence #</th>
                      <th className="py-1.5 px-2.5">Filename</th>
                      <th className="py-1.5 px-2.5">Type</th>
                      <th className="py-1.5 px-2.5">Size</th>
                      <th className="py-1.5 px-2.5">SHA-256 Digest (Original Bytes)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {previewReport.evidenceInventory && previewReport.evidenceInventory.length > 0 ? (
                      previewReport.evidenceInventory.map((ev, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-1.5 px-2.5 font-bold text-cyan-300">{ev.evidenceNumber}</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-200">{ev.filename}</td>
                          <td className="py-1.5 px-2.5 uppercase text-slate-400">{ev.type}</td>
                          <td className="py-1.5 px-2.5 text-slate-400">{(ev.fileSizeBytes / 1024).toFixed(1)} KB</td>
                          <td className="py-1.5 px-2.5 text-[10px] text-slate-300 break-all">{ev.sha256}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-3 text-center text-slate-500 italic">
                          No evidence items currently attached to this case docket.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Chain of Custody */}
              <div className="mt-3">
                <h3 className="text-[11px] font-bold text-slate-300 mb-1.5">Chain-of-Custody Transaction Audit</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-800 rounded">
                    <thead className="bg-slate-900 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1 px-2.5">Event ID</th>
                        <th className="py-1 px-2.5">Evidence #</th>
                        <th className="py-1 px-2.5">Type</th>
                        <th className="py-1 px-2.5">Acting Officer</th>
                        <th className="py-1 px-2.5">Timestamp (UTC)</th>
                        <th className="py-1 px-2.5">Custody Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-[11px]">
                      {previewReport.chainOfCustody && previewReport.chainOfCustody.length > 0 ? (
                        previewReport.chainOfCustody.slice(0, 10).map((c, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-1 px-2.5 font-mono text-[10px] text-slate-400">{c.eventId}</td>
                            <td className="py-1 px-2.5 font-mono text-cyan-300">{c.evidenceNumber}</td>
                            <td className="py-1 px-2.5 font-semibold text-slate-300 uppercase">{c.eventType}</td>
                            <td className="py-1 px-2.5 text-slate-200">{c.actingUser}</td>
                            <td className="py-1 px-2.5 font-mono text-[10px] text-slate-400">
                              {c.timestamp?.substring(0, 19).replace('T', ' ')}
                            </td>
                            <td className="py-1 px-2.5 text-slate-300">{c.notes}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-2.5 text-center text-slate-500 italic">
                            No chain-of-custody transactions recorded on this docket.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* SECTION B: AUTOMATED DIAGNOSTICS */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-slate-800 pb-1 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  SECTION B: Automated Algorithmic Diagnostic Results
                </h2>
                <span className="text-[10px] font-mono text-amber-400/90">
                  AI Model Outputs (Non-Autonomous Proof)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Mathematical pattern correspondence extracted via ForenVision AI neural networks and computer vision pipelines.
              </p>

              {/* 1. Image Forensics */}
              {previewReport.analyses?.imageForensics && previewReport.analyses.imageForensics.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                  <p className="font-bold text-slate-200">1. Image Integrity & Error Level Analysis (ELA)</p>
                  {previewReport.analyses.imageForensics.map((item: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300 space-y-0.5 border-l-2 border-cyan-500 pl-2">
                      <p>
                        <strong>Analysis ID:</strong> {item.analysisId || item.id} &bull; 
                        <strong> Engine:</strong> {item.methodology?.engine || 'OpenCV ELA Engine'} &bull; 
                        <strong> Target Evidence:</strong> {item.evidenceId}
                      </p>
                      <p className="text-slate-400">
                        EXIF tags extracted: {Object.keys(item.exifMetadata || {}).length} &bull; 
                        Recompression Quality: {item.parameters?.recompressionQuality || 90}%
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. Object Detection */}
              {previewReport.analyses?.objectDetection && previewReport.analyses.objectDetection.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                  <p className="font-bold text-slate-200">2. AI Object Detection & Scene Inventory</p>
                  {previewReport.analyses.objectDetection.map((item: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300 space-y-0.5 border-l-2 border-blue-500 pl-2">
                      <p>
                        <strong>Model:</strong> {item.modelMetadata?.model || item.model || 'YOLOv8'} &bull; 
                        <strong> Detections:</strong> {item.detectionsCount || item.detections?.length || 0} objects &bull; 
                        <strong> Threshold:</strong> {item.parameters?.confidenceThreshold || item.confidenceThreshold || 0.25}
                      </p>
                      <p className="text-slate-400">
                        Identified Classes: {Array.from(new Set((item.detections || []).map((d: any) => d.class))).join(', ') || 'None'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Fingerprint (Selective) */}
              {previewReport.analyses?.fingerprintComparison && previewReport.analyses.fingerprintComparison.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                  <p className="font-bold text-slate-200">3. Latent Fingerprint Feature Alignment (SIFT-RANSAC)</p>
                  {previewReport.analyses.fingerprintComparison.map((item: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300 space-y-0.5 border-l-2 border-emerald-500 pl-2">
                      <p>
                        <strong>Method:</strong> {item.method || 'SIFT-RANSAC'} &bull; 
                        <strong> Score:</strong> {item.score || item.comparisonMetrics?.score || 'N/A'} &bull; 
                        <strong> Inliers:</strong> {item.inliers || item.comparisonMetrics?.inlierCount || 'N/A'}
                      </p>
                      <p className="text-slate-400 italic">
                        Decision: {item.matchDecision || item.comparisonMetrics?.correspondenceTier || 'Probative Similarity'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Face Analysis (Selective) */}
              {previewReport.analyses?.faceAnalyses && previewReport.analyses.faceAnalyses.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                  <p className="font-bold text-slate-200">4. Controlled Facial Analysis & 1:1 Metric Verification</p>
                  {previewReport.analyses.faceAnalyses.map((item: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300 space-y-0.5 border-l-2 border-violet-500 pl-2">
                      <p>
                        <strong>Model:</strong> {item.modelMetadata?.detector || item.model || 'InceptionResnetV1'} &bull; 
                        <strong> Cosine Sim:</strong> {item.metrics?.cosineSimilarity || item.cosineSimilarity || 'N/A'} &bull; 
                        <strong> L2 Dist:</strong> {item.metrics?.l2Distance || item.euclideanDistance || 'N/A'}
                      </p>
                      <p className="text-amber-300/90 text-[10px]">
                        Warning: {item.uncertaintyWarning || 'Mathematical vector correspondence only. Not autonomous legal proof.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 5. Witness Sketch Review (Selective) */}
              {previewReport.analyses?.sketchSessions && previewReport.analyses.sketchSessions.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                  <p className="font-bold text-slate-200">5. Witness Composite Sketch Morphological Review</p>
                  {previewReport.analyses.sketchSessions.map((item: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-300 space-y-0.5 border-l-2 border-amber-500 pl-2">
                      <p>
                        <strong>Session ID:</strong> {item.sessionId || item.id} &bull; 
                        <strong> Observations:</strong> {item.annotationsCount || item.annotations?.length || 0} pinned landmarks &bull; 
                        <strong> Status:</strong> {typeof item.methodology === 'object' ? item.methodology?.matchingModel : item.methodology || 'Qualitative Review'}
                      </p>
                      <p className="text-slate-400">
                        Examiner Notes: {item.examinerNotes || item.notes || 'Examined under SOP.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* If no analyses present */}
              {(!previewReport.analyses || Object.values(previewReport.analyses).every((arr: any) => !arr || arr.length === 0)) && (
                <div className="p-3 rounded bg-slate-900/40 text-center text-xs text-slate-500 italic">
                  Zero automated analytical examinations executed for this case docket.
                </div>
              )}
            </div>

            {/* SECTION C: INVESTIGATOR INTERPRETATIONS */}
            <div className="space-y-2 pt-2">
              <div className="border-b border-slate-800 pb-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  SECTION C: Investigator Interpretations & Qualitative Review
                </h2>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-2">
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {previewReport.investigatorReviewNotes || 'Examiner review conducted under standard operating procedures. No supplemental notes entered.'}
                </p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Methodology: ACE-V (Analysis, Comparison, Evaluation, Verification)</span>
                  <span>Examiner Clearance: {previewReport.author?.name} ({previewReport.author?.badge || 'BADGE-VERIFIED'})</span>
                </div>
              </div>
            </div>

            {/* LIMITATIONS & DATA GAPS */}
            <div className="space-y-2 pt-2">
              <div className="border-b border-slate-800 pb-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Examination Limitations, Incomplete Data & Legal Disclaimers
                </h2>
              </div>
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 space-y-2">
                {previewReport.limitationsAndIncompleteData && previewReport.limitationsAndIncompleteData.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    {previewReport.limitationsAndIncompleteData.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] italic">No extraordinary data integrity gaps noted during examination ingestion.</p>
                )}

                <p className="text-[10px] text-slate-400 pt-1 border-t border-amber-800/30 leading-normal">
                  {previewReport.forensicNotice}
                </p>
              </div>
            </div>

            {/* DIGITAL INTEGRITY SEAL */}
            <div className="p-3 rounded-lg bg-[#0F172A] border border-cyan-800/40 font-mono text-[10px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold uppercase">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Forensic Digital Seal & Cryptographic Audit Digest</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-slate-500 block">Metadata Digest (SHA-256):</span>
                  <span className="text-slate-300 break-all">{previewReport.digitalDigest?.sha256_metadata || 'CALCULATING...'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PDF Exhibit Digest (SHA-256):</span>
                  <span className="text-emerald-400 break-all">{previewReport.digitalDigest?.sha256_pdf || previewReport.pdf?.sha256}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
