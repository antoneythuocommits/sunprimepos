'use client';

import type { CreditSettlementReceipt, SaleWithItems } from '@sunprime/shared';
import { formatQuantityDisplay } from '@sunprime/shared';
import { money } from '@/lib/api';

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value?: string;
  strong?: boolean;
}) {
  return (
    <div className={`receipt-row${strong ? ' receipt-row-strong' : ''}`}>
      <span className="receipt-label">{label}</span>
      {value != null && <span className="receipt-amt">{value}</span>}
    </div>
  );
}

function ReceiptShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="receipt-print receipt-pos80c" id="receipt">
      {children}
    </div>
  );
}

interface SaleReceiptProps {
  kind?: 'sale';
  sale: SaleWithItems;
  contact?: string;
}

interface SettlementReceiptProps {
  kind: 'settlement';
  settlement: CreditSettlementReceipt;
  contact?: string;
}

type Props = SaleReceiptProps | SettlementReceiptProps;

export function ReceiptView(props: Props) {
  const contact = props.contact ?? '0722932780';

  if (props.kind === 'settlement') {
    const s = props.settlement;
    return (
      <ReceiptShell>
        <div className="receipt-title">SALE RECEIPT</div>
        <div className="receipt-contact">{contact}</div>
        <div className="receipt-rule" />
        <Row label={`Settlement: ${s.receipt_number}`} />
        <Row label={`Customer: ${s.customer.name}`} />
        <Row label={new Date(s.created_at).toLocaleString()} />
        <div className="receipt-rule" />
        <Row label="Paid" value={money(s.paid_amount)} strong />
        {s.orders.map((o) => (
          <div key={o.sale_id} className="receipt-block">
            <Row label={`Order ${o.receipt_number}`} value={`-${money(o.amount_allocated)}`} />
            {o.items.map((it) => (
              <Row
                key={it.id}
                label={`${it.product_name} x${formatQuantityDisplay(it.quantity)}`}
                value={money(it.line_total)}
              />
            ))}
            <Row label="Balance" value={money(o.remaining_balance)} />
          </div>
        ))}
        <div className="receipt-rule" />
        <Row label="Remaining debt" value={money(s.total_remaining_debt)} strong />
        <div className="receipt-rule" />
        <div className="receipt-thanks">Thank you</div>
      </ReceiptShell>
    );
  }

  const sale = props.sale;
  return (
    <ReceiptShell>
      <div className="receipt-title">SALE RECEIPT</div>
      <div className="receipt-contact">{contact}</div>
      <div className="receipt-rule" />
      <Row label={`Receipt: ${sale.receipt_number}`} />
      <Row label={new Date(sale.created_at).toLocaleString()} />
      {sale.sale_type === 'credit' && sale.customer_name && (
        <Row label={`Customer: ${sale.customer_name}`} />
      )}
      <div className="receipt-rule" />
      {sale.items.map((it) => (
        <div key={it.id} className="receipt-block">
          <div className="receipt-item-name">{it.product_name}</div>
          <Row label={`${formatQuantityDisplay(it.quantity)} x ${money(it.unit_price)}`} value={money(it.line_total)} />
        </div>
      ))}
      <div className="receipt-rule" />
      <Row label="TOTAL" value={money(sale.total_amount)} strong />
      <Row label="Paid" value={money(sale.paid_amount)} strong />
      <Row label="Change" value={money(sale.change_amount)} strong />
      {sale.sale_type === 'credit' && <div className="receipt-flag">CREDIT SALE</div>}
      <div className="receipt-rule" />
      <div className="receipt-thanks">Thank you</div>
    </ReceiptShell>
  );
}

export function printReceipt() {
  window.print();
}
