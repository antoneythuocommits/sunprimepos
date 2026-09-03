import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
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
