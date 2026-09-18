export const UserRole = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SaleType = {
  CASH: 'cash',
  CREDIT: 'credit',
} as const;
export type SaleType = (typeof SaleType)[keyof typeof SaleType];

export const SaleStatus = {
  COMPLETED: 'completed',
  VOID: 'void',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const ReportGroup = {
  DAY: 'day',
  RANGE: 'range',
} as const;
export type ReportGroup = (typeof ReportGroup)[keyof typeof ReportGroup];

export const ProductCategory = {
  GENERAL: 'general',
  FEGI: 'fegi',
} as const;
export type ProductCategory = (typeof ProductCategory)[keyof typeof ProductCategory];

export function normalizeProductCategory(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return ProductCategory.GENERAL;
  if (value.toLowerCase() === ProductCategory.FEGI) return ProductCategory.FEGI;
  return value.slice(0, 50);
}

export function isFegiCategory(raw?: string | null): boolean {
  return (raw ?? '').trim().toLowerCase() === ProductCategory.FEGI;
}
