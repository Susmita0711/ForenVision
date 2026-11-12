import apiClient from './client';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedObject {
  detectionId: string;
  classId: number;
  className: string;
  confidence: number;
  confidencePercent: number;
  sourceModel?: string;
  box: BoundingBox;
  normalizedBox: NormalizedBox;
}

export interface DetectionConfidenceStats {
  meanPercent: number | null;
  maxPercent: number | null;
  minPercent: number | null;
  perClassMeanPercent: Record<string, number>;
}

export interface GunEvaluationSplitMetrics {
  precision: number;
  recall: number;
  mAP50: number;
  mAP50_95: number;
  perClass?: Record<string, { ap50: number; ap50_95: number }>;
}

export interface AvailableDetectionModel {
  modelId: 'yolov4-tiny' | 'forensic-gun-yolov8' | 'combined' | string;
  modelName: string;
  version: string;
  available: boolean;
  supportedClassesCount: number;
  supportedClasses: string[];
  description: string;
  trainingDataset?: Record<string, unknown>;
  evaluationMetrics?: {
    validation?: GunEvaluationSplitMetrics;
    heldOutTest?: GunEvaluationSplitMetrics;
  };
  onnxSha256?: string;
  modelSizeMB?: number;
}

export interface ModelInfo {
  modelId?: string;
  modelName: string;
  version: string;
  source: string;
  license: string;
  architecture: string;
  supportedClassesCount: number;
  supportedClasses: string[];
  inferenceRequirements: {
    engine: string;
    computeTarget: string;
    inputResolution: string;
    normalization: string;
    memoryFootprintMB: number;
    typicalLatencyMs: string;
  };
  trainingDataset?: Record<string, unknown>;
  evaluationMetrics?: AvailableDetectionModel['evaluationMetrics'];
  onnxSha256?: string;
  knownLimitations: string[];
  forensicDisclaimer: string;
  availableModels?: AvailableDetectionModel[];
}

export interface DetectionResult {
  id: string;
  analysisId: string;
  evidenceId: string;
  evidenceNumber: string;
  caseId: string;
  caseNumber: string;
  analysisType: string;
  category: string;
  modelId?: string;
  modelInfo: {
    id?: string;
    name: string;
    version: string;
    source: string;
    license: string;
    benchmarkMetrics?: AvailableDetectionModel['evaluationMetrics'] | null;
    benchmarkNote?: string;
    trainingDataset?: Record<string, unknown>;
  };
  parameters: {
    confidenceThreshold: number;
    nmsThreshold: number;
    inputResolution: string;
    engine: string;
    modelId?: string;
  };
  summary: {
    totalObjects: number;
    uniqueClasses: number;
    classCounts: Record<string, number>;
    inferenceLatencyMs: number;
    imageResolution: string;
    firearmDetections?: number;
    confidenceStats?: DetectionConfidenceStats;
  };
  detectedObjects: DetectedObject[];
  derivedStorageRef: string;
  derivedImageUrl: string;
  forensicDisclaimer: string;
  timestamp: string;
  performedBy: string;
  status: string;
}

export interface RunDetectionPayload {
  evidenceId: string;
  confidenceThreshold?: number;
  nmsThreshold?: number;
  saveAnalysis?: boolean;
  modelId?: string;
}

/**
 * Fetch model specifications, architecture, licensing, and limitations.
 */
export async function getModelInfoApi(modelId?: string): Promise<ModelInfo> {
  const response = await apiClient.get<{ status: string; modelInfo: ModelInfo }>(
    '/analysis/detection/model-info',
    { params: modelId ? { modelId } : undefined }
  );
  return response.data.modelInfo;
}

/**
 * Run real deep-learning object detection inference on an authorized evidence artifact.
 */
export async function runObjectDetectionApi(payload: RunDetectionPayload): Promise<DetectionResult> {
  const response = await apiClient.post<{ status: string; data: DetectionResult; message: string }>(
    '/analysis/detection/run',
    payload
  );
  return response.data.data;
}

/**
 * Fetch the annotated visualization image as a Blob for inline preview or custom rendering.
 */
export async function getDetectionVisualizationBlobApi(analysisId: string): Promise<Blob> {
  const response = await apiClient.get(`/analysis/detection/derived/${analysisId}`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Fetch prior object detection analyses for an authorized evidence artifact.
 */
export async function getDetectionHistoryApi(evidenceId: string): Promise<DetectionResult[]> {
  const response = await apiClient.get<{ status: string; history: DetectionResult[]; count: number }>(
    `/analysis/detection/history/${encodeURIComponent(evidenceId)}`
  );
  return response.data.history;
}

/**
 * Helper to download the derived annotated visualization directly.
 */
export async function downloadDetectionVisualization(analysisId: string, filename?: string): Promise<void> {
  const blob = await getDetectionVisualizationBlobApi(analysisId);
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename || `${analysisId}_visualization.jpg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(downloadUrl);
}
