import apiClient from './client';
import type { ChainOfCustodyRecord, PaginationData } from '../types';

export interface FetchCustodyParams {
  caseId?: string;
  caseNumber?: string;
  evidenceId?: string;
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface RecordCustodyPayload {
  evidenceId: string;
  eventType: string;
  action?: string;
  reason: string;
  location?: string;
  recipient?: string;
  previousCustodian?: {
    name?: string;
    badge?: string;
    role?: string;
    organization?: string;
  };
  newCustodian?: {
    name?: string;
    badge?: string;
    role?: string;
    organization?: string;
  };
  notes?: string;
  isCorrection?: boolean;
  correctedEventId?: string;
  correctionReason?: string;
}

export interface ChainVerificationResponse {
  verified: boolean;
  totalEvents: number;
  evidenceId: string;
  evidenceNumber: string;
  genesisBlockHash?: string;
  latestBlockHash?: string;
  latestTimestamp?: string;
  compromisedEventId?: string;
  message: string;
}

/**
 * Fetch all accessible chain of custody events with search and filters
 */
export async function fetchCustodyEventsApi(params?: FetchCustodyParams): Promise<{
  success: boolean;
  count: number;
  events: ChainOfCustodyRecord[];
  pagination: PaginationData;
}> {
  const response = await apiClient.get('/custody', {
    params: {
      caseId: params?.caseId,
      caseNumber: params?.caseNumber,
      evidenceId: params?.evidenceId,
      type: params?.type && params.type !== 'ALL' ? params.type : undefined,
      q: params?.q?.trim() || undefined,
      page: params?.page || 1,
      limit: params?.limit || 50,
    },
  });
  return response.data;
}

/**
 * Retrieve metadata for a single custody event
 */
export async function fetchCustodyEventByIdApi(eventId: string): Promise<ChainOfCustodyRecord> {
  const response = await apiClient.get(`/custody/${encodeURIComponent(eventId)}`);
  return response.data.event;
}

/**
 * Record a new tamper-evident chain of custody event
 */
export async function recordCustodyEventApi(
  payload: RecordCustodyPayload
): Promise<{ success: boolean; message: string; event: ChainOfCustodyRecord }> {
  const response = await apiClient.post('/custody', payload);
  return response.data;
}

/**
 * Perform cryptographic hash-chain verification for an evidence artifact
 */
export async function verifyCustodyChainApi(evidenceId: string): Promise<ChainVerificationResponse> {
  const response = await apiClient.get(`/custody/verify/${encodeURIComponent(evidenceId)}`);
  return response.data.verification;
}

/**
 * Export custody history as court-ready CSV or JSON
 */
export async function exportCustodyLedgerApi(
  evidenceId: string,
  format: 'csv' | 'json' = 'csv',
  evidenceNumber?: string
): Promise<void> {
  const response = await apiClient.get(`/custody/export/${encodeURIComponent(evidenceId)}`, {
    params: { format },
    responseType: 'blob',
  });

  const contentType = (response.headers['content-type'] as string) || (format === 'json' ? 'application/json' : 'text/csv');
  const filename =
    response.headers['content-disposition']?.split('filename=')[1]?.replace(/['"]/g, '') ||
    `custody_ledger_${evidenceNumber || evidenceId}.${format}`;

  const blob = new Blob([response.data], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(url);
}
