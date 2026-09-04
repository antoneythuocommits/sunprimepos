import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

function readEnv(name: string): string {
  const fromProcess = process.env[name];
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name];
  return (fromProcess || fromExtra || '').trim();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const supabaseUrl = readEnv('EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
export const apiUrl = readEnv('EXPO_PUBLIC_API_URL') || 'http://localhost:4000';

export const supabaseConfigured =
  isValidHttpUrl(supabaseUrl) &&
  supabaseAnonKey.length > 20 &&
  !supabaseUrl.includes('REPLACE_WITH');

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in eas.json / .env and rebuild.',
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter as never,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** @deprecated use getSupabase() — kept for gradual migration */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabase();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
