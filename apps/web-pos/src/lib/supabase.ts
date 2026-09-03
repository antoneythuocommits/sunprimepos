import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    client = createClient(url, key);
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}
