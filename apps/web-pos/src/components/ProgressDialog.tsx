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
  show: (message?: string, percent?: number | null, detail?: string) => number;
  setProgress: (message?: string, percent?: number | null, detail?: string) => void;
  hide: (id?: number) => void;
  withProgress: <T>(promise: Promise<T>, message?: string) => Promise<T>;
  beginNavigation: (message: string) => void;
  finishNavigation: () => void;
}

interface ProgressTask {
  id: number;
  message: string;
  percent: number | null;
  detail?: string;
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
          <p
            className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--brand-dark)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            {value}%
          </p>
        ) : null}
        <div className={`${determinate ? 'mt-3' : ''} h-2 w-full overflow-hidden rounded-full bg-[var(--bg-deep)]`}>
          <div
            className={`h-full rounded-full bg-[var(--brand)] ${
              determinate ? 'transition-[width] duration-150 ease-out' : 'progress-indeterminate w-2/5'
            }`}
            style={determinate ? { width: `${value}%` } : undefined}
            aria-hidden
          />
        </div>
        <p className="mt-4 text-sm font-medium text-[var(--brand-dark)]">{message}</p>
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
  const tasksRef = useRef<ProgressTask[]>([]);
  const orderRef = useRef<number[]>([]);
  const idRef = useRef(0);
  const navIdRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const publish = useCallback(() => {
    const top = tasksRef.current[tasksRef.current.length - 1];
    if (!top) {
      setState((s) => ({ ...s, open: false, percent: null, detail: undefined }));
      return;
    }
    setState({ open: true, message: top.message, percent: top.percent, detail: top.detail });
  }, []);

  const show = useCallback((message = 'Loading…', percent: number | null = null, detail?: string) => {
    const id = ++idRef.current;
    tasksRef.current.push({
      id,
      message,
      percent: percent == null ? null : clampPercent(percent),
      detail,
    });
    orderRef.current.push(id);
    publish();
    return id;
  }, [publish]);

  const hide = useCallback((id?: number) => {
    const target = id ?? orderRef.current[orderRef.current.length - 1];
    if (target == null) return;
    orderRef.current = orderRef.current.filter((item) => item !== target);
    if (navIdRef.current === target) navIdRef.current = null;
    const next = tasksRef.current.filter((task) => task.id !== target);
    if (next.length === tasksRef.current.length) return;
    tasksRef.current = next;
    publish();
  }, [publish]);

  const beginNavigation = useCallback((message: string) => {
    generationRef.current += 1;
    const id = ++idRef.current;
    tasksRef.current = [{ id, message, percent: null }];
    orderRef.current = [id];
    navIdRef.current = id;
    publish();
  }, [publish]);

  const setProgress = useCallback((message?: string, percent?: number | null, detail?: string) => {
    const task = tasksRef.current[tasksRef.current.length - 1];
    if (!task) return;
    if (message !== undefined) task.message = message;
    if (percent !== undefined) task.percent = percent == null ? null : clampPercent(percent);
    if (detail !== undefined) task.detail = detail;
    publish();
  }, [publish]);

  const finishNavigation = useCallback(() => {
    if (navIdRef.current == null) return;
    hide(navIdRef.current);
  }, [hide]);

  const withProgress = useCallback(
    async <T,>(promise: Promise<T>, message = 'Loading…'): Promise<T> => {
      const gen = generationRef.current;
      let taskId: number;
      if (navIdRef.current != null) {
        taskId = navIdRef.current;
        navIdRef.current = null;
        const task = tasksRef.current.find((item) => item.id === taskId);
        if (task) {
          task.message = message;
          task.percent = null;
          task.detail = undefined;
          publish();
        } else {
          taskId = show(message);
        }
      } else {
        taskId = show(message);
      }
      try {
        return await promise;
      } finally {
        if (generationRef.current === gen) hide(taskId);
      }
    },
    [show, hide, publish],
  );

  const value = useMemo(
    () => ({ show, setProgress, hide, withProgress, beginNavigation, finishNavigation }),
    [show, setProgress, hide, withProgress, beginNavigation, finishNavigation],
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
