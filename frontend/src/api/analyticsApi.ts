import apiClient from './client';

export interface CaseStatusMetric {
  status: string;
  count: number;
  color: string;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface EvidenceTypeMetric {
  type: string;
  count: number;
  color: string;
}

export interface AnalysisJobStatusMetric {
  status: string;
  count: number;
}

export interface ProcessingModuleMetric {
  category: string;
  label: string;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  count: number;
}

export interface ProcessingTimesData {
  available: boolean;
  totalJobsMeasured: number;
  overallAvgMs: number;
  overallMinMs: number;
  overallMaxMs: number;
  byModule: ProcessingModuleMetric[];
}

export interface ReportClassificationMetric {
  classification: string;
  count: number;
}

export interface ReportGenerationData {
  totalReports: number;
  byClassification: ReportClassificationMetric[];
  overTime: TimeSeriesPoint[];
}

export interface InvestigatorCaseload {
  investigatorId: string;
  investigatorName: string;
  badge: string;
  role: string;
  activeCases: number;
  closedCases: number;
  totalCases: number;
}

export interface InvestigatorWorkloadData {
  isAuthorized: boolean;
  scope: 'ALL_PERSONNEL' | 'PERSONAL_ONLY';
  notice: string;
  workload: InvestigatorCaseload[];
}

export interface GunBenchmarkSplit {
  precision: number;
  recall: number;
  mAP50: number;
  mAP50_95: number;
  perClass?: Record<string, { ap50: number; ap50_95: number }>;
}

export interface SketchBenchmarkMetrics {
  gallerySize?: number;
  rank1Accuracy: number;
  rank5Accuracy: number;
  meanReciprocalRank?: number;
  rocAuc: number;
  meanGenuineSimilarity?: number;
  meanImpostorSimilarity?: number;
  separationMargin: number;
}

export interface ModelAccuracyAndDetectionsData {
  trainedBenchmarks: {
    gunDetector: {
      available: boolean;
      modelId: string;
      modelName: string;
      version?: string;
      modelSizeMB?: number;
      onnxSha256?: string;
      trainingDataset?: {
        sourceTotalImages?: number;
        sourceSplit?: { train?: number; val?: number; test?: number };
        augmentedTrainImages?: number;
        epochsMax?: number;
      };
      evaluationMetrics?: {
        validation?: GunBenchmarkSplit;
        heldOutTest?: GunBenchmarkSplit;
      };
      trainedAt?: string;
    };
    sketchAdapter: {
      available: boolean;
      modelId: string;
      modelName: string;
      version?: string;
      trainingDataset?: {
        totalSubjects?: number;
        split?: { trainSubjects?: number; valSubjects?: number; testSubjects?: number };
        augmentedTrainPairs?: number;
      };
      evaluationMetrics?: {
        validation?: {
          baselineRawSFace?: SketchBenchmarkMetrics;
          cuhkTrainedAdapter?: SketchBenchmarkMetrics;
        };
        heldOutTest?: {
          baselineRawSFace?: SketchBenchmarkMetrics;
          cuhkTrainedAdapter?: SketchBenchmarkMetrics;
        };
      };
      trainedAt?: string;
    };
    pretrainedEngines: Array<{
      engineId: string;
      name: string;
      status: string;
      metricShown: string;
      note: string;
    }>;
  };
  liveDetectionStats: {
    objectDetection: {
      runsCount: number;
      totalDetections: number;
      firearmDetections: number;
      meanConfidencePercent: number | null;
      minConfidencePercent: number | null;
      maxConfidencePercent: number | null;
      meanGunConfidencePercent: number | null;
      recentRuns: Array<{
        id: string;
        caseNumber: string;
        evidenceLabel: string;
        modelName: string;
        modelId: string;
        totalObjects: number;
        firearmDetections: number;
        meanConfidencePercent: number | null;
        maxConfidencePercent: number | null;
        minConfidencePercent: number | null;
        latencyMs?: number;
        timestamp: string;
      }>;
    };
    faceAnalysis: {
      runsCount: number;
      meanCosineSimilarity: number | null;
      maxCosineSimilarity: number | null;
      meanDetectorConfidencePercent: number | null;
      recentRuns: Array<{
        id: string;
        caseNumber: string;
        mode: string;
        label: string;
        cosineSimilarity: number | null;
        detectorConfidencePercent: number | null;
        correspondenceTier: string | null;
        timestamp: string;
      }>;
    };
    sketchAnalysis: {
      runsCount: number;
      meanAlignedCosine: number | null;
      meanBaselineCosine: number | null;
      meanAlignmentDelta: number | null;
      recentRuns: Array<{
        id: string;
        caseNumber: string;
        label: string;
        alignedCosineSimilarity: number;
        baselineCosineSimilarity: number;
        alignmentDelta: number;
        exploratoryBand?: string;
        timestamp: string;
      }>;
    };
    fingerprintAnalysis: {
      runsCount: number;
      meanInlierCount: number | null;
      meanInlierRatioPercent: number | null;
      recentRuns: Array<{
        id: string;
        caseNumber: string;
        label: string;
        inlierCount: number;
        inlierRatioPercent: number;
        correspondenceTier?: string;
        timestamp: string;
      }>;
    };
  };
}

export interface AnalyticsOverviewData {
  dateRange: {
    preset: string;
    startDate: string | null;
    endDate: string | null;
  };
  casesByStatus: CaseStatusMetric[];
  casesOverTime: TimeSeriesPoint[];
  totalCasesInRange: number;
  evidenceByType: EvidenceTypeMetric[];
  evidenceIngestionOverTime: TimeSeriesPoint[];
  totalEvidenceInRange: number;
  analysisJobsByStatus: AnalysisJobStatusMetric[];
  processingTimes: ProcessingTimesData;
  totalAnalysesInRange: number;
  reportGeneration: ReportGenerationData;
  investigatorWorkload: InvestigatorWorkloadData;
  modelAccuracyAndDetections?: ModelAccuracyAndDetectionsData;
  metricDefinitions: Record<string, string>;
}

export interface FetchAnalyticsParams {
  startDate?: string;
  endDate?: string;
  range?: '7d' | '30d' | '90d' | '1y' | 'all';
}

/**
 * Fetch database-backed overview analytics with date filtering.
 */
export async function fetchAnalyticsOverviewApi(
  params?: FetchAnalyticsParams
): Promise<AnalyticsOverviewData> {
  const response = await apiClient.get('/analytics/overview', { params });
  return response.data?.data;
}

/**
 * Fetch investigator caseload workload metrics.
 */
export async function fetchInvestigatorWorkloadApi(
  params?: FetchAnalyticsParams
): Promise<InvestigatorWorkloadData> {
  const response = await apiClient.get('/analytics/workload', { params });
  return response.data?.data;
}

/**
 * Fetch formal metric definitions and legal accuracy notices.
 */
export async function fetchMetricDefinitionsApi(): Promise<{
  definitions: Record<string, string>;
  forensicAccuracyNotice: string;
}> {
  const response = await apiClient.get('/analytics/definitions');
  return response.data?.data;
}
