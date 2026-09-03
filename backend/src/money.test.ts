import { describe, expect, it } from 'vitest';
import {
  applyFifoPayment,
  computeChange,
  computeSaleTotals,
  lineTotal,
  roundMoney,
} from '@sunprime/shared';

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(10.1 * 3)).toBe(30.3);
  });
});

describe('lineTotal / change / sale totals', () => {
  it('computes line totals', () => {
    expect(lineTotal(2.5, 40)).toBe(100);
    expect(lineTotal(3, 33.33)).toBe(99.99);
  });

  it('computes change', () => {
    expect(computeChange(500, 350.5)).toBe(149.5);
    expect(computeChange(100, 150)).toBe(0);
  });

  it('computes sale totals from buying/selling snapshots', () => {
    const totals = computeSaleTotals([
      { quantity: 2, unit_price: 55, buying_price: 40 },
      { quantity: 1, unit_price: 120, buying_price: 80 },
    ]);
    expect(totals.total_amount).toBe(230);
    expect(totals.cost).toBe(160);
    expect(totals.profit).toBe(70);
  });
});

describe('FIFO credit settlement', () => {
  const orders = [
    { sale_id: 'a', outstanding: 100 },
    { sale_id: 'b', outstanding: 50 },
    { sale_id: 'c', outstanding: 75 },
  ];

  it('pays a single earliest order partially', () => {
    const result = applyFifoPayment(orders, 40);
    expect(result.allocations).toEqual([
      { sale_id: 'a', amount_allocated: 40, remaining_balance: 60 },
    ]);
    expect(result.amount_applied).toBe(40);
    expect(result.leftover).toBe(0);
    expect(result.total_remaining).toBe(185);
  });

  it('spans multiple orders', () => {
    const result = applyFifoPayment(orders, 130);
    expect(result.allocations).toEqual([
      { sale_id: 'a', amount_allocated: 100, remaining_balance: 0 },
      { sale_id: 'b', amount_allocated: 30, remaining_balance: 20 },
    ]);
    expect(result.amount_applied).toBe(130);
    expect(result.leftover).toBe(0);
    expect(result.total_remaining).toBe(95);
  });

  it('exact payoff of all orders', () => {
    const result = applyFifoPayment(orders, 225);
    expect(result.amount_applied).toBe(225);
    expect(result.leftover).toBe(0);
    expect(result.total_remaining).toBe(0);
    expect(result.allocations.every((a) => a.remaining_balance === 0)).toBe(true);
  });

  it('returns leftover on overpayment (does not apply excess)', () => {
    const result = applyFifoPayment(orders, 300);
    expect(result.amount_applied).toBe(225);
    expect(result.leftover).toBe(75);
    expect(result.total_remaining).toBe(0);
  });

  it('rejects non-positive payment', () => {
    expect(() => applyFifoPayment(orders, 0)).toThrow();
    expect(() => applyFifoPayment(orders, -10)).toThrow();
  });

  it('skips zero-outstanding orders', () => {
    const mixed = [
      { sale_id: 'x', outstanding: 0 },
      { sale_id: 'y', outstanding: 20 },
    ];
    const result = applyFifoPayment(mixed, 10);
    expect(result.allocations).toEqual([
      { sale_id: 'y', amount_allocated: 10, remaining_balance: 10 },
    ]);
  });
});
