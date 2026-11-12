import apiClient from './client';

export interface ExifCameraInfo {
  make?: string | null;
  model?: string | null;
  software?: string | null;
  lensModel?: string | null;
  focalLength?: number | null;
  fNumber?: number | null;
  exposureTime?: string | null;
  isoSpeedRatings?: number | string | null;
}

export interface ExifTimestamps {
  dateTime?: string | null;
  dateTimeOriginal?: string | null;
  dateTimeDigitized?: string | null;
  offsetTime?: string | null;
  offsetTimeOriginal?: string | null;
}

export interface ExifGpsInfo {
  hasGpsData: boolean;
  latitude?: number | null;
  longitude?: number | null;
  altitudeMeters?: number | null;
  gpsTimestamp?: string | null;
}

export interface ImageMetadataReport {
  evidenceId: string;
  evidenceNumber: string;
  caseId: string;
  caseNumber: string;
  filename: string;
  mediaType: string;
  fileFormat: string;
  fileSizeBytes: number;
  dimensions: {
    width: number;
    height: number;
    aspectRatio: number;
    totalPixels: number;
  };
  colorMode: string;
  hasExif: boolean;
  camera: ExifCameraInfo;
  timestamps: ExifTimestamps;
  timestampTrustworthinessNotice: string;
  orientation: {
    value: number | null;
    description: string;
  };
  gps: ExifGpsInfo;
  missingFields: string[];
  rawExif: Record<string, any>;
  extractedAt: string;
}

export interface ElaParameters {
  quality: number;
  scale: number;
  recompressionAlgorithm: string;
}

export interface ElaStatistics {
  meanError: number;
  peakError: number;
  stdDevError: number;
  dimensions: string;
  totalPixels: number;
}

export interface ElaAnalysisReport {
  id: string;
  analysisId: string;
  evidenceId: string;
  evidenceNumber: string;
  caseId: string;
  caseNumber: string;
  analysisType: string;
  category: string;
  modelEngine: string;
  parameters: ElaParameters;
  statistics: ElaStatistics;
  derivedStorageRef: string;
  derivedImageUrl: string;
  metadata?: ImageMetadataReport;
  forensicDisclaimer: string;
  timestamp: string;
  performedBy: string;
  status: string;
}

/**
 * Extract EXIF, camera, timestamps, orientation, and GPS metadata
 */
export async function extractImageMetadataApi(evidenceId: string): Promise<ImageMetadataReport> {
  const response = await apiClient.post<{
    success: boolean;
    metadata: ImageMetadataReport;
  }>('/analysis/image/metadata', { evidenceId });
  return response.data.metadata;
}

/**
 * Execute Error Level Analysis (ELA) via JPEG recompression
 */
export async function runErrorLevelAnalysisApi(payload: {
  evidenceId: string;
  quality?: number;
  scale?: number;
  saveResult?: boolean;
}): Promise<ElaAnalysisReport> {
  const response = await apiClient.post<{
    success: boolean;
    message: string;
    analysis: ElaAnalysisReport;
  }>('/analysis/image/ela', payload);
  return response.data.analysis;
}

/**
 * Fetch derived visualization image blob URL with authentication header
 */
export async function fetchDerivedImageBlobUrlApi(analysisId: string): Promise<string> {
  const response = await apiClient.get(`/analysis/image/derived/${encodeURIComponent(analysisId)}`, {
    responseType: 'blob',
  });
  const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
  const blob = new Blob([response.data], { type: contentType });
  return window.URL.createObjectURL(blob);
}

/**
 * Download derived ELA visualization image
 */
export async function downloadDerivedImageApi(analysisId: string, filename?: string): Promise<void> {
  const response = await apiClient.get(`/analysis/image/derived/${encodeURIComponent(analysisId)}`, {
    responseType: 'blob',
  });
  const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
  const downloadName = filename || `ela_analysis_${analysisId}.jpg`;
  const blob = new Blob([response.data], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', downloadName);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Fetch analysis history for an evidence artifact
 */
export async function fetchImageAnalysisHistoryApi(evidenceId: string): Promise<ElaAnalysisReport[]> {
  const response = await apiClient.get<{
    success: boolean;
    count: number;
    history: ElaAnalysisReport[];
  }>(`/analysis/image/history/${encodeURIComponent(evidenceId)}`);
  return response.data.history;
}
