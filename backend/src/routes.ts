import { Router } from 'express';
import { UserRole } from '@sunprime/shared';
import { isSupabaseConfigured } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { asyncHandler } from './middleware/error.js';
import { checkDatabase } from './db.js';
import * as products from './services/products.js';
import * as sales from './services/sales.js';
import * as customers from './services/customers.js';
import * as reports from './services/reports.js';
import * as users from './services/users.js';
import { importInventoryRows, parseInventorySource } from './services/inventoryImport.js';
import { creditPaymentSchema } from '@sunprime/shared';
import { HttpError } from './middleware/error.js';
import type { Router as ExpressRouter } from 'express';

export const router: ExpressRouter = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkDatabase();
    if (!dbOk) {
      res.status(503).json({ status: 'offline', error: 'No internet connection' });
      return;
    }
    res.json({
      status: 'ok',
      supabaseConfigured: isSupabaseConfigured(),
    });
  }),
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    res.json(await users.loginWithUsername(req.body));
  }),
);

router.use(requireAuth);

// Products
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const includeBuying = req.user!.role === UserRole.ADMIN;
    const activeParam = req.query.active;
    const active =
      activeParam === undefined ? undefined : activeParam === 'true' || activeParam === '1';
    const result = await products.listProducts({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      active,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      includeBuying,
    });
    res.json(result);
  }),
);

router.get(
  '/products/by-sku/:sku',
  asyncHandler(async (req, res) => {
    const includeBuying = req.user!.role === UserRole.ADMIN;
    const sku = decodeURIComponent(req.params.sku ?? '');
    const product = await products.getProductBySku(sku, includeBuying);
    if (!product) {
      res.status(404).json({ error: 'No barcode found' });
      return;
    }
    res.json(product);
  }),
);

router.post(
  '/products',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const product = await products.createProduct(req.body, true);
    res.status(201).json(product);
  }),
);

router.patch(
  '/products/:id',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const product = await products.updateProduct(req.params.id, req.body, true);
    res.json(product);
  }),
);

router.post(
  '/products/:id/stock',
  asyncHandler(async (req, res) => {
    const includeBuying = req.user!.role === UserRole.ADMIN;
    const product = await products.adjustStock(req.params.id, req.user!.id, req.body, includeBuying);
    res.json(product);
  }),
);

router.get(
  '/inventory/valuation',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (_req, res) => {
    const valuation = await products.getInventoryValuation();
    res.json(valuation);
  }),
);

// Sales
router.post(
  '/sales',
  asyncHandler(async (req, res) => {
    const sale = await sales.createSale(req.user!.id, req.body);
    res.status(201).json(sale);
  }),
);

router.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const result = await sales.listSales({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    res.json(result);
  }),
);

router.get(
  '/sales/:id',
  asyncHandler(async (req, res) => {
    const sale = await sales.getSale(req.params.id);
    res.json(sale);
  }),
);

// Customers / Credit
router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const list = await customers.listCustomers(
      typeof req.query.search === 'string' ? req.query.search : undefined,
    );
    res.json({ customers: list });
  }),
);

router.post(
  '/customers',
  asyncHandler(async (req, res) => {
    const customer = await customers.createCustomer(req.body);
    res.status(201).json(customer);
  }),
);

router.get(
  '/customers/:id/credit',
  asyncHandler(async (req, res) => {
    const summary = await sales.getCustomerCredit(req.params.id);
    res.json(summary);
  }),
);

router.post(
  '/customers/:id/credit-payments',
  asyncHandler(async (req, res) => {
    const { amount } = creditPaymentSchema.parse(req.body);
    const receipt = await sales.applyCreditPayment(req.params.id, amount);
    res.status(201).json(receipt);
  }),
);

// Reports
router.get(
  '/reports/sales',
  asyncHandler(async (req, res) => {
    const report = await reports.getSalesReport(req.query);
    res.json(report);
  }),
);

// Users (admin)
router.get(
  '/users',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (_req, res) => {
    res.json({ users: await users.listUsers() });
  }),
);

router.post(
  '/users',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const user = await users.createUser(req.body);
    res.status(201).json(user);
  }),
);

router.patch(
  '/users/:id',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const user = await users.updateUser(req.params.id, req.body);
    res.json(user);
  }),
);

// Settings
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json(await users.getSettings());
  }),
);

router.patch(
  '/settings',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    res.json(await users.updateSettings(req.body));
  }),
);

router.post(
  '/inventory/import',
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
    if (!sql.trim()) {
      throw new HttpError(400, 'Upload a MySQL .sql or .csv extract first');
    }
    const rows = parseInventorySource(sql);
    if (!rows.length) {
      throw new HttpError(
        400,
        'No inventory rows found. Use columns name, sku, buying_price, selling_price, stock_quantity, unit, category, is_active',
      );
    }
    if (rows.length > 20_000) {
      throw new HttpError(400, 'Import is limited to 20,000 rows');
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay?.(true);
    res.flushHeaders();

    let lastWrite = 0;
    let lastPercent = -1;
    const writeEvent = (event: Record<string, unknown>, force = false) => {
      const percent = typeof event.percent === 'number' ? event.percent : -1;
      const now = Date.now();
      if (!force && percent === lastPercent && now - lastWrite < 80) return;
      lastWrite = now;
      lastPercent = percent;
      const ok = res.write(`${JSON.stringify(event)}\n`);
      if (typeof (res as { flush?: () => void }).flush === 'function') {
        (res as { flush: () => void }).flush();
      }
      return ok;
    };

    try {
      writeEvent({ type: 'started', total: rows.length, done: 0, percent: 0 }, true);
      const result = await importInventoryRows(rows, (progress) => {
        const percent =
          progress.total === 0 ? 100 : Math.min(100, Math.round((progress.done / progress.total) * 100));
        writeEvent({
          type: 'progress',
          percent,
          done: progress.done,
          total: progress.total,
          inserted: progress.inserted,
          updated: progress.updated,
          skipped: progress.skipped,
        });
      });
      writeEvent(
        {
          type: 'done',
          percent: 100,
          done: result.total,
          total: result.total,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
        },
        true,
      );
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      writeEvent({ type: 'error', error: message }, true);
      res.end();
    }
  }),
);

// Me
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});
