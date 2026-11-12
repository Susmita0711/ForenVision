import { apiClient } from './client';

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: {
    id?: string;
    email?: string;
    name?: string;
    badge_number?: string;
    role?: string;
  };
  target: string;
  target_type: string;
  timestamp: string;
  details?: Record<string, unknown>;
  ip_address: string;
}

export interface PermissionMatrixResponse {
  success: boolean;
  roles: string[];
  permissions: string[];
  role_permissions: Record<string, string[]>;
}

export interface AuditLogsResponse {
  success: boolean;
  count: number;
  total: number;
  page: number;
  limit: number;
  logs: AuditLogEntry[];
}

export const getAuditLogs = async (params?: {
  page?: number;
  limit?: number;
  action?: string;
  actor?: string;
  target_type?: string;
}): Promise<AuditLogsResponse> => {
  const response = await apiClient.get<AuditLogsResponse>('/audit/logs', { params });
  return response.data;
};

export const getPermissionMatrix = async (): Promise<PermissionMatrixResponse> => {
  const response = await apiClient.get<PermissionMatrixResponse>('/audit/matrix');
  return response.data;
};
