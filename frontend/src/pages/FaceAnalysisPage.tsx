import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  ScanFace, 
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
  FileCheck2,
  Info
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { 
  getFaceMethodologyApi,
  detectFacesApi,
  compareFacesApi,
  getFaceHistoryApi,
  getFaceVisualizationBlobApi,
  downloadFaceVisualization,
  type FaceComparisonResult,
  type FaceDetectionResult,
  type FaceMethodologyInfo,
  type FaceQualityReport
} from '../api/faceAnalysisApi';
import { fetchEvidenceApi, fetchEvidencePreviewUrlApi } from '../api/evidenceApi';
import type { EvidenceItem } from '../types';

export const FaceAnalysisPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlEvidenceId = searchParams.get('evidenceId');

  // Operation Mode: Pairwise Comparison vs Single Evidence Detection Audit
  const [analysisMode, setAnalysisMode] = useState<'comparison' | 'detection'>('comparison');

  // Evidence Selection
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [probeEvidenceId, setProbeEvidenceId] = useState<string>(urlEvidenceId || '');
  const [referenceEvidenceId, setReferenceEvidenceId] = useState<string>('');
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Previews
  const [probePreviewUrl, setProbePreviewUrl] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [annotatedVisualizationUrl, setAnnotatedVisualizationUrl] = useState<string | null>(null);

  // Standalone Quality & Single Detection State
  const [singleDetectionResult, setSingleDetectionResult] = useState<FaceDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Comparison Parameters & Results
  const [scoreThreshold, setScoreThreshold] = useState<number>(0.40);
  const [comparisonResult, setComparisonResult] = useState<FaceComparisonResult | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [methodologyInfo, setMethodologyInfo] = useState<FaceMethodologyInfo | null>(null);

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visualizer' | 'quality' | 'methodology' | 'history'>('visualizer');
  const [viewMode, setViewMode] = useState<'annotated' | 'dual' | 'probe' | 'reference'>('annotated');

  // Fetch Methodology & Accessible Evidence on Mount
  useEffect(() => {
    getFaceMethodologyApi()
      .then((info) => setMethodologyInfo(info))
      .catch((err) => console.warn('Could not fetch face methodology:', err));

    setLoadingEvidence(true);
    fetchEvidenceApi()
      .then((res) => {
        const typeRank = (t?: string) => {
          if (t === 'face') return 0;
          if (t === 'image') return 1;
          if (t === 'sketch') return 2;
          return 3; // fingerprint last
        };
        const imageItems = (res.evidence || [])
          .filter(
            (e) =>
              e.id === urlEvidenceId ||
              (e.type !== 'fingerprint' &&
                e.type !== 'sketch' &&
                (e.detectedMediaType?.startsWith('image/') ||
                  e.type === 'face' ||
                  e.type === 'image' ||
                  e.name?.match(/\.(jpg|jpeg|png|tif|tiff|bmp)$/i)))
          )
          .sort((a, b) => typeRank(a.type) - typeRank(b.type));
        setEvidenceList(imageItems);

        // Pre-fill probe and reference with dedicated face captures when available
        let selectedProbeId = probeEvidenceId;
        if (urlEvidenceId) {
          const match = imageItems.find((e) => e.id === urlEvidenceId);
          if (match) {
            selectedProbeId = match.id;
            setProbeEvidenceId(match.id);
          }
        } else if (imageItems.length > 0 && !probeEvidenceId) {
          selectedProbeId = imageItems[0].id;
          setProbeEvidenceId(imageItems[0].id);
        }

        if (imageItems.length > 1 && !referenceEvidenceId) {
          const probeCaseId = imageItems.find((e) => e.id === selectedProbeId)?.caseId;
          const mate =
            imageItems.find((e) => e.id !== selectedProbeId && e.type === 'face' && e.caseId === probeCaseId) ||
            imageItems.find((e) => e.id !== selectedProbeId && e.type === 'face') ||
            imageItems.find((e) => e.id !== selectedProbeId) ||
            imageItems[1];
          setReferenceEvidenceId(mate.id);
        }
      })
      .catch((err) => setError(`Failed to load evidence artifacts: ${err.message}`))
      .finally(() => setLoadingEvidence(false));
  }, [urlEvidenceId]);

  // Load Probe Preview
  useEffect(() => {
    if (!probeEvidenceId) {
      setProbePreviewUrl(null);
      return;
    }
    let active = true;
    fetchEvidencePreviewUrlApi(probeEvidenceId)
      .then((url) => {
        if (active) setProbePreviewUrl(url);
      })
      .catch(() => {
        if (active) setProbePreviewUrl(null);
      });

    // Also load history for probe evidence
    getFaceHistoryApi(probeEvidenceId)
      .then((hist) => {
        if (active) setAnalysisHistory(hist);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [probeEvidenceId]);

  // Load Reference Preview
  useEffect(() => {
    if (!referenceEvidenceId) {
      setReferencePreviewUrl(null);
      return;
    }
    let active = true;
    fetchEvidencePreviewUrlApi(referenceEvidenceId)
      .then((url) => {
        if (active) setReferencePreviewUrl(url);
      })
      .catch(() => {
        if (active) setReferencePreviewUrl(null);
      });

    return () => {
      active = false;
    };
  }, [referenceEvidenceId]);

  // Execute Controlled 1:1 Facial Comparison
  const handleRunComparison = async () => {
    if (!probeEvidenceId || !referenceEvidenceId) {
      setError('Please select both a Probe and a Reference photographic evidence item.');
      return;
    }

    if (probeEvidenceId === referenceEvidenceId) {
      setError('Probe and Reference evidence cannot be the identical artifact for comparison.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await compareFacesApi({
        probeEvidenceId,
        referenceEvidenceId,
        scoreThreshold,
        saveAnalysis: true,
      });

      setComparisonResult(result);

      // Stream generated visualization
      const blob = await getFaceVisualizationBlobApi(result.id);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));

      // Refresh history
      const updatedHistory = await getFaceHistoryApi(probeEvidenceId);
      setAnalysisHistory(updatedHistory);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Controlled face comparison failed.';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Single Evidence Face Detection & Quality Audit
  const handleRunSingleDetection = async () => {
    if (!probeEvidenceId) {
      setError('Please select an evidence artifact to audit.');
      return;
    }

    setIsDetecting(true);
    setError(null);

    try {
      const result = await detectFacesApi({
        evidenceId: probeEvidenceId,
        scoreThreshold,
        saveAnalysis: true,
      });

      setSingleDetectionResult(result);

      // Stream generated single visualization
      const blob = await getFaceVisualizationBlobApi(result.id);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));

      // Refresh history
      const updatedHistory = await getFaceHistoryApi(probeEvidenceId);
      setAnalysisHistory(updatedHistory);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Face detection audit failed.';
      setError(msg);
    } finally {
      setIsDetecting(false);
    }
  };

  // Swap Probe and Reference
  const handleSwapEvidence = () => {
    const tempId = probeEvidenceId;
    setProbeEvidenceId(referenceEvidenceId);
    setReferenceEvidenceId(tempId);
  };

  // Load Past History Record
  const handleLoadHistoryRecord = async (record: any) => {
    if (record.category === 'face_biometric_comparison') {
      setComparisonResult(record);
      setAnalysisMode('comparison');
    } else {
      setSingleDetectionResult(record);
      setAnalysisMode('detection');
    }
    setActiveTab('visualizer');
    try {
      const blob = await getFaceVisualizationBlobApi(record.id || record.analysisId);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.warn('Could not stream historical visualization:', err);
    }
  };

  const selectedProbe = evidenceList.find((e) => e.id === probeEvidenceId);
  const selectedReference = evidenceList.find((e) => e.id === referenceEvidenceId);

  // Helper for Quality Tier Color
  const getQualityTierBadge = (tier?: string) => {
    switch (tier) {
      case 'HIGH_FORENSIC_QUALITY':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">HIGH FORENSIC QUALITY</span>;
      case 'ACCEPTABLE_INVESTIGATIVE_QUALITY':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">ACCEPTABLE INVESTIGATIVE</span>;
      case 'MARGINAL_LIMITED_VALUE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">MARGINAL QUALITY</span>;
      case 'DEGRADED_UNRELIABLE':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">DEGRADED / UNRELIABLE</span>;
    }
  };

  // Helper for Correspondence Tier Color
  const getCorrespondenceBadge = (tier?: string) => {
    switch (tier) {
      case 'STRONG_CORRESPONDENCE':
        return <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">STRONG CORRESPONDENCE</span>;
      case 'MODERATE_CORRESPONDENCE':
        return <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">MODERATE CORRESPONDENCE</span>;
      case 'LOW_CORRESPONDENCE':
        return <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">LOW CORRESPONDENCE</span>;
      case 'INCONCLUSIVE_DIVERGENT':
      default:
        return <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">INCONCLUSIVE / DIVERGENT</span>;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'AI Forensic Modules' },
          { label: 'Controlled Face Analysis' },
        ]}
        title="Controlled Facial Analysis & 1:1 Forensic Inspection"
        description="Preserve original evidence immutability, localize facial landmarks via YuNet CNN, assess forensic quality (IPD, blur, illumination symmetry), and execute controlled 1-to-1 exploratory comparison under strict ACE-V forensic standards."
        badge={
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            YuNet CNN + SFace 128-d (Apache 2.0)
          </span>
        }
      />

      {/* Prominent Legal & Forensic Uncertainty Warning */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-amber-300 tracking-wide uppercase font-mono text-[11px]">
              Forensic Science & Legal Notice (NIST / OSAC / ENFSI Standards)
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              Algorithmic facial comparison scores quantify mathematical similarity between feature representations in a latent neural embedding space. 
              They do <span className="font-semibold text-white">NOT prove physical identity</span>, individualization, or legal culpability. 
              Under no circumstances does ForenVision AI automatically label individuals as suspects or conduct unrestricted database surveillance sweeps. 
              Conclusive forensic determinations require independent morphological analysis by a certified facial comparison examiner under ACE-V methodology.
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-white underline font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Operation Mode Selector & Parameters */}
      <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAnalysisMode('comparison')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                analysisMode === 'comparison'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              1-to-1 Controlled Comparison
            </button>
            <button
              onClick={() => setAnalysisMode('detection')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                analysisMode === 'detection'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Single-Evidence Face Audit
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-slate-400">Score Threshold:</span>
              <span className="font-mono text-cyan-400 font-semibold">{scoreThreshold.toFixed(2)}</span>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-20 accent-cyan-500 cursor-pointer"
              />
            </div>

            {analysisMode === 'comparison' ? (
              <button
                onClick={handleRunComparison}
                disabled={isProcessing || !probeEvidenceId || !referenceEvidenceId}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'Aligning & Comparing...' : 'Execute 1:1 Comparison'}</span>
              </button>
            ) : (
              <button
                onClick={handleRunSingleDetection}
                disabled={isDetecting || !probeEvidenceId}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all active:scale-95 disabled:opacity-50"
              >
                <ScanFace className={`h-4 w-4 ${isDetecting ? 'animate-spin' : ''}`} />
                <span>{isDetecting ? 'Detecting & Auditing...' : 'Audit Single Evidence'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Evidence Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Probe Evidence Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                {analysisMode === 'comparison' ? 'Probe Evidence Artifact (Questioned)' : 'Target Evidence Image'}
              </span>
              {selectedProbe && (
                <span className="font-mono text-[11px] text-slate-400">
                  Case: {selectedProbe.caseNumber}
                </span>
              )}
            </label>
            <select
              value={probeEvidenceId}
              onChange={(e) => setProbeEvidenceId(e.target.value)}
              disabled={loadingEvidence}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">-- Select Photographic Evidence --</option>
              {evidenceList.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.evidenceNumber}] {e.name || e.originalFileName} ({e.caseNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Reference Evidence Picker (Visible in Comparison Mode) */}
          {analysisMode === 'comparison' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Reference Evidence Artifact (Exemplar / Known)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSwapEvidence}
                    title="Swap Probe and Reference"
                    className="p-0.5 text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                  </button>
                  {selectedReference && (
                    <span className="font-mono text-[11px] text-slate-400">
                      Case: {selectedReference.caseNumber}
                    </span>
                  )}
                </div>
              </label>
              <select
                value={referenceEvidenceId}
                onChange={(e) => setReferenceEvidenceId(e.target.value)}
                disabled={loadingEvidence}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select Reference Exemplar --</option>
                {evidenceList.map((e) => (
                  <option key={e.id} value={e.id}>
                    [{e.evidenceNumber}] {e.name || e.originalFileName} ({e.caseNumber})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 flex items-center gap-3 text-xs text-slate-400">
              <Info className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>
                Single audit mode inspects all faces in the selected evidence, measures inter-pupillary distance, detects 5 landmarks, and calculates sharpness and illumination uniformity.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Visualizer Canvas & Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Workspace Tabs & View Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('visualizer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'visualizer'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="h-3.5 w-3.5 text-cyan-400" />
                <span>Visualizer</span>
              </button>
              <button
                onClick={() => setActiveTab('quality')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'quality'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Quality Audit</span>
              </button>
              <button
                onClick={() => setActiveTab('methodology')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'methodology'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 text-blue-400" />
                <span>Methodology & Caveats</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'history'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="h-3.5 w-3.5 text-purple-400" />
                <span>Analysis History ({analysisHistory.length})</span>
              </button>
            </div>

            {/* View Mode Switcher (Visible in visualizer tab) */}
            {activeTab === 'visualizer' && (
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setViewMode('annotated')}
                  disabled={!annotatedVisualizationUrl}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'annotated'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  Annotated
                </button>
                {analysisMode === 'comparison' && (
                  <button
                    onClick={() => setViewMode('dual')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      viewMode === 'dual' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Dual Master
                  </button>
                )}
                <button
                  onClick={() => setViewMode('probe')}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'probe' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Probe
                </button>
                {analysisMode === 'comparison' && (
                  <button
                    onClick={() => setViewMode('reference')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      viewMode === 'reference' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Reference
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TAB 1: VISUALIZER */}
          {activeTab === 'visualizer' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanFace className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    {viewMode === 'annotated' && (annotatedVisualizationUrl ? 'Annotated Face Detection & Landmark Overlay' : 'Awaiting Analysis Execution')}
                    {viewMode === 'dual' && 'Dual Master Working Copies (Side-by-Side)'}
                    {viewMode === 'probe' && `Probe Evidence: ${selectedProbe?.name || 'Artifact'}`}
                    {viewMode === 'reference' && `Reference Exemplar: ${selectedReference?.name || 'Artifact'}`}
                  </span>
                </div>

                {annotatedVisualizationUrl && (
                  <button
                    onClick={() => {
                      const id = comparisonResult?.id || singleDetectionResult?.id;
                      if (id) downloadFaceVisualization(id);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition-all"
                  >
                    <Download className="h-3 w-3 text-cyan-400" />
                    <span>Export Derived Canvas</span>
                  </button>
                )}
              </div>

              {/* Viewport Display */}
              <div className="relative rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center min-h-[460px] overflow-hidden">
                {isProcessing || isDetecting ? (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
                    <p className="text-sm font-semibold text-slate-200">Executing Neural Face Pipeline...</p>
                    <p className="text-xs text-slate-400 font-mono">Running YuNet face localization and SFace 128-d canonical embedding extraction.</p>
                  </div>
                ) : viewMode === 'annotated' && annotatedVisualizationUrl ? (
                  <img
                    src={annotatedVisualizationUrl}
                    alt="Annotated Facial Visualization"
                    className="max-h-[560px] w-auto object-contain"
                  />
                ) : viewMode === 'dual' && analysisMode === 'comparison' ? (
                  <div className="grid grid-cols-2 gap-2 p-2 w-full h-full">
                    <div className="flex flex-col items-center space-y-1">
                      <span className="text-[10px] font-mono font-semibold text-cyan-400 uppercase">Probe Questioned</span>
                      {probePreviewUrl ? (
                        <img src={probePreviewUrl} alt="Probe" className="max-h-[440px] w-auto object-contain rounded border border-slate-800" />
                      ) : (
                        <div className="h-64 flex items-center justify-center text-xs text-slate-500">No probe preview</div>
                      )}
                    </div>
                    <div className="flex flex-col items-center space-y-1">
                      <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase">Reference Exemplar</span>
                      {referencePreviewUrl ? (
                        <img src={referencePreviewUrl} alt="Reference" className="max-h-[440px] w-auto object-contain rounded border border-slate-800" />
                      ) : (
                        <div className="h-64 flex items-center justify-center text-xs text-slate-500">No reference preview</div>
                      )}
                    </div>
                  </div>
                ) : viewMode === 'probe' && probePreviewUrl ? (
                  <img src={probePreviewUrl} alt="Probe Frame" className="max-h-[520px] w-auto object-contain" />
                ) : viewMode === 'reference' && referencePreviewUrl ? (
                  <img src={referencePreviewUrl} alt="Reference Frame" className="max-h-[520px] w-auto object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8 text-center text-slate-500">
                    <ScanFace className="h-12 w-12 text-slate-700" />
                    <p className="text-xs">No analysis visualization rendered yet.</p>
                    <p className="text-[11px] font-mono text-slate-600">Select evidence items above and click Execute to start face analysis.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: QUALITY AUDIT */}
          {activeTab === 'quality' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Probe Quality Report */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Probe Evidence Quality
                    </span>
                    {getQualityTierBadge(comparisonResult?.probeEvidence?.quality?.qualityTier || singleDetectionResult?.faces[0]?.quality?.qualityTier)}
                  </div>

                  {(() => {
                    const q: FaceQualityReport | undefined = comparisonResult?.probeEvidence?.quality || singleDetectionResult?.faces[0]?.quality;
                    if (!q) {
                      return <p className="text-xs text-slate-500 py-4">Execute analysis to evaluate probe face image quality metrics.</p>;
                    }
                    return (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Inter-Pupillary Distance (IPD)</span>
                            <span className={`text-base font-bold font-mono ${q.interPupillaryDistance >= 60 ? 'text-emerald-400' : q.interPupillaryDistance >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {q.interPupillaryDistance} px
                            </span>
                            <span className="text-[10px] text-slate-500 block">NIST Minimum: 60 px</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Facial Sharpness (Laplacian)</span>
                            <span className="text-base font-bold font-mono text-slate-200">
                              {q.laplacianVariance.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">Clarity Score: {q.clarityScore}%</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Lighting Asymmetry</span>
                            <span className={`text-base font-bold font-mono ${q.lightingAsymmetry > 0.20 ? 'text-rose-400' : 'text-slate-200'}`}>
                              {(q.lightingAsymmetry * 100).toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-slate-500 block">Hemispheric luminance delta</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Head Roll Angle</span>
                            <span className="text-base font-bold font-mono text-slate-200">
                              {q.rollAngleDegrees}°
                            </span>
                            <span className="text-[10px] text-slate-500 block">Eye-line tilt angle</span>
                          </div>
                        </div>

                        {q.warnings && q.warnings.length > 0 && (
                          <div className="rounded bg-amber-950/20 p-2.5 border border-amber-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-amber-300 font-semibold block">Quality Warnings:</span>
                            <ul className="list-disc list-inside text-[11px] text-amber-200/80 space-y-0.5">
                              {q.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Reference Quality Report */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Reference Evidence Quality
                    </span>
                    {getQualityTierBadge(comparisonResult?.referenceEvidence?.quality?.qualityTier)}
                  </div>

                  {(() => {
                    const q: FaceQualityReport | undefined = comparisonResult?.referenceEvidence?.quality;
                    if (!q) {
                      return <p className="text-xs text-slate-500 py-4">Execute pairwise comparison to evaluate reference quality metrics.</p>;
                    }
                    return (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Inter-Pupillary Distance (IPD)</span>
                            <span className={`text-base font-bold font-mono ${q.interPupillaryDistance >= 60 ? 'text-emerald-400' : q.interPupillaryDistance >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {q.interPupillaryDistance} px
                            </span>
                            <span className="text-[10px] text-slate-500 block">NIST Minimum: 60 px</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Facial Sharpness (Laplacian)</span>
                            <span className="text-base font-bold font-mono text-slate-200">
                              {q.laplacianVariance.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">Clarity Score: {q.clarityScore}%</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Lighting Asymmetry</span>
                            <span className={`text-base font-bold font-mono ${q.lightingAsymmetry > 0.20 ? 'text-rose-400' : 'text-slate-200'}`}>
                              {(q.lightingAsymmetry * 100).toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-slate-500 block">Hemispheric luminance delta</span>
                          </div>
                          <div className="rounded bg-slate-950 p-2.5 border border-slate-800">
                            <span className="text-slate-400 text-[10px] uppercase font-mono block">Head Roll Angle</span>
                            <span className="text-base font-bold font-mono text-slate-200">
                              {q.rollAngleDegrees}°
                            </span>
                            <span className="text-[10px] text-slate-500 block">Eye-line tilt angle</span>
                          </div>
                        </div>

                        {q.warnings && q.warnings.length > 0 && (
                          <div className="rounded bg-amber-950/20 p-2.5 border border-amber-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-amber-300 font-semibold block">Quality Warnings:</span>
                            <ul className="list-disc list-inside text-[11px] text-amber-200/80 space-y-0.5">
                              {q.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: METHODOLOGY & CAVEATS */}
          {activeTab === 'methodology' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4 text-xs">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Scientific Methodology & Algorithmic Specifications</h3>
                <p className="text-slate-400 text-[11px]">Open-source neural architectures, mathematical distance metrics, and ethical forensic standards.</p>
              </div>

              {methodologyInfo ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2">
                      <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase block">Face Detection Model</span>
                      <p className="font-semibold text-slate-200">{methodologyInfo.methodology.detectorModel.name}</p>
                      <p className="text-slate-400 text-[11px]">{methodologyInfo.methodology.detectorModel.architecture}</p>
                      <div className="text-[10px] font-mono text-slate-500">
                        License: <span className="text-slate-300">{methodologyInfo.methodology.detectorModel.license}</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block">Face Representation Model</span>
                      <p className="font-semibold text-slate-200">{methodologyInfo.methodology.comparisonModel.name}</p>
                      <p className="text-slate-400 text-[11px]">{methodologyInfo.methodology.comparisonModel.architecture}</p>
                      <div className="text-[10px] font-mono text-slate-500">
                        License: <span className="text-slate-300">{methodologyInfo.methodology.comparisonModel.license}</span> &bull; Dim: 128-d
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Scientific & Forensic Limitations:</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                      {methodologyInfo.methodology.scientificLimitations.map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Biometric Data Retention Policy:</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {methodologyInfo.methodology.retentionPolicy}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Loading methodology specifications...</p>
              )}
            </div>
          )}

          {/* TAB 4: ANALYSIS HISTORY */}
          {activeTab === 'history' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Saved Facial Analysis History</h3>
                  <p className="text-[11px] text-slate-400">Past comparisons and detection audits associated with selected evidence.</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                  {analysisHistory.length} Records
                </span>
              </div>

              {analysisHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No prior facial analysis records found for this evidence artifact.</p>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto">
                  {analysisHistory.map((item) => (
                    <div
                      key={item.id || item.analysisId}
                      className="rounded-lg bg-slate-950 p-3 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400 font-semibold">{item.analysisId || item.id}</span>
                          <span className="text-slate-400">&bull;</span>
                          <span className="text-slate-300 font-medium">{item.analysisType}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {item.timestamp ? new Date(item.timestamp).toUTCString() : 'Historical Run'} &bull; Analyst: {item.analyst?.name || 'Authorized Examiner'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.metrics?.correspondenceTier && getCorrespondenceBadge(item.metrics.correspondenceTier)}
                        <button
                          onClick={() => handleLoadHistoryRecord(item)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Metrics & Telemetry Card */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Exploratory Metrics</h3>
                  <p className="text-[11px] text-slate-400 font-mono">SFace Latent Space (128-d)</p>
                </div>
              </div>
              {comparisonResult?.metrics?.correspondenceTier && (
                getCorrespondenceBadge(comparisonResult.metrics.correspondenceTier)
              )}
            </div>

            {/* Metric Displays */}
            {comparisonResult ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono">Cosine Similarity:</span>
                    <span className="font-mono text-cyan-400 font-bold text-sm">
                      {comparisonResult.metrics.cosineSimilarity > 0 ? `+${comparisonResult.metrics.cosineSimilarity.toFixed(4)}` : comparisonResult.metrics.cosineSimilarity.toFixed(4)}
                    </span>
                  </div>
                  {/* Visual Meter */}
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        comparisonResult.metrics.cosineSimilarity >= 0.55
                          ? 'bg-emerald-500'
                          : comparisonResult.metrics.cosineSimilarity >= 0.36
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, (comparisonResult.metrics.cosineSimilarity + 1) * 50))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>-1.0 (Divergent)</span>
                    <span>0.0</span>
                    <span>+1.0 (Identical Vector)</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono">L2 Euclidean Distance:</span>
                    <span className="font-mono text-slate-200 font-bold">{comparisonResult.metrics.l2Distance.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono">Correspondence Index:</span>
                    <span className="font-mono text-cyan-400 font-bold">{comparisonResult.metrics.correspondenceIndex}%</span>
                  </div>
                  {(comparisonResult.probeEvidence.faceConfidence !== undefined || comparisonResult.referenceEvidence.faceConfidence !== undefined) && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-mono">YuNet Face Conf (Probe / Ref):</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {comparisonResult.probeEvidence.faceConfidence !== undefined
                          ? `${(comparisonResult.probeEvidence.faceConfidence * 100).toFixed(1)}%`
                          : 'N/A'}{' '}
                        /{' '}
                        {comparisonResult.referenceEvidence.faceConfidence !== undefined
                          ? `${(comparisonResult.referenceEvidence.faceConfidence * 100).toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono">Evaluator Baseline:</span>
                    <span className="font-mono text-slate-400">Cosine &ge; 0.363 / L2 &le; 1.163</span>
                  </div>
                </div>

                {/* Interpretation */}
                <div className="space-y-1.5 text-xs">
                  <span className="text-slate-400 uppercase text-[10px] font-mono tracking-wider">
                    Diagnostic Interpretation:
                  </span>
                  <p className="text-slate-300 leading-relaxed bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-[11px]">
                    {comparisonResult.metrics.interpretation}
                  </p>
                </div>
              </div>
            ) : singleDetectionResult ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Detected Human Faces:</span>
                    <span className="font-mono text-cyan-400 font-bold text-sm">{singleDetectionResult.detectedFacesCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Primary Detection Confidence:</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">
                      {singleDetectionResult.faces[0]?.confidence !== undefined
                        ? `${(singleDetectionResult.faces[0].confidence * 100).toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Primary Face BBox:</span>
                    <span className="font-mono text-slate-300">
                      {singleDetectionResult.faces[0]?.box ? `${singleDetectionResult.faces[0].box.width}x${singleDetectionResult.faces[0].box.height} px` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Detector Engine:</span>
                    <span className="font-mono text-slate-300">{singleDetectionResult.faces[0]?.detectorEngine || 'YuNet CNN'}</span>
                  </div>
                </div>
                {singleDetectionResult.faces.length > 0 && (
                  <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1.5 text-[11px] font-mono">
                    <span className="text-[10px] uppercase text-slate-400 block">Per-Face Detection Scores:</span>
                    {singleDetectionResult.faces.map((f) => (
                      <div key={f.faceIndex} className="flex justify-between items-center text-slate-300">
                        <span>Face #{f.faceIndex + 1} ({f.box.width}x{f.box.height})</span>
                        <span className="text-emerald-400 font-bold">
                          {(f.confidence * 100).toFixed(1)}% &bull; Clarity {f.quality.clarityScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500 space-y-1">
                <p>Awaiting execution of facial analysis.</p>
                <p className="text-[11px] text-slate-600">Select evidence items and execute 1:1 comparison to compute vector metrics.</p>
              </div>
            )}

            {/* Evidence Verification Hashes */}
            <div className="pt-3 border-t border-slate-800 space-y-2 text-[11px] font-mono">
              <span className="text-slate-400 uppercase text-[10px] block">Forensic Integrity Audit:</span>
              <div className="space-y-1 text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800/80">
                <div className="truncate">
                  <span className="text-cyan-400">Probe SHA-256: </span>
                  {selectedProbe?.sha256Hash || 'N/A'}
                </div>
                {analysisMode === 'comparison' && selectedReference && (
                  <div className="truncate">
                    <span className="text-emerald-400">Ref SHA-256: </span>
                    {selectedReference.sha256Hash || 'N/A'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
