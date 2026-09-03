'use client';

import type { CreditSettlementReceipt, SaleWithItems } from '@sunprime/shared';
import { money } from '@/lib/api';

/** POS-80C thermal: 80mm paper ≈ 42 monospace columns */
const COLS = 42;

function center(text: string, width = COLS): string {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(pad - left)}`;
}

function padLine(left: string, right: string, width = COLS): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

function dash(): string {
  return '-'.repeat(COLS);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}.`;
}

function ReceiptBody({ lines }: { lines: string[] }) {
  return (
    <pre className="receipt-print receipt-pos80c" id="receipt">
      {lines.join('\n')}
    </pre>
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
    const lines: string[] = [
      center('SALE RECEIPT'),
      center(contact),
      dash(),
      `Settlement: ${s.receipt_number}`,
      `Customer: ${truncate(s.customer.name, COLS - 10)}`,
      new Date(s.created_at).toLocaleString(),
      dash(),
      padLine('Paid', money(s.paid_amount)),
    ];

    for (const o of s.orders) {
      lines.push(padLine(truncate(`Order ${o.receipt_number}`, 26), `-${money(o.amount_allocated)}`));
      for (const it of o.items) {
        lines.push(
          padLine(` ${truncate(it.product_name, 20)} x${it.quantity}`, money(it.line_total)),
        );
      }
      lines.push(padLine(' Bal', money(o.remaining_balance)));
    }

    lines.push(dash(), padLine('Remaining debt', money(s.total_remaining_debt)), dash(), center('Thank you'));
    return <ReceiptBody lines={lines} />;
  }

  const sale = props.sale;
  const lines: string[] = [
    center('SALE RECEIPT'),
    center(contact),
    dash(),
    `Receipt: ${sale.receipt_number}`,
    new Date(sale.created_at).toLocaleString(),
  ];

  if (sale.sale_type === 'credit' && sale.customer_name) {
    lines.push(`Customer: ${truncate(sale.customer_name, COLS - 10)}`);
  }

  lines.push(dash());

  for (const it of sale.items) {
    lines.push(truncate(it.product_name, COLS));
    lines.push(padLine(`${it.quantity} x ${money(it.unit_price)}`, money(it.line_total)));
  }

  lines.push(
    dash(),
    padLine('TOTAL', money(sale.total_amount)),
    padLine('Paid', money(sale.paid_amount)),
    padLine('Change', money(sale.change_amount)),
  );

  if (sale.sale_type === 'credit') {
    lines.push('', 'CREDIT SALE');
  }

  lines.push(dash(), center('Thank you'));

  return <ReceiptBody lines={lines} />;
}

export function printReceipt() {
  window.print();
}
