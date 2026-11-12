import { apiClient } from './client';
import type { User, UserRole } from '../types';

export interface BackendUser {
  id: string;
  email: string;
  full_name: string;
  badge_number: string;
  role: UserRole;
  department: string;
  organization?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string | null;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: BackendUser;
  error?: string;
}

export interface UsersListResponse {
  success: boolean;
  count: number;
  users: BackendUser[];
}

export function adaptBackendUser(raw: unknown): User {
  const u = (raw || {}) as Record<string, unknown>;
  const is_active = typeof u.is_active === 'boolean' ? u.is_active : true;
  const fullName = (u.full_name as string) || (u.name as string) || 'Forensic Examiner';
  const badgeNum = (u.badge_number as string) || (u.badgeNumber as string) || 'FX-0000';
  const lastLoginStr = (u.last_login as string) || (u.lastActive as string) || undefined;

  return {
    id: String(u.id || u._id || ''),
    badgeNumber: badgeNum,
    badge_number: badgeNum,
    name: fullName,
    full_name: fullName,
    email: (u.email as string) || '',
    role: (u.role as UserRole) || 'analyst',
    department: (u.department as string) || 'Digital Forensics Division',
    organization: (u.organization as string) || 'ForenVision Forensic Laboratory',
    is_active: is_active,
    status: is_active ? 'active' : 'suspended',
    lastActive: lastLoginStr ? new Date(lastLoginStr).toLocaleString() : 'Current Session',
    created_at: (u.created_at as string) || new Date().toISOString(),
    last_login: lastLoginStr,
  };
}

export async function loginApi(email: string, password: string):Promise<{ success: boolean; token?: string; user?: User; error?: string }> {
  try {
    const res = await apiClient.post<AuthResponse>('/auth/login', {
      email,
      password,
    });
    if (res.data.success && res.data.user) {
      return {
        success: true,
        token: res.data.token,
        user: adaptBackendUser(res.data.user),
      };
    }
    return {
      success: false,
      error: res.data.message || 'Login failed',
    };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    const msg =
      axiosErr.response?.data?.error ||
      axiosErr.response?.data?.message ||
      'Unable to connect to authentication server';
    return { success: false, error: msg };
  }
}

export async function registerApi(data: {
  email: string;
  password: string;
  fullName: string;
  badgeNumber: string;
  department?: string;
  organization?: string;
  role?: string;
}): Promise<{ success: boolean; token?: string; user?: User; error?: string }> {
  try {
    const res = await apiClient.post<AuthResponse>('/auth/register', {
      email: data.email,
      password: data.password,
      full_name: data.fullName,
      badge_number: data.badgeNumber,
      department: data.department || 'Digital Forensics Division',
      organization: data.organization || 'ForenVision Forensic Laboratory',
      role: data.role || 'analyst',
    });
    if (res.data.success && res.data.user) {
      return {
        success: true,
        token: res.data.token,
        user: adaptBackendUser(res.data.user),
      };
    }
    return {
      success: false,
      error: res.data.message || 'Registration failed',
    };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    const msg =
      axiosErr.response?.data?.error ||
      axiosErr.response?.data?.message ||
      'Registration request failed';
    return { success: false, error: msg };
  }
}

export async function logoutApi(): Promise<{ success: boolean }> {
  try {
    await apiClient.post('/auth/logout');
    return { success: true };
  } catch {
    return { success: true };
  }
}

export async function getCurrentUserApi(): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await apiClient.get<{ success: boolean; user: BackendUser }>('/auth/me');
    if (res.data.success && res.data.user) {
      return {
        success: true,
        user: adaptBackendUser(res.data.user),
      };
    }
    return { success: false, error: 'Session invalid' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    return {
      success: false,
      error: axiosErr.response?.data?.error || 'Authentication expired',
    };
  }
}

export async function updateProfileApi(data: {
  fullName?: string;
  department?: string;
  organization?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await apiClient.put<{ success: boolean; message: string; user: BackendUser }>('/auth/profile', {
      full_name: data.fullName,
      department: data.department,
      organization: data.organization,
      current_password: data.currentPassword,
      new_password: data.newPassword,
    });
    if (res.data.success && res.data.user) {
      return { success: true, user: adaptBackendUser(res.data.user) };
    }
    return { success: false, error: res.data.message || 'Update failed' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    return {
      success: false,
      error: axiosErr.response?.data?.error || axiosErr.response?.data?.message || 'Profile update failed',
    };
  }
}

export async function fetchUsersApi(): Promise<{ success: boolean; users: User[]; error?: string }> {
  try {
    const res = await apiClient.get<UsersListResponse>('/users');
    if (res.data.success && Array.isArray(res.data.users)) {
      return {
        success: true,
        users: res.data.users.map(adaptBackendUser),
      };
    }
    return { success: true, users: [] };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string } } };
    return {
      success: false,
      users: [],
      error: axiosErr.response?.data?.error || 'Failed to fetch users',
    };
  }
}

export async function provisionUserApi(data: {
  email: string;
  password?: string;
  fullName: string;
  badgeNumber: string;
  role: string;
  department: string;
  organization?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await apiClient.post<{ success: boolean; user: BackendUser; message?: string }>('/users', {
      email: data.email,
      password: data.password || 'Temporary@123!',
      full_name: data.fullName,
      badge_number: data.badgeNumber,
      role: data.role,
      department: data.department,
      organization: data.organization || 'ForenVision Forensic Laboratory',
    });
    if (res.data.success && res.data.user) {
      return {
        success: true,
        user: adaptBackendUser(res.data.user),
      };
    }
    return { success: false, error: res.data.message || 'Provisioning failed' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    return {
      success: false,
      error: axiosErr.response?.data?.error || axiosErr.response?.data?.message || 'Failed to provision user',
    };
  }
}

export async function updateUserStatusApi(userId: string, isActive: boolean): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await apiClient.patch<{ success: boolean; user: BackendUser; message?: string }>(`/users/${userId}/status`, {
      is_active: isActive,
    });
    if (res.data.success && res.data.user) {
      return {
        success: true,
        user: adaptBackendUser(res.data.user),
      };
    }
    return { success: false, error: res.data.message || 'Status update failed' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    return {
      success: false,
      error: axiosErr.response?.data?.error || axiosErr.response?.data?.message || 'Failed to update user status',
    };
  }
}

export async function assignUserRoleApi(
  userId: string,
  role: string,
  authorizedWorkflows?: string[]
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await apiClient.patch<{ success: boolean; user: BackendUser; message?: string }>(`/users/${userId}/role`, {
      role,
      authorizedWorkflows,
    });
    if (res.data.success && res.data.user) {
      return {
        success: true,
        user: adaptBackendUser(res.data.user),
      };
    }
    return { success: false, error: res.data.message || 'Role assignment failed' };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    return {
      success: false,
      error: axiosErr.response?.data?.error || axiosErr.response?.data?.message || 'Failed to update user role',
    };
  }
}

