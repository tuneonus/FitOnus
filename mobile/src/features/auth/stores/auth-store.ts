import { create } from 'zustand';
import { User } from '../api/auth-repository';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean; // Initial load (e.g. reading from SecureStore)
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setLoading: (isLoading: boolean) => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true, // true by default until initialized
  setAuth: (user) => set({ isAuthenticated: true, user }),
  clearAuth: () => set({ isAuthenticated: false, user: null }),
  setLoading: (isLoading) => set({ isLoading }),
  updateUser: (updates) => 
    set((state) => ({ 
      user: state.user ? { ...state.user, ...updates } : null 
    })),
}));
