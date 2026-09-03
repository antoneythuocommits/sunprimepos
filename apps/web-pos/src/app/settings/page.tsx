'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { AppSettings, AppUser } from '@sunprime/shared';
import { AppShell } from '@/components/AppShell';
import { useProgress } from '@/components/ProgressDialog';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { withProgress } = useProgress();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [u, s] = await Promise.all([
      api<{ users: AppUser[] }>('/users'),
      api<AppSettings>('/settings'),
    ]);
    setUsers(u.users);
    setSettings(s);
  }

  useEffect(() => {
    void withProgress(refresh(), 'Loading settings…').catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await withProgress(
        (async () => {
          await api('/users', {
            method: 'POST',
            body: JSON.stringify({ email, password, role }),
          });
          setEmail('');
          setPassword('');
          setMessage('User created');
          await refresh();
        })(),
        'Creating user…',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function toggleActive(user: AppUser) {
    await withProgress(
      (async () => {
        await api(`/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: !user.is_active }),
        });
        await refresh();
      })(),
      'Updating user…',
    );
  }

  async function changeRole(user: AppUser, next: 'admin' | 'cashier') {
    await withProgress(
      (async () => {
        await api(`/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: next }),
        });
        await refresh();
      })(),
      'Updating role…',
    );
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    await withProgress(
      (async () => {
        await api('/settings', {
          method: 'PATCH',
          body: JSON.stringify(settings),
        });
        setMessage('Settings saved (receipt header remains SALE RECEIPT / 0722932780 as required)');
      })(),
      'Saving settings…',
    );
  }

  return (
    <AppShell>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h1 className="text-lg font-semibold">Users</h1>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {message && <p className="text-sm text-green-800">{message}</p>}
          <form onSubmit={createUser} className="space-y-2 border-b border-[var(--line)] pb-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border px-3 py-2"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border px-3 py-2"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'cashier')}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="w-full py-2 rounded-lg bg-[var(--brand)] text-white">
              Create user
            </button>
          </form>
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-[var(--line)] rounded-lg p-3"
              >
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {u.role} · {u.is_active ? 'active' : 'inactive'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as 'admin' | 'cashier')}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="cashier">cashier</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    className="text-sm underline"
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 h-fit">
          <h2 className="text-lg font-semibold mb-3">Settings</h2>
          {settings && (
            <form onSubmit={saveSettings} className="space-y-3">
              <div>
                <label className="text-sm text-[var(--muted)]">Business name</label>
                <input
                  value={settings.business_name}
                  onChange={(e) =>
                    setSettings({ ...settings, business_name: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)]">Receipt contact (display)</label>
                <input
                  value={settings.receipt_contact}
                  onChange={(e) =>
                    setSettings({ ...settings, receipt_contact: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Printed receipts always show header <strong>SALE RECEIPT</strong> and contact{' '}
                  <strong>0722932780</strong> as specified.
                </p>
              </div>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white">
                Save settings
              </button>
            </form>
          )}
        </section>
      </div>
    </AppShell>
  );
}
