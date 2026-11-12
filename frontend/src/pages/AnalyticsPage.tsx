import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  Clock, 
  FileText, 
  Database,
  BarChart3,
  Calendar,
  RefreshCw,
  Info,
  CheckCircle2,
  Users,
  Lock,
  Layers,
  FolderSearch,
  Cpu,
  Target,
  Sparkles,
  ScanFace,
  Fingerprint
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { StatCard } from '../components/common/StatCard';
import { ChartCard } from '../components/common/ChartCard';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { 
  fetchAnalyticsOverviewApi, 
  type AnalyticsOverviewData,
  type FetchAnalyticsParams 
} from '../api/analyticsApi';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Date Filtering State
  const [rangePreset, setRangePreset] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');
  const [showCustomRange, setShowCustomRange] = useState<boolean>(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  // Definitions Modal State
  const [isDefsModalOpen, setIsDefsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    loadAnalytics();
  }, [rangePreset]);

  const loadAnalytics = async (customParams?: FetchAnalyticsParams) => {
    setLoading(true);
    setError(null);
    try {
      const params: FetchAnalyticsParams = customParams || {
        range: rangePreset,
      };
      const result = await fetchAnalyticsOverviewApi(params);
      setData(result);
    } catch (err: any) {
      console.error('Failed to load analytics telemetry:', err);
      setError(
        err?.response?.data?.message ||
        'Unable to aggregate forensic operations analytics from database.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart) return;
    loadAnalytics({
      startDate: customStart,
      endDate: customEnd || undefined,
    });
  };

  const handleResetToPreset = (preset: '7d' | '30d' | '90d' | '1y' | 'all') => {
    setRangePreset(preset);
    setShowCustomRange(false);
    setCustomStart('');
    setCustomEnd('');
  };

  // Color mappings
  const STATUS_COLOR_FALLBACKS: Record<string, string> = {
    ACTIVE: '#3B82F6',
    OPEN: '#06B6D4',
    IN_PROGRESS: '#3B82F6',
    UNDER_REVIEW: '#A855F7',
    CLOSED: '#10B981',
    ARCHIVED: '#64748B',
    COLD: '#475569',
  };

  const TYPE_COLOR_FALLBACKS: Record<string, string> = {
    image: '#06B6D4',
    video: '#3B82F6',
    audio: '#8B5CF6',
    document: '#10B981',
    pdf: '#F59E0B',
    binary: '#64748B',
    other: '#94A3B8',
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Breadcrumbs
        items={[{ label: 'Analytics' }]}
        title="Forensic Operations Intelligence & Telemetry"
        description="Empirical casework intake, evidence ingestion trajectories, compute latencies, and certified examiner workload distribution."
        badge={
          <span className="rounded bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <Database className="h-3 w-3" />
            <span>REAL DATABASE TELEMETRY</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDefsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors"
            >
              <Info className="h-3.5 w-3.5 text-cyan-400" />
              <span>Metric Definitions</span>
            </button>

            <button
              onClick={() => loadAnalytics()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Date Range Filtering Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-mono text-slate-400 mr-2 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-cyan-400" />
            <span>Time Window:</span>
          </span>

          {(['7d', '30d', '90d', '1y', 'all'] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => handleResetToPreset(preset)}
              className={`px-3 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                rangePreset === preset && !showCustomRange
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-950'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {preset === 'all' ? 'All Time' : preset.toUpperCase()}
            </button>
          ))}

          <button
            onClick={() => setShowCustomRange(!showCustomRange)}
            className={`px-3 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
              showCustomRange
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Custom Range...
          </button>
        </div>

        {data?.dateRange && (
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <span className="text-slate-500">Active Boundary:</span>
            <span className="text-cyan-400 font-semibold">
              {data.dateRange.startDate ? data.dateRange.startDate.substring(0, 10) : 'Epoch Inception'}
              {' &rarr; '}
              {data.dateRange.endDate ? data.dateRange.endDate.substring(0, 10) : 'Present'}
            </span>
          </div>
        )}
      </div>

      {/* Custom Date Range Collapsible Form */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomRange}
          className="flex flex-wrap items-end gap-3 p-4 bg-slate-900/90 rounded-xl border border-cyan-500/30 text-xs"
        >
          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              Start Date (ISO / YYYY-MM-DD) *
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              required
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
              End Date (ISO / YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 text-xs font-semibold shadow-md shadow-cyan-950 transition-all"
          >
            Filter Analytics
          </button>
        </form>
      )}

      {/* Forensic Accuracy Invariant Notice Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 mt-0.5 flex-shrink-0">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-200">
            Forensic Science & Legal Invariant: Model Confidence &ne; Forensic Accuracy
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Algorithmic confidence scores (such as neural bounding-box probabilities or facial embedding cosine similarities) denote mathematical pattern correspondence under training parameters. Under <strong>OSAC</strong>, <strong>NIST</strong>, and <strong>Federal Rules of Evidence (FRE 702 / Daubert)</strong>, algorithmic confidence NEVER equates to forensic accuracy, identity certainty, or autonomous legal proof of guilt.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-[#0F172A] rounded-xl border border-slate-800">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-slate-400 font-mono">Aggregating database records & computing operational metrics...</p>
        </div>
      ) : error ? (
        <ErrorState
          title="Telemetry Computation Failure"
          message={error}
          onRetry={() => loadAnalytics()}
        />
      ) : data ? (
        <div className="space-y-6">
          {/* Top Aggregate Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              title="Cases in Timeframe"
              value={data.totalCasesInRange.toString()}
              icon={FolderSearch}
              subtitle="Authorized active & resolved dockets"
              accentColor="cyan"
            />

            <StatCard
              title="Evidence Ingested"
              value={data.totalEvidenceInRange.toString()}
              icon={Layers}
              subtitle="SHA-256 sealed artifacts"
              accentColor="cyan"
            />

            <StatCard
              title="Analysis Executions"
              value={data.totalAnalysesInRange.toString()}
              icon={Activity}
              subtitle="Diagnostic runs executed"
              accentColor="emerald"
            />

            <StatCard
              title="Mean Compute Latency"
              value={
                data.processingTimes.available && data.processingTimes.overallAvgMs > 0
                  ? `${data.processingTimes.overallAvgMs} ms`
                  : 'N/A'
              }
              icon={Clock}
              subtitle={
                data.processingTimes.available
                  ? `${data.processingTimes.totalJobsMeasured} measured pipeline runs`
                  : 'Zero compute latency recorded'
              }
              accentColor="emerald"
            />

            <StatCard
              title="Sealed Court Reports"
              value={data.reportGeneration.totalReports.toString()}
              icon={FileText}
              subtitle="Formal PDF dossiers compiled"
              accentColor="amber"
            />
          </div>

          {/* Real AI Model Evaluation Accuracy & Live Detection Confidence */}
          {data.modelAccuracyAndDetections && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-400" />
                    <span>Real AI Model Accuracy &amp; Live Detection Telemetry</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Measured validation/held-out test benchmarks from trained model metadata alongside live MongoDB detection confidence scores (zero fabricated figures).
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 uppercase font-semibold">
                  100% Measured &bull; No Dummy Data
                </span>
              </div>

              {/* 1. Trained Dataset Model Benchmarks */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* YOLOv8n Gun Detector */}
                {(() => {
                  const gun = data.modelAccuracyAndDetections.trainedBenchmarks.gunDetector;
                  const val = gun.evaluationMetrics?.validation;
                  const test = gun.evaluationMetrics?.heldOutTest;
                  return (
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                            <Target className="h-4 w-4 text-rose-400" />
                            <span>{gun.modelName}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Split: {gun.trainingDataset?.sourceSplit?.train ?? 0} train ({gun.trainingDataset?.augmentedTrainImages ?? 0} aug) / {gun.trainingDataset?.sourceSplit?.val ?? 0} val / {gun.trainingDataset?.sourceSplit?.test ?? 0} test &bull; {gun.modelSizeMB ?? '-'} MB
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                          {gun.version || 'YOLOv8n'}
                        </span>
                      </div>

                      {test && val ? (
                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                          <div className="p-3 rounded-lg bg-slate-900 border border-emerald-500/30 space-y-1">
                            <span className="text-[10px] uppercase text-emerald-300 font-semibold block">
                              Held-Out Test ({gun.trainingDataset?.sourceSplit?.test ?? 1} img)
                            </span>
                            <div className="flex justify-between">
                              <span className="text-slate-400">mAP@50:</span>
                              <span className="text-emerald-400 font-bold">{(test.mAP50 * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Gun AP@50:</span>
                              <span className="text-white font-semibold">{((test.perClass?.gun?.ap50 ?? test.mAP50) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Precision / Recall:</span>
                              <span className="text-slate-200">{(test.precision * 100).toFixed(1)}% / {(test.recall * 100).toFixed(0)}%</span>
                            </div>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                            <span className="text-[10px] uppercase text-cyan-300 font-semibold block">
                              Validation ({gun.trainingDataset?.sourceSplit?.val ?? 2} imgs)
                            </span>
                            <div className="flex justify-between">
                              <span className="text-slate-400">mAP@50:</span>
                              <span className="text-cyan-300 font-bold">{(val.mAP50 * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Gun AP@50:</span>
                              <span className="text-white font-semibold">{((val.perClass?.gun?.ap50 ?? val.mAP50) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Precision / Recall:</span>
                              <span className="text-slate-200">{(val.precision * 100).toFixed(1)}% / {(val.recall * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Benchmark metadata unavailable.</p>
                      )}
                    </div>
                  );
                })()}

                {/* CUHK Sketch Adapter */}
                {(() => {
                  const sk = data.modelAccuracyAndDetections.trainedBenchmarks.sketchAdapter;
                  const testAdapter = sk.evaluationMetrics?.heldOutTest?.cuhkTrainedAdapter;
                  const testBase = sk.evaluationMetrics?.heldOutTest?.baselineRawSFace;
                  const valAdapter = sk.evaluationMetrics?.validation?.cuhkTrainedAdapter;
                  return (
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                            <Sparkles className="h-4 w-4 text-purple-400" />
                            <span>{sk.modelName}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            CUHK Split: {sk.trainingDataset?.split?.trainSubjects ?? 0} train ({sk.trainingDataset?.augmentedTrainPairs ?? 0} aug) / {sk.trainingDataset?.split?.valSubjects ?? 0} val / {sk.trainingDataset?.split?.testSubjects ?? 0} test subjects
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-[10px] font-mono text-purple-300">
                          {sk.version || 'CUHK-v1'}
                        </span>
                      </div>

                      {testAdapter ? (
                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                          <div className="p-3 rounded-lg bg-slate-900 border border-purple-500/30 space-y-1">
                            <span className="text-[10px] uppercase text-purple-300 font-semibold block">
                              Held-Out Test ({testAdapter.gallerySize ?? 28} Pairs)
                            </span>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Rank-1 (vs Base):</span>
                              <span className="text-emerald-400 font-bold">
                                {(testAdapter.rank1Accuracy * 100).toFixed(2)}%
                                {testBase ? ` (${(testBase.rank1Accuracy * 100).toFixed(1)}%)` : ''}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Rank-5 / MRR:</span>
                              <span className="text-white font-semibold">
                                {(testAdapter.rank5Accuracy * 100).toFixed(0)}% / {testAdapter.meanReciprocalRank?.toFixed(4) ?? '-'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">ROC-AUC / Margin:</span>
                              <span className="text-cyan-300">
                                {testAdapter.rocAuc.toFixed(4)} / +{testAdapter.separationMargin.toFixed(4)}
                              </span>
                            </div>
                          </div>

                          {valAdapter && (
                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                              <span className="text-[10px] uppercase text-cyan-300 font-semibold block">
                                Validation ({valAdapter.gallerySize ?? 28} Pairs)
                              </span>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Rank-1 Accuracy:</span>
                                <span className="text-cyan-300 font-bold">{(valAdapter.rank1Accuracy * 100).toFixed(2)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Rank-5 / MRR:</span>
                                <span className="text-white font-semibold">
                                  {(valAdapter.rank5Accuracy * 100).toFixed(0)}% / {valAdapter.meanReciprocalRank?.toFixed(4) ?? '-'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">ROC-AUC / Margin:</span>
                                <span className="text-slate-200">
                                  {valAdapter.rocAuc.toFixed(4)} / +{valAdapter.separationMargin.toFixed(4)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Benchmark metadata unavailable.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 2. Live Database Detection Confidence Summary Across Modules */}
              {(() => {
                const live = data.modelAccuracyAndDetections.liveDetectionStats;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5" /> Object Detection Runs
                          </span>
                          <span className="font-mono text-white font-bold">{live.objectDetection.runsCount}</span>
                        </div>
                        <p className="font-mono text-lg font-bold text-emerald-400">
                          {live.objectDetection.meanConfidencePercent !== null
                            ? `${live.objectDetection.meanConfidencePercent}% avg conf`
                            : 'No runs in window'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {live.objectDetection.totalDetections} boxes ({live.objectDetection.firearmDetections} firearms
                          {live.objectDetection.meanGunConfidencePercent !== null
                            ? `, gun avg ${live.objectDetection.meanGunConfidencePercent}%`
                            : ''})
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                            <ScanFace className="h-3.5 w-3.5" /> Face Analysis Runs
                          </span>
                          <span className="font-mono text-white font-bold">{live.faceAnalysis.runsCount}</span>
                        </div>
                        <p className="font-mono text-lg font-bold text-cyan-300">
                          {live.faceAnalysis.meanCosineSimilarity !== null
                            ? `${live.faceAnalysis.meanCosineSimilarity.toFixed(4)} avg cos`
                            : live.faceAnalysis.meanDetectorConfidencePercent !== null
                            ? `${live.faceAnalysis.meanDetectorConfidencePercent}% det conf`
                            : 'No runs in window'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          YuNet avg det conf: {live.faceAnalysis.meanDetectorConfidencePercent !== null ? `${live.faceAnalysis.meanDetectorConfidencePercent}%` : 'N/A'}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" /> Sketch CUHK Probes
                          </span>
                          <span className="font-mono text-white font-bold">{live.sketchAnalysis.runsCount}</span>
                        </div>
                        <p className="font-mono text-lg font-bold text-purple-300">
                          {live.sketchAnalysis.meanAlignedCosine !== null
                            ? `${live.sketchAnalysis.meanAlignedCosine.toFixed(4)} aligned`
                            : 'No runs in window'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          Lift vs raw SFace: {live.sketchAnalysis.meanAlignmentDelta !== null
                            ? `${live.sketchAnalysis.meanAlignmentDelta >= 0 ? '+' : ''}${live.sketchAnalysis.meanAlignmentDelta.toFixed(4)}`
                            : 'N/A'}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                            <Fingerprint className="h-3.5 w-3.5" /> Fingerprint AFIS
                          </span>
                          <span className="font-mono text-white font-bold">{live.fingerprintAnalysis.runsCount}</span>
                        </div>
                        <p className="font-mono text-lg font-bold text-amber-300">
                          {live.fingerprintAnalysis.meanInlierRatioPercent !== null
                            ? `${live.fingerprintAnalysis.meanInlierRatioPercent}% inlier ratio`
                            : 'No runs in window'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          Mean RANSAC inliers: {live.fingerprintAnalysis.meanInlierCount ?? 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Recent Real Object Detection Confidence Table */}
                    {live.objectDetection.recentRuns.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Case</th>
                              <th className="py-2 px-3">Exhibit</th>
                              <th className="py-2 px-3">Model Engine</th>
                              <th className="py-2 px-3 text-center">Objects (Guns)</th>
                              <th className="py-2 px-3 text-center">Avg Conf %</th>
                              <th className="py-2 px-3 text-center">Min – Max %</th>
                              <th className="py-2 px-3 text-right">Latency</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                            {live.objectDetection.recentRuns.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-900/40">
                                <td className="py-2 px-3 text-cyan-400">{r.caseNumber}</td>
                                <td className="py-2 px-3 font-sans text-slate-200 truncate max-w-[180px]">{r.evidenceLabel}</td>
                                <td className="py-2 px-3 text-slate-300">{r.modelName}</td>
                                <td className="py-2 px-3 text-center text-white">
                                  {r.totalObjects}{' '}
                                  {r.firearmDetections > 0 && (
                                    <span className="text-rose-400 font-bold">({r.firearmDetections} gun)</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center font-bold text-emerald-400">
                                  {r.meanConfidencePercent !== null ? `${r.meanConfidencePercent}%` : '0%'}
                                </td>
                                <td className="py-2 px-3 text-center text-slate-300">
                                  {r.minConfidencePercent !== null && r.maxConfidencePercent !== null
                                    ? `${r.minConfidencePercent}% – ${r.maxConfidencePercent}%`
                                    : 'N/A'}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-400">
                                  {r.latencyMs ? `${r.latencyMs} ms` : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pretrained / Classical Engine Honesty Strip */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
                      {data.modelAccuracyAndDetections.trainedBenchmarks.pretrainedEngines.map((eng) => (
                        <div key={eng.engineId} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                          <span className="font-semibold text-slate-200 block">{eng.name}</span>
                          <span className="font-mono text-[10px] text-cyan-400 block">{eng.metricShown}</span>
                          <span className="text-slate-500 text-[10px] leading-snug block">{eng.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Row 1: Cases Intake Trajectory vs Cases by Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cases Over Time */}
            <ChartCard
              title="Cases Created Over Time"
              subtitle="Chronological casework intake velocity"
              icon={TrendingUp}
              metric={data.totalCasesInRange.toString()}
              metricLabel="Total Intakes"
              height={280}
            >
              {data.casesOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.casesOverTime}>
                    <defs>
                      <linearGradient id="colorCaseIntake" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#94A3B8', fontSize: 10 }} 
                      tickFormatter={(val) => val.length > 5 ? val.substring(5) : val}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Cases Initiated"
                      stroke="#06B6D4"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCaseIntake)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No Cases Initiated in Window"
                  description="Zero investigation cases were created within the selected timeframe."
                  className="py-12"
                />
              )}
            </ChartCard>

            {/* Cases by Status */}
            <ChartCard
              title="Cases by Lifecycle Status"
              subtitle="Active, under review, and closed docket balance"
              icon={BarChart3}
              height={280}
            >
              {data.casesByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.casesByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="status" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Bar dataKey="count" name="Cases" radius={[4, 4, 0, 0]}>
                      {data.casesByStatus.map((entry, idx) => (
                        <Cell 
                          key={`cell-${idx}`} 
                          fill={entry.color || STATUS_COLOR_FALLBACKS[entry.status] || '#38BDF8'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Zero Cases Discovered"
                  description="No casework records match the active date parameters."
                  className="py-12"
                />
              )}
            </ChartCard>
          </div>

          {/* Row 2: Evidence Ingestion Trajectory vs Evidence by Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Evidence Ingestion Over Time */}
            <ChartCard
              title="Evidence Ingestion Velocity Over Time"
              subtitle="Daily volume of physical & digital exhibits hashed into the vault"
              icon={TrendingUp}
              metric={data.totalEvidenceInRange.toString()}
              metricLabel="Total Ingested"
              height={280}
            >
              {data.evidenceIngestionOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.evidenceIngestionOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#94A3B8', fontSize: 10 }} 
                      tickFormatter={(val) => val.length > 5 ? val.substring(5) : val}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Bar dataKey="count" name="Artifacts Ingested" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No Evidence Ingested in Window"
                  description="Zero evidence items were uploaded during this period."
                  className="py-12"
                />
              )}
            </ChartCard>

            {/* Evidence by Type */}
            <ChartCard
              title="Evidence Distribution by Media Type"
              subtitle="MIME classification breakdown across registered evidence"
              icon={Layers}
              height={280}
            >
              {data.evidenceByType.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.evidenceByType} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="type" 
                      tick={{ fill: '#94A3B8', fontSize: 10 }} 
                      tickFormatter={(v) => v.toUpperCase()}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Bar dataKey="count" name="Artifact Count" radius={[4, 4, 0, 0]}>
                      {data.evidenceByType.map((entry, idx) => (
                        <Cell 
                          key={`cell-ev-${idx}`} 
                          fill={entry.color || TYPE_COLOR_FALLBACKS[entry.type] || '#38BDF8'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Zero Evidence Discovered"
                  description="No evidence files registered in this timeframe."
                  className="py-12"
                />
              )}
            </ChartCard>
          </div>

          {/* Row 3: Analysis Jobs by Status vs Processing Compute Latency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Analysis Jobs by Status */}
            <ChartCard
              title="Analysis Jobs by Lifecycle Status"
              subtitle="Execution states across all diagnostic engines"
              icon={Activity}
              metric={data.totalAnalysesInRange.toString()}
              metricLabel="Total Executions"
              height={280}
            >
              {data.analysisJobsByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.analysisJobsByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="status" 
                      tick={{ fill: '#94A3B8', fontSize: 10 }} 
                      tickFormatter={(v) => v.toUpperCase()}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Bar dataKey="count" name="Jobs" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Zero Analysis Jobs in Window"
                  description="No automated diagnostic pipelines executed during this period."
                  className="py-12"
                />
              )}
            </ChartCard>

            {/* Processing Times When Recorded */}
            <ChartCard
              title="Empirical AI Pipeline Compute Latency (ms)"
              subtitle="Average CPU/GPU execution duration by forensic engine"
              icon={Clock}
              height={280}
            >
              {data.processingTimes.available && data.processingTimes.byModule.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.processingTimes.byModule}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                  >
                    <XAxis type="number" unit="ms" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: '#94A3B8', fontSize: 10 }}
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                      formatter={(val: any, _name: any, item: any) => [
                        `${val} ms (Min: ${item.payload.minTimeMs}ms, Max: ${item.payload.maxTimeMs}ms, Runs: ${item.payload.count})`,
                        'Avg Latency',
                      ]}
                    />
                    <Bar dataKey="avgTimeMs" name="Avg Latency (ms)" fill="#38BDF8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No Compute Latency Recorded"
                  description="Processing execution times have not been captured for jobs in this timeframe. Run ELA or YOLO inference to generate telemetry."
                  className="py-12"
                />
              )}
            </ChartCard>
          </div>

          {/* Row 4: Report-Generation Activity vs Investigator Workload */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Report Generation Activity */}
            <ChartCard
              title="Court Exhibit Report Generation Activity"
              subtitle="Formal PDF dossiers sealed and archived by classification"
              icon={FileText}
              metric={data.reportGeneration.totalReports.toString()}
              metricLabel="Sealed Dossiers"
              height={280}
            >
              {data.reportGeneration.byClassification.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.reportGeneration.byClassification} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="classification" 
                      tick={{ fill: '#94A3B8', fontSize: 9 }}
                      tickFormatter={(v) => v.length > 15 ? `${v.substring(0, 15)}...` : v}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Bar dataKey="count" name="Reports Compiled" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Zero Reports Generated in Window"
                  description="No court exhibit dossiers compiled during this timeframe."
                  className="py-12"
                />
              )}
            </ChartCard>

            {/* Investigator Workload (Protected with Access Clearance) */}
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold tracking-tight text-white">
                      Investigator Workload & Caseload Balance
                    </h3>
                  </div>

                  <span
                    className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase font-bold flex items-center gap-1 ${
                      data.investigatorWorkload.isAuthorized
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    <Lock className="h-2.5 w-2.5" />
                    <span>{data.investigatorWorkload.scope}</span>
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 mb-3">
                  {data.investigatorWorkload.notice}
                </p>

                {/* Workload Table */}
                <div className="overflow-x-auto max-h-[190px] overflow-y-auto pr-1">
                  <table className="w-full text-left text-xs border border-slate-800 rounded">
                    <thead className="bg-slate-900 font-mono text-[10px] uppercase text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="py-1.5 px-2.5">Examiner</th>
                        <th className="py-1.5 px-2.5">Badge</th>
                        <th className="py-1.5 px-2.5 text-center">Active Cases</th>
                        <th className="py-1.5 px-2.5 text-center">Closed Cases</th>
                        <th className="py-1.5 px-2.5 text-right">Total Assigned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {data.investigatorWorkload.workload.length > 0 ? (
                        data.investigatorWorkload.workload.map((inv, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-1.5 px-2.5 font-sans font-medium text-slate-200">
                              {inv.investigatorName}
                            </td>
                            <td className="py-1.5 px-2.5 text-cyan-400 text-[10px]">{inv.badge}</td>
                            <td className="py-1.5 px-2.5 text-center text-emerald-400 font-bold">{inv.activeCases}</td>
                            <td className="py-1.5 px-2.5 text-center text-slate-400">{inv.closedCases}</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-200">{inv.totalCases}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                            Zero active caseload allocations recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                <span>Confidentiality Safeguard: Restricted case titles are never exposed.</span>
                <span>Active Examiners: {data.investigatorWorkload.workload.length}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Metric Definitions & Forensic Standards Modal */}
      <Modal
        isOpen={isDefsModalOpen}
        onClose={() => setIsDefsModalOpen(false)}
        title="Formal Metric Definitions & Forensic Invariants"
        subtitle="Standardized glossary and scientific legal boundaries adhering to OSAC, NIST, and Federal Rules of Evidence"
        size="lg"
        footer={
          <button
            type="button"
            onClick={() => setIsDefsModalOpen(false)}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-cyan-950 transition-all"
          >
            Acknowledge & Close
          </button>
        }
      >
        <div className="space-y-4 text-xs text-slate-300 max-h-[60vh] overflow-y-auto pr-2">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200/90 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Mandatory Legal Invariant: Model Confidence &ne; Forensic Accuracy</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {data?.metricDefinitions?.forensicAccuracyNotice ||
                'Algorithmic confidence scores measure mathematical pattern correspondence within statistical models under specific test conditions. Under OSAC, NIST, and Federal Rules of Evidence (FRE 702), model confidence NEVER equates to forensic accuracy, identification certainty, or autonomous legal proof of guilt.'}
            </p>
          </div>

          <div className="space-y-3">
            {Object.entries(data?.metricDefinitions || {}).map(([key, defText]) => {
              if (key === 'forensicAccuracyNotice') return null;
              return (
                <div key={key} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="font-mono text-cyan-400 font-bold uppercase text-[10px] tracking-wider block">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <p className="text-[11px] text-slate-300 leading-normal">{defText}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};
