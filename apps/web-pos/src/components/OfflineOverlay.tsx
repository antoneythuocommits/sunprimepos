'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getOffline,
  isBrowserOffline,
  pingApi,
  reportNetworkFailure,
  reportNetworkSuccess,
  subscribeOffline,
} from '@/lib/connectivity';

export function OfflineOverlay() {
  const [offline, setOffline] = useState(false);
  const hadOverlay = useRef(false);

  useEffect(() => subscribeOffline(setOffline), []);

  useEffect(() => {
    if (offline) {
      hadOverlay.current = true;
      return;
    }
    if (hadOverlay.current) {
      hadOverlay.current = false;
      window.location.reload();
    }
  }, [offline]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      const wait = getOffline() || isBrowserOffline() ? 2500 : 12000;
      timer = setTimeout(() => {
        void check();
      }, wait);
    }

    async function check() {
      if (cancelled) return;
      if (isBrowserOffline()) {
        reportNetworkFailure();
        schedule();
        return;
      }
      const ok = await pingApi();
      if (cancelled) return;
      if (ok) {
        reportNetworkSuccess();
      } else {
        reportNetworkFailure();
      }
      schedule();
    }

    function onBrowserOffline() {
      reportNetworkFailure();
      schedule();
    }

    function onBrowserOnline() {
      void check();
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void check();
    }

    void check();
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('online', onBrowserOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('online', onBrowserOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-[3px] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-copy"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-7 shadow-xl text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-[var(--brand)]/25 border-t-[var(--brand)] animate-spin"
          aria-hidden
        />
        <h2 id="offline-title" className="text-xl font-semibold text-[var(--brand-dark)]">
          No internet connection
        </h2>
        <p id="offline-copy" className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
          Check your internet connection. This page will resume automatically when you are back
          online.
        </p>
      </div>
    </div>
  );
}
