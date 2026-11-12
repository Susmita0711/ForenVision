import apiClient from './client';
import type { HealthResponse, DatabaseHealthResponse } from '../types';

/**
 * Fetch general system health status.
 * Reports Flask backend operational readiness and summary database status.
 */
export const getHealthStatus = async (): Promise<HealthResponse> => {
  const response = await apiClient.get<HealthResponse>('/health');
  return response.data;
};

/**
 * Fetch detailed database connectivity and health diagnostic.
 * Queries MongoDB Atlas connection, ping latency, and index verification.
 */
export const getDatabaseHealth = async (): Promise<DatabaseHealthResponse> => {
  const response = await apiClient.get<DatabaseHealthResponse>('/database-health');
  return response.data;
};
