'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { AppSettings, AppUser } from '@sunprime/shared';
import { useProgress } from '@/components/ProgressDialog';
import { api, importDebtsWithProgress, importInventoryWithProgress } from '@/lib/api';

export default function SettingsPage() {
  const { withProgress, show, hide, setProgress } = useProgress();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [fileName, setFileName] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [debtFileName, setDebtFileName] = useState('');
  const [debtImportResult, setDebtImportResult] = useState<string | null>(null);

  async function refresh() {
    const [u, s] = await Promise.all([
      api<{ users: AppUser[] }>('/users'),
      api<AppSettings>('/settings'),
    ]);
    setUsers(u.users);
    setSettings(s);
  }

  useEffect(() => {
    void withProgress(refresh(), 'Loading settings…').catch((e) =>
      setError(e instanceof Error ? e.message : 'Failed to load settings'),
    );
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
            body: JSON.stringify({ username, password, role }),
          });
          setUsername('');
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

  async function importInventory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('inventoryFile') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError('Choose a .sql or .csv extract first');
      return;
    }
    setError(null);
    setImportResult(null);
    show('Reading file…', 0);
    try {
      const sql = await file.text();
      setProgress('Importing inventory…', 0, 'Preparing rows…');
      const result = await importInventoryWithProgress(sql, (event) => {
        const total = event.total ?? 0;
        const done = event.done ?? 0;
        const percent = event.percent ?? (total ? Math.round((done / total) * 100) : 0);
        const detail =
          total > 0 ? `${done.toLocaleString()} of ${total.toLocaleString()} items` : 'Preparing rows…';
        if (event.type === 'done') {
          setProgress('Finishing import…', 100, detail);
          return;
        }
        setProgress('Importing inventory…', percent, detail);
      });
      setProgress(
        'Import complete',
        100,
        `${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
      );
      setImportResult(
        `Imported ${result.total} rows: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`,
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      hide();
    }
  }

  async function importDebts(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('debtFile') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError('Choose a .sql or .csv debt extract first');
      return;
    }
    const confirmed = window.confirm(
      'Replace all current credit debts with this file? Cash sales and stock stay.',
    );
    if (!confirmed) return;
    setError(null);
    setDebtImportResult(null);
    show('Reading file…', 0);
    try {
      const sql = await file.text();
      setProgress('Replacing credit debts…', 0, 'Preparing rows…');
      const result = await importDebtsWithProgress(sql, (event) => {
        const total = event.total ?? 0;
        const done = event.done ?? 0;
        const percent = event.percent ?? (total ? Math.round((done / total) * 100) : 0);
        const detail =
          total > 0 ? `${done.toLocaleString()} of ${total.toLocaleString()} debts` : 'Preparing rows…';
        if (event.type === 'done') {
          setProgress('Finishing import…', 100, detail);
          return;
        }
        setProgress('Replacing credit debts…', percent, detail);
      });
      const summary = `Loaded ${result.debts} debts, recorded ${result.payments} payments, removed ${result.removed} previous debts${
        result.skipped ? `, skipped ${result.skipped}` : ''
      }`;
      setProgress('Import complete', 100, summary);
      setDebtImportResult(
        result.skip_reasons.length ? `${summary}. ${result.skip_reasons.join(' ')}` : summary,
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      hide();
    }
  }

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h1 className="text-lg font-semibold">Users</h1>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {message && <p className="text-sm text-green-800">{message}</p>}
          <form onSubmit={createUser} className="space-y-2 border-b border-[var(--line)] pb-4">
            <input
              type="text"
              required
              minLength={3}
              maxLength={32}
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
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
                  <div className="font-medium">{u.username}</div>
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

      <section className="mt-4 bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Import inventory from MySQL</h2>
        <p className="text-sm text-[var(--muted)]">
          Export stock from MySQL using the column names below, then upload the <code>.sql</code> or{' '}
          <code>.csv</code> file. A real barcode updates that product. A blank sku, or <code>0</code>{' '}
          (the MySQL default when there is no barcode), is ignored and those products match by name.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--line)]">
                <th className="py-2 pr-3">Column name</th>
                <th className="pr-3">Required</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['name', 'Yes', 'Product name'],
                ['selling_price', 'Yes', 'Selling price'],
                ['sku', 'No', 'Unique barcode / SKU (used to match existing products)'],
                ['buying_price', 'No', 'Cost / buying price (default 0)'],
                ['stock_quantity', 'No', 'Quantity on hand (default 0)'],
                ['unit', 'No', 'Unit such as pcs or kg (default pcs)'],
                ['category', 'No', 'general or fegi (default general)'],
                ['is_active', 'No', '1 / 0 or true / false (default 1)'],
              ].map(([col, req, meaning]) => (
                <tr key={col} className="border-b border-[var(--line)]/50">
                  <td className="py-2 pr-3 font-mono">{col}</td>
                  <td className="pr-3">{req}</td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="text-xs bg-[var(--bg)] border border-[var(--line)] rounded-lg p-3 overflow-auto">{`SELECT
  name,
  sku,
  buying_price,
  selling_price,
  stock_quantity,
  unit,
  category,
  is_active
FROM your_mysql_stock_table;`}</pre>
        <form onSubmit={importInventory} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="inventoryFile"
            accept=".sql,.csv,.json,.txt"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            className="text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white">
            Import stock
          </button>
          {fileName && <span className="text-xs text-[var(--muted)]">{fileName}</span>}
        </form>
        {importResult && <p className="text-sm text-green-800">{importResult}</p>}
      </section>

      <section className="mt-4 bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Import debts from a previous system</h2>
        <p className="text-sm text-[var(--muted)]">
          Upload one row per item. Rows with the same <code>receipt_number</code> form one debt.
          For that receipt, <code>sum(line_total) − paid_amount = debt_balance</code>. This
          replaces every current credit debt. Cash sales and stock are kept, and importing does
          not change quantities on hand.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--line)]">
                <th className="py-2 pr-3">Column name</th>
                <th className="pr-3">Required</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['customer_name', 'Yes', 'Customer the debt belongs to'],
                ['receipt_number', 'Yes', 'Groups item rows into one debt'],
                ['product_name', 'Yes', 'Item sold on credit'],
                ['quantity', 'Yes', 'Quantity of that item'],
                ['unit_price', 'Yes', 'Price per unit'],
                ['line_total', 'Yes', 'quantity × unit_price for that item'],
                ['paid_amount', 'Yes', 'Already received for the whole debt. Repeat it on every item row'],
                ['debt_balance', 'Yes', 'Still owed for the whole debt. Repeat it on every item row'],
                ['phone', 'No', 'Customer phone'],
                ['debt_date', 'No', 'Date of the debt, YYYY-MM-DD'],
                ['sku', 'No', 'Barcode, used only to attach the line to an existing product'],
              ].map(([col, req, meaning]) => (
                <tr key={col} className="border-b border-[var(--line)]/50">
                  <td className="py-2 pr-3 font-mono">{col}</td>
                  <td className="pr-3">{req}</td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="text-xs bg-[var(--bg)] border border-[var(--line)] rounded-lg p-3 overflow-auto">{`INSERT INTO debts (
  customer_name, phone, receipt_number, debt_date, product_name,
  quantity, unit_price, line_total, paid_amount, debt_balance
) VALUES
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'White Bread Loaf', 2, 55.00, 110.00, 50.00, 160.00),
  ('Jane Wanjiku', '0712345678', 'OLD-1001', '2026-03-01', 'Croissant', 2, 50.00, 100.00, 50.00, 160.00);`}</pre>
        <form onSubmit={importDebts} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="debtFile"
            accept=".sql,.csv,.json,.txt"
            onChange={(e) => setDebtFileName(e.target.files?.[0]?.name ?? '')}
            className="text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white">
            Replace debts
          </button>
          {debtFileName && <span className="text-xs text-[var(--muted)]">{debtFileName}</span>}
        </form>
        {debtImportResult && <p className="text-sm text-green-800">{debtImportResult}</p>}
      </section>
    </>
  );
}
