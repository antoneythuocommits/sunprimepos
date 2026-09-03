/**
 * Pure money helpers — used by backend business logic and unit tests.
 * All amounts are rounded to 2 decimal places (cents).
 */

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export function computeChange(paidAmount: number, totalAmount: number): number {
  return roundMoney(Math.max(0, paidAmount - totalAmount));
}

export function computeSaleTotals(
  items: Array<{ quantity: number; unit_price: number; buying_price: number }>,
): { total_amount: number; cost: number; profit: number } {
  let total_amount = 0;
  let cost = 0;
  for (const item of items) {
    total_amount = roundMoney(total_amount + lineTotal(item.quantity, item.unit_price));
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
