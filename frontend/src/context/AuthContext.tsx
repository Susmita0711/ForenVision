import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserRole } from '../types';
import {
  loginApi,
  registerApi,
  logoutApi,
  getCurrentUserApi,
} from '../api/authApi';

interface RegisterPayload {
  badgeNumber: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  password?: string;
  organization?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, passOrBadge: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updated: Partial<User>) => void;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_USER_KEY = 'forenvision_user';
const AUTH_TOKEN_KEY = 'forenvision_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSession = useCallback(async () => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!storedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await getCurrentUserApi();
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
      } else {
        // Expired or invalid token
        setUser(null);
        setToken(null);
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // If server unreachable, retain cached user for offline viewing if present
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (email: string, passOrBadge: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedEmail = email.trim();
    const trimmedPass = passOrBadge.trim();

    if (!trimmedEmail || !trimmedPass) {
      return { success: false, error: 'Email and credentials are required.' };
    }

    const res = await loginApi(trimmedEmail, trimmedPass);
    if (res.success && res.user) {
      setUser(res.user);
      if (res.token) {
        setToken(res.token);
        localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
      return { success: true };
    }

    return {
      success: false,
      error: res.error || 'Authentication failure. Check clearance credentials.',
    };
  };

  const register = async (data: RegisterPayload): Promise<{ success: boolean; error?: string }> => {
    if (!data.name.trim() || !data.badgeNumber.trim() || !data.email.trim()) {
      return { success: false, error: 'All identification fields are required.' };
    }

    const res = await registerApi({
      fullName: data.name.trim(),
      badgeNumber: data.badgeNumber.trim().toUpperCase(),
      email: data.email.trim(),
      password: data.password || 'Temporary@123!',
      role: data.role,
      department: data.department,
      organization: data.organization,
    });

    if (res.success && res.user) {
      setUser(res.user);
      if (res.token) {
        setToken(res.token);
        localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
      return { success: true };
    }

    return {
      success: false,
      error: res.error || 'Enrollment registration failed.',
    };
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // ignore network errors on logout
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  };

  const updateProfile = (updated: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const nextUser = { ...prev, ...updated };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
      return nextUser;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        register,
        logout,
        updateProfile,
        checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
