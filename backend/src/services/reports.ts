import {
  reportQuerySchema,
  roundMoney,
  roundQuantity,
  type SalesReport,
  type SalesReportLine,
  type SalesReportProduct,
  type SalesReportSale,
  type SalesReportTotals,
} from '@sunprime/shared';
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

  const lines = await pool.query(
    `SELECT
       s.id AS sale_id,
       s.receipt_number,
       s.sale_type,
       s.total_amount,
       s.created_at,
       si.product_name,
       si.quantity,
       si.unit_price,
       si.line_total,
       si.buying_price,
       p.category,
       p.buying_price AS product_buy
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.status = 'completed'
       AND s.created_at >= $1::date
       AND s.created_at < ($2::date + INTERVAL '1 day')
     ORDER BY s.created_at DESC, si.id`,
    [query.from, query.to],
  );

  const sales: SalesReportSale[] = [];
  const saleIndex = new Map<string, SalesReportSale>();
  const productIndex = new Map<string, SalesReportProduct>();
  const profitProbe: Array<Record<string, unknown>> = [];
  let fegiLineCount = 0;
  let fegiInflatedCount = 0;

  for (const row of lines.rows) {
    const saleId = String(row.sale_id);
    let sale = saleIndex.get(saleId);
    if (!sale) {
      sale = {
        id: saleId,
        receipt_number: String(row.receipt_number),
        created_at: new Date(String(row.created_at)).toISOString(),
        sale_type: row.sale_type === 'credit' ? 'credit' : 'cash',
        total_amount: toNumber(row.total_amount),
        profit: 0,
        items: [],
      };
      saleIndex.set(saleId, sale);
      sales.push(sale);
    }
    if (row.product_name == null) continue;

    const quantity = toNumber(row.quantity);
    const lineTotal = roundMoney(toNumber(row.line_total));
    const buying = toNumber(row.buying_price);
    const cost = roundMoney(quantity * buying);
    const profit = roundMoney(lineTotal - cost);
    const missing = buying <= 0;
    const item: SalesReportLine = {
      product_name: String(row.product_name),
      quantity,
      line_total: lineTotal,
      cost,
      profit,
      missing_buying_price: missing,
    };
    sale.items.push(item);
    sale.profit = roundMoney(sale.profit + profit);

    // #region agent log
    const category = row.category == null ? '' : String(row.category);
    const isFegi = category.trim().toLowerCase() === 'fegi';
    const unitPrice = toNumber(row.unit_price);
    const productBuy = row.product_buy == null ? null : toNumber(row.product_buy);
    if (isFegi || item.product_name.toLowerCase().includes('sportsman')) {
      const naiveCost = roundMoney(quantity * buying);
      const scaledCost = roundMoney(quantity * 10 * buying);
      const scaledProfit = roundMoney(lineTotal - scaledCost);
      if (isFegi) {
        fegiLineCount += 1;
        if (Math.abs(profit - scaledProfit) > 0.001) fegiInflatedCount += 1;
      }
      const isSportsman = item.product_name.toLowerCase().includes('sportsman');
      const sportsmanCount = profitProbe.filter((line) => String(line.name).toLowerCase().includes('sportsman')).length;
      if ((isSportsman && sportsmanCount < 6) || profitProbe.length < 8) {
        profitProbe.push({
          receipt: sale.receipt_number,
          name: item.product_name,
          category,
          quantity,
          unitPrice,
          buying,
          productBuy,
          lineTotal,
          reportedProfit: profit,
          naiveCost,
          naiveProfit: roundMoney(lineTotal - naiveCost),
          scaledCost,
          scaledProfit,
          qtyTimesUnit: roundMoney(quantity * unitPrice),
          qtyTimes10TimesUnit: roundMoney(quantity * 10 * unitPrice),
          wholeQty: Math.abs(quantity - Math.round(quantity)) < 1e-9,
        });
      }
    }
    // #endregion

    const key = item.product_name.toLowerCase();
    const product = productIndex.get(key) ?? {
      product_name: item.product_name,
      quantity: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      missing_buying_price: false,
    };
    product.quantity = roundQuantity(product.quantity + quantity);
    product.revenue = roundMoney(product.revenue + lineTotal);
    product.cost = roundMoney(product.cost + cost);
    product.profit = roundMoney(product.revenue - product.cost);
    product.missing_buying_price = product.missing_buying_price || missing;
    productIndex.set(key, product);
  }

  const products = [...productIndex.values()].sort((a, b) =>
    a.product_name.localeCompare(b.product_name),
  );

  // #region agent log
  fetch('http://127.0.0.1:7689/ingest/4773018b-d033-46d7-8403-a56ad49fb9ca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf4697'},body:JSON.stringify({sessionId:'bf4697',runId:'pre-fix',hypothesisId:'A',location:'reports.ts:getSalesReport',message:'sales report aggregates',data:{from:query.from,to:query.to,saleCount:totals.sale_count,lineRows:lines.rows.length,nullProductNames:lines.rows.filter((row)=>row.product_name==null).length,productCount:products.length,salesWithItems:sales.filter((sale)=>sale.items.length>0).length},timestamp:Date.now()})}).catch(()=>{});
  fetch('http://127.0.0.1:7689/ingest/4773018b-d033-46d7-8403-a56ad49fb9ca',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3e8c52'},body:JSON.stringify({sessionId:'3e8c52',runId:'pre-fix',hypothesisId:'A-E',location:'reports.ts:getSalesReport',message:'fegi profit formula probe',data:{from:query.from,to:query.to,fegiLineCount,fegiInflatedCount,probed:profitProbe.length,lines:profitProbe},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return {
    from: query.from,
    to: query.to,
    group: query.group,
    totals,
    days:
      query.group === 'day'
        ? [...byDay.entries()].map(([date, t]) => ({ date, ...t }))
        : undefined,
    products,
    sales,
  };
}
