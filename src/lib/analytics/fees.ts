import { MARKET_FEES } from './constants';

export async function yieldIfNeeded(deadline: number): Promise<number> {
  if (typeof performance !== 'undefined' && performance.now() >= deadline) {
    if (typeof window !== 'undefined' && 'scheduler' in window && (window.scheduler as any)?.yield) {
      await (window.scheduler as any).yield();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return performance.now() + 50;
  }
  return deadline;
}

export function computeListingFee(price: number): number {
  const p = Math.max(0, Math.floor(Number(price) || 0));
  if (p <= 0) return 0;
  return Math.max(MARKET_FEES.listingFeeMin, Math.ceil((p * MARKET_FEES.listingFeePct) / 100));
}

export function computeSaleTax(price: number): number {
  const p = Math.max(0, Math.floor(Number(price) || 0));
  if (p <= 0) return 0;
  return Math.ceil((p * MARKET_FEES.saleTaxPct) / 100);
}

export function computeNetProceeds(price: number): number {
  const p = Math.max(0, Math.floor(Number(price) || 0));
  if (p <= 0) return 0;
  const fee = computeListingFee(p);
  const tax = computeSaleTax(p);
  return Math.max(0, p - fee - tax);
}

export function isResaleBlocked(entry: any, now = Date.now()): boolean {
  if (!entry) return false;
  if (entry.sellBlock || entry.resaleLocked === true) return true;
  if (entry.resaleUntil) {
    const untilMs = Date.parse(entry.resaleUntil);
    if (Number.isFinite(untilMs) && untilMs > now) return true;
  }
  return false;
}

export function computeSpareCopies(entry: any, activeListedQty = 0): number {
  if (!entry || entry.pinned || isResaleBlocked(entry)) return 0;
  if (!Number.isFinite(Number(entry.qty))) return 0;
  const qty = Math.max(0, Math.floor(Number(entry.qty) || 0));
  if (qty < 2) return 0;
  const locked = Math.max(0, Math.floor(Number(entry.locked) || 0));
  const resaleLocked =
    typeof entry.resaleLocked === 'number' ? Math.max(0, Math.floor(entry.resaleLocked)) : 0;
  const byFormula = Math.max(0, qty - locked - resaleLocked - 1);
  const serverListable =
    entry.listable !== undefined && entry.listable !== null
      ? Math.max(0, Math.min(qty - 1, Math.floor(Number(entry.listable) || 0)))
      : byFormula;
  const available = Math.min(byFormula, serverListable);
  return Math.max(0, available - Math.max(0, Math.floor(Number(activeListedQty) || 0)));
}
