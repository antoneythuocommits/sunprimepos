import { supabaseUrl } from './supabase';

type Listener = (offline: boolean) => void;

const listeners = new Set<Listener>();
let offline = false;

export function getOffline(): boolean {
  return offline;
}

export function subscribeOffline(listener: Listener): () => void {
  listeners.add(listener);
  listener(offline);
  return () => {
    listeners.delete(listener);
  };
}

function emit(next: boolean) {
  if (offline === next) return;
  offline = next;
  for (const listener of listeners) listener(offline);
}

export function reportNetworkFailure() {
  emit(true);
}

export function reportNetworkSuccess() {
  emit(false);
}

export function isUnavailableStatus(status: number): boolean {
  return status === 0 || status === 503;
}

async function pingUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    return res.ok || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the phone can reach the public internet — not the shop LAN API. */
export async function pingInternet(): Promise<boolean> {
  const targets = [
    supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/health` : '',
    'https://www.gstatic.com/generate_204',
    'https://cloudflare.com/cdn-cgi/trace',
  ].filter(Boolean);

  for (const url of targets) {
    if (await pingUrl(url)) return true;
  }
  return false;
}
