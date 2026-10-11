'use client';

import { FormEvent, useEffect, useState } from 'react';
import { formatQuantityDisplay, type SalesReport } from '@sunprime/shared';
import { useProgress } from '@/components/ProgressDialog';
import { api, money } from '@/lib/api';

export default function ReportsPage() {
  const { withProgress } = useProgress();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [group, setGroup] = useState<'day' | 'range'>('range');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      await withProgress(
        (async () => {
          const r = await api<SalesReport>(
            `/reports/sales?from=${from}&to=${to}&group=${group}`,
          );
          setReport(r);
        })(),
        'Loading report…',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-4">
        <h1 className="text-lg font-semibold">Sales reports</h1>
        <form onSubmit={load} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--muted)]">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block mt-1 rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block mt-1 rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Group</label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as 'day' | 'range')}
              className="block mt-1 rounded-lg border px-3 py-2"
            >
              <option value="range">Range totals</option>
              <option value="day">By day</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white">
            Run report
          </button>
        </form>
        {error && <p className="text-sm text-red-700">{error}</p>}

        {report && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Revenue', report.totals.revenue],
                ['Cost', report.totals.cost],
                ['Profit', report.totals.profit],
                ['Sales', report.totals.sale_count],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-[var(--bg)] p-4">
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
                  <div className="text-2xl font-semibold mt-1">
                    {label === 'Sales' ? value : money(Number(value))}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--line)] p-4">
                <div className="font-medium mb-1">Cash</div>
                <div>
                  {money(report.totals.cash_revenue)} · {report.totals.cash_count} sales
                </div>
              </div>
              <div className="rounded-lg border border-[var(--line)] p-4">
                <div className="font-medium mb-1">Credit</div>
                <div>
                  {money(report.totals.credit_revenue)} · {report.totals.credit_count} sales
                </div>
              </div>
            </div>
            <div>
              <h2 className="font-medium mb-2">Products sold</h2>
              {(report.products ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No products sold in this period.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--muted)] border-b">
                        <th className="py-2 pr-3">Product</th>
                        <th className="pr-3">Qty</th>
                        <th className="pr-3">Amount</th>
                        <th>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.products ?? []).map((p) => (
                        <tr key={p.product_name} className="border-b border-[var(--line)]/50">
                          <td className="py-2 pr-3">
                            {p.product_name}
                            {p.missing_buying_price && (
                              <span className="ml-2 text-xs font-medium text-[var(--accent)]">
                                No buying price
                              </span>
                            )}
                          </td>
                          <td className="pr-3">{formatQuantityDisplay(p.quantity)}</td>
                          <td className="pr-3">{money(p.revenue)}</td>
                          <td>{money(p.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h2 className="font-medium mb-2">Sales</h2>
              {(report.sales ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No sales in this period.</p>
              ) : (
                <div className="space-y-3">
                  {(report.sales ?? []).map((sale) => (
                    <div key={sale.id} className="border border-[var(--line)] rounded-lg p-3">
                      <div className="flex flex-wrap justify-between gap-2 text-sm mb-2">
                        <span>
                          {sale.receipt_number} · {new Date(sale.created_at).toLocaleString()} ·{' '}
                          {sale.sale_type}
                        </span>
                        <span className="font-medium">
                          {money(sale.total_amount)} · profit {money(sale.profit)}
                        </span>
                      </div>
                      {sale.items.map((item, index) => (
                        <div
                          key={`${sale.id}-${index}`}
                          className="flex flex-wrap justify-between gap-2 text-sm text-[var(--muted)]"
                        >
                          <span>
                            {item.product_name} × {formatQuantityDisplay(item.quantity)}
                            {item.missing_buying_price ? ' · no buying price' : ''}
                          </span>
                          <span>
                            {money(item.line_total)} · profit {money(item.profit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {report.days && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)] border-b">
                    <th className="py-2">Date</th>
                    <th>Revenue</th>
                    <th>Cost</th>
                    <th>Profit</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.date} className="border-b border-[var(--line)]/50">
                      <td className="py-2">{d.date}</td>
                      <td>{money(d.revenue)}</td>
                      <td>{money(d.cost)}</td>
                      <td>{money(d.profit)}</td>
                      <td>{d.sale_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
  );
}
