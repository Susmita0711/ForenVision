import apiClient from './client';
import type { 
  ForensicCase, 
  CasePriority, 
  CaseStatus, 
  EvidenceItem, 
  PaginationData, 
  ActivityLog,
  BaseAnalysisResult
} from '../types';

export interface CreateCasePayload {
  title: string;
  description?: string;
  incidentType?: string;
  priority?: CasePriority;
  tags?: string[];
  is_restricted?: boolean;
  leadInvestigator?: string;
  assignedExaminers?: string[];
}

export interface UpdateCasePayload {
  title?: string;
  description?: string;
  incidentType?: string;
  priority?: CasePriority;
  tags?: string[];
  leadInvestigator?: string;
  assignedExaminers?: string[];
  is_restricted?: boolean;
}

export interface FetchCasesParams {
  status?: string;
  priority?: string;
  incidentType?: string;
  q?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface AttachEvidencePayload {
  name: string;
  type: EvidenceItem['type'];
  fileFormat: string;
  fileSizeBytes: number;
  sha256Hash: string;
  originalFileName?: string;
  tags?: string[];
  notes?: string;
  thumbnailUrl?: string;
}

export async function fetchCasesApi(params?: FetchCasesParams): Promise<{
  success: boolean;
  cases: ForensicCase[];
  pagination?: PaginationData;
  error?: string;
}> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      cases: ForensicCase[];
      count: number;
      pagination?: PaginationData;
    }>('/cases', { params });

    if (res.data.success && Array.isArray(res.data.cases)) {
      return { 
        success: true, 
        cases: res.data.cases,
        pagination: res.data.pagination
      };
    }
    return { success: false, cases: [], error: 'Unexpected response format.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
      message?: string;
    };
    return {
      success: false,
      cases: [],
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to connect to cases endpoint.',
    };
  }
}

export async function fetchCaseByIdApi(
  caseId: string
): Promise<{ success: boolean; case?: ForensicCase; error?: string }> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      case: ForensicCase;
    }>(`/cases/${caseId}`);

    if (res.data.success && res.data.case) {
      return { success: true, case: res.data.case };
    }
    return { success: false, error: 'Case not found or access restricted.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to retrieve case details.',
    };
  }
}

export async function createCaseApi(
  payload: CreateCasePayload
): Promise<{ success: boolean; case?: ForensicCase; error?: string; message?: string }> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      case: ForensicCase;
      message?: string;
    }>('/cases', payload);

    if (res.data.success && res.data.case) {
      return { success: true, case: res.data.case, message: res.data.message };
    }
    return {
      success: false,
      error: res.data.message || 'Case creation unsuccessful.',
    };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
      message?: string;
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Error contacting case registry service.',
    };
  }
}

export async function updateCaseApi(
  caseId: string,
  payload: UpdateCasePayload
): Promise<{ success: boolean; case?: ForensicCase; error?: string; message?: string }> {
  try {
    const res = await apiClient.patch<{
      success: boolean;
      case: ForensicCase;
      message?: string;
    }>(`/cases/${caseId}`, payload);

    if (res.data.success && res.data.case) {
      return { success: true, case: res.data.case, message: res.data.message };
    }
    return {
      success: false,
      error: res.data.message || 'Failed to update case docket.',
    };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Unable to submit case modifications.',
    };
  }
}

export async function updateCaseStatusApi(
  caseId: string,
  status: CaseStatus,
  reason?: string
): Promise<{ success: boolean; case?: ForensicCase; error?: string; message?: string }> {
  try {
    const res = await apiClient.patch<{
      success: boolean;
      case: ForensicCase;
      message?: string;
    }>(`/cases/${caseId}/status`, { status, reason });

    if (res.data.success && res.data.case) {
      return { success: true, case: res.data.case, message: res.data.message };
    }
    return {
      success: false,
      error: res.data.message || 'Failed to transition case status.',
    };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Unable to transition case status.',
    };
  }
}

export async function archiveCaseApi(
  caseId: string,
  reason?: string
): Promise<{ success: boolean; case?: ForensicCase; error?: string; message?: string }> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      case: ForensicCase;
      message?: string;
    }>(`/cases/${caseId}/archive`, { reason });

    if (res.data.success && res.data.case) {
      return { success: true, case: res.data.case, message: res.data.message };
    }
    return {
      success: false,
      error: res.data.message || 'Failed to archive case docket.',
    };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to archive case docket.',
    };
  }
}

export async function fetchCaseEvidenceApi(
  caseId: string
): Promise<{ success: boolean; evidence: EvidenceItem[]; error?: string }> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      evidence: EvidenceItem[];
    }>(`/cases/${caseId}/evidence`);

    if (res.data.success && Array.isArray(res.data.evidence)) {
      return { success: true, evidence: res.data.evidence };
    }
    return { success: false, evidence: [], error: 'Unexpected response format.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      evidence: [],
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to retrieve case evidence.',
    };
  }
}

export async function attachCaseEvidenceApi(
  caseId: string,
  payload: AttachEvidencePayload
): Promise<{ success: boolean; evidence?: EvidenceItem; error?: string; message?: string }> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      evidence: EvidenceItem;
      message?: string;
    }>(`/cases/${caseId}/evidence`, payload);

    if (res.data.success && res.data.evidence) {
      return { success: true, evidence: res.data.evidence, message: res.data.message };
    }
    return {
      success: false,
      error: res.data.message || 'Evidence intake failed.',
    };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to attach evidence artifact.',
    };
  }
}

export async function fetchCaseAnalysesApi(
  caseId: string
): Promise<{ success: boolean; analyses: BaseAnalysisResult[]; error?: string }> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      analyses: BaseAnalysisResult[];
    }>(`/cases/${caseId}/analyses`);

    if (res.data.success && Array.isArray(res.data.analyses)) {
      return { success: true, analyses: res.data.analyses };
    }
    return { success: false, analyses: [], error: 'Unexpected response format.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      analyses: [],
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to retrieve case analysis results.',
    };
  }
}

export async function fetchCaseAuditApi(
  caseId: string
): Promise<{ success: boolean; auditLogs: ActivityLog[]; error?: string }> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      audit_logs: ActivityLog[];
    }>(`/cases/${caseId}/audit`);

    if (res.data.success && Array.isArray(res.data.audit_logs)) {
      return { success: true, auditLogs: res.data.audit_logs };
    }
    return { success: false, auditLogs: [], error: 'Unexpected response format.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string } };
    };
    return {
      success: false,
      auditLogs: [],
      error:
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        'Failed to retrieve case audit logs.',
    };
  }
}
