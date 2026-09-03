import type { SaleStatus, SaleType, UserRole } from './enums.js';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  buying_price: number;
  selling_price: number;
  stock_quantity: number;
  unit: string;
  is_active: boolean;
  allow_negative_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  receipt_number: string;
  cashier_id: string;
  customer_id: string | null;
  sale_type: SaleType;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  status: SaleStatus;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  buying_price: number;
  line_total: number;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
  customer_name?: string | null;
  cashier_email?: string | null;
}

export interface CreditPayment {
  id: string;
  customer_id: string;
  amount: number;
  receipt_number: string;
  created_at: string;
}

export interface CreditPaymentAllocation {
  id: string;
  credit_payment_id: string;
  sale_id: string;
  amount_allocated: number;
}

export interface CreditOrderBalance {
  sale: Sale;
  items: SaleItem[];
  outstanding_balance: number;
  allocated_total: number;
}

export interface CustomerCreditSummary {
  customer: Customer;
  orders: CreditOrderBalance[];
  total_outstanding: number;
}

export interface SettlementOrderResult {
  sale_id: string;
  receipt_number: string;
  created_at: string;
  items: SaleItem[];
  amount_allocated: number;
  remaining_balance: number;
}

export interface CreditSettlementReceipt {
  receipt_number: string;
  customer: Customer;
  paid_amount: number;
  orders: SettlementOrderResult[];
  total_remaining_debt: number;
  created_at: string;
}

export interface InventoryValuationItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  unit: string;
  buying_price: number;
  selling_price: number;
  value_at_buying: number;
  value_at_selling: number;
}

export interface InventoryValuation {
  total_at_buying: number;
  total_at_selling: number;
  products: InventoryValuationItem[];
}

export interface SalesReportTotals {
  revenue: number;
  cost: number;
  profit: number;
  sale_count: number;
  cash_revenue: number;
  credit_revenue: number;
  cash_count: number;
  credit_count: number;
}

export interface SalesReportDay extends SalesReportTotals {
  date: string;
}

export interface SalesReport {
  from: string;
  to: string;
  group: 'day' | 'range';
  totals: SalesReportTotals;
  days?: SalesReportDay[];
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AppSettings {
  business_name: string;
  receipt_contact: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  supabaseConfigured: boolean;
}
