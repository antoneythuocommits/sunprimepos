import { Router } from 'express';
import { UserRole } from '@sunprime/shared';
import { isSupabaseConfigured } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { asyncHandler } from './middleware/error.js';
import * as products from './services/products.js';
import * as sales from './services/sales.js';
import * as customers from './services/customers.js';
import * as reports from './services/reports.js';
import * as users from './services/users.js';
import { creditPaymentSchema } from '@sunprime/shared';
import type { Router as ExpressRouter } from 'express';

export const router: ExpressRouter = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    supabaseConfigured: isSupabaseConfigured(),
  });
});

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

// Me
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});
