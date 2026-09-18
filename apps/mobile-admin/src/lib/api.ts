import { getSupabase, apiUrl } from './supabase';
import { isUnavailableStatus, reportNetworkSuccess } from './connectivity';
import type { AppUser } from '@sunprime/shared';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      reportNetworkSuccess();
    }
    return res;
  } catch {
    throw new Error('Could not reach the server. Check Wi-Fi and that the API is running.');
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const res = await apiFetch(`${apiUrl}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (isUnavailableStatus(res.status)) {
    throw new Error('Could not reach the server. Check Wi-Fi and that the API is running.');
  }
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body as T;
}

export async function loginWithUsername(username: string, password: string) {
  const res = await apiFetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (isUnavailableStatus(res.status)) {
    throw new Error('Could not reach the server. Check Wi-Fi and that the API is running.');
  }
  if (!res.ok) {
    throw new Error(body.error ?? 'Login failed');
  }
  return body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: AppUser;
  };
}

export function money(n: number): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
