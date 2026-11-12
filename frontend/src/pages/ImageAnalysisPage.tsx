import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  RefreshCw, 
  Sliders, 
  Download, 
  AlertTriangle, 
  Info, 
  Camera, 
  Clock, 
  MapPin, 
  Database,
  History,
  FileText,
  Lock,
  Columns,
  Eye
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { 
  extractImageMetadataApi, 
  runErrorLevelAnalysisApi, 
  fetchDerivedImageBlobUrlApi,
  downloadDerivedImageApi,
  fetchImageAnalysisHistoryApi,
  type ImageMetadataReport,
  type ElaAnalysisReport
} from '../api/imageForensicsApi';
import { 
  fetchEvidenceApi, 
  fetchEvidencePreviewUrlApi 
} from '../api/evidenceApi';
import type { EvidenceItem } from '../types';

export const ImageAnalysisPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlEvidenceId = searchParams.get('evidenceId');

  // Artifact selection state
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>(urlEvidenceId || '');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);

  // Image blobs
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [derivedImageUrl, setDerivedImageUrl] = useState<string | null>(null);

  // Analysis results & metadata
  const [elaReport, setElaReport] = useState<ElaAnalysisReport | null>(null);
  const [metadataReport, setMetadataReport] = useState<ImageMetadataReport | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<ElaAnalysisReport[]>([]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ELA controls
  const [quality, setQuality] = useState<number>(90);
  const [scale, setScale] = useState<number>(15);
  const [viewMode, setViewMode] = useState<'side_by_side' | 'ela_only' | 'original_only' | 'overlay'>('side_by_side');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(50);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'viewer' | 'metadata' | 'history'>('viewer');

  // Load available evidence images
  useEffect(() => {
    setLoadingEvidence(true);
    fetchEvidenceApi({ limit: 100 })
      .then((res) => {
        const typeRank = (t?: string) => (t === 'image' ? 0 : t === 'face' ? 1 : 2);
        const imageItems = (res.evidence || [])
          .filter(
            (e) =>
              e.type === 'image' ||
              e.detectedMediaType?.startsWith('image/') ||
              ['jpg', 'jpeg', 'png', 'tiff', 'webp'].includes(e.fileFormat?.toLowerCase() || '')
          )
          .sort((a, b) => typeRank(a.type) - typeRank(b.type));
        setEvidenceList(imageItems);

        // Auto-select from URL or first scene image
        if (urlEvidenceId) {
          const match = imageItems.find((e) => e.id === urlEvidenceId || e.evidenceNumber === urlEvidenceId);
          if (match) {
            setSelectedEvidenceId(match.id);
            setSelectedEvidence(match);
          }
        } else if (imageItems.length > 0 && !selectedEvidenceId) {
          const preferred = imageItems.find((e) => e.originalFileName?.includes('surveillance_scene')) || imageItems[0];
          setSelectedEvidenceId(preferred.id);
          setSelectedEvidence(preferred);
        }
      })
      .catch((err) => {
        console.error('Failed to load evidence items:', err);
      })
      .finally(() => setLoadingEvidence(false));
  }, [urlEvidenceId]);

  // Load original evidence preview blob & history when selectedEvidenceId changes
  useEffect(() => {
    if (!selectedEvidenceId) return;

    const currentItem = evidenceList.find((e) => e.id === selectedEvidenceId);
    if (currentItem) {
      setSelectedEvidence(currentItem);
    }

    // Reset derived view on switch
    setDerivedImageUrl(null);
    setElaReport(null);
    setError(null);

    // Fetch original image preview blob
    fetchEvidencePreviewUrlApi(selectedEvidenceId)
      .then((url) => setOriginalImageUrl(url))
      .catch((err) => console.warn('Failed to load preview blob:', err));

    // Fetch analysis history
    fetchImageAnalysisHistoryApi(selectedEvidenceId)
      .then((history) => setAnalysisHistory(history || []))
      .catch((err) => console.warn('Failed to load analysis history:', err));

    // Automatically extract metadata on selection
    extractImageMetadataApi(selectedEvidenceId)
      .then((report) => setMetadataReport(report))
      .catch((err) => console.warn('Initial metadata extraction:', err));
  }, [selectedEvidenceId, evidenceList]);

  // Run Error Level Analysis
  const handleRunEla = async () => {
    if (!selectedEvidenceId) {
      setError('Please select an evidence artifact to analyze.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const report = await runErrorLevelAnalysisApi({
        evidenceId: selectedEvidenceId,
        quality,
        scale,
        saveResult: true,
      });

      setElaReport(report);
      if (report.metadata) {
        setMetadataReport(report.metadata);
      }

      // Fetch derived image blob URL
      const derivedBlob = await fetchDerivedImageBlobUrlApi(report.analysisId);
      setDerivedImageUrl(derivedBlob);

      // Refresh history list
      fetchImageAnalysisHistoryApi(selectedEvidenceId)
        .then((history) => setAnalysisHistory(history || []))
        .catch((err) => console.warn('Failed to update history:', err));
    } catch (err: any) {
      console.error('ELA analysis failed:', err);
      setError(err.response?.data?.message || err.message || 'Error Level Analysis failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle derived image download
  const handleDownloadDerived = async () => {
    if (!elaReport) return;
    try {
      await downloadDerivedImageApi(
        elaReport.analysisId,
        `ela_${selectedEvidence?.evidenceNumber || 'evidence'}_q${quality}_s${scale}.jpg`
      );
    } catch (err: any) {
      alert(`Download failed: ${err.response?.data?.message || err.message}`);
    }
  };

  // Load a prior run from history
  const handleLoadPriorRun = async (run: ElaAnalysisReport) => {
    setElaReport(run);
    setQuality(run.parameters?.quality || 90);
    setScale(run.parameters?.scale || 15);
    if (run.metadata) {
      setMetadataReport(run.metadata);
    }
    setActiveTab('viewer');
    try {
      const blob = await fetchDerivedImageBlobUrlApi(run.analysisId);
      setDerivedImageUrl(blob);
    } catch (err) {
      console.warn('Failed to load prior derived blob:', err);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'AI Forensic Modules' },
          { label: 'Image Forensics & ELA' },
        ]}
        title="Image Forensics & Error Level Analysis (ELA)"
        description="JPEG recompression difference analysis, EXIF metadata extraction, camera telemetry, and GPS provenance inspection."
        badge={
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Zero-Modification Working Copy
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunEla}
              disabled={isProcessing || !selectedEvidenceId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Recompressing Image Copy...' : 'Run ELA Diagnostic'}</span>
            </button>
          </div>
        }
      />

      {/* Artifact Selector Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Target Evidence Artifact:</span>
            <select
              value={selectedEvidenceId}
              onChange={(e) => setSelectedEvidenceId(e.target.value)}
              disabled={loadingEvidence}
              className="rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none min-w-[280px]"
            >
              {loadingEvidence ? (
                <option value="">Loading image vault records...</option>
              ) : evidenceList.length === 0 ? (
                <option value="">No image evidence artifacts discovered</option>
              ) : (
                evidenceList.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.evidenceNumber} - {ev.name} ({ev.fileFormat})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {selectedEvidence && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span>Case: <span className="text-cyan-400">{selectedEvidence.caseNumber}</span></span>
            <span>&bull;</span>
            <span>SHA-256: <span className="text-slate-300">{selectedEvidence.sha256Hash?.substring(0, 10)}...</span></span>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRunEla}
            className="rounded bg-rose-900/60 hover:bg-rose-900 px-3 py-1 font-semibold text-rose-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Forensic Disclaimer Notice */}
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-xs text-amber-300 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-slate-300">
          <p className="font-semibold text-amber-300">Forensic Notice Regarding Error Level Analysis (ELA)</p>
          <p className="leading-relaxed text-[11px]">
            Error Level Analysis highlights compression rate variance across an image matrix. Natural photographic textures,
            high-contrast edges, saturated chromatic areas, and standard multi-generation resaves routinely produce pronounced
            ELA error levels without intentional forgery. <strong>ELA is an exploratory visual diagnostic, not conclusive proof of manipulation.</strong>
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('viewer')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'viewer'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Columns className="h-4 w-4" />
          <span>Interactive Lightbox & ELA</span>
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'metadata'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className="h-4 w-4" />
          <span>EXIF & Metadata Inspector</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'history'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Analysis History ({analysisHistory.length})</span>
        </button>
      </div>

      {/* TAB 1: Viewer & ELA Workspace */}
      {activeTab === 'viewer' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              {/* Quality Slider */}
              <div className="flex items-center gap-2 text-xs">
                <Sliders className="h-4 w-4 text-cyan-400" />
                <span className="text-slate-300">Recompression Quality:</span>
                <input
                  type="range"
                  min="60"
                  max="98"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-28 accent-cyan-400 cursor-pointer"
                />
                <span className="font-mono text-cyan-400 font-bold">{quality}%</span>
              </div>

              {/* Scale Multiplier Slider */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-300">Contrast Scale Multiplier:</span>
                <input
                  type="range"
                  min="5"
                  max="35"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-28 accent-cyan-400 cursor-pointer"
                />
                <span className="font-mono text-cyan-400 font-bold">{scale}x</span>
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">View Layout:</span>
              <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700/80 p-0.5 text-xs">
                <button
                  onClick={() => setViewMode('side_by_side')}
                  className={`px-2.5 py-1 rounded ${viewMode === 'side_by_side' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                >
                  Side by Side
                </button>
                <button
                  onClick={() => setViewMode('overlay')}
                  className={`px-2.5 py-1 rounded ${viewMode === 'overlay' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                >
                  Blend Overlay
                </button>
                <button
                  onClick={() => setViewMode('ela_only')}
                  className={`px-2.5 py-1 rounded ${viewMode === 'ela_only' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                >
                  ELA Only
                </button>
                <button
                  onClick={() => setViewMode('original_only')}
                  className={`px-2.5 py-1 rounded ${viewMode === 'original_only' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
                >
                  Original
                </button>
              </div>
            </div>
          </div>

          {/* Overlay Blend Slider if in overlay mode */}
          {viewMode === 'overlay' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-3 flex items-center justify-center gap-3 text-xs">
              <span className="text-slate-400">Original</span>
              <input
                type="range"
                min="0"
                max="100"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-64 accent-cyan-400 cursor-pointer"
              />
              <span className="text-cyan-400 font-bold">ELA ({overlayOpacity}%)</span>
            </div>
          )}

          {/* Comparison Lightbox Container */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
            {viewMode === 'side_by_side' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Original Evidence */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Original Evidence Image</span>
                    <span className="font-mono text-slate-500 text-[10px]">Uncompressed Master</span>
                  </div>
                  <div className="h-96 w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
                    {originalImageUrl ? (
                      <img
                        src={originalImageUrl}
                        alt="Original"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-slate-600 font-mono text-xs">Select evidence to preview</span>
                    )}
                  </div>
                </div>

                {/* Right: ELA Recompression Result */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300">
                      ELA Visualization (Q={quality}, S={scale}x)
                    </span>
                    {derivedImageUrl && (
                      <button
                        onClick={handleDownloadDerived}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download Derived Image</span>
                      </button>
                    )}
                  </div>
                  <div className="h-96 w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
                    {isProcessing ? (
                      <div className="flex flex-col items-center gap-2 text-cyan-400">
                        <RefreshCw className="h-8 w-8 animate-spin" />
                        <span className="text-xs font-mono">Executing JPEG Recompression Comparison...</span>
                      </div>
                    ) : derivedImageUrl ? (
                      <img
                        src={derivedImageUrl}
                        alt="Derived ELA"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-600 text-center p-6">
                        <Eye className="h-8 w-8" />
                        <span className="text-xs font-mono">
                          Click 'Run ELA Diagnostic' to compute compression variance
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : viewMode === 'overlay' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Interactive Blend Overlay ({overlayOpacity}% ELA)
                  </span>
                  {derivedImageUrl && (
                    <button
                      onClick={handleDownloadDerived}
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download ELA Image</span>
                    </button>
                  )}
                </div>
                <div className="h-[480px] w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden relative flex items-center justify-center">
                  {originalImageUrl && (
                    <img
                      src={originalImageUrl}
                      alt="Original"
                      className="max-h-full max-w-full object-contain absolute"
                    />
                  )}
                  {derivedImageUrl && (
                    <img
                      src={derivedImageUrl}
                      alt="Derived ELA"
                      style={{ opacity: overlayOpacity / 100 }}
                      className="max-h-full max-w-full object-contain absolute mix-blend-screen transition-opacity"
                    />
                  )}
                </div>
              </div>
            ) : viewMode === 'ela_only' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    Error Level Analysis (Q={quality}, S={scale}x)
                  </span>
                  {derivedImageUrl && (
                    <button
                      onClick={handleDownloadDerived}
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download ELA Image</span>
                    </button>
                  )}
                </div>
                <div className="h-[480px] w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                  {derivedImageUrl ? (
                    <img
                      src={derivedImageUrl}
                      alt="Derived ELA"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-slate-600 font-mono text-xs">No ELA generated yet</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Original Evidence Master</span>
                </div>
                <div className="h-[480px] w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                  {originalImageUrl ? (
                    <img
                      src={originalImageUrl}
                      alt="Original"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-slate-600 font-mono text-xs">No image loaded</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Objective Statistical Metrics Card */}
          {elaReport && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Sliders className="h-4 w-4 text-cyan-400" />
                <span>Objective Recompression Error Metrics</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Mean Pixel Error</span>
                  <span className="text-base font-bold text-cyan-300">{elaReport.statistics.meanError}</span>
                  <span className="text-[10px] text-slate-500 block">Average 8-bit difference</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Peak Error Value</span>
                  <span className="text-base font-bold text-amber-300">{elaReport.statistics.peakError} / 255</span>
                  <span className="text-[10px] text-slate-500 block">Maximum channel divergence</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Standard Deviation</span>
                  <span className="text-base font-bold text-slate-200">{elaReport.statistics.stdDevError}</span>
                  <span className="text-[10px] text-slate-500 block">Variance dispersion</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Analyzed Dimensions</span>
                  <span className="text-base font-bold text-slate-200">{elaReport.statistics.dimensions}</span>
                  <span className="text-[10px] text-slate-500 block">{elaReport.statistics.totalPixels.toLocaleString()} total pixels</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row justify-between gap-2">
                <span>Diagnostic Engine: <span className="text-slate-200 font-mono">{elaReport.modelEngine}</span></span>
                <span>Examiner: <span className="text-slate-200">{elaReport.performedBy}</span></span>
                <span>Derived Storage Reference: <span className="text-cyan-400 font-mono">{elaReport.derivedStorageRef}</span></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EXIF & Metadata Inspector */}
      {activeTab === 'metadata' && (
        <div className="space-y-6">
          {metadataReport ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Camera & Hardware Telemetry */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Camera className="h-4 w-4 text-cyan-400" />
                  <span>Hardware & Optical Telemetry</span>
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Camera Make:</span>
                    <span className="font-semibold text-slate-200">{metadataReport.camera.make || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Camera Model:</span>
                    <span className="font-semibold text-slate-200">{metadataReport.camera.model || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Firmware / Software:</span>
                    <span className="font-mono text-slate-300">{metadataReport.camera.software || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Lens Specification:</span>
                    <span className="text-slate-200">{metadataReport.camera.lensModel || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Focal Length:</span>
                    <span className="font-mono text-cyan-300">
                      {metadataReport.camera.focalLength ? `${metadataReport.camera.focalLength} mm` : 'Not Recorded'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">F-Number / Aperture:</span>
                    <span className="font-mono text-cyan-300">
                      {metadataReport.camera.fNumber ? `f/${metadataReport.camera.fNumber}` : 'Not Recorded'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">Exposure Shutter Speed:</span>
                    <span className="font-mono text-slate-300">{metadataReport.camera.exposureTime || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/50">
                    <span className="text-slate-400">ISO Sensitivity:</span>
                    <span className="font-mono text-slate-300">{metadataReport.camera.isoSpeedRatings || 'Not Recorded'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">EXIF Orientation:</span>
                    <span className="font-mono text-slate-300">{metadataReport.orientation.description}</span>
                  </div>
                </div>
              </div>

              {/* Timestamps & Geolocation */}
              <div className="space-y-6">
                {/* Timestamps */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span>Embedded Timestamps</span>
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800/50">
                      <span className="text-slate-400">DateTime (File Modification):</span>
                      <span className="font-mono text-slate-200">{metadataReport.timestamps.dateTime || 'Not Recorded'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/50">
                      <span className="text-slate-400">DateTimeOriginal (Shutter):</span>
                      <span className="font-mono text-cyan-300 font-semibold">{metadataReport.timestamps.dateTimeOriginal || 'Not Recorded'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/50">
                      <span className="text-slate-400">DateTimeDigitized:</span>
                      <span className="font-mono text-slate-200">{metadataReport.timestamps.dateTimeDigitized || 'Not Recorded'}</span>
                    </div>
                  </div>

                  {/* Warning on Trustworthiness */}
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300/90 leading-relaxed">
                    <p className="font-semibold text-amber-300 mb-0.5">Timestamp Provenance Warning</p>
                    {metadataReport.timestampTrustworthinessNotice}
                  </div>
                </div>

                {/* GPS Coordinates */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <MapPin className="h-4 w-4 text-cyan-400" />
                    <span>GPS Geolocation Provenance</span>
                  </h4>

                  {metadataReport.gps.hasGpsData ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-800/50">
                        <span className="text-slate-400">Latitude:</span>
                        <span className="font-mono text-emerald-400 font-bold">{metadataReport.gps.latitude}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/50">
                        <span className="text-slate-400">Longitude:</span>
                        <span className="font-mono text-emerald-400 font-bold">{metadataReport.gps.longitude}</span>
                      </div>
                      {metadataReport.gps.altitudeMeters !== undefined && (
                        <div className="flex justify-between py-1 border-b border-slate-800/50">
                          <span className="text-slate-400">Altitude:</span>
                          <span className="font-mono text-slate-200">{metadataReport.gps.altitudeMeters} meters</span>
                        </div>
                      )}
                      {metadataReport.gps.gpsTimestamp && (
                        <div className="flex justify-between py-1">
                          <span className="text-slate-400">Satellite Timestamp:</span>
                          <span className="font-mono text-slate-300">{metadataReport.gps.gpsTimestamp}</span>
                        </div>
                      )}
                      <div className="pt-2">
                        <a
                          href={`https://www.google.com/maps?q=${metadataReport.gps.latitude},${metadataReport.gps.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs"
                        >
                          <span>Open in Satellite Map Coordinates &rarr;</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-2">
                      No GPS telemetry or coordinate IFD embedded in artifact headers.
                    </p>
                  )}
                </div>
              </div>

              {/* Missing Metadata Fields Audit */}
              <div className="md:col-span-2 rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span>Missing Standard Forensic Metadata Fields ({metadataReport.missingFields.length})</span>
                </h4>
                <p className="text-xs text-slate-400">
                  The following standard photographic attributes were absent from the container headers (indicating potential metadata stripping or synthetic origin):
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {metadataReport.missingFields.map((field) => (
                    <span
                      key={field}
                      className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-900 border border-slate-800 text-slate-400"
                    >
                      &times; {field}
                    </span>
                  ))}
                </div>
              </div>

              {/* Raw EXIF Data Dictionary */}
              {metadataReport.hasExif && Object.keys(metadataReport.rawExif).length > 0 && (
                <div className="md:col-span-2 rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <FileText className="h-4 w-4 text-cyan-400" />
                    <span>Raw Sanitized EXIF Key-Value Dictionary</span>
                  </h4>
                  <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-300 border border-slate-800 space-y-1">
                    {Object.entries(metadataReport.rawExif).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-cyan-400 shrink-0">{k}:</span>
                        <span className="text-slate-300 truncate select-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No metadata loaded. Select an evidence artifact to inspect EXIF headers.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Analysis History */}
      {activeTab === 'history' && (
        <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="h-4 w-4 text-cyan-400" />
              <span>Prior Image Forensic Runs for {selectedEvidence?.evidenceNumber || 'Artifact'}</span>
            </h4>
          </div>

          {analysisHistory.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">
              No previous analysis sessions recorded for this artifact. Run an ELA diagnostic to establish a baseline.
            </p>
          ) : (
            <div className="space-y-3">
              {analysisHistory.map((run) => (
                <div
                  key={run.id || run.analysisId}
                  className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{run.analysisType}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        Q={run.parameters?.quality || 90} &bull; S={run.parameters?.scale || 15}x
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <span>Mean Error: <strong className="text-cyan-300">{run.statistics?.meanError}</strong></span>
                      <span>Peak: <strong className="text-amber-300">{run.statistics?.peakError}</strong></span>
                      <span>Std Dev: <strong className="text-slate-200">{run.statistics?.stdDevError}</strong></span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {run.timestamp ? run.timestamp.substring(0, 19).replace('T', ' ') : 'Recent'} &bull; By {run.performedBy}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleLoadPriorRun(run)}
                      className="rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white px-3 py-1.5 text-xs font-semibold border border-slate-700 transition-colors"
                    >
                      Load ELA Visualization
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
