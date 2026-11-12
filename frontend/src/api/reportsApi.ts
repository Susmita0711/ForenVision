import apiClient from './client';

export interface ReportCaseMetadata {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedInvestigator?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface ReportEvidenceItem {
  id: string;
  evidenceNumber: string;
  filename: string;
  type: string;
  fileSizeBytes: number;
  mediaType: string;
  sha256: string;
  uploadedAt: string;
  integrityStatus: string;
}

export interface ReportCustodyItem {
  eventId: string;
  evidenceNumber: string;
  eventType: string;
  actingUser: string;
  timestamp: string;
  notes: string;
  verificationHash?: string;
}

export interface ReportSectionA {
  title: string;
  physicalDigitalEvidenceFacts: {
    totalEvidenceItems: number;
    inventory: ReportEvidenceItem[];
  };
  chainOfCustodyAudit: {
    totalCustodyEvents: number;
    timeline: ReportCustodyItem[];
  };
}

export interface ReportSectionB {
  title: string;
  imageForensics: {
    totalAnalyses: number;
    results: any[];
  } | null;
  objectDetection: {
    totalRuns: number;
    totalDetectionsCount: number;
    results: any[];
  } | null;
  fingerprintComparison: {
    totalComparisons: number;
    results: any[];
  } | null;
  faceAnalysis: {
    totalEvaluations: number;
    results: any[];
  } | null;
  witnessSketchReview: {
    totalSessions: number;
    results: any[];
  } | null;
}

export interface ReportSectionC {
  title: string;
  investigatorReviewNotes: string;
  verificationMethodology: string;
  examiner: {
    name: string;
    badge: string;
    role: string;
  };
}

export interface ReportLimitationsBlock {
  title: string;
  dataIntegrityGaps: string[];
  modelBoundaryDisclaimers: string[];
}

export interface ReportDigitalDigest {
  sha256_metadata: string;
  sha256_pdf: string;
  generatedAtUtc: string;
  reportId: string;
  reportVersion: string;
}

export interface ForensicReportDocument {
  id: string;
  reportId: string;
  reportNumber: string;
  version: string;
  reportVersion: string;
  title: string;
  classification: string;
  caseId: string;
  caseNumber: string;
  caseMetadata: ReportCaseMetadata;
  evidenceInventory: ReportEvidenceItem[];
  evidenceCount: number;
  chainOfCustody: ReportCustodyItem[];
  custodyEventsCount: number;
  analyses: Record<string, any>;
  sectionA_observations?: ReportSectionA;
  sectionB_automated_diagnostics?: ReportSectionB;
  sectionC_investigator_interpretations?: ReportSectionC;
  limitationsAndGaps?: ReportLimitationsBlock;
  investigatorReviewNotes: string;
  limitationsAndIncompleteData: string[];
  forensicNotice: string;
  author: {
    id: string;
    name: string;
    badge: string;
    role: string;
  };
  investigator?: {
    id: string;
    name: string;
    badge: string;
    role: string;
    email: string;
  };
  pdf: {
    fileSizeBytes: number;
    sha256: string;
    filename: string;
  };
  digitalDigest?: ReportDigitalDigest;
  createdAt: string;
  status: string;
}

export interface GenerateReportPayload {
  caseId: string;
  title?: string;
  classification?: string;
  investigatorNotes?: string;
}

/**
 * Fetch list of authorized forensic reports with optional case filtering.
 */
export async function fetchReportsApi(caseId?: string): Promise<ForensicReportDocument[]> {
  const params: Record<string, string> = {};
  if (caseId) params.caseId = caseId;
  const response = await apiClient.get('/reports', { params });
  return response.data?.data || [];
}

/**
 * Generate and seal a new court exhibit report using real database records.
 */
export async function generateReportApi(
  payload: GenerateReportPayload
): Promise<ForensicReportDocument> {
  const response = await apiClient.post('/reports/generate', payload);
  return response.data?.data;
}

/**
 * Retrieve comprehensive report document by ID.
 */
export async function getReportDetailsApi(reportId: string): Promise<ForensicReportDocument> {
  const response = await apiClient.get(`/reports/${encodeURIComponent(reportId)}`);
  return response.data?.data;
}

/**
 * Securely stream and download the ReportLab generated PDF file.
 * Uses authenticated Bearer token and triggers local browser download.
 */
export async function downloadReportPdfApi(reportId: string, filename?: string): Promise<void> {
  const response = await apiClient.get(`/reports/${encodeURIComponent(reportId)}/pdf?download=true`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${reportId}_dossier.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Retrieve structured report payload formatted for browser printable view.
 */
export async function getPrintablePreviewApi(reportId: string): Promise<ForensicReportDocument> {
  const response = await apiClient.get(`/reports/${encodeURIComponent(reportId)}/preview`);
  return response.data?.data;
}
