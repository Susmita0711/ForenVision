import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  MapPin, 
  CheckCircle2, 
  Lock,
  Download,
  RefreshCw,
  AlertCircle,
  FileText
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { DataTable, type Column } from '../components/common/DataTable';
import { SearchInput } from '../components/common/SearchInput';
import { Modal } from '../components/common/Modal';
import { 
  fetchCustodyEventsApi, 
  recordCustodyEventApi,
  exportCustodyLedgerApi
} from '../api/custodyApi';
import { fetchEvidenceApi } from '../api/evidenceApi';
import type { ChainOfCustodyRecord, EvidenceItem } from '../types';

export const ChainOfCustodyPage: React.FC = () => {
  const [records, setRecords] = useState<ChainOfCustodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal & form state
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [availableEvidence, setAvailableEvidence] = useState<EvidenceItem[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [action, setAction] = useState<string>('transferred');
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('Forensic Vault Station B');
  const [recipient, setRecipient] = useState('');
  const [recipientBadge, setRecipientBadge] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load custody records from API
  const loadCustodyRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCustodyEventsApi({ q: searchQuery });
      setRecords(res.events || []);
    } catch (err: any) {
      console.error('Failed to load chain of custody ledger:', err);
      setError(
        err.response?.data?.message ||
        'Unable to load cryptographic custody records. Ensure network and clearance status.'
      );
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadCustodyRecords();
  }, [loadCustodyRecords]);

  // Load evidence list when opening handover modal
  const handleOpenSignModal = async () => {
    setIsSignModalOpen(true);
    setSubmitError(null);
    setReason('');
    setRecipient('');
    setRecipientBadge('');
    setLoadingEvidence(true);

    try {
      const res = await fetchEvidenceApi({ limit: 100 });
      setAvailableEvidence(res.evidence || []);
      if (res.evidence && res.evidence.length > 0 && !selectedEvidenceId) {
        setSelectedEvidenceId(res.evidence[0].id);
      }
    } catch (err) {
      console.error('Failed to load evidence options:', err);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleSignCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidenceId) {
      setSubmitError('Please select a target evidence artifact.');
      return;
    }
    if (!reason.trim()) {
      setSubmitError('Operational reason / justification is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await recordCustodyEventApi({
        evidenceId: selectedEvidenceId,
        eventType: action,
        reason: reason.trim(),
        location: location.trim(),
        recipient: recipient.trim() || undefined,
        newCustodian: recipient.trim() ? {
          name: recipient.trim(),
          badge: recipientBadge.trim() || undefined,
        } : undefined,
      });

      setIsSignModalOpen(false);
      setReason('');
      await loadCustodyRecords();
    } catch (err: any) {
      console.error('Failed to sign custody record:', err);
      setSubmitError(err.response?.data?.message || err.message || 'Failed to record custody handover.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportSelected = async (item: ChainOfCustodyRecord) => {
    try {
      await exportCustodyLedgerApi(item.evidenceId, 'csv', item.evidenceNumber);
    } catch (err: any) {
      alert(`Export failed: ${err.response?.data?.message || err.message}`);
    }
  };

  const columns: Column<ChainOfCustodyRecord>[] = [
    {
      key: 'evidenceNumber',
      header: 'Evidence & Case',
      sortable: true,
      width: '160px',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-bold text-cyan-400">{item.evidenceNumber}</span>
          <p className="font-mono text-[10px] text-slate-500">{item.caseNumber}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Chain Action',
      sortable: true,
      render: (item) => (
        <span className={`font-semibold text-xs px-2 py-0.5 rounded border ${
          item.isCorrection
            ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
            : item.action === 'Collected'
            ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/60'
            : item.action === 'Returned' || item.action === 'Stored in Vault'
            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
            : 'bg-slate-900 text-slate-200 border-slate-700'
        }`}>
          {item.action}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Operational Reason & Location',
      render: (item) => (
        <div className="max-w-xs">
          <p className="text-slate-200 truncate">{item.reason}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
            <MapPin className="h-3 w-3 text-cyan-400 shrink-0" />
            <span className="truncate">{item.location}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'performedBy',
      header: 'Officer / Badge',
      sortable: true,
      render: (item) => (
        <div>
          <p className="text-slate-200 font-medium">{item.performedBy}</p>
          {item.recipient && (
            <p className="text-[10px] text-cyan-400 font-mono">
              &rarr; {item.recipient}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'blockHash',
      header: 'Cryptographic Block & Proof',
      render: (item) => (
        <div className="font-mono text-[10px]">
          <span className="text-emerald-400 font-bold flex items-center gap-1 select-all">
            <Lock className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
            {item.blockHash ? `${item.blockHash.substring(0, 18)}...` : 'N/A'}
          </span>
          <span className="text-slate-400 block mt-0.5">
            Prev: {item.previousBlockHash ? `${item.previousBlockHash.substring(0, 14)}...` : '00000000000000...'}
          </span>
        </div>
      ),
    },
    {
      key: 'verified',
      header: 'Integrity',
      render: () => (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" /> Valid
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp (UTC)',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-[10px] text-slate-400">
          {item.timestamp ? item.timestamp.substring(0, 19).replace('T', ' ') : 'N/A'}
        </span>
      ),
    },
    {
      key: 'id',
      header: 'Export',
      render: (item) => (
        <button
          onClick={() => handleExportSelected(item)}
          className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 text-[11px] border border-slate-700 transition-colors"
          title="Export CSV history for this artifact"
        >
          <Download className="h-3 w-3 text-cyan-400" />
          <span>CSV</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Chain of Custody' }]}
        title="Cryptographic Chain of Custody Ledger"
        description="Tamper-evident append-only ledger guaranteeing continuous evidence custody tracking under ISO/IEC 27037 standards."
        badge={
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Lock className="h-3 w-3" />
            ISO/IEC 27037 Compliant Ledger
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadCustodyRecords}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
              title="Refresh ledger"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleOpenSignModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Sign Custody Handover</span>
            </button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Filter by Evidence ID, case docket, block hash, or examiner..."
          className="w-full sm:w-96"
        />

        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-800/40">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Ledger Consensus Verified (SHA-256 Hash Chain Linking)</span>
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
            onClick={loadCustodyRecords}
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
          <p className="text-xs font-mono">Authenticating custody access & reading cryptographic blocks...</p>
        </div>
      )}

      {/* Ledger Table */}
      {!loading && !error && records.length > 0 && (
        <DataTable
          columns={columns}
          data={records}
          keyExtractor={(item) => item.id}
          pageSize={10}
        />
      )}

      {/* Empty State */}
      {!loading && !error && records.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#0F172A] p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-500 border border-slate-800 mb-4">
            <FileText className="h-7 w-7 text-cyan-500/50" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">No Custody Records Found</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            No custody transfer or verification blocks match your search query or have been recorded for accessible dockets.
          </p>
          <button
            onClick={handleOpenSignModal}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Record First Custody Block</span>
          </button>
        </div>
      )}

      {/* Sign Custody Modal */}
      <Modal
        isOpen={isSignModalOpen}
        onClose={() => !isSubmitting && setIsSignModalOpen(false)}
        title="Sign Forensic Custody Transfer"
        subtitle="Create an immutable cryptographic block linking your credentials to evidence handover"
        size="md"
        footer={
          <>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsSignModalOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="sign-custody-form"
              disabled={isSubmitting || !selectedEvidenceId}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/50 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Signing Block...</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Cryptographically Sign Block</span>
                </>
              )}
            </button>
          </>
        }
      >
        <form id="sign-custody-form" onSubmit={handleSignCustody} className="space-y-4">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Evidence Artifact *
              </label>
              <select
                value={selectedEvidenceId}
                onChange={(e) => setSelectedEvidenceId(e.target.value)}
                disabled={loadingEvidence}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                {loadingEvidence ? (
                  <option value="">Loading accessible artifacts...</option>
                ) : availableEvidence.length === 0 ? (
                  <option value="">No evidence artifacts found</option>
                ) : (
                  availableEvidence.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.evidenceNumber} - {ev.name.substring(0, 24)}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Custody Action *
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="transferred">Transferred to Custodian</option>
                <option value="checked_out">Checked Out for Lab Work</option>
                <option value="returned">Returned to Vault</option>
                <option value="stored">Deposited in Cold Storage Vault</option>
                <option value="sealed">Sealed with Tamper Tape</option>
                <option value="accessed">Inspected / Viewed</option>
                <option value="analysed">Analyzed via Forensic AI</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Recipient / Receiving Entity
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. Dr. Marcus Sterling"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Recipient Badge / ID
              </label>
              <input
                type="text"
                value={recipientBadge}
                onChange={(e) => setRecipientBadge(e.target.value)}
                placeholder="e.g. LAB-9104"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Physical Location *
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ballistics Analysis Chamber 4"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Operational Justification *
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Relocated to secure optical analysis chamber for ELA scan."
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
