import type { KyaraSettings, PricingStrategy, SellMode, SellTier } from '../../types/settings';

/**
 * A sell profile bundles every knob that decides how aggressively a duplicate is sold.
 * `fast` clears stock quickly (undercut, short staleness, step-down repricing),
 * `normal` follows the user's own settings, `patient` waits for a better price.
 */
export interface SellProfile {
  tier: SellTier;
  strategy: PricingStrategy;
  velocityFirst: boolean;
  turbo: boolean;
  medianFloorPct: number;
  staleMinutes: number;
  repriceDiscountPct: number;
  durationHours: 12 | 24 | 48;
  recycleStale: boolean;
}

export const DEFAULT_CHEAP_BELOW = 12;
export const DEFAULT_PREMIUM_ABOVE = 60;

function pickDuration(value: unknown, fallback: 12 | 24 | 48): 12 | 24 | 48 {
  const n = Number(value);
  return n === 12 || n === 24 || n === 48 ? n : fallback;
}

export function resolveSellTier(settings: Partial<KyaraSettings>, referencePrice: number | null): SellTier {
  const mode: SellMode = settings.autoSellMode ?? 'adaptive';
  if (mode === 'fast' || mode === 'normal' || mode === 'patient') return mode;
  if (!referencePrice || !Number.isFinite(referencePrice)) return 'normal';
  const cheapBelow = Number(settings.autoSellCheapBelow ?? DEFAULT_CHEAP_BELOW);
  const premiumAbove = Math.max(cheapBelow + 1, Number(settings.autoSellPremiumAbove ?? DEFAULT_PREMIUM_ABOVE));
  if (referencePrice < cheapBelow) return 'fast';
  if (referencePrice >= premiumAbove) return 'patient';
  return 'normal';
}

export function resolveSellProfile(settings: Partial<KyaraSettings>, referencePrice: number | null): SellProfile {
  const tier = resolveSellTier(settings, referencePrice);
  const userStrategy: PricingStrategy = settings.autoSellStrategy ?? 'recent20_median';
  const userDuration = pickDuration(settings.autoSellDurationHours, 12);
  const recycleStale = settings.autoSellRecycleExpired !== false;

  if (tier === 'fast') {
    return {
      tier,
      strategy: 'flash',
      velocityFirst: false,
      turbo: settings.autoSellTurboLiquidity !== false,
      medianFloorPct: Math.min(55, Number(settings.autoSellMedianFloorPct ?? 70)),
      staleMinutes: 30,
      repriceDiscountPct: 8,
      durationHours: 12,
      recycleStale
    };
  }
  if (tier === 'patient') {
    return {
      tier,
      strategy: 'balanced',
      velocityFirst: false,
      turbo: false,
      medianFloorPct: Math.max(85, Number(settings.autoSellMedianFloorPct ?? 70)),
      staleMinutes: 720,
      repriceDiscountPct: 3,
      durationHours: pickDuration(Math.max(24, userDuration), 24),
      recycleStale: false
    };
  }
  return {
    tier,
    strategy: userStrategy,
    velocityFirst: settings.autoSellVelocityFirst !== false,
    turbo: settings.autoSellTurboLiquidity !== false,
    medianFloorPct: Number(settings.autoSellMedianFloorPct ?? 70),
    staleMinutes: 180,
    repriceDiscountPct: Number(settings.autoSellRepriceDiscountPct ?? 5),
    durationHours: userDuration,
    recycleStale
  };
}

/** Next price ceiling after a listing went stale: at least 1 ◆ lower, `pct`% lower otherwise. */
export function nextRepriceCeiling(lastPrice: number, pct: number): number {
  const price = Math.max(1, Math.floor(Number(lastPrice) || 1));
  const stepped = Math.floor(price * (1 - Math.max(1, pct) / 100));
  return Math.max(1, Math.min(price - 1, stepped));
}
