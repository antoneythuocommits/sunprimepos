'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getSupabase } from '@/lib/supabase';

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
  const { user, status, clear } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  async function logout() {
    clear();
    await getSupabase().auth.signOut();
    router.replace('/login');
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
              .filter((l) => !l.admin || !mounted || user?.role !== 'cashier')
              .map((l) => {
                const active = pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    prefetch
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
            {mounted && user ? (
              <span className="hidden sm:inline">{user.username || user.email}</span>
            ) : (
              <span className="opacity-60">…</span>
            )}
            <ThemeToggle />
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
