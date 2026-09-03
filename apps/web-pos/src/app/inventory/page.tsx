'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Product } from '@sunprime/shared';
import { AppShell } from '@/components/AppShell';
import { useProgress } from '@/components/ProgressDialog';
import { api, money } from '@/lib/api';

const emptyForm = {
  name: '',
  sku: '',
  buying_price: '',
  selling_price: '',
  stock_quantity: '0',
  unit: 'pcs',
};

export default function InventoryPage() {
  const { withProgress } = useProgress();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searching, setSearching] = useState(false);

  async function load(q = search, silent = false) {
    const run = async () => {
      const r = await api<{ products: Product[] }>(
        `/products?search=${encodeURIComponent(q)}&limit=100`,
      );
      setProducts(r.products);
    };
    if (silent) {
      setSearching(true);
      try {
        await run();
      } finally {
        setSearching(false);
      }
      return;
    }
    await withProgress(run(), 'Loading inventory…');
  }

  useEffect(() => {
    void withProgress(
      Promise.all([
        api<{ user: { role: string } }>('/me').then((r) => setIsAdmin(r.user.role === 'admin')),
        load('', true),
      ]).catch((e) => setError(e.message)),
      'Loading inventory…',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load(search, true).catch(() => undefined);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function saveProduct(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name: form.name,
      sku: form.sku || null,
      buying_price: Number(form.buying_price),
      selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity),
      unit: form.unit,
    };
    try {
      await withProgress(
        (async () => {
          if (editing) {
            await api(`/products/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
          } else {
            await api('/products', { method: 'POST', body: JSON.stringify(body) });
          }
          setForm(emptyForm);
          setEditing(null);
          await load('', true);
        })(),
        editing ? 'Saving product…' : 'Creating product…',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function adjustStock(e: FormEvent) {
    e.preventDefault();
    if (!stockProduct) return;
    try {
      await withProgress(
        (async () => {
          await api(`/products/${stockProduct.id}/stock`, {
            method: 'POST',
            body: JSON.stringify({ delta: Number(delta), reason }),
          });
          setStockProduct(null);
          setDelta('');
          setReason('');
          await load('', true);
        })(),
        'Updating stock…',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock adjust failed');
    }
  }

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="text-lg font-semibold">Inventory</h1>
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="rounded-lg border border-[var(--line)] px-3 py-2 w-64 pr-9"
              />
              {searching && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)] animate-spin" />
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--line)]">
                  <th className="py-2">Name</th>
                  <th>Stock</th>
                  {isAdmin && <th>Buy</th>}
                  <th>Sell</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--line)]/50">
                    <td className="py-2">
                      {p.name}
                      <div className="text-xs text-[var(--muted)]">{p.sku}</div>
                    </td>
                    <td>
                      {p.stock_quantity} {p.unit}
                    </td>
                    {isAdmin && <td>{money(p.buying_price)}</td>}
                    <td>{money(p.selling_price)}</td>
                    <td className="space-x-2 whitespace-nowrap">
                      {isAdmin && (
                        <button
                          type="button"
                          className="underline text-xs"
                          onClick={() => {
                            setEditing(p);
                            setForm({
                              name: p.name,
                              sku: p.sku ?? '',
                              buying_price: String(p.buying_price),
                              selling_price: String(p.selling_price),
                              stock_quantity: String(p.stock_quantity),
                              unit: p.unit,
                            });
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="underline text-xs"
                        onClick={() => setStockProduct(p)}
                      >
                        Adjust stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {isAdmin && (
          <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 h-fit">
            <h2 className="font-semibold mb-3">{editing ? 'Edit product' : 'Add product'}</h2>
            <form onSubmit={saveProduct} className="space-y-3">
              {(['name', 'sku', 'buying_price', 'selling_price', 'stock_quantity', 'unit'] as const).map(
                (field) => (
                  <div key={field}>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      {field.replace('_', ' ')}
                    </label>
                    <input
                      value={form[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2"
                      required={field === 'name' || field.includes('price')}
                      disabled={!!editing && field === 'stock_quantity'}
                    />
                  </div>
                ),
              )}
              <div className="flex gap-2">
                {editing && (
                  <button
                    type="button"
                    className="flex-1 py-2 rounded-lg border"
                    onClick={() => {
                      setEditing(null);
                      setForm(emptyForm);
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" className="flex-1 py-2 rounded-lg bg-[var(--brand)] text-white">
                  Save
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      {stockProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={adjustStock}
            className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 shadow-xl"
          >
            <h2 className="font-semibold">Adjust stock — {stockProduct.name}</h2>
            <p className="text-sm text-[var(--muted)]">
              Current: {stockProduct.stock_quantity} {stockProduct.unit}
            </p>
            <input
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Delta (+ add / − remove)"
              className="w-full rounded-lg border px-3 py-2"
              required
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              className="w-full rounded-lg border px-3 py-2"
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setStockProduct(null)}>
                Cancel
              </button>
              <button type="submit" className="px-3 py-2 bg-[var(--brand)] text-white rounded-lg">
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
