'use client';

import { useEffect, useState } from 'react';
import type { SaleWithItems } from '@sunprime/shared';
import { AppShell } from '@/components/AppShell';
import { useProgress } from '@/components/ProgressDialog';
import { printReceipt, ReceiptView } from '@/components/ReceiptView';
import { api, money } from '@/lib/api';

export default function ReprintPage() {
  const { withProgress } = useProgress();
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [selected, setSelected] = useState<SaleWithItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void withProgress(
      api<{ sales: SaleWithItems[] }>('/sales?limit=100')
        .then((r) => setSales(r.sales))
        .catch((e) => setError(e.message)),
      'Loading sales…',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectSale(id: string) {
    await withProgress(
      (async () => {
        const sale = await api<SaleWithItems>(`/sales/${id}`);
        setSelected(sale);
      })(),
      'Loading receipt…',
    );
  }

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4">
          <h1 className="text-lg font-semibold mb-3">Reprint receipts</h1>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b">
                <th className="py-2">Receipt</th>
                <th>When</th>
                <th>Type</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr
                  key={s.id}
                  className={`border-b border-[var(--line)]/50 cursor-pointer ${
                    selected?.id === s.id ? 'bg-[var(--bg)]' : 'hover:bg-[var(--bg)]/60'
                  }`}
                  onClick={() => selectSale(s.id)}
                >
                  <td className="py-2 font-medium">{s.receipt_number}</td>
                  <td>{new Date(s.created_at).toLocaleString()}</td>
                  <td>{s.sale_type}</td>
                  <td>{money(s.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 h-fit">
          {!selected && <p className="text-[var(--muted)] text-sm">Select a sale to reprint.</p>}
          {selected && (
            <>
              <button
                type="button"
                onClick={() => printReceipt()}
                className="mb-3 w-full py-2 rounded-lg bg-[var(--brand)] text-white"
              >
                Print Receipt
              </button>
              <ReceiptView sale={selected} />
            </>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
