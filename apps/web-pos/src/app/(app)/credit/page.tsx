'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { CreditSettlementReceipt, Customer, CustomerCreditSummary } from '@sunprime/shared';
import { formatQuantityDisplay } from '@sunprime/shared';
import { useProgress } from '@/components/ProgressDialog';
import { printReceipt, ReceiptView } from '@/components/ReceiptView';
import { api, money } from '@/lib/api';

export default function CreditPage() {
  const { withProgress } = useProgress();
  const [customers, setCustomers] = useState<(Customer & { outstanding?: number })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomerCreditSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [settlement, setSettlement] = useState<CreditSettlementReceipt | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [totalDebt, setTotalDebt] = useState(0);
  const skipSearch = useRef(true);

  async function loadCustomers(search = query) {
    const q = search.trim();
    const path = q ? `/customers?search=${encodeURIComponent(q)}` : '/customers';
    const r = await api<{
      customers: (Customer & { outstanding?: number })[];
      total_outstanding: number;
    }>(path);
    setCustomers(r.customers);
    setTotalDebt(r.total_outstanding ?? 0);
  }

  async function loadCredit(id: string) {
    await withProgress(
      (async () => {
        const s = await api<CustomerCreditSummary>(`/customers/${id}/credit`);
        setSummary(s);
        setSelectedId(id);
      })(),
      'Loading credit orders…',
    );
  }

  useEffect(() => {
    void withProgress(loadCustomers(''), 'Loading customers…')
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customers'))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      loadCustomers(query).catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to search customers'),
      );
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function createCustomer(e: FormEvent) {
    e.preventDefault();
    await withProgress(
      (async () => {
        await api('/customers', {
          method: 'POST',
          body: JSON.stringify({ name: newName, phone: newPhone || null }),
        });
        setNewName('');
        setNewPhone('');
        await loadCustomers();
      })(),
      'Creating customer…',
    );
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    try {
      await withProgress(
        (async () => {
          const receipt = await api<CreditSettlementReceipt>(
            `/customers/${selectedId}/credit-payments`,
            {
              method: 'POST',
              body: JSON.stringify({ amount: Number(amount) }),
            },
          );
          setSettlement(receipt);
          setAmount('');
          const s = await api<CustomerCreditSummary>(`/customers/${selectedId}/credit`);
          setSummary(s);
          await loadCustomers();
          setTimeout(() => printReceipt(), 200);
        })(),
        'Processing payment…',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-semibold text-lg">Credit</h1>
        <p className="text-[var(--muted)]">
          Total debt{' '}
          <span className="ml-2 text-2xl font-semibold text-[var(--ink)]">
            {ready ? money(totalDebt) : '…'}
          </span>
        </p>
      </div>
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <aside className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-lg">Customers</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer name"
            className="w-full rounded-lg border px-3 py-2"
          />
          <form onSubmit={createCustomer} className="space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New customer name"
              className="w-full rounded-lg border px-3 py-2"
              required
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone"
              className="w-full rounded-lg border px-3 py-2"
            />
            <button type="submit" className="w-full py-2 rounded-lg bg-[var(--brand)] text-white text-sm">
              Add customer
            </button>
          </form>
          {ready && customers.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              {query.trim() ? 'No customers match that name.' : 'No customers yet.'}
            </p>
          )}
          <ul className="max-h-[60vh] overflow-auto divide-y divide-[var(--line)]">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => loadCredit(c.id)}
                  className={`w-full text-left py-2 px-1 ${
                    selectedId === c.id ? 'text-[var(--brand)] font-medium' : ''
                  }`}
                >
                  <div>{c.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    Debt: {money(c.outstanding ?? 0)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 space-y-4">
          {!summary && (
            <p className="text-[var(--muted)]">Select a customer to view credit orders.</p>
          )}
          {summary && (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{summary.customer.name}</h2>
                  <p className="text-[var(--muted)]">
                    Total outstanding: {money(summary.total_outstanding)}
                  </p>
                </div>
                <form onSubmit={pay} className="flex gap-2 items-end">
                  <div>
                    <label className="text-xs text-[var(--muted)]">Clear debt (any amount)</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="block mt-1 rounded-lg border px-3 py-2 w-40"
                      required
                      inputMode="decimal"
                    />
                  </div>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white">
                    Take payment
                  </button>
                </form>
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}

              <div className="space-y-3">
                {summary.orders.map((o) => (
                  <div key={o.sale.id} className="border border-[var(--line)] rounded-lg p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm mb-2">
                      <span>
                        {o.sale.receipt_number} · {new Date(o.sale.created_at).toLocaleString()}
                      </span>
                      <span className="font-medium text-right">
                        Total {money(o.sale.total_amount)} · Paid {money(o.allocated_total)} · Balance{' '}
                        {money(o.outstanding_balance)}
                      </span>
                    </div>
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between text-sm text-[var(--muted)]">
                        <span>
                          {it.product_name} × {formatQuantityDisplay(it.quantity)}
                        </span>
                        <span>{money(it.line_total)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {!summary.orders.length && (
                  <p className="text-[var(--muted)]">No outstanding credit orders.</p>
                )}
              </div>
            </>
          )}

          {settlement && (
            <div className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Settlement receipt</h3>
                <button type="button" className="underline text-sm" onClick={() => printReceipt()}>
                  Print
                </button>
              </div>
              <ReceiptView kind="settlement" settlement={settlement} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
