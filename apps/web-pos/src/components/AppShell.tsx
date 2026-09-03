'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AppUser } from '@sunprime/shared';
import { api } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { useProgress } from '@/components/ProgressDialog';

const links = [
  { href: '/pos', label: 'Sales' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/credit', label: 'Credit' },
  { href: '/reports', label: 'Reports' },
  { href: '/reprint', label: 'Reprint' },
  { href: '/settings', label: 'Users & Settings', admin: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { show, hide } = useProgress();
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    show('Loading session…');
    api<{ user: AppUser }>('/me')
      .then((r) => {
        if (!cancelled) setUser(r.user);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      })
      .finally(() => {
        hide();
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, show, hide]);

  async function logout() {
    show('Signing out…');
    try {
      await getSupabase().auth.signOut();
      router.replace('/login');
    } finally {
      hide();
    }
  }

  if (!ready || !user) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-6">
          <Link href="/pos" className="font-semibold text-xl tracking-tight text-[var(--brand-dark)] no-print">
            Sunprime POS
          </Link>
          <nav className="flex flex-wrap gap-1 flex-1">
            {links
              .filter((l) => !l.admin || user.role === 'admin')
              .map((l) => {
                const active = pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`px-3 py-1.5 rounded-md text-sm transition ${
                      active
                        ? 'bg-[var(--brand)] text-white'
                        : 'text-[var(--muted)] hover:bg-[var(--bg-deep)]'
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
          </nav>
          <div className="text-sm text-[var(--muted)] flex items-center gap-3">
            <span>{user.email}</span>
            <button
              type="button"
              onClick={logout}
              className="px-2 py-1 rounded border border-[var(--line)] hover:bg-[var(--bg-deep)]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
