import { z } from 'zod';
import { ReportGroup, SaleType, UserRole } from './enums.js';

export const moneySchema = z
  .number()
  .finite()
  .multipleOf(0.01)
  .or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number));

export const positiveMoneySchema = z.number().finite().nonnegative().multipleOf(0.01);

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(100).nullable().optional(),
  buying_price: z.number().finite().nonnegative(),
  selling_price: z.number().finite().nonnegative(),
  stock_quantity: z.number().finite().default(0),
  unit: z.string().min(1).max(20).default('pcs'),
  is_active: z.boolean().default(true),
  allow_negative_stock: z.boolean().default(false),
});

export const updateProductSchema = createProductSchema.partial();

export const stockAdjustSchema = z.object({
  delta: z.number().finite().refine((v) => v !== 0, 'delta must be non-zero'),
  reason: z.string().min(1).max(500),
});

export const saleItemInputSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().finite().positive(),
  unit_price: z.number().finite().nonnegative(),
});

export const createSaleSchema = z.object({
  items: z.array(saleItemInputSchema).min(1),
  sale_type: z.enum([SaleType.CASH, SaleType.CREDIT]),
  paid_amount: z.number().finite().nonnegative(),
  customer_id: z.string().uuid().nullable().optional(),
  print_receipt: z.boolean().optional().default(false),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const creditPaymentSchema = z.object({
  amount: z.number().finite().positive(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum([UserRole.ADMIN, UserRole.CASHIER]),
});

export const updateUserSchema = z.object({
  role: z.enum([UserRole.ADMIN, UserRole.CASHIER]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const updateSettingsSchema = z.object({
  business_name: z.string().min(1).max(200).optional(),
  receipt_contact: z.string().min(1).max(100).optional(),
});

export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group: z.enum([ReportGroup.DAY, ReportGroup.RANGE]).default(ReportGroup.RANGE),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreditPaymentInput = z.infer<typeof creditPaymentSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
