import axios from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Request Interceptor (attach authorization tokens when present & set adaptive timeouts)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('forenvision_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Grant extended timeout for compute-intensive forensic analysis & PDF generation
    if (config.url?.includes('/analysis/') || config.url?.includes('/reports/generate')) {
      config.timeout = config.timeout && config.timeout > 30000 ? config.timeout : 60000;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response Interceptor (centralized error logging and formatting)
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const errorDetails = {
      status: error.response?.status,
      message: (error.response?.data as { message?: string })?.message || error.message,
      url: error.config?.url,
    };
    console.error('[API Client Error]:', errorDetails);
    return Promise.reject(error);
  }
);

export default apiClient;
