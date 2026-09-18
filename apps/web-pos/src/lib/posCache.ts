import type { Customer, Product } from '@sunprime/shared';
import { formatQuantityDisplay } from '@sunprime/shared';

export interface CachedCartLine {
  key: string;
  product: Product;
  quantity: number;
  quantity_display: string;
  entered_price: number;
}

export interface PosCache {
  cart: CachedCartLine[];
  saleType: 'cash' | 'credit';
  paid: string;
  printOnComplete: boolean;
  selectedCustomer: Customer | null;
}

const POS_CACHE_KEY = 'sunprime-pos-cache';

export function readPosCache(): PosCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosCache;
    if (!Array.isArray(parsed.cart)) return null;
    parsed.cart = parsed.cart.map((line) => {
      const quantity = Number(line.quantity);
      const entered_price = Number(
        (line as CachedCartLine & { unit_price?: number }).entered_price ??
          (line as CachedCartLine & { unit_price?: number }).unit_price,
      );
      return {
        ...line,
        quantity,
        quantity_display: line.quantity_display || formatQuantityDisplay(quantity),
        entered_price,
      };
    });
    return parsed;
  } catch {
    return null;
  }
}

export function writePosCache(state: PosCache) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(POS_CACHE_KEY, JSON.stringify(state));
}

export function clearPosCache() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(POS_CACHE_KEY);
}
