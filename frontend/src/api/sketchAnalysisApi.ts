import apiClient from './client';

export interface SketchPreprocessingParams {
  grayscale?: boolean;
  normalize?: boolean;
  clahe?: boolean;
  claheClipLimit?: number;
  edgeFilter?: 'none' | 'canny' | 'sobel';
  cannyLow?: number;
  cannyHigh?: number;
  invert?: boolean;
  contrast?: number;
  brightness?: number;
}

export interface MorphologicalAnnotation {
  id: string;
  target: 'sketch' | 'reference';
  feature:
    | 'orbital_eyes'
    | 'eyebrows'
    | 'nasal_bridge_aperture'
    | 'mouth_lips'
    | 'mandibular_jawline_chin'
    | 'hairline_cranial'
    | 'auricular_ears'
    | 'scars_marks_tattoos'
    | 'general_facial_proportions';
  x: number; // Normalized [0, 1] or pixel
  y: number; // Normalized [0, 1] or pixel
  width?: number;
  height?: number;
  notes: string;
  linkedAnnotationId?: string | null;
}

export interface SketchEvidenceSide {
  id: string;
  evidenceNumber: string;
  filename: string;
  sha256: string;
  dimensions: string;
  preprocessing: SketchPreprocessingParams;
}

export interface SketchSessionRecord {
  id: string;
  sessionId: string;
  analysisId: string;
  analysisType: string;
  category: string;
  title: string;
  caseId: string;
  caseNumber: string;
  sketchEvidence: SketchEvidenceSide;
  referenceEvidence: SketchEvidenceSide;
  annotations: MorphologicalAnnotation[];
  annotationsCount: number;
  morphologicalChecklist: Record<string, string>;
  examinerNotes: string;
  methodology: {
    engine: string;
    matchingModel: string;
    evaluationFramework: string;
    standardsCompliance: string[];
  };
  forensicNotice: string;
  retentionPolicy: string;
  visualization: {
    derivedFilename: string;
    hasVisual: boolean;
    fileSize: number;
  };
  examiner: {
    id: string;
    name: string;
    badge: string;
    role: string;
  };
  timestamp: string;
  status: string;
}

export interface SketchBenchmarkMetricsEntry {
  gallerySize?: number;
  rank1Accuracy: number;
  rank5Accuracy: number;
  meanReciprocalRank?: number;
  rocAuc: number;
  meanGenuineSimilarity?: number;
  meanImpostorSimilarity?: number;
  separationMargin: number;
}

export interface SketchBenchmarkEvaluation {
  validation?: {
    baselineRawSFace?: SketchBenchmarkMetricsEntry;
    cuhkTrainedAdapter?: SketchBenchmarkMetricsEntry;
  };
  heldOutTest?: {
    baselineRawSFace?: SketchBenchmarkMetricsEntry;
    cuhkTrainedAdapter?: SketchBenchmarkMetricsEntry;
  };
}

export interface ExperimentalSketchProbeResult {
  id: string;
  sessionId: string;
  analysisId: string;
  analysisType: string;
  category: string;
  experimentalStatus: string;
  admissibilityStatus: string;
  caseId: string;
  caseNumber: string;
  sketchEvidence: {
    id: string;
    evidenceNumber: string;
    filename: string;
    faceDetection: {
      detected: boolean;
      method: string;
      confidence: number;
      box: number[];
    };
  };
  referenceEvidence: {
    id: string;
    evidenceNumber: string;
    filename: string;
    faceDetection: {
      detected: boolean;
      method: string;
      confidence: number;
      box: number[];
    };
  };
  metrics: {
    alignedCosineSimilarity: number;
    baselineRawSFaceSimilarity: number;
    alignmentDelta: number;
    alignedL2Distance: number;
    exploratoryBand: string;
  };
  modelInfo: {
    modelId: string;
    modelName: string;
    version: string;
    trainingDataset?: {
      totalSubjects?: number;
      split?: { trainSubjects?: number; valSubjects?: number; testSubjects?: number };
      augmentedTrainPairs?: number;
    };
    benchmarkTestMetrics?: SketchBenchmarkEvaluation['heldOutTest'];
    benchmarkEvaluation?: SketchBenchmarkEvaluation;
  };
  visualization: {
    derivedFilename: string;
    derivedImageUrl: string;
    hasVisual: boolean;
    fileSize: number;
  };
  forensicDisclaimer: string;
  performedBy: string;
  timestamp: string;
  status: string;
}

export interface SketchMethodologyInfo {
  methodology: {
    engine: string;
    evaluationStatus: string;
    automatedMatchingStatus: string;
    scientificRationale: string;
    supportedPreprocessing: string[];
    morphologicalFeatureCategories: string[];
    standardsCompliance: string[];
    retentionPolicy: string;
  };
  forensicDisclaimer: string;
  modelStatus: {
    automatedMatching: string;
    validationRationale: string;
    humanReviewRequired: boolean;
    experimentalCrossModalityAvailable?: boolean;
  };
  experimentalModel?: {
    available: boolean;
    modelId: string;
    modelName: string;
    version: string;
    architecture?: string;
    admissibilityNotice: string;
    evaluationMetrics?: SketchBenchmarkEvaluation;
  } | null;
}

export interface PreprocessPayload {
  evidenceId: string;
  params: SketchPreprocessingParams;
}

export interface PreprocessResponse {
  status: string;
  evidenceId: string;
  effectiveParams: SketchPreprocessingParams;
  previewDataUrl: string;
}

export interface CreateSessionPayload {
  sketchEvidenceId: string;
  referenceEvidenceId: string;
  title?: string;
  sketchPreprocessing?: SketchPreprocessingParams;
  referencePreprocessing?: SketchPreprocessingParams;
  annotations?: MorphologicalAnnotation[];
  morphologicalChecklist?: Record<string, string>;
  examinerNotes?: string;
}

/**
 * Fetch sketch methodology specifications, limitations, and legal disclaimers.
 */
export async function getSketchMethodologyApi(): Promise<SketchMethodologyInfo> {
  const response = await apiClient.get<{ status: string; data: SketchMethodologyInfo }>(
    '/analysis/sketch/methodology'
  );
  return response.data.data;
}

/**
 * Upload an authorized witness composite sketch image directly to a case.
 */
export async function uploadSketchEvidenceApi(
  file: File,
  caseId: string,
  notes?: string
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('caseId', caseId);
  if (notes) {
    formData.append('notes', notes);
  }

  const response = await apiClient.post<{ status: string; data: any }>(
    '/analysis/sketch/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}

/**
 * Apply preprocessing filters to an evidence working copy.
 */
export async function preprocessEvidenceApi(
  payload: PreprocessPayload
): Promise<PreprocessResponse> {
  const response = await apiClient.post<PreprocessResponse>(
    '/analysis/sketch/preprocess',
    payload
  );
  return response.data;
}

/**
 * Save an authorized forensic sketch comparison and morphological review session.
 */
export async function saveSketchSessionApi(
  payload: CreateSessionPayload
): Promise<SketchSessionRecord> {
  const response = await apiClient.post<{ status: string; data: SketchSessionRecord }>(
    '/analysis/sketch/session',
    payload
  );
  return response.data.data;
}

/**
 * Execute experimental CUHK-trained cross-modality sketch-to-photo feature probe.
 */
export async function compareSketchExperimentalApi(payload: {
  sketchEvidenceId: string;
  referenceEvidenceId: string;
  saveAnalysis?: boolean;
}): Promise<ExperimentalSketchProbeResult> {
  const response = await apiClient.post<{ status: string; data: ExperimentalSketchProbeResult }>(
    '/analysis/sketch/compare-experimental',
    payload
  );
  return response.data.data;
}

/**
 * Retrieve session details by session ID.
 */
export async function getSketchSessionApi(sessionId: string): Promise<SketchSessionRecord> {
  const response = await apiClient.get<{ status: string; data: SketchSessionRecord }>(
    `/analysis/sketch/session/${encodeURIComponent(sessionId)}`
  );
  return response.data.data;
}

/**
 * Retrieve prior comparison sessions for an evidence item.
 */
export async function getSketchHistoryApi(evidenceId: string): Promise<SketchSessionRecord[]> {
  const response = await apiClient.get<{
    status: string;
    evidenceId: string;
    count: number;
    data: SketchSessionRecord[];
  }>(`/analysis/sketch/history/${encodeURIComponent(evidenceId)}`);
  return response.data.data;
}

/**
 * Stream derived comparison visualization as a Blob.
 */
export async function getSketchVisualizationBlobApi(sessionId: string): Promise<Blob> {
  const response = await apiClient.get(`/analysis/sketch/derived/${sessionId}`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Helper to download derived visualization JPEG image.
 */
export async function downloadSketchVisualization(
  sessionId: string,
  filename?: string
): Promise<void> {
  const blob = await getSketchVisualizationBlobApi(sessionId);
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename || `${sessionId}_sketch_review.jpg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(downloadUrl);
}
