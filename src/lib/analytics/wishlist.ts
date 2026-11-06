import { Rarity, WishlistSuggestion } from '../../types/kyara';
import { RARITY_PRICE_FLOORS } from './constants';

export function generateDailyWishlist(
  catalogById: Map<number, any> | Record<number, any>,
  ownedSet: Set<number> | number[] | null,
  collectionPrices: Map<number, any> | Record<number, any>,
  limit = 20
): WishlistSuggestion[] {
  const entries = catalogById instanceof Map ? Array.from(catalogById.entries()) : Object.entries(catalogById || {});
  const seriesStats = new Map<string, { total: number; owned: number }>();

  for (const [id, card] of entries) {
    const numId = Number(id);
    const s = card?.series || 'Autre';
    if (!seriesStats.has(s)) {
      seriesStats.set(s, { total: 0, owned: 0 });
    }
    const st = seriesStats.get(s)!;
    st.total++;
    const isOwned = ownedSet instanceof Set ? ownedSet.has(numId) : Array.isArray(ownedSet) && ownedSet.includes(numId);
    if (isOwned) st.owned++;
  }

  const missingCandidates: WishlistSuggestion[] = [];
  for (const [id, card] of entries) {
    const numId = Number(id);
    const isOwned = ownedSet instanceof Set ? ownedSet.has(numId) : Array.isArray(ownedSet) && ownedSet.includes(numId);
    if (isOwned) continue;

    const rarity: Rarity = card?.rarity || 'C';
    const s = card?.series || 'Autre';
    const st = seriesStats.get(s);
    const completionPct = st && st.total > 0 ? (st.owned / st.total) * 100 : 0;

    const priceData = collectionPrices instanceof Map ? collectionPrices.get(numId) : collectionPrices?.[numId];
    const median7d = Number.isFinite(priceData?.median7d) ? priceData.median7d : Number(RARITY_PRICE_FLOORS[rarity] ?? 5);
    const sales7d = Number.isFinite(priceData?.sales7d) ? priceData.sales7d : 0;

    const affordabilityScore = Math.max(0, 100 - Math.min(100, median7d));
    const liquidityScore = Math.min(100, sales7d * 10);
    const score = Math.round(completionPct * 0.4 + affordabilityScore * 0.4 + liquidityScore * 0.2);

    missingCandidates.push({
      characterId: numId,
      name: card?.name || `Carte #${numId}`,
      series: s,
      rarity,
      completionPct: Math.round(completionPct),
      refMedian: median7d,
      priorityScore: score
    });
  }

  missingCandidates.sort((a, b) => b.priorityScore - a.priorityScore);
  return missingCandidates.slice(0, limit);
}

export function evaluateWishlistMatch(
  wishItem: any,
  listing: any,
  userChakra = 0,
  reserve = 0
): any {
  if (!wishItem || !listing) return null;
  const wishCharId = Number(wishItem.characterId || wishItem.id);
  const listingCharId = Number(listing.character?.id ?? listing.characterId);
  if (wishCharId !== listingCharId) return null;

  const buyPrice =
    listing.type === 'fixed'
      ? Number(listing.price)
      : Number.isFinite(listing.buyoutPrice) && listing.buyoutPrice > 0
        ? Number(listing.buyoutPrice)
        : Number(listing.price);

  const maxBudget = Number(wishItem.maxBudget || wishItem.budget || wishItem.budgetChakra || Infinity);
  const isUnderBudget = buyPrice <= maxBudget;
  const canAfford = userChakra >= buyPrice + reserve;
  const savings = maxBudget !== Infinity ? Math.max(0, maxBudget - buyPrice) : 0;

  return {
    matches: true,
    listingId: listing.id,
    characterId: wishCharId,
    name: wishItem.name || listing.character?.name || `Carte #${wishCharId}`,
    series: wishItem.series || listing.character?.series || '',
    rarity: wishItem.rarity || listing.character?.rarity || 'C',
    buyPrice,
    maxBudget,
    isUnderBudget,
    canAfford,
    savings,
    shouldAutoBuy: Boolean(wishItem.autoBuy && isUnderBudget && canAfford)
  };
}
