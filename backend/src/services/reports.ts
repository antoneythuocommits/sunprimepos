import { reportQuerySchema, roundMoney, type SalesReport, type SalesReportTotals } from '@sunprime/shared';
import { pool, toNumber } from '../db.js';

function emptyTotals(): SalesReportTotals {
  return {
    revenue: 0,
    cost: 0,
    profit: 0,
    sale_count: 0,
    cash_revenue: 0,
    credit_revenue: 0,
    cash_count: 0,
    credit_count: 0,
  };
}

export async function getSalesReport(rawQuery: unknown): Promise<SalesReport> {
  const query = reportQuerySchema.parse(rawQuery);

  const result = await pool.query(
    `SELECT
       s.id,
       s.sale_type,
       s.total_amount,
       s.created_at::date AS sale_date,
       COALESCE(SUM(si.quantity * si.buying_price), 0) AS cost
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.status = 'completed'
       AND s.created_at >= $1::date
       AND s.created_at < ($2::date + INTERVAL '1 day')
     GROUP BY s.id
     ORDER BY s.created_at ASC`,
    [query.from, query.to],
  );

  const totals = emptyTotals();
  const byDay = new Map<string, SalesReportTotals>();

  for (const row of result.rows) {
    const revenue = toNumber(row.total_amount);
    const cost = roundMoney(toNumber(row.cost));
    const profit = roundMoney(revenue - cost);
    const date = String(row.sale_date).slice(0, 10);

    totals.revenue = roundMoney(totals.revenue + revenue);
    totals.cost = roundMoney(totals.cost + cost);
    totals.profit = roundMoney(totals.profit + profit);
    totals.sale_count += 1;

    if (row.sale_type === 'cash') {
      totals.cash_revenue = roundMoney(totals.cash_revenue + revenue);
      totals.cash_count += 1;
    } else {
      totals.credit_revenue = roundMoney(totals.credit_revenue + revenue);
      totals.credit_count += 1;
    }

    if (query.group === 'day') {
      const day = byDay.get(date) ?? emptyTotals();
      day.revenue = roundMoney(day.revenue + revenue);
      day.cost = roundMoney(day.cost + cost);
      day.profit = roundMoney(day.profit + profit);
      day.sale_count += 1;
      if (row.sale_type === 'cash') {
        day.cash_revenue = roundMoney(day.cash_revenue + revenue);
        day.cash_count += 1;
      } else {
        day.credit_revenue = roundMoney(day.credit_revenue + revenue);
        day.credit_count += 1;
      }
      byDay.set(date, day);
    }
  }

  return {
    from: query.from,
    to: query.to,
    group: query.group,
    totals,
    days:
      query.group === 'day'
        ? [...byDay.entries()].map(([date, t]) => ({ date, ...t }))
        : undefined,
  };
}
