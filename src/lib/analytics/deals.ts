import { Rarity, MarketDeal } from '../../types/kyara';
import { KyaraSettings, DEFAULT_SETTINGS } from '../../types/settings';
import { computeNetProceeds } from './fees';

export function evaluateDeal(
  listing: any,
  marketStats: any = {},
  ownedCardIds: Set<number> | number[] | null = null,
  settings: Partial<KyaraSettings> = DEFAULT_SETTINGS
): MarketDeal | null {
  if (!listing) return null;
  const buyPrice = Number(listing.price || 0);
  if (buyPrice <= 0) return null;

  const charId = Number(listing.character?.id ?? listing.characterId);
  const name = listing.character?.name || listing.name || `Carte #${charId}`;
  const rarity: Rarity = listing.character?.rarity || listing.rarity || 'C';
  const series = listing.character?.series || listing.series || '';

  const refMedian = Number(marketStats.median7d ?? marketStats.refMedian ?? 0);
  const sales7d = Number(marketStats.sales7d ?? 0);

  const isMissing = Boolean(
    ownedCardIds &&
    (ownedCardIds instanceof Set ? !ownedCardIds.has(charId) : Array.isArray(ownedCardIds) && !ownedCardIds.includes(charId))
  );

  const targetResalePrice = refMedian > 0 ? refMedian : Math.round(buyPrice * 1.3);
  const netProceeds = computeNetProceeds(targetResalePrice);
  const flipProfit = netProceeds - buyPrice;
  const roiPct = Math.round((flipProfit / buyPrice) * 100);
  const discountPct = refMedian > buyPrice ? Math.round(((refMedian - buyPrice) / refMedian) * 100) : 0;

  const minProfit = Number(settings.autoMarketMinProfit ?? 5);
  const minMarginPct = Number(settings.autoMarketMinMarginPct ?? 20);
  const isGoodFlip = flipProfit >= minProfit && roiPct >= minMarginPct && sales7d >= 2;

  return {
    listingId: String(listing.id),
    characterId: charId,
    name,
    rarity,
    series,
    buyPrice,
    refMedian,
    targetResalePrice,
    flipProfit,
    roiPct,
    isGoodFlip,
    isMissing,
    discountPct,
    sales7d
  };
}
