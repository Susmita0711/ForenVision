import apiClient from './client';

export interface MinutiaePoint {
  type: 'termination' | 'bifurcation';
  x: number;
  y: number;
}

export interface MinutiaeSummary {
  total: number;
  terminations: number;
  bifurcations: number;
}

export interface QualityReport {
  qualityTier: 'EXCELLENT' | 'ACCEPTABLE' | 'MARGINAL' | 'POOR / INSUFFICIENT';
  clarityScore: number;
  laplacianVariance: number;
  meanIntensity: number;
  stdDevIntensity: number;
  dynamicRange: number;
  usableAreaPercent: number;
  warnings: string[];
  dimensions: string;
}

export interface EvidenceSideInfo {
  id: string;
  evidenceNumber: string;
  caseId: string;
  caseNumber: string;
  filename: string;
  quality: QualityReport;
  minutiae: MinutiaeSummary;
  keypointCount: number;
}

export interface AlignmentData {
  rotationDegrees: number;
  translationX: number;
  translationY: number;
  scaleFactor: number;
  transformationMatrix: number[][];
}

export interface ComparisonMetrics {
  rawCandidateMatches: number;
  ratioFilteredMatches: number;
  inlierCount: number;
  inlierRatio: number;
  correspondenceTier: 'STRONG_CORRESPONDENCE' | 'MODERATE_CORRESPONDENCE' | 'INCONCLUSIVE_CORRESPONDENCE' | 'NO_SIGNIFICANT_CORRESPONDENCE';
  alignment: AlignmentData | null;
  interpretation: string;
}

export interface FingerprintComparisonResult {
  id: string;
  analysisId: string;
  analysisType: string;
  category: string;
  probeEvidence: EvidenceSideInfo;
  referenceEvidence: EvidenceSideInfo;
  comparisonMetrics: ComparisonMetrics;
  parameters: {
    loweRatioThreshold: number;
    ransacReprojectionThreshold: number;
    maxSiftFeatures: number;
    enhancementMethod: string;
  };
  derivedStorageRef: string;
  derivedImageUrl: string;
  forensicDisclaimer: string;
  timestamp: string;
  performedBy: string;
  status: string;
}

export interface MethodologyInfo {
  methodology: {
    engine: string;
    preprocessing: string[];
    featureExtraction: string[];
    alignmentAndMatching: string[];
    scientificLimitations: string[];
  };
  forensicDisclaimer: string;
  evaluationGuidelines: Record<string, string>;
}

export interface CompareFingerprintsPayload {
  probeEvidenceId: string;
  referenceEvidenceId: string;
  loweRatio?: number;
  ransacThreshold?: number;
  maxFeatures?: number;
  saveAnalysis?: boolean;
}

/**
 * Fetch scientific methodology, algorithm specifications, and legal caveats.
 */
export async function getFingerprintMethodologyApi(): Promise<MethodologyInfo> {
  const response = await apiClient.get<{ status: string; data: MethodologyInfo }>(
    '/analysis/fingerprint/methodology'
  );
  return response.data.data;
}

/**
 * Run standalone image quality assessment on an evidence artifact.
 */
export async function assessFingerprintQualityApi(evidenceId: string): Promise<QualityReport> {
  const response = await apiClient.post<{ status: string; quality: QualityReport }>(
    '/analysis/fingerprint/assess-quality',
    { evidenceId }
  );
  return response.data.quality;
}

/**
 * Compare two authorized fingerprint impressions using SIFT descriptors and RANSAC alignment.
 */
export async function compareFingerprintsApi(
  payload: CompareFingerprintsPayload
): Promise<FingerprintComparisonResult> {
  const response = await apiClient.post<{
    status: string;
    data: FingerprintComparisonResult;
    message: string;
  }>('/analysis/fingerprint/compare', payload);
  return response.data.data;
}

/**
 * Stream derived comparison visualization as a Blob.
 */
export async function getFingerprintVisualizationBlobApi(analysisId: string): Promise<Blob> {
  const response = await apiClient.get(`/analysis/fingerprint/derived/${analysisId}`, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Fetch prior fingerprint comparisons for an evidence item.
 */
export async function getFingerprintHistoryApi(
  evidenceId: string
): Promise<FingerprintComparisonResult[]> {
  const response = await apiClient.get<{
    status: string;
    history: FingerprintComparisonResult[];
    count: number;
  }>(`/analysis/fingerprint/history/${encodeURIComponent(evidenceId)}`);
  return response.data.history;
}

/**
 * Helper to download the derived match visualization image directly.
 */
export async function downloadFingerprintVisualization(
  analysisId: string,
  filename?: string
): Promise<void> {
  const blob = await getFingerprintVisualizationBlobApi(analysisId);
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename || `${analysisId}_fingerprint_comparison.jpg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(downloadUrl);
}
