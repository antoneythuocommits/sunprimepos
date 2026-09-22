'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Customer, Product, SaleWithItems } from '@sunprime/shared';
import { formatQuantityDisplay, isFegiCategory, priceSaleLine, roundQuantity } from '@sunprime/shared';
import { api, money } from '@/lib/api';
import { printReceipt, ReceiptView } from '@/components/ReceiptView';
import { useProgress } from '@/components/ProgressDialog';
import { clearPosCache, readPosCache, writePosCache } from '@/lib/posCache';

interface CartLine {
  key: string;
  product: Product;
  quantity: number;
  quantity_display: string;
  entered_price: number;
}

function pricedLine(line: CartLine) {
  return priceSaleLine({
    category: line.product.category,
    quantity: line.quantity,
    entered_price: line.entered_price,
  });
}

/** Handheld scanners dump compact codes then Enter — skip slow name search for those. */
function looksLikeBarcode(term: string): boolean {
  const t = term.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^\d{4,}$/.test(t)) return true;
  return /^[A-Za-z0-9._-]{6,}$/.test(t) && /\d/.test(t);
}

function MessageBox({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-[var(--dialog)] rounded-xl w-full max-w-sm p-5 shadow-xl space-y-4"
      >
        <p className="text-base font-medium text-[var(--brand-dark)]">{message}</p>
        <button
          type="button"
          autoFocus
          className="w-full py-2.5 rounded-lg bg-[var(--brand)] text-white font-medium"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function PosTerminal() {
  const { show, hide, withProgress } = useProgress();
  const paidRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [dialogProduct, setDialogProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [saleType, setSaleType] = useState<'cash' | 'credit'>('cash');
  const [paid, setPaid] = useState('');
  const [printOnComplete, setPrintOnComplete] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageBox, setMessageBox] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<SaleWithItems | null>(null);
  const [skuLookupBusy, setSkuLookupBusy] = useState(false);

  // Credit customer step
  const [needCustomer, setNeedCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const grandTotal = useMemo(
    () => cart.reduce((sum, l) => sum + pricedLine(l).line_total, 0),
    [cart],
  );
  const paidNum = Number(paid) || 0;
  const change = Math.round((paidNum - grandTotal) * 100) / 100;
  const canCompleteCash = saleType === 'credit' || paidNum + 1e-9 >= grandTotal;
  const canComplete = !busy && cart.length > 0 && canCompleteCash;

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const saved = readPosCache();
    if (saved) {
      setCart(saved.cart);
      setSaleType(saved.saleType);
      setPaid(saved.paid);
      setPrintOnComplete(saved.printOnComplete);
      setSelectedCustomer(saved.selectedCustomer);
    }
    setCacheReady(true);
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    writePosCache({
      cart,
      saleType,
      paid,
      printOnComplete,
      selectedCustomer,
    });
  }, [cacheReady, cart, saleType, paid, printOnComplete, selectedCustomer]);

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    // Scanners finish (and send Enter) well under 400ms; cashiers typing names still get suggestions.
    const barcodeLike = looksLikeBarcode(term);
    const delay = barcodeLike ? 400 : 120;
    if (!barcodeLike) setSearching(true);
    const t = setTimeout(() => {
      setSearching(true);
      api<{ products: Product[] }>(
        `/products?search=${encodeURIComponent(term)}&active=true&limit=20`,
      )
        .then((r) => {
          setResults(r.products);
          setHighlight(0);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, delay);
    return () => clearTimeout(t);
  }, [query]);

  const existingCartLine = useMemo(
    () => (dialogProduct ? cart.find((l) => l.product.id === dialogProduct.id) : undefined),
    [cart, dialogProduct],
  );

  useEffect(() => {
    if (dialogProduct) {
      setQty('1');
      const existing = cart.find((l) => l.product.id === dialogProduct.id);
      setPrice(String(existing?.entered_price ?? dialogProduct.selling_price));
      requestAnimationFrame(() => {
        qtyRef.current?.focus();
        qtyRef.current?.select();
      });
    }
    // Only reset fields when the dialog product changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogProduct]);

  function openProduct(product: Product) {
    setDialogProduct(product);
    setQuery('');
    setResults([]);
    setError(null);
  }

  function addToCart() {
    if (!dialogProduct) return;
    const quantity = Number(qty);
    const entered_price = Number(price);
    if (!(quantity > 0) || !(entered_price >= 0)) {
      setError('Enter a valid quantity and price');
      return;
    }
    const existingQty = cart.find((l) => l.product.id === dialogProduct.id)?.quantity ?? 0;
    const available = Math.max(0, dialogProduct.stock_quantity);
    if (roundQuantity(existingQty + quantity) > roundQuantity(available)) {
      setError(
        available > 0
          ? `Only ${formatQuantityDisplay(available)} ${dialogProduct.unit} in stock`
          : `${dialogProduct.name} is out of stock`,
      );
      return;
    }
    const quantity_display = formatQuantityDisplay(quantity, qty);
    setCart((prev) => {
      const existingIdx = prev.findIndex((l) => l.product.id === dialogProduct.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        const existing = next[existingIdx];
        const mergedQty = existing.quantity + quantity;
        next[existingIdx] = {
          ...existing,
          quantity: mergedQty,
          quantity_display: formatQuantityDisplay(mergedQty),
          entered_price,
        };
        return next;
      }
      return [
        ...prev,
        {
          key: dialogProduct.id,
          product: dialogProduct,
          quantity,
          quantity_display,
          entered_price,
        },
      ];
    });
    setDialogProduct(null);
    setError(null);
    focusSearch();
  }

  async function resolveSkuOrSelection() {
    const term = query.trim();
    if (!term) return;

    const barcodeLike = looksLikeBarcode(term);

    // Prefer exact SKU match from current results (fast path for scanners)
    const fromResults = results.find(
      (p) => p.sku && p.sku.toLowerCase() === term.toLowerCase(),
    );
    if (fromResults) {
      openProduct(fromResults);
      return;
    }

    setSkuLookupBusy(true);
    try {
      const product = await api<Product>(`/products/by-sku/${encodeURIComponent(term)}`);
      openProduct(product);
    } catch {
      // Name search only — never pick a suggestion after a failed barcode scan
      if (!barcodeLike && results.length > 0) {
        openProduct(results[highlight] ?? results[0]);
        return;
      }
      setMessageBox('No barcode found');
      setQuery('');
      setResults([]);
      focusSearch();
    } finally {
      setSkuLookupBusy(false);
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === ' ' || e.code === 'Space') {
      // Jump to paid amount when search is empty (checkout shortcut)
      if (!query.trim() && saleType === 'cash') {
        e.preventDefault();
        setResults([]);
        requestAnimationFrame(() => {
          paidRef.current?.focus();
          paidRef.current?.select();
        });
        return;
      }
    }
    if (e.key === 'ArrowDown') {
      if (!results.length) return;
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void resolveSkuOrSelection();
    } else if (e.key === 'Escape') {
      setResults([]);
    }
  }

  function onQtyKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      priceRef.current?.focus();
      priceRef.current?.select();
    }
  }

  function onPriceKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addToCart();
    }
  }

  async function loadCustomers(q: string) {
    const r = await api<{ customers: Customer[] }>(
      `/customers?search=${encodeURIComponent(q)}`,
    );
    setCustomers(r.customers);
  }

  useEffect(() => {
    if (!needCustomer) return;
    const t = setTimeout(() => {
      loadCustomers(customerQuery).catch(() => setCustomers([]));
    }, 150);
    return () => clearTimeout(t);
  }, [customerQuery, needCustomer]);

  async function submitSale(customerId?: string) {
    if (!cart.length) {
      setError('Cart is empty');
      return;
    }
    setBusy(true);
    setError(null);
    show('Completing sale…');
    try {
      const sale = await api<SaleWithItems>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((l) => ({
            product_id: l.product.id,
            quantity: l.quantity,
            unit_price: l.entered_price,
          })),
          sale_type: saleType,
          paid_amount: saleType === 'credit' ? 0 : paidNum,
          customer_id: customerId ?? null,
          print_receipt: printOnComplete,
        }),
      });
      setLastSale(sale);
      setCart([]);
      setPaid('');
      setNeedCustomer(false);
      setSelectedCustomer(null);
      clearPosCache();
      if (printOnComplete) {
        setTimeout(() => printReceipt(), 200);
      }
      focusSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setBusy(false);
      hide();
    }
  }

  function onCompleteSale() {
    if (saleType === 'credit') {
      setNeedCustomer(true);
      setCustomerQuery('');
      void withProgress(loadCustomers(''), 'Loading customers…');
      return;
    }
    void submitSale();
  }

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 shadow-sm">
        <h1 className="text-lg font-semibold mb-3 text-[var(--brand-dark)]">Point of Sale</h1>

        <div className="relative">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search name or scan SKU… (Enter)"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--field)] px-3 py-3 pr-10 text-base outline-none focus:ring-2 focus:ring-[var(--brand)]"
            autoComplete="off"
            disabled={skuLookupBusy}
          />
          {(searching || skuLookupBusy) && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-[var(--brand)]/25 border-t-[var(--brand)] animate-spin"
              aria-label="Searching"
            />
          )}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--dialog)] shadow-lg">
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2 flex justify-between gap-3 ${
                      i === highlight ? 'bg-[var(--brand)] text-white' : 'hover:bg-[var(--bg)]'
                    }`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => openProduct(p)}
                  >
                    <span>
                      {p.name}
                      <span className="opacity-70 text-sm ml-2">
                        {p.stock_quantity} {p.unit}
                        {isFegiCategory(p.category) ? ' · fegi' : ''}
                      </span>
                    </span>
                    <span className="font-medium">{money(p.selling_price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-[var(--brand-dark)]/70 border-b-2 border-[var(--line)]">
                <th className="py-3 pr-3 text-sm font-semibold uppercase tracking-wide">Item</th>
                <th className="py-3 pr-3 text-sm font-semibold uppercase tracking-wide">Qty</th>
                <th className="py-3 pr-3 text-sm font-semibold uppercase tracking-wide">Price</th>
                <th className="py-3 pr-3 text-sm font-semibold uppercase tracking-wide">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => {
                const priced = pricedLine(line);
                return (
                <tr key={line.key} className="border-b border-[var(--line)]">
                  <td className="py-3.5 pr-3 text-lg font-bold leading-tight text-[var(--brand-dark)]">
                    {line.product.name}
                  </td>
                  <td className="py-3.5 pr-3 text-lg font-semibold tabular-nums">
                    {line.quantity_display}
                  </td>
                  <td className="py-3.5 pr-3 text-lg font-semibold tabular-nums">
                    {money(priced.unit_price)}
                  </td>
                  <td className="py-3.5 pr-3 text-lg font-bold tabular-nums text-[var(--brand-dark)]">
                    {money(priced.line_total)}
                  </td>
                  <td className="py-3.5">
                    <button
                      type="button"
                      className="text-red-700 text-sm font-medium"
                      onClick={() => setCart((c) => c.filter((x) => x.key !== line.key))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                );
              })}
              {!cart.length && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-base text-[var(--muted)]">
                    Cart is empty — search and add products
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4 shadow-sm space-y-4">
        <div className="text-3xl font-semibold tracking-tight">
          {money(grandTotal)}
          <span className="block text-sm font-normal text-[var(--muted)] mt-1">Grand total</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg border ${
              saleType === 'cash'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'border-[var(--line)]'
            }`}
            onClick={() => setSaleType('cash')}
          >
            Cash
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg border ${
              saleType === 'credit'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--line)]'
            }`}
            onClick={() => setSaleType('credit')}
          >
            Credit
          </button>
        </div>

        {saleType === 'cash' && (
          <div>
            <label className="text-sm text-[var(--muted)]">Total paid amount</label>
            <input
              ref={paidRef}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
              placeholder="0.00"
            />
            <div className="mt-3 rounded-lg bg-[var(--brand)] text-white px-4 py-3">
              <div className="text-xs uppercase tracking-wider opacity-80">Change</div>
              <div className="text-3xl font-semibold tabular-nums">{money(change)}</div>
            </div>
            {cart.length > 0 && !canCompleteCash && (
              <p className="text-xs text-red-700 mt-2">
                Paid amount must cover the grand total ({money(grandTotal)})
              </p>
            )}
          </div>
        )}

        {saleType === 'credit' && (
          <p className="text-sm text-[var(--muted)]">
            Paid amount is 0. You will select a customer when completing the sale.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={printOnComplete}
            onChange={(e) => setPrintOnComplete(e.target.checked)}
          />
          Print receipt
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="button"
          disabled={!canComplete}
          onClick={onCompleteSale}
          className="w-full py-3 rounded-lg bg-[var(--brand)] text-white font-medium disabled:opacity-50"
        >
          {busy ? 'Processing…' : 'Complete Sale'}
        </button>
      </section>

      {lastSale && (
        <div className="receipt-print-host" aria-hidden>
          <ReceiptView sale={lastSale} />
        </div>
      )}

      {dialogProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--dialog)] rounded-xl w-full max-w-md p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold">{dialogProduct.name}</h2>
            {dialogProduct.sku && (
              <p className="text-xs text-[var(--muted)]">SKU: {dialogProduct.sku}</p>
            )}
            <p className="text-sm text-[var(--muted)]">
              Default price: {money(dialogProduct.selling_price)} / {dialogProduct.unit}
              {isFegiCategory(dialogProduct.category) ? ' · fegi' : ''}
            </p>
            {isFegiCategory(dialogProduct.category) && (
              <p className="text-xs text-[var(--muted)]">
                Decimal qty (0.1) keeps price and totals units × price. Whole qty (1, 5) shows
                price × 10.
              </p>
            )}
            {existingCartLine && (
              <p className="text-sm rounded-lg bg-[var(--bg)] border border-[var(--line)] px-3 py-2">
                Already in cart: <strong>{existingCartLine.quantity_display}</strong> — adding more will
                merge into one line.
              </p>
            )}
            <div>
              <label className="text-sm">Quantity{existingCartLine ? ' to add' : ''}</label>
              <input
                ref={qtyRef}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={onQtyKeyDown}
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-sm">
                Selling price{' '}
                <span className="text-[var(--muted)]">
                  (default {money(dialogProduct.selling_price)})
                </span>
              </label>
              <input
                ref={priceRef}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={onPriceKeyDown}
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
                inputMode="decimal"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-[var(--line)]"
                onClick={() => {
                  setDialogProduct(null);
                  focusSearch();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-[var(--brand)] text-white"
                onClick={addToCart}
              >
                {existingCartLine ? 'Merge into cart' : 'Add to cart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {messageBox && (
        <MessageBox
          message={messageBox}
          onClose={() => {
            setMessageBox(null);
            focusSearch();
          }}
        />
      )}

      {needCustomer && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--dialog)] rounded-xl w-full max-w-lg p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold">Select customer for credit sale</h2>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Search customers…"
              className="w-full rounded-lg border border-[var(--line)] px-3 py-2"
              autoFocus
            />
            <ul className="max-h-56 overflow-auto border border-[var(--line)] rounded-lg">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2 ${
                      selectedCustomer?.id === c.id
                        ? 'bg-[var(--brand)] text-white'
                        : 'hover:bg-[var(--bg)]'
                    }`}
                    onClick={() => setSelectedCustomer(c)}
                  >
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border"
                onClick={() => setNeedCustomer(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedCustomer || busy}
                className="px-3 py-2 rounded-lg bg-[var(--brand)] text-white disabled:opacity-50"
                onClick={() => selectedCustomer && submitSale(selectedCustomer.id)}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
