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
  percent: number | null;
  detail?: string;
}

interface ProgressContextValue {
  show: (message?: string, percent?: number | null, detail?: string) => void;
  setProgress: (message?: string, percent?: number | null, detail?: string) => void;
  hide: () => void;
  withProgress: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function ProgressDialog({
  open,
  message = 'Loading…',
  percent = null,
  detail,
}: {
  open: boolean;
  message?: string;
  percent?: number | null;
  detail?: string;
}) {
  if (!open) return null;
  const determinate = percent != null;
  const value = determinate ? clampPercent(percent) : 0;

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={determinate ? `${message} ${value}%` : message}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-7 shadow-xl text-center">
        {determinate ? (
          <>
            <p
              className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--brand-dark)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
            >
              {value}%
            </p>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-deep)]">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-150 ease-out"
                style={{ width: `${value}%` }}
                aria-hidden
              />
            </div>
          </>
        ) : (
          <div
            className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-[var(--brand)]/25 border-t-[var(--brand)] animate-spin"
            aria-hidden
          />
        )}
        <p className={`text-sm font-medium text-[var(--brand-dark)] ${determinate ? 'mt-3' : ''}`}>
          {message}
        </p>
        {detail ? <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p> : null}
      </div>
    </div>
  );
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>({
    open: false,
    message: 'Loading…',
    percent: null,
  });
  const depthRef = useRef(0);

  const show = useCallback((message = 'Loading…', percent: number | null = null, detail?: string) => {
    depthRef.current += 1;
    setState({
      open: true,
      message,
      percent: percent == null ? null : clampPercent(percent),
      detail,
    });
  }, []);

  const setProgress = useCallback((message?: string, percent?: number | null, detail?: string) => {
    setState((s) => {
      if (!s.open) return s;
      return {
        ...s,
        message: message ?? s.message,
        percent: percent === undefined ? s.percent : percent == null ? null : clampPercent(percent),
        detail: detail === undefined ? s.detail : detail,
      };
    });
  }, []);

  const hide = useCallback(() => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setState((s) => ({ ...s, open: false, percent: null, detail: undefined }));
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

  const value = useMemo(
    () => ({ show, setProgress, hide, withProgress }),
    [show, setProgress, hide, withProgress],
  );

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <ProgressDialog
        open={state.open}
        message={state.message}
        percent={state.percent}
        detail={state.detail}
      />
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
