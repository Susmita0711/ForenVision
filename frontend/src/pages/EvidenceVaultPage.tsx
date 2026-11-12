import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Database, 
  Upload, 
  Grid, 
  List, 
  Hash, 
  Download, 
  AlertCircle, 
  RefreshCw, 
  FileText,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { SearchInput } from '../components/common/SearchInput';
import { FilterBar, type FilterOption } from '../components/common/FilterBar';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, type Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { FileUpload } from '../components/common/FileUpload';
import { 
  fetchEvidenceApi, 
  uploadEvidenceApi, 
  downloadEvidenceFileApi 
} from '../api/evidenceApi';
import { fetchCasesApi } from '../api/casesApi';
import { useAuth } from '../context/AuthContext';
import type { EvidenceItem, EvidenceType, ForensicCase } from '../types';

export const EvidenceVaultPage: React.FC = () => {
  const { user } = useAuth();
  const rawRole = (user?.role || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const canUpload = role === 'admin' || role === 'investigator';
  const canDownload = role === 'admin' || role === 'investigator' || role === 'analyst';

  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [integrityFilter, setIntegrityFilter] = useState('ALL');

  // Intake modal state
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [availableCases, setAvailableCases] = useState<ForensicCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<EvidenceType>('image');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedHash, setUploadedHash] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // Load evidence list
  const loadEvidence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEvidenceApi({
        type: typeFilter,
        integrity: integrityFilter,
        q: searchQuery,
      });
      setEvidenceList(res.evidence || []);
    } catch (err: any) {
      console.error('Failed to load evidence vault records:', err);
      setError(
        err.response?.data?.message ||
        'Unable to retrieve evidence records from secure vault. Check network and clearance.'
      );
    } finally {
      setLoading(false);
    }
  }, [typeFilter, integrityFilter, searchQuery]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  // Load authorized cases for intake modal
  const loadCases = async () => {
    setLoadingCases(true);
    try {
      const res = await fetchCasesApi({ limit: 100 });
      setAvailableCases(res.cases || []);
      if (res.cases && res.cases.length > 0 && !selectedCaseId) {
        setSelectedCaseId(res.cases[0].id || res.cases[0].caseNumber);
      }
    } catch (err) {
      console.error('Failed to load cases for intake modal:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const handleOpenIntake = () => {
    setIsIntakeOpen(true);
    setUploadError(null);
    setUploadProgress(null);
    setUploadedFile(null);
    setUploadedHash('');
    setNewItemName('');
    setIntakeNotes('');
    loadCases();
  };

  const filters: FilterOption[] = [
    {
      id: 'type',
      label: 'Evidence Modality',
      currentValue: typeFilter,
      options: [
        { label: 'All Modalities', value: 'ALL' },
        { label: 'Image', value: 'image' },
        { label: 'Fingerprint', value: 'fingerprint' },
        { label: 'Face', value: 'face' },
        { label: 'Sketch', value: 'sketch' },
        { label: 'Document', value: 'document' },
        { label: 'Digital Artifact', value: 'digital_artifact' },
      ],
    },
    {
      id: 'integrity',
      label: 'Integrity Audit',
      currentValue: integrityFilter,
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Verified (SHA-256)', value: 'verified' },
        { label: 'Tampered / Divergence', value: 'tampered' },
        { label: 'Unverified', value: 'unverified' },
      ],
    },
  ];

  const handleFilterChange = (filterId: string, value: string) => {
    if (filterId === 'type') setTypeFilter(value);
    if (filterId === 'integrity') setIntegrityFilter(value);
  };

  const handleResetFilters = () => {
    setTypeFilter('ALL');
    setIntegrityFilter('ALL');
    setSearchQuery('');
  };

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile || !uploadedHash) {
      setUploadError('Please select or drop an evidence file.');
      return;
    }
    if (!selectedCaseId) {
      setUploadError('Please select an authorized case docket.');
      return;
    }

    setIsSubmitting(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      await uploadEvidenceApi(
        {
          file: uploadedFile,
          caseIdOrNumber: selectedCaseId,
          name: newItemName.trim() || uploadedFile.name,
          type: newItemType,
          notes: intakeNotes.trim() || undefined,
        },
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setIsIntakeOpen(false);
      setUploadedFile(null);
      setUploadedHash('');
      setUploadProgress(null);
      await loadEvidence();
    } catch (err: any) {
      console.error('Evidence intake failed:', err);
      const serverMsg = err.response?.data?.message || err.message || 'Evidence ingestion failed.';
      setUploadError(serverMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent, item: EvidenceItem) => {
    e.stopPropagation();
    try {
      await downloadEvidenceFileApi(item.id, item.originalFileName);
    } catch (err: any) {
      alert(`Download failed: ${err.response?.data?.message || 'Access restricted'}`);
    }
  };

  const tableColumns: Column<EvidenceItem>[] = [
    {
      key: 'evidenceNumber',
      header: 'Evidence ID',
      sortable: true,
      width: '130px',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-cyan-400">{item.evidenceNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Artifact Name & Format',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-semibold text-slate-100 truncate">{item.name}</p>
          <p className="text-[10px] font-mono text-slate-400">
            {item.fileFormat || 'BIN'} &bull; {(item.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      ),
    },
    {
      key: 'caseNumber',
      header: 'Case Docket',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs text-slate-300">{item.caseNumber}</span>
      ),
    },
    {
      key: 'sha256Hash',
      header: 'SHA-256 Digest',
      render: (item) => (
        <span className="font-mono text-[10px] text-cyan-300 truncate max-w-[200px] block select-all">
          {item.sha256Hash ? `${item.sha256Hash.substring(0, 24)}...` : 'N/A'}
        </span>
      ),
    },
    {
      key: 'integrityStatus',
      header: 'Integrity Audit',
      sortable: true,
      render: (item) => <StatusBadge status={item.integrityStatus} size="sm" />,
    },
    {
      key: 'capturedAt',
      header: 'Intake Date',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-[10px] text-slate-400">
          {item.capturedAt ? item.capturedAt.substring(0, 10) : 'N/A'}
        </span>
      ),
    },
    {
      key: 'id',
      header: 'Actions',
      width: '90px',
      render: (item) => (
        canDownload ? (
          <button
            onClick={(e) => handleDownload(e, item)}
            className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 text-[11px] border border-slate-700 transition-colors"
            title="Download original bytes"
          >
            <Download className="h-3 w-3 text-cyan-400" />
            <span>Save</span>
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-mono"
            title="Raw byte download restricted for Viewer clearance"
          >
            <Lock className="h-3 w-3" />
            <span>Locked</span>
          </span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Evidence Vault' }]}
        title="Forensic Evidence Vault"
        description="Air-gapped and cryptographically registered digital and physical evidence assets with SHA-256 baselines."
        badge={
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Zero-Trust Vault
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadEvidence}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
              title="Refresh vault contents"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {canUpload && (
              <button
                onClick={handleOpenIntake}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
              >
                <Upload className="h-4 w-4" />
                <span>Intake New Artifact</span>
              </button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by Evidence ID, case number, or SHA-256 digest..."
          className="w-full sm:w-80"
        />

        <div className="flex items-center gap-3">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetAll={handleResetFilters}
            activeCount={(typeFilter !== 'ALL' ? 1 : 0) + (integrityFilter !== 'ALL' ? 1 : 0)}
          />

          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700/80 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
              title="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadEvidence}
            className="rounded bg-rose-900/60 hover:bg-rose-900 px-3 py-1 font-semibold text-rose-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-xs font-mono">Authenticating vault access & reading evidence registry...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && evidenceList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#0F172A] p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-500 border border-slate-800 mb-4">
            <Database className="h-7 w-7 text-cyan-500/50" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">No Evidence Discovered</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            No evidence records match your current filter criteria or have been attached to accessible cases.
          </p>
          {canUpload && (
            <button
              onClick={handleOpenIntake}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all"
            >
              <Upload className="h-4 w-4" />
              <span>Intake First Evidence Item</span>
            </button>
          )}
        </div>
      )}

      {/* Evidence Content (Table or Grid) */}
      {!loading && !error && evidenceList.length > 0 && (
        viewMode === 'table' ? (
          <DataTable
            columns={tableColumns}
            data={evidenceList}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => navigate(`/evidence/${item.id}`)}
            pageSize={10}
            emptyTitle="No Evidence Discovered"
            emptyDescription="No vault records match your current filter parameters."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {evidenceList.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(`/evidence/${item.id}`)}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A] shadow-xl hover:border-slate-700 hover:shadow-cyan-950/20 transition-all cursor-pointer flex flex-col"
              >
                {/* Thumbnail / Header Container */}
                <div className="relative h-44 w-full bg-slate-950 overflow-hidden flex items-center justify-center">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : item.type === 'image' ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-2 p-4">
                      <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
                        <Database className="h-6 w-6" />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">Secure Image Vault</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-2 p-4">
                      <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
                        <FileText className="h-6 w-6" />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase">{item.fileFormat || item.type}</span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3">
                    <span className="font-mono text-xs font-bold text-white bg-slate-900/90 backdrop-blur px-2.5 py-1 rounded-md border border-slate-700 shadow">
                      {item.evidenceNumber}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={item.integrityStatus} size="sm" />
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Case: <span className="text-cyan-400">{item.caseNumber}</span>
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <Hash className="h-3 w-3 text-cyan-400 shrink-0" />
                      <span className="truncate select-all">{item.sha256Hash}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                      <span>{item.fileFormat} &bull; {(item.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                      {canDownload ? (
                        <button
                          onClick={(e) => handleDownload(e, item)}
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 p-1"
                          title="Download raw file"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-slate-600 p-1"
                          title="Raw byte download restricted for Viewer clearance"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Intake Evidence Modal */}
      <Modal
        isOpen={isIntakeOpen}
        onClose={() => !isSubmitting && setIsIntakeOpen(false)}
        title="Evidence Intake & Cryptographic Registration"
        subtitle="Secure multipart ingestion with SHA-256 calculation and private vault isolation"
        size="lg"
        footer={
          <>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsIntakeOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleIntakeSubmit}
              disabled={!uploadedFile || !uploadedHash || isSubmitting || !selectedCaseId}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Ingesting into Vault...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Deposit into Vault</span>
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {uploadError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Artifact Label *
              </label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="e.g. Forged Wire Receipt Scan"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Assign to Case Docket *
              </label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                disabled={loadingCases}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                {loadingCases ? (
                  <option value="">Loading accessible dockets...</option>
                ) : availableCases.length === 0 ? (
                  <option value="">No authorized cases found</option>
                ) : (
                  availableCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber} - {c.title.substring(0, 32)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Evidence Modality
              </label>
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value as EvidenceType)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="image">Image (Photograph / High-Res Scan)</option>
                <option value="fingerprint">Fingerprint Lift (1000 DPI)</option>
                <option value="face">Facial Frame / CCTV Still</option>
                <option value="sketch">Artist Composite Drawing</option>
                <option value="document">Document (PDF / Scanned Form)</option>
                <option value="digital_artifact">Raw Digital Storage Artifact</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Examiner Intake Notes
              </label>
              <input
                type="text"
                value={intakeNotes}
                onChange={(e) => setIntakeNotes(e.target.value)}
                placeholder="Scene location, custody transfer notes, etc."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <FileUpload
            accept="image/jpeg,image/png,image/tiff,.tiff,.tif,application/pdf"
            helperText="Supported formats: JPEG, PNG, TIFF, PDF. Max size 25MB. SHA-256 computed from raw original bytes."
            onFileSelect={(file, sha256) => {
              setUploadedFile(file);
              setUploadedHash(sha256);
            }}
          />

          {/* Progress Bar when uploading */}
          {uploadProgress !== null && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Vault Transfer Progress:</span>
                <span className="text-cyan-400 font-bold">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
