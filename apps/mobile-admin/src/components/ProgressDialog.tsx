import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

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

function IndeterminateBar() {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [slide]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 260],
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, styles.indeterminate, { transform: [{ translateX }] }]} />
    </View>
  );
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
  const label = determinate ? `${message} ${value}%` : message;

  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityRole="alert"
      accessibilityState={{ busy: true }}
      accessibilityLabel={label}
    >
      <View style={styles.card}>
        {determinate ? (
          <Text style={styles.percent} accessibilityRole="progressbar">
            {value}%
          </Text>
        ) : null}
        {determinate ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${value}%` }]} />
          </View>
        ) : (
          <IndeterminateBar />
        )}
        <Text style={styles.message}>{message}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
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

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fffcf5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d4ccba',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  percent: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e3a2b',
    fontVariant: ['tabular-nums'],
  },
  track: {
    marginTop: 12,
    height: 10,
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#efe8d8',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2f5540',
  },
  indeterminate: {
    width: 110,
  },
  message: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#1e3a2b',
    textAlign: 'center',
  },
  detail: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#5c675f',
    textAlign: 'center',
  },
});
