import { getSupabase, apiUrl } from './supabase';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body as T;
}

export function money(n: number): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
