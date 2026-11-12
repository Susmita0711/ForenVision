import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Target, 
  Cpu, 
  Sliders, 
  Download, 
  AlertTriangle, 
  History, 
  ShieldCheck, 
  Eye, 
  Search, 
  Box, 
  Tag, 
  Database
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { 
  getModelInfoApi,
  runObjectDetectionApi,
  getDetectionVisualizationBlobApi,
  downloadDetectionVisualization,
  getDetectionHistoryApi,
  type DetectionResult,
  type ModelInfo
} from '../api/objectDetectionApi';
import { fetchEvidenceApi, fetchEvidencePreviewUrlApi } from '../api/evidenceApi';
import type { EvidenceItem } from '../types';

export const ObjectDetectionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlEvidenceId = searchParams.get('evidenceId');

  // Evidence Selection
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>(urlEvidenceId || '');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Model Specifications
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('combined');
  const [classSearchQuery, setClassSearchQuery] = useState('');

  // Detection Parameters
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(30); // 30%
  const [nmsThreshold, setNmsThreshold] = useState<number>(40); // 40%

  // Image Blobs
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState<string | null>(null);

  // Detection Results & History
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [detectionHistory, setDetectionHistory] = useState<DetectionResult[]>([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');

  // UI State
  const [isInferencing, setIsInferencing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detections' | 'model' | 'history'>('detections');
  const [viewMode, setViewMode] = useState<'annotated' | 'sideBySide' | 'original'>('annotated');

  // Load Model Specs on Mount or when Selected Model Changes
  useEffect(() => {
    const queryModel = selectedModelId === 'forensic-gun-yolov8' ? 'forensic-gun-yolov8' : undefined;
    getModelInfoApi(queryModel)
      .then((info) => {
        setModelInfo(info);
        // Fallback cleanly to yolov4-tiny if trained gun model isn't available
        const gunAvail = info.availableModels?.find((m) => m.modelId === 'forensic-gun-yolov8')?.available;
        if (gunAvail === false && selectedModelId !== 'yolov4-tiny') {
          setSelectedModelId('yolov4-tiny');
        }
      })
      .catch((err) => console.warn('Could not fetch model info:', err));
  }, [selectedModelId]);

  // Load Photographic Evidence Artifacts
  useEffect(() => {
    setLoadingEvidence(true);
    fetchEvidenceApi()
      .then((res) => {
        // Filter for image evidence, prioritizing general scene photos over prints/sketches
        const typeRank = (t?: string) => (t === 'image' ? 0 : t === 'face' ? 1 : 2);
        const imageItems = (res.evidence || [])
          .filter(
            (e) =>
              e.detectedMediaType?.startsWith('image/') ||
              e.type === 'image' ||
              e.name?.match(/\.(jpg|jpeg|png|tiff|bmp)$/i)
          )
          .sort((a, b) => typeRank(a.type) - typeRank(b.type));
        setEvidenceList(imageItems);

        // Preselect URL evidence if provided, or first scene image
        if (urlEvidenceId) {
          const match = imageItems.find((e) => e.id === urlEvidenceId);
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
        setError(`Failed to load evidence artifacts: ${err.message}`);
      })
      .finally(() => setLoadingEvidence(false));
  }, [urlEvidenceId]);

  // Load Evidence Image & Prior History when Selection Changes
  useEffect(() => {
    if (!selectedEvidenceId) return;

    const ev = evidenceList.find((e) => e.id === selectedEvidenceId) || null;
    setSelectedEvidence(ev);
    setDetectionResult(null);
    setAnnotatedImageUrl(null);
    setError(null);

    // Fetch original preview
    fetchEvidencePreviewUrlApi(selectedEvidenceId)
      .then((url) => setOriginalImageUrl(url))
      .catch(() => setOriginalImageUrl(null));

    // Fetch prior detection history
    getDetectionHistoryApi(selectedEvidenceId)
      .then((history) => {
        setDetectionHistory(history);
        if (history.length > 0) {
          // Preload latest run
          const latest = history[0];
          setDetectionResult(latest);
          getDetectionVisualizationBlobApi(latest.id)
            .then((blob) => setAnnotatedImageUrl(URL.createObjectURL(blob)))
            .catch(() => {});
        }
      })
      .catch(() => setDetectionHistory([]));
  }, [selectedEvidenceId, evidenceList]);

  // Execute Neural Network Inference
  const handleRunDetection = async () => {
    if (!selectedEvidenceId) {
      setError('Please select an authorized image evidence artifact.');
      return;
    }

    setIsInferencing(true);
    setError(null);

    try {
      const result = await runObjectDetectionApi({
        evidenceId: selectedEvidenceId,
        confidenceThreshold: confidenceThreshold / 100,
        nmsThreshold: nmsThreshold / 100,
        saveAnalysis: true,
        modelId: selectedModelId,
      });

      setDetectionResult(result);
      setSelectedClassFilter('ALL');

      // Fetch the generated annotated visualization blob
      const blob = await getDetectionVisualizationBlobApi(result.id);
      if (annotatedImageUrl) {
        URL.revokeObjectURL(annotatedImageUrl);
      }
      setAnnotatedImageUrl(URL.createObjectURL(blob));

      // Refresh history list
      const updatedHistory = await getDetectionHistoryApi(selectedEvidenceId);
      setDetectionHistory(updatedHistory);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Inference execution failed.';
      setError(msg);
    } finally {
      setIsInferencing(false);
    }
  };

  // Load a historical analysis record
  const handleLoadHistoryRecord = async (record: DetectionResult) => {
    setDetectionResult(record);
    setSelectedClassFilter('ALL');
    setActiveTab('detections');
    try {
      const blob = await getDetectionVisualizationBlobApi(record.id);
      if (annotatedImageUrl) {
        URL.revokeObjectURL(annotatedImageUrl);
      }
      setAnnotatedImageUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.warn('Could not stream historical visualization:', err);
    }
  };

  // Filtered Detections
  const filteredDetections = (detectionResult?.detectedObjects || []).filter((d) => {
    if (selectedClassFilter === 'ALL') return true;
    return d.className.toLowerCase() === selectedClassFilter.toLowerCase();
  });

  // Filtered Supported Classes in Model Info Drawer
  const filteredSupportedClasses = (modelInfo?.supportedClasses || []).filter((c) =>
    c.toLowerCase().includes(classSearchQuery.toLowerCase())
  );

  // Compute real per-run confidence statistics (works for live runs and older history records)
  const computeRunConfidenceStats = (res: DetectionResult) => {
    if (res.summary.confidenceStats && res.summary.confidenceStats.meanPercent !== null) {
      return res.summary.confidenceStats;
    }
    const dets = res.detectedObjects || [];
    if (dets.length === 0) {
      return { meanPercent: null, maxPercent: null, minPercent: null, perClassMeanPercent: {} as Record<string, number> };
    }
    const pcts = dets.map((d) => d.confidencePercent);
    const classBuckets: Record<string, number[]> = {};
    dets.forEach((d) => {
      classBuckets[d.className] = classBuckets[d.className] || [];
      classBuckets[d.className].push(d.confidencePercent);
    });
    const perClassMeanPercent: Record<string, number> = {};
    Object.entries(classBuckets).forEach(([cls, vals]) => {
      perClassMeanPercent[cls] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
    });
    return {
      meanPercent: Number((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)),
      maxPercent: Number(Math.max(...pcts).toFixed(1)),
      minPercent: Number(Math.min(...pcts).toFixed(1)),
      perClassMeanPercent,
    };
  };

  const activeConfidenceStats = detectionResult ? computeRunConfidenceStats(detectionResult) : null;
  const activeResultModelId = detectionResult?.modelId || detectionResult?.modelInfo?.id;
  const activeBenchmarkMetrics =
    detectionResult?.modelInfo?.benchmarkMetrics ||
    modelInfo?.availableModels?.find((m) => m.modelId === activeResultModelId)?.evaluationMetrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Breadcrumbs */}
      <div>
        <Breadcrumbs
          items={[
            { label: 'AI Forensics', path: '/analysis/image' },
            { label: 'Object Detection', path: '/analysis/detection' },
          ]}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Target className="h-6 w-6 text-cyan-400" />
              <span>AI-Assisted Object Detection</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Deep-learning visual localization using trained Firearm &amp; Person YOLOv8n and MS COCO YOLOv4-tiny on verified image evidence.
            </p>
          </div>

          {/* Model Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <span className="font-semibold text-white">
              {selectedModelId === 'forensic-gun-yolov8'
                ? 'Gun & Person YOLOv8n'
                : selectedModelId === 'combined'
                ? 'Dual Scan (YOLOv8n + YOLOv4-tiny)'
                : 'YOLOv4-tiny'}
            </span>
            <span className="text-slate-500">&bull;</span>
            <span className="text-emerald-400 font-mono text-[11px]">OpenCV DNN</span>
          </div>
        </div>
      </div>

      {/* Forensic Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 shadow-sm">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold uppercase tracking-wider text-[11px] text-amber-300">
            Forensic Object Detection Notice &amp; Standard of Evidence
          </p>
          <p className="leading-relaxed text-amber-200/90">
            Automated object detection performs statistical pattern localization based on neural network activations.
            Under <strong>no circumstances</strong> does a detected object (e.g. vehicle, person, backpack) establish
            criminal intent, ownership, contraband possession, or legal guilt. All outputs require verification by a qualified forensic examiner.
          </p>
        </div>
      </div>

      {/* Error Alert */}
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

      {/* Primary Workspace Grid: Controls & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Artifact Selector & Parameters (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Artifact Selector Card */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                <span>Target Evidence</span>
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                {evidenceList.length} Image{evidenceList.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2">
              <label htmlFor="evidence-select" className="text-xs text-slate-400 font-medium">
                Select Photographic Artifact:
              </label>
              <select
                id="evidence-select"
                value={selectedEvidenceId}
                onChange={(e) => setSelectedEvidenceId(e.target.value)}
                disabled={loadingEvidence || isInferencing}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              >
                {evidenceList.length === 0 ? (
                  <option value="">No image evidence available</option>
                ) : (
                  evidenceList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.evidenceNumber || ev.id} &mdash; {ev.name} ({ev.caseNumber || 'No Docket'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedEvidence && (
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>File:</span>
                  <span className="text-slate-200 font-medium truncate max-w-[180px]">
                    {selectedEvidence.name}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Case Docket:</span>
                  <span className="text-cyan-400">{selectedEvidence.caseNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>SHA-256 Digest:</span>
                  <span className="text-slate-300 font-mono text-[10px] truncate max-w-[150px]">
                    {selectedEvidence.sha256Hash || 'Verified'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Model Inference Parameters Card */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              <span>Inference Parameters</span>
            </h2>

            {/* Model Engine Selector */}
            <div className="space-y-2">
              <label htmlFor="model-select" className="text-xs text-slate-400 font-medium block">
                Detection Neural Network:
              </label>
              <select
                id="model-select"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={isInferencing}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="combined">Dual Forensic Scan (Gun YOLOv8n + COCO YOLOv4-tiny)</option>
                <option value="forensic-gun-yolov8">ForenVision Gun &amp; Person Detector (Trained YOLOv8n)</option>
                <option value="yolov4-tiny">YOLOv4-tiny (80 MS COCO Scene Classes)</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Dual Forensic Scan combines the dataset-trained firearm detector with 80 general scene classes.
              </p>
            </div>

            {/* Confidence Threshold Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Confidence Threshold (C_min):</span>
                <span className="font-mono text-cyan-400 font-semibold">{confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="95"
                step="5"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                disabled={isInferencing}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Minimum activation probability required to consider a detection valid.
              </p>
            </div>

            {/* NMS Threshold Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Non-Maximum Suppression (NMS IoU):</span>
                <span className="font-mono text-purple-400 font-semibold">{nmsThreshold}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={nmsThreshold}
                onChange={(e) => setNmsThreshold(Number(e.target.value))}
                disabled={isInferencing}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Intersection-over-Union threshold for merging overlapping bounding boxes.
              </p>
            </div>

            {/* Run Action Button */}
            <button
              onClick={handleRunDetection}
              disabled={!selectedEvidenceId || isInferencing}
              className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg ${
                isInferencing || !selectedEvidenceId
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              }`}
            >
              {isInferencing ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Running Neural Inference...</span>
                </>
              ) : (
                <>
                  <Target className="h-4 w-4" />
                  <span>Execute AI Detection</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Metrics (if available) */}
          {detectionResult && (
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Detection Summary</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <p className="text-[11px] text-slate-500 font-medium">Total Objects</p>
                  <p className="text-xl font-bold text-white mt-0.5">
                    {detectionResult.summary.totalObjects}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <p className="text-[11px] text-slate-500 font-medium">Mean Box Conf</p>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5 font-mono">
                    {activeConfidenceStats?.meanPercent !== null && activeConfidenceStats?.meanPercent !== undefined
                      ? `${activeConfidenceStats.meanPercent}%`
                      : '0%'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <p className="text-[11px] text-slate-500 font-medium">Inference Latency</p>
                  <p className="text-xl font-bold text-purple-400 mt-0.5 font-mono">
                    {detectionResult.summary.inferenceLatencyMs} <span className="text-xs font-normal text-slate-400">ms</span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <p className="text-[11px] text-slate-500 font-medium">Conf Range (Min–Max)</p>
                  <p className="text-sm font-bold text-cyan-300 mt-1 font-mono">
                    {activeConfidenceStats?.minPercent !== null && activeConfidenceStats?.maxPercent !== null && activeConfidenceStats
                      ? `${activeConfidenceStats.minPercent}% – ${activeConfidenceStats.maxPercent}%`
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {activeConfidenceStats && Object.keys(activeConfidenceStats.perClassMeanPercent).length > 0 && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Per-Class Live Avg Confidence
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(activeConfidenceStats.perClassMeanPercent).map(([cls, avgPct]) => (
                      <span
                        key={cls}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                          cls.toLowerCase() === 'gun'
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        {cls}: {avgPct}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeBenchmarkMetrics?.heldOutTest ? (
                <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase tracking-wider text-[10px] text-cyan-300 font-semibold">
                      Verified YOLOv8n Accuracy
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Res: {detectionResult.summary.imageResolution}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Held-Out Test mAP@50</span>
                      <span className="text-sm font-bold text-emerald-400">
                        {(activeBenchmarkMetrics.heldOutTest.mAP50 * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        P: {(activeBenchmarkMetrics.heldOutTest.precision * 100).toFixed(1)}% &bull; R: {(activeBenchmarkMetrics.heldOutTest.recall * 100).toFixed(0)}%
                      </span>
                    </div>
                    {activeBenchmarkMetrics.validation && (
                      <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Validation mAP@50</span>
                        <span className="text-sm font-bold text-cyan-300">
                          {(activeBenchmarkMetrics.validation.mAP50 * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Gun AP@50: {((activeBenchmarkMetrics.validation.perClass?.gun?.ap50 ?? activeBenchmarkMetrics.validation.mAP50) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400">
                  Pretrained 80-class MS COCO baseline — live per-box confidence shown above (no local ground-truth accuracy split).
                </div>
              )}

              {/* Download Visualization Button */}
              <button
                onClick={() => downloadDetectionVisualization(detectionResult.id, `${selectedEvidence?.name || 'evidence'}_annotated.jpg`)}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors border border-slate-700/60"
              >
                <Download className="h-3.5 w-3.5 text-cyan-400" />
                <span>Download Annotated Image (JPEG)</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Visualizer Viewport & Detailed Results (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Visual Lightbox Shell */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            {/* Viewport Top Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Viewport Mode:
                </span>
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    onClick={() => setViewMode('annotated')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'annotated'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Annotated
                  </button>
                  <button
                    onClick={() => setViewMode('sideBySide')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'sideBySide'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Side by Side
                  </button>
                  <button
                    onClick={() => setViewMode('original')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === 'original'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Original Master
                  </button>
                </div>
              </div>

              {detectionResult && (
                <div className="text-xs text-slate-500 font-mono">
                  Engine: <span className="text-slate-300 font-semibold">{detectionResult.modelInfo.name}</span>
                </div>
              )}
            </div>

            {/* Viewport Image Canvas */}
            <div className="p-4 sm:p-6 bg-slate-950 flex items-center justify-center min-h-[380px] relative">
              {isInferencing && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
                  <div className="h-8 w-8 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                  <p className="text-sm font-medium text-cyan-300">
                    Propagating tensors through {selectedModelId === 'forensic-gun-yolov8' ? 'ForenVision Gun & Person YOLOv8n' : selectedModelId === 'combined' ? 'Dual Forensic Scan (YOLOv8n + YOLOv4-tiny)' : 'YOLOv4-tiny'} neural network...
                  </p>
                  <p className="text-xs text-slate-500">
                    Applying confidence filtering &amp; Non-Maximum Suppression
                  </p>
                </div>
              )}

              {viewMode === 'annotated' && (
                <div className="w-full flex items-center justify-center">
                  {annotatedImageUrl ? (
                    <img
                      src={annotatedImageUrl}
                      alt="AI Object Detection Annotated Visualization"
                      className="max-h-[500px] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl"
                    />
                  ) : originalImageUrl ? (
                    <div className="relative text-center">
                      <img
                        src={originalImageUrl}
                        alt="Target Master Evidence"
                        className="max-h-[500px] w-auto object-contain rounded-lg opacity-75 border border-slate-800"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-lg">
                        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 text-center max-w-sm">
                          <Target className="h-8 w-8 text-cyan-400 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-white">Ready for Neural Inference</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Click &ldquo;Execute AI Detection&rdquo; to locate objects and compute confidence scores.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 py-12">
                      <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No evidence artifact selected</p>
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'sideBySide' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="space-y-1.5 text-center">
                    <p className="text-xs font-mono text-slate-400">Untouched Master Evidence</p>
                    {originalImageUrl ? (
                      <img
                        src={originalImageUrl}
                        alt="Master Original"
                        className="max-h-[360px] w-auto mx-auto object-contain rounded-lg border border-slate-800"
                      />
                    ) : (
                      <div className="h-[240px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-600">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-center">
                    <p className="text-xs font-mono text-cyan-400">
                      {detectionResult?.modelInfo.name || 'Annotated Detection'}
                    </p>
                    {annotatedImageUrl ? (
                      <img
                        src={annotatedImageUrl}
                        alt="Annotated Visualization"
                        className="max-h-[360px] w-auto mx-auto object-contain rounded-lg border border-slate-800"
                      />
                    ) : (
                      <div className="h-[240px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-600">
                        Run inference to render
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'original' && (
                <div className="w-full flex items-center justify-center">
                  {originalImageUrl ? (
                    <img
                      src={originalImageUrl}
                      alt="Untouched Master Evidence"
                      className="max-h-[500px] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl"
                    />
                  ) : (
                    <div className="text-center text-slate-500 py-12">
                      <p className="text-sm">No image available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tab Navigation: Detections | Model Specs | History */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden">
            <div className="flex border-b border-slate-800 bg-slate-950/60 px-4">
              <button
                onClick={() => setActiveTab('detections')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'detections'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Box className="h-4 w-4" />
                <span>Detected Entities ({detectionResult?.detectedObjects.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('model')}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'model'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="h-4 w-4" />
                <span>Model Specifications &amp; Vocabulary</span>
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
                <span>Inference History ({detectionHistory.length})</span>
              </button>
            </div>

            {/* Tab 1: Detections Explorer */}
            {activeTab === 'detections' && (
              <div className="p-5 space-y-4">
                {detectionResult ? (
                  <>
                    {/* Class Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-800">
                      <span className="text-xs text-slate-500 mr-1 font-medium">Filter Class:</span>
                      <button
                        onClick={() => setSelectedClassFilter('ALL')}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                          selectedClassFilter === 'ALL'
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        All ({detectionResult.detectedObjects.length})
                      </button>
                      {Object.entries(detectionResult.summary.classCounts).map(([cls, count]) => (
                        <button
                          key={cls}
                          onClick={() => setSelectedClassFilter(cls)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            selectedClassFilter.toLowerCase() === cls.toLowerCase()
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {cls} ({count})
                        </button>
                      ))}
                    </div>

                    {/* Detections List */}
                    {filteredDetections.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-sm">
                        No objects match the selected class filter.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredDetections.map((d, idx) => {
                          const isWeapon = d.className.toLowerCase() === 'gun';
                          return (
                            <div
                              key={d.detectionId || idx}
                              className={`p-3.5 rounded-xl bg-slate-950 border space-y-2 transition-colors ${
                                isWeapon
                                  ? 'border-rose-500/50 hover:border-rose-400'
                                  : 'border-slate-800/80 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-semibold text-xs capitalize ${
                                      isWeapon
                                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                                    }`}
                                  >
                                    <Tag className={`h-3 w-3 ${isWeapon ? 'text-rose-400' : 'text-cyan-400'}`} />
                                    {d.className}
                                  </span>
                                  {d.sourceModel && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                                      {d.sourceModel === 'forensic-gun-yolov8' ? 'YOLOv8n' : 'YOLOv4-tiny'}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-mono font-bold text-white">
                                  {d.confidencePercent}%
                                </span>
                              </div>

                            {/* Progress bar for confidence */}
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  d.confidencePercent >= 75
                                    ? 'bg-emerald-400'
                                    : d.confidencePercent >= 50
                                    ? 'bg-cyan-400'
                                    : 'bg-amber-400'
                                }`}
                                style={{ width: `${d.confidencePercent}%` }}
                              />
                            </div>

                            {/* Bounding Box Coordinates */}
                            <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
                              <span>Box [X, Y, W, H]:</span>
                              <span className="text-slate-200">
                                [{d.box.x}, {d.box.y}, {d.box.width}, {d.box.height}]
                              </span>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-12 text-center text-slate-500 space-y-2">
                    <Target className="h-8 w-8 mx-auto text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">No detection analysis loaded</p>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Select an image and click &ldquo;Execute AI Detection&rdquo; to inspect detected bounding boxes and class scores.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Model Specifications & Supported Classes */}
            {activeTab === 'model' && (
              <div className="p-5 space-y-6">
                {modelInfo ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Architecture & License Card */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                          Neural Architecture
                        </h3>
                        <div className="text-xs space-y-1.5 font-mono">
                          <div className="flex justify-between text-slate-400">
                            <span>Model Name:</span>
                            <span className="text-white font-bold">{modelInfo.modelName}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Version:</span>
                            <span className="text-slate-200">{modelInfo.version}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>License:</span>
                            <span className="text-emerald-400 font-semibold">{modelInfo.license}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Input Tensor:</span>
                            <span className="text-cyan-400">{modelInfo.inferenceRequirements.inputResolution}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Memory Footprint:</span>
                            <span className="text-slate-200">{modelInfo.inferenceRequirements.memoryFootprintMB} MB</span>
                          </div>
                        </div>
                      </div>

                      {/* Known Limitations Card */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          <span>Known Forensic Limitations</span>
                        </h3>
                        <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                          {modelInfo.knownLimitations.map((lim, i) => (
                            <li key={i} className="leading-relaxed">
                              {lim}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Registered Models & Dataset Benchmarks */}
                    {modelInfo.availableModels && modelInfo.availableModels.length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                          Registered Detection Engines &amp; Training Benchmarks
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {modelInfo.availableModels.map((m) => (
                            <div
                              key={m.modelId}
                              className={`p-3 rounded-lg border space-y-1.5 ${
                                selectedModelId === m.modelId
                                  ? 'border-cyan-500/50 bg-cyan-950/10'
                                  : 'border-slate-800 bg-slate-900/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-white truncate">{m.modelName}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                    m.available
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {m.available ? 'READY' : 'UNAVAILABLE'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed">{m.description}</p>
                              {m.evaluationMetrics?.heldOutTest && (
                                <div className="pt-1 font-mono text-[10px] text-cyan-300 space-y-0.5">
                                  <div>
                                    Test mAP@50: {(m.evaluationMetrics.heldOutTest.mAP50 * 100).toFixed(1)}% &bull; Prec: {(m.evaluationMetrics.heldOutTest.precision * 100).toFixed(1)}%
                                  </div>
                                  {m.onnxSha256 && (
                                    <div className="text-slate-500 truncate">
                                      ONNX SHA256: {m.onnxSha256.slice(0, 16)}...
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Supported COCO Classes Section with Search */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Supported Object Classes ({modelInfo.supportedClassesCount})
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Official MS COCO category vocabulary recognized by this model.
                          </p>
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full sm:w-64">
                          <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Search classes (e.g. car, person)..."
                            value={classSearchQuery}
                            onChange={(e) => setClassSearchQuery(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>

                      {/* Class Badge Grid */}
                      <div className="max-h-56 overflow-y-auto p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-wrap gap-1.5">
                        {filteredSupportedClasses.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            No supported classes match &ldquo;{classSearchQuery}&rdquo;.
                          </p>
                        ) : (
                          filteredSupportedClasses.map((cls, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300"
                            >
                              {cls}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Loading model specifications...
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Prior History Runs */}
            {activeTab === 'history' && (
              <div className="p-5 space-y-3">
                {detectionHistory.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No prior detection runs recorded for this evidence item.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detectionHistory.map((run) => {
                      const runStats = computeRunConfidenceStats(run);
                      return (
                      <div
                        key={run.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          detectionResult?.id === run.id
                            ? 'bg-cyan-500/10 border-cyan-500/40'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {run.summary.totalObjects} Objects Detected
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              ({run.summary.uniqueClasses} classes)
                            </span>
                            {runStats.meanPercent !== null && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                                Avg {runStats.meanPercent}% / Max {runStats.maxPercent}%
                              </span>
                            )}
                            {detectionResult?.id === run.id && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-bold uppercase">
                                Active View
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-2">
                            <span>{run.modelInfo?.name || 'YOLO'}</span>
                            <span>&bull;</span>
                            <span>Thresh: {Math.round(run.parameters.confidenceThreshold * 100)}%</span>
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
                            onClick={() => downloadDetectionVisualization(run.id, `${selectedEvidence?.name || 'evidence'}_${run.id}.jpg`)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="Download Annotated Image"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      );
                    })}
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
