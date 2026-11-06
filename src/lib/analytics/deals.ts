import { Rarity, MarketDeal } from '../../types/kyara';
import { KyaraSettings, DEFAULT_SETTINGS } from '../../types/settings';
import { computeNetProceeds } from './fees';

export function evaluateDeal(
  listing: any,
  arg2: any = null,
  arg3: any = null,
  arg4: any = null
): MarketDeal | null {
  if (!listing || listing.status !== 'active' || listing.isMine) return null;
  const endsAtMs = listing.endsAt ? Date.parse(listing.endsAt) : Infinity;
  if (Number.isFinite(endsAtMs) && endsAtMs <= Date.now()) return null;

  const buyPrice =
    listing.type === 'fixed'
      ? Number(listing.price)
      : Number.isFinite(listing.buyoutPrice) && Number(listing.buyoutPrice) > 0
        ? Number(listing.buyoutPrice)
        : null;
  if (!Number.isFinite(buyPrice) || buyPrice === null || buyPrice <= 0) return null;

  // Determine parameters: evaluateDeal(listing, ownedSet, settings) vs evaluateDeal(listing, marketStats, ownedSet, settings)
  const isDirectCall = arg2 instanceof Set || Array.isArray(arg2) || arg2 === null;
  const ownedSet = isDirectCall ? arg2 : arg3;
  const marketStats = isDirectCall ? {} : (arg2 || {});
  const settings: Partial<KyaraSettings> = (isDirectCall ? arg3 : arg4) || DEFAULT_SETTINGS;

  const char = listing.character || {};
  const characterId = Number(char.id ?? listing.characterId);
  const isMissing = Boolean(
    ownedSet &&
    (ownedSet instanceof Set ? !ownedSet.has(characterId) : Array.isArray(ownedSet) && !ownedSet.includes(characterId))
  );

  const prices = { ...(listing.prices || {}), ...marketStats };
  const median7d = Number.isFinite(prices.median7d) && prices.median7d > 0 ? Number(prices.median7d) : null;
  const median30d = Number.isFinite(prices.median30d) && prices.median30d > 0 ? Number(prices.median30d) : null;
  const refMedian = median7d ?? median30d ?? null;
  const sales7d = Number.isFinite(prices.sales7d) && prices.sales7d >= 0 ? Number(prices.sales7d) : 0;

  if (!refMedian || refMedian <= 0) {
    return {
      listingId: String(listing.id),
      characterId,
      name: char.name || `Carte #${characterId}`,
      series: char.series || '',
      rarity: (char.rarity || 'C') as Rarity,
      type: listing.type,
      buyPrice,
      refMedian: null,
      sales7d,
      discountPct: 0,
      targetResalePrice: null,
      netResale: null,
      flipProfit: null,
      roiPct: null,
      isMissing,
      isGoodFlip: false,
      isGoodMissingBuy: Boolean(isMissing && buyPrice <= Number(settings.autoBuyMissingMaxPrice ?? 25))
    };
  }

  const discountPct = Math.round(((refMedian - buyPrice) / refMedian) * 100);
  const targetResalePrice = Math.max(buyPrice + 1, Math.round(refMedian * 0.98));
  const netResale = computeNetProceeds(targetResalePrice);
  const flipProfit = netResale - buyPrice;
  const roiPct = Math.round((flipProfit / buyPrice) * 100);

  const minDiscount = Number(settings.autoBuyMinDiscountPct ?? 28);
  const minProfit = Number(settings.autoMarketMinProfit ?? settings.autoBuyMinFlipProfit ?? 15);
  const minMargin = Number(settings.autoMarketMinMarginPct ?? 0);
  const minSales = Number(settings.autoBuyMinSales7d ?? 4);
  const maxUnit = Number(settings.autoBuyMaxUnitPrice ?? 400);

  const isGoodFlip =
    discountPct >= minDiscount &&
    flipProfit >= minProfit &&
    roiPct >= minMargin &&
    sales7d >= minSales &&
    buyPrice <= maxUnit;

  const isGoodMissingBuy =
    isMissing &&
    buyPrice <= Number(settings.autoBuyMissingMaxPrice ?? 25) &&
    discountPct >= 0;

  return {
    listingId: String(listing.id),
    characterId,
    name: char.name || `Carte #${characterId}`,
    series: char.series || '',
    rarity: (char.rarity || 'C') as Rarity,
    type: listing.type,
    buyPrice,
    refMedian,
    sales7d,
    discountPct,
    targetResalePrice,
    netResale,
    flipProfit,
    roiPct,
    isMissing,
    isGoodFlip,
    isGoodMissingBuy
  };
}
