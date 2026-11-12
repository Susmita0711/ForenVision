import apiClient from './client';

export interface FaceQualityReport {
  qualityTier: 'HIGH_FORENSIC_QUALITY' | 'ACCEPTABLE_INVESTIGATIVE_QUALITY' | 'MARGINAL_LIMITED_VALUE' | 'DEGRADED_UNRELIABLE';
  clarityScore: number;
  laplacianVariance: number;
  meanLuminance: number;
  stdDevLuminance: number;
  dynamicRange: number;
  interPupillaryDistance: number;
  lightingAsymmetry: number;
  overexposedPercent: number;
  underexposedPercent: number;
  rollAngleDegrees: number;
  dimensions: string;
  warnings: string[];
}

export interface FaceLandmarks {
  rightEye?: [number, number];
  leftEye?: [number, number];
  noseTip?: [number, number];
  rightMouth?: [number, number];
  leftMouth?: [number, number];
}

export interface DetectedFace {
  faceIndex: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  landmarks?: FaceLandmarks;
  interPupillaryDistance: number;
  rollAngleDegrees: number;
  faceAreaRatio: number;
  quality: FaceQualityReport;
  detectorEngine: string;
}

export interface FaceDetectionResult {
  id: string;
  analysisId: string;
  analysisType: string;
  category: string;
  evidence: {
    id: string;
    evidenceNumber: string;
    filename: string;
    caseId: string;
    caseNumber: string;
    dimensions: string;
  };
  detectedFacesCount: number;
  faces: DetectedFace[];
  parameters: {
    scoreThreshold: number;
    imageResolution: string;
  };
  modelMetadata: {
    detector: string;
    detectorLicense: string;
    standardsCompliance: string[];
  };
  forensicNotice: string;
  retentionPolicy: string;
  visualization: {
    derivedFilename: string;
    hasVisual: boolean;
    fileSize: number;
  };
  analyst: {
    id: string;
    name: string;
    badge: string;
    role: string;
  };
  timestamp: string;
  status: string;
}

export interface FaceComparisonResult {
  id: string;
  analysisId: string;
  analysisType: string;
  category: string;
  probeEvidence: {
    id: string;
    evidenceNumber: string;
    filename: string;
    caseId: string;
    caseNumber: string;
    detectedFacesCount: number;
    faceConfidence?: number;
    faceBox: { x: number; y: number; width: number; height: number };
    landmarks?: FaceLandmarks;
    quality: FaceQualityReport;
  };
  referenceEvidence: {
    id: string;
    evidenceNumber: string;
    filename: string;
    caseId: string;
    caseNumber: string;
    detectedFacesCount: number;
    faceConfidence?: number;
    faceBox: { x: number; y: number; width: number; height: number };
    landmarks?: FaceLandmarks;
    quality: FaceQualityReport;
  };
  metrics: {
    cosineSimilarity: number;
    l2Distance: number;
    correspondenceIndex: number;
    correspondenceTier: 'STRONG_CORRESPONDENCE' | 'MODERATE_CORRESPONDENCE' | 'LOW_CORRESPONDENCE' | 'INCONCLUSIVE_DIVERGENT';
    interpretation: string;
    scoreThreshold: number;
  };
  modelMetadata: {
    detector: string;
    recognizer: string;
    detectorLicense: string;
    recognizerLicense: string;
    standardsCompliance: string[];
  };
  forensicNotice: string;
  retentionPolicy: string;
  visualization: {
    derivedFilename: string;
    hasVisual: boolean;
    fileSize: number;
  };
  analyst: {
    id: string;
    name: string;
    badge: string;
    role: string;
  };
  timestamp: string;
  status: string;
}

export interface FaceMethodologyInfo {
  methodology: {
    engine: string;
    detectorModel: {
      name: string;
      version: string;
      architecture: string;
      license: string;
      features: string[];
      inputResolution: string;
    };
    comparisonModel: {
      name: string;
      version: string;
      architecture: string;
      license: string;
      embeddingDimension: number;
      metrics: string[];
      canonicalCropSize: string;
    };
    fallbackDetector: {
      name: string;
      license: string;
      role: string;
    };
    qualityAssessment: string[];
    scientificLimitations: string[];
    retentionPolicy: string;
    evaluationGuidelines: Record<string, string>;
  };
  forensicDisclaimer: string;
  modelsAvailable: {
    yuNetDetectionModel: boolean;
    sFaceRecognitionModel: boolean;
    haarCascadeFallback: boolean;
  };
}

export interface DetectFacesPayload {
  evidenceId: string;
  scoreThreshold?: number;
  saveAnalysis?: boolean;
}

export interface CompareFacesPayload {
  probeEvidenceId: string;
  referenceEvidenceId: string;
  scoreThreshold?: number;
  saveAnalysis?: boolean;
}

/**
 * Fetch scientific methodology, model specifications, and legal caveats.
 */
export async function getFaceMethodologyApi(): Promise<FaceMethodologyInfo> {
  const response = await apiClient.get<{ status: string; data: FaceMethodologyInfo }>(
    '/analysis/face/methodology'
  );
  return response.data.data;
}

/**
 * Perform facial detection, landmark localization, and quality audit on single evidence item.
 */
export async function detectFacesApi(payload: DetectFacesPayload): Promise<FaceDetectionResult> {
  const response = await apiClient.post<{ status: string; data: FaceDetectionResult }>(
    '/analysis/face/detect',
    payload
  );
  return response.data.data;
}

/**
 * Execute strictly controlled 1-to-1 facial comparison between two authorized evidence items.
 */
export async function compareFacesApi(payload: CompareFacesPayload): Promise<FaceComparisonResult> {
  const response = await apiClient.post<{ status: string; data: FaceComparisonResult }>(
    '/analysis/face/compare',
    payload
  );
  return response.data.data;
}

/**
 * Fetch prior facial analysis records for an evidence item.
 */
export async function getFaceHistoryApi(evidenceId: string): Promise<any[]> {
  const response = await apiClient.get<{
    status: string;
    evidenceId: string;
    count: number;
    data: any[];
  }>(`/analysis/face/history/${encodeURIComponent(evidenceId)}`);
  return response.data.data;
}

/**
 * Stream derived facial comparison / detection visualization as a Blob.
 */
export async function getFaceVisualizationBlobApi(analysisId: string): Promise<Blob> {
  const response = await apiClient.get(`/analysis/face/derived/${analysisId}`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Helper to download derived visualization JPEG image directly.
 */
export async function downloadFaceVisualization(
  analysisId: string,
  filename?: string
): Promise<void> {
  const blob = await getFaceVisualizationBlobApi(analysisId);
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename || `${analysisId}_facial_analysis.jpg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(downloadUrl);
}
