const TOKEN_KEY = 'fitonus_admin_access_token';

/**
 * Safely retrieves the stored admin bearer token from localStorage.
 * SSR-safe and handles environments where localStorage is disabled or restricted.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Safely persists the admin bearer token into localStorage.
 */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Quota exceeded or storage restricted
  }
}

/**
 * Safely removes the admin bearer token from localStorage.
 */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage restricted
  }
}

