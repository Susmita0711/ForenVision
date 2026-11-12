import apiClient from './client';
import type { AxiosProgressEvent } from 'axios';
import type { 
  EvidenceItem, 
  EvidenceType, 
  IntegrityStatus, 
  PaginationData, 
  ChainOfCustodyRecord 
} from '../types';

export interface FetchEvidenceParams {
  caseId?: string;
  caseNumber?: string;
  type?: string;
  integrity?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface UploadEvidencePayload {
  file: File;
  caseIdOrNumber: string;
  name?: string;
  type?: EvidenceType;
  notes?: string;
  tags?: string[];
}

export interface VerificationResult {
  verified: boolean;
  integrityStatus: IntegrityStatus;
  computedHash: string;
  storedHash: string;
  lastIntegrityCheck: string;
  message: string;
}

export interface EvidenceListResponse {
  success: boolean;
  count: number;
  evidence: EvidenceItem[];
  pagination: PaginationData;
}

export interface AssociatedAnalysis {
  id: string;
  evidenceId: string;
  evidenceNumber: string;
  analysisType: string;
  performedBy: string;
  timestamp: string;
  summary: string;
  integrityScore?: number;
  status: string;
  details?: Record<string, any>;
}

/**
 * Fetch accessible evidence items with query parameters and filters
 */
export async function fetchEvidenceApi(params?: FetchEvidenceParams): Promise<EvidenceListResponse> {
  const response = await apiClient.get<EvidenceListResponse>('/evidence', {
    params: {
      caseId: params?.caseId,
      caseNumber: params?.caseNumber,
      type: params?.type && params.type !== 'ALL' ? params.type : undefined,
      integrity: params?.integrity && params.integrity !== 'ALL' ? params.integrity : undefined,
      q: params?.q?.trim() || undefined,
      page: params?.page || 1,
      limit: params?.limit || 20,
    },
  });
  return response.data;
}

/**
 * Retrieve metadata for a single evidence item by ID or evidence number
 */
export async function fetchEvidenceByIdApi(evidenceId: string): Promise<EvidenceItem> {
  const response = await apiClient.get<{ success: boolean; evidence: EvidenceItem }>(
    `/evidence/${encodeURIComponent(evidenceId)}`
  );
  return response.data.evidence;
}

/**
 * Upload an evidence file with progress monitoring
 */
export async function uploadEvidenceApi(
  payload: UploadEvidencePayload,
  onProgress?: (percentCompleted: number) => void
): Promise<{ success: boolean; evidence: EvidenceItem; message: string }> {
  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append('caseId', payload.caseIdOrNumber);

  if (payload.name) {
    formData.append('name', payload.name);
  }
  if (payload.type) {
    formData.append('type', payload.type);
  }
  if (payload.notes) {
    formData.append('notes', payload.notes);
  }
  if (payload.tags && payload.tags.length > 0) {
    formData.append('tags', payload.tags.join(','));
  }

  const response = await apiClient.post<{
    success: boolean;
    evidence: EvidenceItem;
    message: string;
  }>('/evidence/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent: AxiosProgressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return response.data;
}

/**
 * Download original immutable evidence binary
 */
export async function downloadEvidenceFileApi(evidenceId: string, filename?: string): Promise<void> {
  const response = await apiClient.get(`/evidence/${encodeURIComponent(evidenceId)}/download`, {
    responseType: 'blob',
  });

  // Extract filename from header or fallback
  let downloadFilename = filename;
  if (!downloadFilename) {
    const disposition = response.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        downloadFilename = match[1].replace(/['"]/g, '');
      }
    }
  }
  if (!downloadFilename) {
    downloadFilename = `evidence_${evidenceId}.bin`;
  }

  const contentType = (response.headers['content-type'] as string) || 'application/octet-stream';
  const blob = new Blob([response.data], {
    type: contentType,
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', downloadFilename);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Retrieve blob preview URL with authorization header attached
 */
export async function fetchEvidencePreviewUrlApi(evidenceId: string): Promise<string> {
  const response = await apiClient.get(`/evidence/${encodeURIComponent(evidenceId)}/preview`, {
    responseType: 'blob',
  });
  const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
  const blob = new Blob([response.data], {
    type: contentType,
  });
  return window.URL.createObjectURL(blob);
}

/**
 * On-demand cryptographic SHA-256 verification
 */
export async function verifyEvidenceIntegrityApi(evidenceId: string): Promise<VerificationResult> {
  const response = await apiClient.post<{
    success: boolean;
    verification: VerificationResult;
  }>(`/evidence/${encodeURIComponent(evidenceId)}/verify`);
  return response.data.verification;
}

/**
 * Fetch AI analyses associated with this evidence item
 */
export async function fetchEvidenceAnalysesApi(evidenceId: string): Promise<AssociatedAnalysis[]> {
  const response = await apiClient.get<{
    success: boolean;
    count: number;
    analyses: AssociatedAnalysis[];
  }>(`/evidence/${encodeURIComponent(evidenceId)}/analyses`);
  return response.data.analyses;
}

/**
 * Associate a new AI analysis report with evidence
 */
export async function associateEvidenceAnalysisApi(
  evidenceId: string,
  analysisData: {
    analysisType: string;
    summary: string;
    integrityScore?: number;
    details?: Record<string, any>;
  }
): Promise<AssociatedAnalysis> {
  const response = await apiClient.post<{
    success: boolean;
    message: string;
    analysis: AssociatedAnalysis;
  }>(`/evidence/${encodeURIComponent(evidenceId)}/analyses`, analysisData);
  return response.data.analysis;
}

/**
 * Fetch verified Chain of Custody blocks for evidence item
 */
export async function fetchEvidenceCustodyApi(
  evidenceId: string
): Promise<ChainOfCustodyRecord[]> {
  const response = await apiClient.get<{
    success: boolean;
    count: number;
    custody: ChainOfCustodyRecord[];
  }>(`/evidence/${encodeURIComponent(evidenceId)}/custody`);
  return response.data.custody;
}
