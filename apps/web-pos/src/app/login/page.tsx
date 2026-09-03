'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { useProgress } from '@/components/ProgressDialog';

export default function LoginPage() {
  const router = useRouter();
  const { show, hide } = useProgress();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    show('Signing in…');
    try {
      const { error: authError } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.replace('/pos');
    } finally {
      setBusy(false);
      hide();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-8 shadow-sm"
      >
        <h1 className="text-3xl font-semibold text-[var(--brand-dark)] tracking-tight">Sunprime</h1>
        <p className="text-[var(--muted)] mt-1 mb-6">Sign in to the POS terminal</p>
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 rounded-lg border border-[var(--line)] px-3 py-2"
          disabled={busy}
        />
        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 rounded-lg border border-[var(--line)] px-3 py-2"
          disabled={busy}
        />
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-[var(--brand)] text-white font-medium disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
