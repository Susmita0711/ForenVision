import apiClient from './client';

export interface ForensicSettings {
  autoVerifyHashes: boolean;
  highContrastOverlay: boolean;
  maxUploadSizeMb: number;
  retentionPolicyDays: number;
  strictCustodyChain: boolean;
  requireTwoExaminerSignoff: boolean;
  auditTrailRetentionDays: number;
  sessionTimeoutMinutes: number;
  enforceStrictMfa: boolean;
}

export async function fetchSettingsApi(): Promise<ForensicSettings> {
  const res = await apiClient.get<{ success: boolean; settings: ForensicSettings }>('/settings');
  return res.data.settings;
}

export async function updateSettingsApi(updates: Partial<ForensicSettings>): Promise<ForensicSettings> {
  const res = await apiClient.patch<{ success: boolean; settings: ForensicSettings }>('/settings', updates);
  return res.data.settings;
}

export async function updateProfileBackendApi(updates: {
  name?: string;
  department?: string;
  badge_number?: string;
}) {
  const res = await apiClient.patch<{ success: boolean; user: Record<string, unknown> }>('/auth/profile', updates);
  return res.data.user;
}

