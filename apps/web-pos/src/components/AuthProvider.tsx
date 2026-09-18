'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppUser } from '@sunprime/shared';
import { api } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';

type AuthStatus = 'loading' | 'ready' | 'unauthenticated';

interface AuthContextValue {
  user: AppUser | null;
  status: AuthStatus;
  refresh: () => Promise<AppUser | null>;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_CACHE_KEY = 'sunprime-user';

function readCachedUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AppUser | null) {
  if (typeof window === 'undefined') return;
  if (user) sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(USER_CACHE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: AppUser }>('/me');
      setUser(r.user);
      writeCachedUser(r.user);
      setStatus('ready');
      return r.user;
    } catch {
      setUser(null);
      writeCachedUser(null);
      setStatus('unauthenticated');
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setUser(null);
    writeCachedUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setStatus('ready');
    }

    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
        clear();
        return;
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        void refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh, clear]);

  const value = useMemo(
    () => ({ user, status, refresh, clear }),
    [user, status, refresh, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
