import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let currentSession: Session | null = null;
let sessionReady: Promise<void> | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    client = createClient(url, key);
    sessionReady = new Promise((resolve) => {
      client!.auth.onAuthStateChange((_event, session) => {
        currentSession = session;
        resolve();
      });
    });
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  getSupabase();
  if (sessionReady) await sessionReady;
  return currentSession;
}
