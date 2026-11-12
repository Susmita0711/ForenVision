import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Fingerprint, 
  RefreshCw, 
  Sliders, 
  Download, 
  AlertTriangle, 
  ShieldCheck, 
  Eye, 
  History, 
  BookOpen, 
  Sparkles,
  ArrowRightLeft,
  Database
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { 
  getFingerprintMethodologyApi,
  assessFingerprintQualityApi,
  compareFingerprintsApi,
  getFingerprintVisualizationBlobApi,
  downloadFingerprintVisualization,
  getFingerprintHistoryApi,
  type FingerprintComparisonResult,
  type MethodologyInfo,
  type QualityReport
} from '../api/fingerprintApi';
import { fetchEvidenceApi, fetchEvidencePreviewUrlApi } from '../api/evidenceApi';
import type { EvidenceItem } from '../types';

export const FingerprintAnalysisPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlEvidenceId = searchParams.get('evidenceId');

  // Evidence Selection
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [probeEvidenceId, setProbeEvidenceId] = useState<string>(urlEvidenceId || '');
  const [referenceEvidenceId, setReferenceEvidenceId] = useState<string>('');
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Previews
  const [probePreviewUrl, setProbePreviewUrl] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [annotatedVisualizationUrl, setAnnotatedVisualizationUrl] = useState<string | null>(null);

  // Standalone Quality Audits
  const [probeQuality, setProbeQuality] = useState<QualityReport | null>(null);
  const [referenceQuality, setReferenceQuality] = useState<QualityReport | null>(null);

  // Comparison Parameters
  const [loweRatio, setLoweRatio] = useState<number>(0.75);
  const [ransacThreshold, setRansacThreshold] = useState<number>(5.0);
  const [maxFeatures, setMaxFeatures] = useState<number>(800);

  // Results & History
  const [comparisonResult, setComparisonResult] = useState<FingerprintComparisonResult | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<FingerprintComparisonResult[]>([]);
  const [methodologyInfo, setMethodologyInfo] = useState<MethodologyInfo | null>(null);

  // UI State
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visualizer' | 'quality' | 'methodology' | 'history'>('visualizer');
  const [viewMode, setViewMode] = useState<'alignment' | 'dual' | 'probe' | 'reference'>('alignment');

  // Fetch Methodology & Accessible Evidence on Mount
  useEffect(() => {
    getFingerprintMethodologyApi()
      .then((info) => setMethodologyInfo(info))
      .catch((err) => console.warn('Could not fetch methodology:', err));

    setLoadingEvidence(true);
    fetchEvidenceApi()
      .then((res) => {
        const imageItems = (res.evidence || [])
          .filter(
            (e) =>
              e.detectedMediaType?.startsWith('image/') ||
              e.type === 'fingerprint' ||
              e.type === 'image' ||
              e.name?.match(/\.(jpg|jpeg|png|tif|tiff|bmp)$/i)
          )
          .sort((a, b) => (a.type === 'fingerprint' ? 0 : 1) - (b.type === 'fingerprint' ? 0 : 1));
        setEvidenceList(imageItems);

        // Pre-fill probe and reference prioritizing fingerprint artifacts
        const fpItems = imageItems.filter((e) => e.type === 'fingerprint');
        const pool = fpItems.length >= 2 ? fpItems : imageItems;
        let selectedProbeId = probeEvidenceId;
        if (urlEvidenceId) {
          const match = imageItems.find((e) => e.id === urlEvidenceId);
          if (match) {
            selectedProbeId = match.id;
            setProbeEvidenceId(match.id);
          }
        } else if (pool.length > 0 && !probeEvidenceId) {
          selectedProbeId = pool[0].id;
          setProbeEvidenceId(pool[0].id);
        }

        if (pool.length > 1 && !referenceEvidenceId) {
          const refCandidate = pool.find((e) => e.id !== selectedProbeId) || pool[1];
          setReferenceEvidenceId(refCandidate.id);
        }
      })
      .catch((err) => setError(`Failed to load evidence artifacts: ${err.message}`))
      .finally(() => setLoadingEvidence(false));
  }, [urlEvidenceId]);

  // Load Probe Preview & Quality
  useEffect(() => {
    if (!probeEvidenceId) return;

    fetchEvidencePreviewUrlApi(probeEvidenceId)
      .then((url) => setProbePreviewUrl(url))
      .catch(() => setProbePreviewUrl(null));

    assessFingerprintQualityApi(probeEvidenceId)
      .then((q) => setProbeQuality(q))
      .catch(() => setProbeQuality(null));

    // Fetch prior history for probe
    getFingerprintHistoryApi(probeEvidenceId)
      .then((hist) => {
        setComparisonHistory(hist);
        if (hist.length > 0 && !comparisonResult) {
          const latest = hist[0];
          setComparisonResult(latest);
          getFingerprintVisualizationBlobApi(latest.id)
            .then((blob) => setAnnotatedVisualizationUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch(() => setComparisonHistory([]));
  }, [probeEvidenceId]);

  // Load Reference Preview & Quality
  useEffect(() => {
    if (!referenceEvidenceId) return;

    fetchEvidencePreviewUrlApi(referenceEvidenceId)
      .then((url) => setReferencePreviewUrl(url))
      .catch(() => setReferencePreviewUrl(null));

    assessFingerprintQualityApi(referenceEvidenceId)
      .then((q) => setReferenceQuality(q))
      .catch(() => setReferenceQuality(null));
  }, [referenceEvidenceId]);

  // Run Biometric Comparison
  const handleRunComparison = async () => {
    if (!probeEvidenceId || !referenceEvidenceId) {
      setError('Please select both a Probe and a Reference fingerprint impression.');
      return;
    }

    if (probeEvidenceId === referenceEvidenceId) {
      setError('Probe and Reference impressions cannot be the identical evidence artifact.');
      return;
    }

    setIsComparing(true);
    setError(null);

    try {
      const result = await compareFingerprintsApi({
        probeEvidenceId,
        referenceEvidenceId,
        loweRatio,
        ransacThreshold,
        maxFeatures,
        saveAnalysis: true,
      });

      setComparisonResult(result);

      // Stream generated visualization
      const blob = await getFingerprintVisualizationBlobApi(result.id);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));

      // Refresh history
      const updatedHistory = await getFingerprintHistoryApi(probeEvidenceId);
      setComparisonHistory(updatedHistory);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Biometric comparison failed.';
      setError(msg);
    } finally {
      setIsComparing(false);
    }
  };

  // Swap Probe and Reference
  const handleSwapImpressions = () => {
    const tempId = probeEvidenceId;
    setProbeEvidenceId(referenceEvidenceId);
    setReferenceEvidenceId(tempId);
  };

  // Load Past History Record
  const handleLoadHistoryRecord = async (record: FingerprintComparisonResult) => {
    setComparisonResult(record);
    setActiveTab('visualizer');
    try {
      const blob = await getFingerprintVisualizationBlobApi(record.id);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.warn('Could not load history visualization:', err);
    }
  };

  const selectedProbeEvidence = evidenceList.find((e) => e.id === probeEvidenceId);
  const selectedRefEvidence = evidenceList.find((e) => e.id === referenceEvidenceId);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'AI Forensic Modules', path: '/analysis/image' },
            { label: 'Fingerprint Biometrics', path: '/analysis/fingerprint' },
          ]}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Fingerprint className="h-6 w-6 text-cyan-400" />
              <span>Fingerprint Feature Comparison &amp; Minutiae Alignment</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Scale-space SIFT descriptor matching, RANSAC geometric alignment, and morphological ridge minutiae extraction.
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span className="font-semibold text-white">SIFT + RANSAC</span>
            <span className="text-slate-500">&bull;</span>
            <span className="text-slate-400">Crossing Number Minutiae</span>
            <span className="text-slate-500">&bull;</span>
            <span className="text-emerald-400 font-mono text-[11px]">ACE-V Standard</span>
          </div>
        </div>
      </div>

      {/* Forensic Disclaimer Notice */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 shadow-sm">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold uppercase tracking-wider text-[11px] text-amber-300">
            Biometric Forensic Notice &amp; Standard of Evidence
          </p>
          <p className="leading-relaxed text-amber-200/90">
            Biometric comparison scores represent algorithmic geometric congruence metrics. Under ACE-V forensic standards,
            automated systems <strong>never</strong> make autonomous identity, individualization, or guilt determinations.
            Conclusive source attribution requires manual examination by a qualified latent print examiner.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Impression Selectors & Parameter Controls (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Dual Impression Selector Card */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                <span>Impressions Selection</span>
              </h2>
              <button
                onClick={handleSwapImpressions}
                title="Swap Probe and Reference impressions"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Probe Impression Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor="probe-select" className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>Probe (Latent / Questioned):</span>
                <span className="font-mono text-cyan-400 text-[10px]">Print A</span>
              </label>
              <select
                id="probe-select"
                value={probeEvidenceId}
                onChange={(e) => setProbeEvidenceId(e.target.value)}
                disabled={loadingEvidence || isComparing}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {evidenceList.map((ev) => (
                  <option key={`probe_${ev.id}`} value={ev.id}>
                    {ev.evidenceNumber || ev.id} &mdash; {ev.name} ({ev.caseNumber || 'No Docket'})
                  </option>
                ))}
              </select>
            </div>

            {/* Reference Impression Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor="reference-select" className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>Reference (Tenprint / Known):</span>
                <span className="font-mono text-purple-400 text-[10px]">Print B</span>
              </label>
              <select
                id="reference-select"
                value={referenceEvidenceId}
                onChange={(e) => setReferenceEvidenceId(e.target.value)}
                disabled={loadingEvidence || isComparing}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {evidenceList.map((ev) => (
                  <option key={`ref_${ev.id}`} value={ev.id}>
                    {ev.evidenceNumber || ev.id} &mdash; {ev.name} ({ev.caseNumber || 'No Docket'})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Artifact Dockets */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                <span className="text-slate-500 font-bold block text-[10px]">PROBE DOCKET</span>
                <span className="text-cyan-400 truncate block">{selectedProbeEvidence?.caseNumber || 'N/A'}</span>
                <span className="text-slate-400 text-[10px] truncate block">{selectedProbeEvidence?.name}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                <span className="text-slate-500 font-bold block text-[10px]">REFERENCE DOCKET</span>
                <span className="text-purple-400 truncate block">{selectedRefEvidence?.caseNumber || 'N/A'}</span>
                <span className="text-slate-400 text-[10px] truncate block">{selectedRefEvidence?.name}</span>
              </div>
            </div>
          </div>

          {/* Biometric Comparison Parameters Card */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              <span>Matching Tolerances</span>
            </h2>

            {/* Lowe Ratio Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Lowe&apos;s Ratio Threshold (&rho;):</span>
                <span className="font-mono text-cyan-400 font-semibold">{loweRatio}</span>
              </div>
              <input
                type="range"
                min="0.60"
                max="0.85"
                step="0.05"
                value={loweRatio}
                onChange={(e) => setLoweRatio(Number(e.target.value))}
                disabled={isComparing}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                L2 distance ratio between first and second nearest descriptor neighbors.
              </p>
            </div>

            {/* RANSAC Threshold Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">RANSAC Reprojection Tolerance (&epsilon;):</span>
                <span className="font-mono text-purple-400 font-semibold">{ransacThreshold} px</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="10.0"
                step="1.0"
                value={ransacThreshold}
                onChange={(e) => setRansacThreshold(Number(e.target.value))}
                disabled={isComparing}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Maximum allowable geometric spatial deviation for affine inliers.
              </p>
            </div>

            {/* Max SIFT Features */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Max SIFT Feature Density:</span>
                <span className="font-mono text-emerald-400 font-semibold">{maxFeatures}</span>
              </div>
              <input
                type="range"
                min="300"
                max="1200"
                step="100"
                value={maxFeatures}
                onChange={(e) => setMaxFeatures(Number(e.target.value))}
                disabled={isComparing}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunComparison}
              disabled={isComparing || !probeEvidenceId || !referenceEvidenceId || probeEvidenceId === referenceEvidenceId}
              className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg ${
                isComparing || !probeEvidenceId || !referenceEvidenceId || probeEvidenceId === referenceEvidenceId
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              }`}
            >
              {isComparing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Computing Geometric Alignment...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4" />
                  <span>Execute Biometric Comparison</span>
                </>
              )}
            </button>
          </div>

          {/* Quality Previews on Left Column */}
          {(probeQuality || referenceQuality) && (
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Quality Diagnostics</span>
              </h2>

              {probeQuality && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span className="text-cyan-400">Probe Clarity:</span>
                    <span className="font-mono text-white">{probeQuality.clarityScore} / 100</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-mono text-[11px]">
                    <span>Tier: {probeQuality.qualityTier}</span>
                    <span>Area: {probeQuality.usableAreaPercent}%</span>
                  </div>
                  {probeQuality.warnings.length > 0 && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] space-y-0.5">
                      {probeQuality.warnings.map((w, i) => (
                        <p key={i}>&bull; {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {referenceQuality && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span className="text-purple-400">Reference Clarity:</span>
                    <span className="font-mono text-white">{referenceQuality.clarityScore} / 100</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-mono text-[11px]">
                    <span>Tier: {referenceQuality.qualityTier}</span>
                    <span>Area: {referenceQuality.usableAreaPercent}%</span>
                  </div>
                  {referenceQuality.warnings.length > 0 && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] space-y-0.5">
                      {referenceQuality.warnings.map((w, i) => (
                        <p key={i}>&bull; {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Visualization Lightbox & Detailed Metrics (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Comparison Canvas Lightbox */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            {/* Viewport Top Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Viewer Mode:
                </span>
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    onClick={() => setViewMode('alignment')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'alignment'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Feature Alignment
                  </button>
                  <button
                    onClick={() => setViewMode('dual')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'dual'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Dual Master Prints
                  </button>
                  <button
                    onClick={() => setViewMode('probe')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'probe'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Probe Only
                  </button>
                  <button
                    onClick={() => setViewMode('reference')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'reference'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Reference Only
                  </button>
                </div>
              </div>

              {comparisonResult && (
                <button
                  onClick={() => downloadFingerprintVisualization(comparisonResult.id, `fp_comparison_${comparisonResult.id}.jpg`)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors border border-slate-700/60"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Download Match Image</span>
                </button>
              )}
            </div>

            {/* Viewport Canvas */}
            <div className="p-4 sm:p-6 bg-slate-950 flex items-center justify-center min-h-[380px] relative">
              {isComparing && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
                  <div className="h-8 w-8 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                  <p className="text-sm font-medium text-cyan-300">
                    Running SIFT descriptor extraction &amp; RANSAC geometric alignment...
                  </p>
                  <p className="text-xs text-slate-500">
                    Extracting topological minutiae and computing inlier match vectors
                  </p>
                </div>
              )}

              {viewMode === 'alignment' && (
                <div className="w-full flex items-center justify-center">
                  {annotatedVisualizationUrl ? (
                    <img
                      src={annotatedVisualizationUrl}
                      alt="Biometric Feature Correspondence Overlay"
                      className="max-h-[500px] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl"
                    />
                  ) : (
                    <div className="text-center text-slate-500 py-16 space-y-2">
                      <Fingerprint className="h-10 w-10 mx-auto text-slate-600" />
                      <p className="text-sm font-medium text-slate-400">Ready for Biometric Comparison</p>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto">
                        Click &ldquo;Execute Biometric Comparison&rdquo; to align impressions and extract corresponding features.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'dual' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="space-y-1.5 text-center">
                    <p className="text-xs font-mono text-cyan-400">Probe Impression (Latent / A)</p>
                    {probePreviewUrl ? (
                      <img
                        src={probePreviewUrl}
                        alt="Probe Master"
                        className="max-h-[340px] w-auto mx-auto object-contain rounded-lg border border-slate-800"
                      />
                    ) : (
                      <div className="h-[220px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-600">
                        No probe preview
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-center">
                    <p className="text-xs font-mono text-purple-400">Reference Impression (Tenprint / B)</p>
                    {referencePreviewUrl ? (
                      <img
                        src={referencePreviewUrl}
                        alt="Reference Master"
                        className="max-h-[340px] w-auto mx-auto object-contain rounded-lg border border-slate-800"
                      />
                    ) : (
                      <div className="h-[220px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-600">
                        No reference preview
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'probe' && (
                <div className="w-full flex items-center justify-center">
                  {probePreviewUrl ? (
                    <img
                      src={probePreviewUrl}
                      alt="Probe Master"
                      className="max-h-[500px] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl"
                    />
                  ) : (
                    <div className="text-center text-slate-500 py-12">
                      <p className="text-sm">No probe impression selected</p>
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'reference' && (
                <div className="w-full flex items-center justify-center">
                  {referencePreviewUrl ? (
                    <img
                      src={referencePreviewUrl}
                      alt="Reference Master"
                      className="max-h-[500px] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl"
                    />
                  ) : (
                    <div className="text-center text-slate-500 py-12">
                      <p className="text-sm">No reference impression selected</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tabs: Visualizer Metrics | Quality Breakdown | Methodology | History */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden">
            <div className="flex border-b border-slate-800 bg-slate-950/60 px-4">
              <button
                onClick={() => setActiveTab('visualizer')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'visualizer'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="h-4 w-4" />
                <span>Comparison Metrics</span>
              </button>

              <button
                onClick={() => setActiveTab('quality')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'quality'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Ridge &amp; Minutiae Audit</span>
              </button>

              <button
                onClick={() => setActiveTab('methodology')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'methodology'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Algorithm &amp; Limitations</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="h-4 w-4" />
                <span>History ({comparisonHistory.length})</span>
              </button>
            </div>

            {/* Tab 1: Comparison Metrics */}
            {activeTab === 'visualizer' && (
              <div className="p-5 space-y-5">
                {comparisonResult ? (
                  <>
                    {/* Primary Metric Score Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[11px] text-slate-500 font-medium">RANSAC Inliers</p>
                        <p className="text-2xl font-bold text-white mt-0.5">
                          {comparisonResult.comparisonMetrics.inlierCount}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">
                          of {comparisonResult.comparisonMetrics.ratioFilteredMatches} ratio matches
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[11px] text-slate-500 font-medium">Inlier Ratio</p>
                        <p className="text-2xl font-bold text-cyan-400 mt-0.5">
                          {Math.round(comparisonResult.comparisonMetrics.inlierRatio * 100)}%
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">Spatial coherence</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[11px] text-slate-500 font-medium">Correspondence</p>
                        <span
                          className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase font-mono ${
                            comparisonResult.comparisonMetrics.correspondenceTier === 'STRONG_CORRESPONDENCE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : comparisonResult.comparisonMetrics.correspondenceTier === 'MODERATE_CORRESPONDENCE'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {comparisonResult.comparisonMetrics.correspondenceTier.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[11px] text-slate-500 font-medium">Estimated Rotation</p>
                        <p className="text-xl font-bold text-purple-400 mt-0.5 font-mono">
                          {comparisonResult.comparisonMetrics.alignment
                            ? `${comparisonResult.comparisonMetrics.alignment.rotationDegrees}°`
                            : 'N/A'}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">
                          Scale: {comparisonResult.comparisonMetrics.alignment?.scaleFactor || 1.0}x
                        </p>
                      </div>
                    </div>

                    {/* Scientific Interpretation Alert */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Forensic Interpretation Note
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {comparisonResult.comparisonMetrics.interpretation}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-slate-500 space-y-2">
                    <Fingerprint className="h-8 w-8 mx-auto text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">No comparison results loaded</p>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Select Probe and Reference impressions, then click &ldquo;Execute Biometric Comparison&rdquo;.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Quality & Minutiae Audit */}
            {activeTab === 'quality' && (
              <div className="p-5 space-y-5">
                {comparisonResult ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Probe Side */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-cyan-400">Probe Impression (Latent)</span>
                        <span className="text-xs text-slate-400 font-mono">{comparisonResult.probeEvidence.filename}</span>
                      </div>
                      <div className="text-xs space-y-1.5 font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Quality Tier:</span>
                          <span className="text-white font-semibold">{comparisonResult.probeEvidence.quality.qualityTier}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Clarity Score:</span>
                          <span className="text-cyan-400 font-bold">{comparisonResult.probeEvidence.quality.clarityScore} / 100</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Total Minutiae:</span>
                          <span className="text-white font-bold">{comparisonResult.probeEvidence.minutiae.total}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Ridge Terminations:</span>
                          <span className="text-emerald-400">{comparisonResult.probeEvidence.minutiae.terminations}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Ridge Bifurcations:</span>
                          <span className="text-amber-400">{comparisonResult.probeEvidence.minutiae.bifurcations}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SIFT Keypoints:</span>
                          <span className="text-slate-200">{comparisonResult.probeEvidence.keypointCount}</span>
                        </div>
                      </div>
                    </div>

                    {/* Reference Side */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-purple-400">Reference Impression (Tenprint)</span>
                        <span className="text-xs text-slate-400 font-mono">{comparisonResult.referenceEvidence.filename}</span>
                      </div>
                      <div className="text-xs space-y-1.5 font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Quality Tier:</span>
                          <span className="text-white font-semibold">{comparisonResult.referenceEvidence.quality.qualityTier}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Clarity Score:</span>
                          <span className="text-purple-400 font-bold">{comparisonResult.referenceEvidence.quality.clarityScore} / 100</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Total Minutiae:</span>
                          <span className="text-white font-bold">{comparisonResult.referenceEvidence.minutiae.total}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Ridge Terminations:</span>
                          <span className="text-emerald-400">{comparisonResult.referenceEvidence.minutiae.terminations}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Ridge Bifurcations:</span>
                          <span className="text-amber-400">{comparisonResult.referenceEvidence.minutiae.bifurcations}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SIFT Keypoints:</span>
                          <span className="text-slate-200">{comparisonResult.referenceEvidence.keypointCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Run comparison to view extracted minutiae and ridge quality audits.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Methodology & Limitations */}
            {activeTab === 'methodology' && (
              <div className="p-5 space-y-5">
                {methodologyInfo ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Preprocessing */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                          Preprocessing &amp; Ridge Enhancement
                        </h3>
                        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                          {methodologyInfo.methodology.preprocessing.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Matching Engine */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                          Alignment &amp; Geometric RANSAC
                        </h3>
                        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                          {methodologyInfo.methodology.alignmentAndMatching.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Scientific Limitations */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        <span>Scientific Limitations</span>
                      </h3>
                      <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                        {methodologyInfo.methodology.scientificLimitations.map((lim, i) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Loading methodology specifications...
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: History */}
            {activeTab === 'history' && (
              <div className="p-5 space-y-3">
                {comparisonHistory.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No prior comparisons recorded for this evidence item.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comparisonHistory.map((run) => (
                      <div
                        key={run.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          comparisonResult?.id === run.id
                            ? 'bg-cyan-500/10 border-cyan-500/40'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {run.comparisonMetrics.inlierCount} Inlier Matches
                            </span>
                            <span className="text-[11px] text-cyan-400 font-mono">
                              ({Math.round(run.comparisonMetrics.inlierRatio * 100)}% ratio)
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold uppercase font-mono">
                              {run.comparisonMetrics.correspondenceTier.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                            <span>Probe: {run.probeEvidence.filename}</span>
                            <span>&bull;</span>
                            <span>Ref: {run.referenceEvidence.filename}</span>
                            <span>&bull;</span>
                            <span>{new Date(run.timestamp).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleLoadHistoryRecord(run)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                          >
                            Load Visualizer
                          </button>
                          <button
                            onClick={() => downloadFingerprintVisualization(run.id, `fp_comparison_${run.id}.jpg`)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="Download Visualization"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
