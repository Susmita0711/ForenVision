import apiClient from './client';
import type { ForensicCase, ActivityLog } from '../types';

export interface DashboardMetrics {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  underReviewCases: number;
  totalEvidence: number;
  pendingAnalyses: number;
  analysisQueueAvailable: boolean;
}

export interface CaseStatusSlice {
  name: string;
  value: number;
  color: string;
}

export interface EvidenceDistributionItem {
  type: string;
  count: number;
}

export interface DashboardSummaryResponse {
  metrics: DashboardMetrics;
  caseStatusDistribution: CaseStatusSlice[];
  evidenceDistribution: EvidenceDistributionItem[];
  recentCases: ForensicCase[];
  recentActivity: ActivityLog[];
  metadata: {
    timestamp: string;
    userRole: string;
    authorizedCaseCount: number;
    isDatabaseConnected: boolean;
  };
}

export async function fetchDashboardSummary(): Promise<{
  success: boolean;
  data?: DashboardSummaryResponse;
  error?: string;
}> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: DashboardSummaryResponse;
    }>('/dashboard/summary');

    if (res.data.success && res.data.data) {
      return { success: true, data: res.data.data };
    }
    return { success: false, error: 'Malformed telemetry response from server.' };
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: { data?: { error?: string; message?: string }; status?: number };
      message?: string;
    };
    const message =
      axiosErr.response?.data?.message ||
      axiosErr.response?.data?.error ||
      (axiosErr.response?.status === 401
        ? 'Session expired. Please re-authenticate.'
        : 'Backend telemetry service is currently unreachable.');
    return { success: false, error: message };
  }
}
