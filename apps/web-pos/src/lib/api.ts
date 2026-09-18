import type { AppUser } from '@sunprime/shared';
import { isUnavailableStatus, reportNetworkFailure, reportNetworkSuccess } from './connectivity';
import { getSession } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (isUnavailableStatus(res.status)) {
      reportNetworkFailure();
    } else if (res.ok || (res.status >= 400 && res.status < 500)) {
      reportNetworkSuccess();
    }
    return res;
  } catch {
    reportNetworkFailure();
    throw new ApiError(0, 'No internet connection. Check your network.');
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const session = await getSession();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await apiFetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (isUnavailableStatus(res.status)) {
    throw new ApiError(res.status, 'No internet connection. Check your network.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return body as T;
}

export interface InventoryImportProgress {
  type: 'started' | 'progress' | 'done' | 'error';
  percent?: number;
  done?: number;
  total?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}

export interface InventoryImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export async function importInventoryWithProgress(
  sql: string,
  onProgress: (event: InventoryImportProgress) => void,
): Promise<InventoryImportResult> {
  const session = await getSession();
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/x-ndjson, application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await apiFetch(`${API_URL}/inventory/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql }),
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('ndjson')) {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    const result = body as InventoryImportResult;
    onProgress({ type: 'done', percent: 100, done: result.total, ...result });
    return result;
  }

  if (!res.body) {
    throw new ApiError(res.status, 'Import stream was empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: InventoryImportResult | null = null;
  let streamError: string | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as InventoryImportProgress;
    if (event.type === 'error') {
      streamError = event.error ?? 'Import failed';
      return;
    }
    onProgress(event);
    if (event.type === 'done') {
      result = {
        inserted: event.inserted ?? 0,
        updated: event.updated ?? 0,
        skipped: event.skipped ?? 0,
        total: event.total ?? 0,
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  if (streamError) {
    throw new ApiError(res.ok ? 400 : res.status, streamError);
  }
  if (!res.ok) {
    throw new ApiError(res.status, 'Import failed');
  }
  if (!result) {
    throw new ApiError(500, 'Import did not finish');
  }
  return result;
}

export async function loginWithUsername(username: string, password: string) {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (isUnavailableStatus(res.status)) {
    throw new ApiError(res.status, 'No internet connection. Check your network.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'Login failed');
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
