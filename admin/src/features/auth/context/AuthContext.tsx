'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authApi } from '../api';
import { getAuthToken, clearAuthToken } from '@/lib/token-storage';
import type { AdminUser, LoginCredentials } from '../types';

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      clearAuthToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const token = getAuthToken();
      if (!token) {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const me = await authApi.getMe();
        if (isMounted) setUser(me);
      } catch {
        clearAuthToken();
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for session expiration events broadcasted by apiClient
  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthToken();
      setUser(null);
      router.replace('/login');
    };

    window.addEventListener('fitonus:auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('fitonus:auth:expired', handleAuthExpired);
    };
  }, [router]);

  // Route protection
  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute = pathname === '/login';

    if (!user && !isAuthRoute) {
      router.replace('/login');
    } else if (user && isAuthRoute) {
      router.replace('/');
    }
  }, [user, isLoading, pathname, router]);

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const result = await authApi.login(credentials);
      setUser(result.user);
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      clearAuthToken();
      setUser(null);
      setIsLoading(false);
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

