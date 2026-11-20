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
  const rawCharId = Number(char.id ?? listing.characterId);
  const characterId = Number.isFinite(rawCharId) ? rawCharId : 0;
  const rarity = (char.rarity || 'C') as Rarity;
  const focusRarities =
    Array.isArray(settings.renaissanceTargetRarities) && settings.renaissanceTargetRarities.length
      ? settings.renaissanceTargetRarities
      : (['C', 'U', 'R'] as Rarity[]);
  const isMissing = Boolean(
    ownedSet &&
    (ownedSet instanceof Set ? !ownedSet.has(characterId) : Array.isArray(ownedSet) && !ownedSet.includes(characterId))
  );
  const isRenaissanceNeed = Boolean(isMissing && focusRarities.includes(rarity));
  const missingMaxPrice = Number.isFinite(Number(settings.autoBuyMissingMaxPrice))
    ? Number(settings.autoBuyMissingMaxPrice)
    : 25;

  const pickPositive = (...vals: unknown[]): number | null => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };
  const median7d = pickPositive(marketStats?.median7d, listing.prices?.median7d, listing.median7d, char.median7d);
  const median30d = pickPositive(marketStats?.median30d, listing.prices?.median30d, listing.median30d, char.median30d);
  const refMedian = median7d ?? median30d ?? null;
  const rawSales = marketStats?.sales7d ?? listing.prices?.sales7d ?? listing.sales7d ?? char.sales7d;
  const sales7d = Number.isFinite(Number(rawSales)) && Number(rawSales) >= 0 ? Number(rawSales) : 0;

  if (!refMedian || refMedian <= 0) {
    return {
      listingId: String(listing.id),
      characterId,
      name: char.name || `Carte #${characterId}`,
      series: char.series || '',
      rarity,
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
      isRenaissanceNeed,
      isGoodFlip: false,
      isGoodMissingBuy: Boolean(isMissing && buyPrice <= missingMaxPrice)
    };
  }

  const discountPct = Math.round(((refMedian - buyPrice) / refMedian) * 100);
  const targetResalePrice = Math.max(buyPrice + 1, Math.round(refMedian * 0.98));
  const netResale = computeNetProceeds(targetResalePrice);
  const flipProfit = netResale - buyPrice;
  const roiPct = Math.round((flipProfit / buyPrice) * 100);

  const rawMinDiscount = settings.autoBuyMinDiscountPct ?? settings.autoMarketMinMarginPct ?? 18;
  const minDiscount = Number.isFinite(Number(rawMinDiscount)) ? Number(rawMinDiscount) : 18;
  const rawMinProfit = settings.autoMarketMinProfit ?? settings.autoBuyMinFlipProfit ?? 5;
  const minProfit = Number.isFinite(Number(rawMinProfit)) ? Number(rawMinProfit) : 5;
  const rawMinMargin = settings.autoMarketMinMarginPct ?? 15;
  const minMargin = Number.isFinite(Number(rawMinMargin)) ? Number(rawMinMargin) : 15;
  const rawMinSales = settings.autoBuyMinSales7d ?? 1;
  const minSales = Number.isFinite(Number(rawMinSales)) ? Number(rawMinSales) : 1;
  const rawMaxUnit = settings.autoBuyMaxUnitPrice ?? 400;
  const maxUnit = Number.isFinite(Number(rawMaxUnit)) ? Number(rawMaxUnit) : 400;

  const isGoodFlip =
    discountPct >= minDiscount &&
    flipProfit >= minProfit &&
    roiPct >= minMargin &&
    sales7d >= minSales &&
    buyPrice <= maxUnit;

  const isGoodMissingBuy = Boolean(
    isMissing &&
    buyPrice <= missingMaxPrice &&
    discountPct >= -10
  );

  return {
    listingId: String(listing.id),
    characterId,
    name: char.name || `Carte #${characterId}`,
    series: char.series || '',
    rarity,
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
    isRenaissanceNeed,
    isGoodFlip,
    isGoodMissingBuy
  };
}
