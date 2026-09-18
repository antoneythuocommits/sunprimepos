const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

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

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isUnavailableStatus(status: number): boolean {
  return status === 0 || status === 503;
}

function isAbortError(err: unknown): boolean {
  return typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError';
}

async function pingRemote(): Promise<boolean | 'unknown'> {
  const targets = [
    SUPABASE_URL,
    'https://connectivitycheck.gstatic.com/generate_204',
  ].filter(Boolean);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    for (const url of targets) {
      try {
        const sep = url.includes('?') ? '&' : '?';
        await fetch(`${url}${sep}_=${Date.now()}`, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        return true;
      } catch (err) {
        if (isAbortError(err) || (err instanceof Error && err.name === 'AbortError')) {
          return 'unknown';
        }
      }
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function pingHealth(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${API_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function pingApi(): Promise<boolean> {
  if (isBrowserOffline()) return false;
  const remote = await pingRemote();
  if (remote === false) return false;
  return pingHealth();
}
