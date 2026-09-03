'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ProgressState {
  open: boolean;
  message: string;
}

interface ProgressContextValue {
  show: (message?: string) => void;
  hide: () => void;
  withProgress: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressDialog({
  open,
  message = 'Loading…',
}: {
  open: boolean;
  message?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="mx-4 w-full max-w-xs rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-7 shadow-xl text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-[var(--brand)]/25 border-t-[var(--brand)] animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-[var(--brand-dark)]">{message}</p>
      </div>
    </div>
  );
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>({ open: false, message: 'Loading…' });
  const depthRef = useRef(0);

  const show = useCallback((message = 'Loading…') => {
    depthRef.current += 1;
    setState({ open: true, message });
  }, []);

  const hide = useCallback(() => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setState((s) => ({ ...s, open: false }));
    }
  }, []);

  const withProgress = useCallback(
    async <T,>(promise: Promise<T>, message = 'Loading…'): Promise<T> => {
      show(message);
      try {
        return await promise;
      } finally {
        hide();
      }
    },
    [show, hide],
  );

  const value = useMemo(() => ({ show, hide, withProgress }), [show, hide, withProgress]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <ProgressDialog open={state.open} message={state.message} />
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error('useProgress must be used within ProgressProvider');
  }
  return ctx;
}
