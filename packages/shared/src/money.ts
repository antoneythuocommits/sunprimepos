import { isFegiCategory } from './enums.js';

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function isWholeQuantity(quantity: number): boolean {
  const qty = roundQuantity(quantity);
  return Math.abs(qty - Math.round(qty)) < 1e-9;
}

export function formatQuantityDisplay(quantity: number, entered?: string): string {
  const qty = roundQuantity(quantity);
  const trimmed = entered?.trim() ?? '';
  if (trimmed !== '') {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && roundQuantity(parsed) === qty) {
      return trimmed;
    }
  }
  if (isWholeQuantity(qty)) return String(Math.round(qty));
  return String(qty);
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export function priceSaleLine(input: {
  category?: string | null;
  quantity: number;
  entered_price: number;
}): { quantity: number; unit_price: number; line_total: number } {
  const quantity = roundQuantity(input.quantity);
  const entered_price = roundMoney(input.entered_price);
  if (!isFegiCategory(input.category)) {
    return {
      quantity,
      unit_price: entered_price,
      line_total: lineTotal(quantity, entered_price),
    };
  }
  if (isWholeQuantity(quantity)) {
    const unit_price = roundMoney(entered_price * 10);
    return {
      quantity,
      unit_price,
      line_total: lineTotal(quantity, unit_price),
    };
  }
  const units = roundQuantity(quantity * 10);
  return {
    quantity,
    unit_price: entered_price,
    line_total: lineTotal(units, entered_price),
  };
}

export function computeChange(paidAmount: number, totalAmount: number): number {
  return roundMoney(Math.max(0, paidAmount - totalAmount));
}

export function computeSaleTotals(
  items: Array<{
    quantity: number;
    unit_price: number;
    buying_price: number;
    line_total?: number;
  }>,
): { total_amount: number; cost: number; profit: number } {
  let total_amount = 0;
  let cost = 0;
  for (const item of items) {
    const selling = item.line_total ?? lineTotal(item.quantity, item.unit_price);
    total_amount = roundMoney(total_amount + selling);
    cost = roundMoney(cost + lineTotal(item.quantity, item.buying_price));
  }
  return {
    total_amount,
    cost,
    profit: roundMoney(total_amount - cost),
  };
}

export interface FifoOrder {
  sale_id: string;
  outstanding: number;
}

export interface FifoAllocation {
  sale_id: string;
  amount_allocated: number;
  remaining_balance: number;
}

export interface FifoResult {
  allocations: FifoAllocation[];
  amount_applied: number;
  leftover: number;
  total_remaining: number;
}

/**
 * Apply a payment FIFO across credit orders (earliest first).
 * Orders must already be sorted by created_at ascending.
 * Overpayment is returned as `leftover` (not applied).
 */
export function applyFifoPayment(orders: FifoOrder[], paymentAmount: number): FifoResult {
  const amount = roundMoney(paymentAmount);
  if (amount <= 0) {
    throw new Error('Payment amount must be positive');
  }

  let remaining = amount;
  const allocations: FifoAllocation[] = [];
  let amount_applied = 0;

  for (const order of orders) {
    if (remaining <= 0) break;
    const outstanding = roundMoney(order.outstanding);
    if (outstanding <= 0) continue;

    const allocated = roundMoney(Math.min(remaining, outstanding));
    const newBalance = roundMoney(outstanding - allocated);
    allocations.push({
      sale_id: order.sale_id,
      amount_allocated: allocated,
      remaining_balance: newBalance,
    });
    remaining = roundMoney(remaining - allocated);
    amount_applied = roundMoney(amount_applied + allocated);
  }

  const unpaidRemainder = orders.reduce((sum, o) => {
    const alloc = allocations.find((a) => a.sale_id === o.sale_id);
    const bal = alloc ? alloc.remaining_balance : roundMoney(o.outstanding);
    return roundMoney(sum + bal);
  }, 0);

  return {
    allocations,
    amount_applied,
    leftover: remaining,
    total_remaining: unpaidRemainder,
  };
}
