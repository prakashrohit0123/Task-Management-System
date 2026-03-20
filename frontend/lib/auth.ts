/**
 * lib/auth.ts
 *
 * Token management strategy:
 * - Access token: stored in a module-level variable (memory only, not persisted)
 * - Refresh token: stored in localStorage (survives page reloads)
 *
 * This means on a hard refresh the access token is gone, but fetchWithAuth
 * will automatically use the refresh token to get a new one.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// In-memory access token (not accessible to XSS via localStorage)
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(newAccessToken: string, newRefreshToken: string): void {
  accessToken = newAccessToken;
  if (typeof window !== 'undefined') {
    localStorage.setItem('refreshToken', newRefreshToken);
  }
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function setUserEmail(email: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userEmail', email);
  }
}

export function getUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('userEmail');
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new access token on success, or null on failure.
 */
async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    accessToken = data.accessToken;
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * A fetch wrapper that:
 * 1. Adds Authorization header automatically
 * 2. On 401, attempts to refresh the access token and retries once
 * 3. If refresh fails, clears all tokens (caller should redirect to /login)
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // If we have no access token in memory, try to refresh first (e.g., after page reload)
  if (!accessToken) {
    await tryRefresh();
  }

  const makeRequest = async (token: string | null): Promise<Response> => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  let response = await makeRequest(accessToken);

  // If we get a 401, attempt token refresh and retry once
  if (response.status === 401) {
    const newToken = await tryRefresh();

    if (newToken) {
      response = await makeRequest(newToken);
    } else {
      // Refresh failed — clear everything so the UI can redirect to login
      clearTokens();
    }
  }

  return response;
}
