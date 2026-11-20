import type { Rarity, SeriesMissingCard, SeriesProgress } from '../../types/kyara';
import { RARITIES, RARITY_PRICE_FLOORS } from './constants';

const NEAR_COMPLETE_PCT = 75;
const MAX_MISSING_CARDS_PREVIEW = 50;

interface SeriesAccumulator {
  series: string;
  owned: number;
  total: number;
  missingCards: SeriesMissingCard[];
  estimatedCostToComplete: number;
}

function getPriceEntry(
  collectionPrices: Map<number, any> | Record<number, any> | null | undefined,
  id: number
): any {
  if (!collectionPrices) return undefined;
  return collectionPrices instanceof Map ? collectionPrices.get(id) : collectionPrices[id];
}

/**
 * Compute per-series completion progress, prioritizing nearly complete and affordable series.
 */
export function computeSeriesProgress(
  catalogById: Map<number, any> | Record<number, any>,
  ownedSet: Set<number> | number[] | null | undefined,
  collectionPrices: Map<number, any> | Record<number, any> | null | undefined = null,
  limit = 25
): SeriesProgress[] {
  const ownedIds =
    ownedSet instanceof Set
      ? ownedSet
      : new Set(Array.isArray(ownedSet) ? ownedSet.map(Number).filter(Number.isFinite) : []);

  const entries: Iterable<[unknown, any]> =
    catalogById instanceof Map
      ? catalogById.entries()
      : catalogById && typeof catalogById === 'object'
        ? Object.entries(catalogById)
        : [];

  const groups = new Map<string, SeriesAccumulator>();

  for (const [key, card] of entries) {
    if (!card || typeof card !== 'object') continue;
    const id = Number(card.characterId ?? card.id ?? key);
    if (!Number.isFinite(id)) continue;

    const series = String(card.series || 'Autre').trim() || 'Autre';
    const rawRarity = card.rarity as Rarity;
    const rarity: Rarity = RARITIES.includes(rawRarity) ? rawRarity : 'C';

    let acc = groups.get(series);
    if (!acc) {
      acc = { series, owned: 0, total: 0, missingCards: [], estimatedCostToComplete: 0 };
      groups.set(series, acc);
    }

    acc.total += 1;
    if (ownedIds.has(id)) {
      acc.owned += 1;
    } else {
      const priceEntry = getPriceEntry(collectionPrices, id);
      const rawMedian = priceEntry?.median7d;
      const estimatedPrice =
        (typeof rawMedian === 'number' && Number.isFinite(rawMedian) ? rawMedian : null) ??
        RARITY_PRICE_FLOORS[rarity] ??
        5;

      acc.estimatedCostToComplete += estimatedPrice;
      acc.missingCards.push({
        characterId: id,
        name: String(card.name || `#${id}`),
        rarity,
        estimatedPrice
      });
    }
  }

  const results: SeriesProgress[] = [];
  for (const acc of groups.values()) {
    const missingCount = acc.total - acc.owned;
    if (acc.total < 3 || missingCount <= 0) continue;

    acc.missingCards.sort((a, b) => a.estimatedPrice - b.estimatedPrice || a.characterId - b.characterId);

    results.push({
      series: acc.series,
      owned: acc.owned,
      total: acc.total,
      missingCount,
      completionPct: Math.round((acc.owned / acc.total) * 1000) / 10,
      estimatedCostToComplete: Math.round(acc.estimatedCostToComplete),
      missingCards: acc.missingCards.slice(0, MAX_MISSING_CARDS_PREVIEW)
    });
  }

  results.sort((a, b) => {
    const aNear = a.completionPct >= NEAR_COMPLETE_PCT;
    const bNear = b.completionPct >= NEAR_COMPLETE_PCT;
    if (aNear !== bNear) return aNear ? -1 : 1;
    if (aNear && bNear) {
      return (
        a.missingCount - b.missingCount ||
        a.estimatedCostToComplete - b.estimatedCostToComplete ||
        b.completionPct - a.completionPct
      );
    }
    return (
      b.completionPct - a.completionPct ||
      a.missingCount - b.missingCount ||
      a.estimatedCostToComplete - b.estimatedCostToComplete
    );
  });

  return results.slice(0, Math.max(0, limit));
}
