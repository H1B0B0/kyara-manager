import { state } from '../state';
import { runtimeCache } from '../cache';
import { mapLimit } from '../../lib/concurrency';
import { evaluateDuplicate } from '../../lib/analytics/duplicates';
import { DEFAULT_RECYCLE_VALUES } from '../../lib/analytics/constants';
import { fetchLiveStats } from './sell-live';
import type { CardLedger } from '../safety';

function probePriority(d: any): number {
  if (['R', 'E', 'L', 'M'].includes(d.rarity)) return 3;
  if (d.referenceMedian !== null && d.referenceMedian !== undefined) return 2;
  return 1;
}

/**
 * Probes the live market in parallel for borderline duplicates, updates runtimeCache,
 * and re-evaluates all duplicates so each card has a fresh, accurate VENDRE vs RECYCLER decision.
 */
export async function triageDuplicatesLive(
  duplicates: any[],
  book: CardLedger,
  settings = state.currentSettings,
  maxProbes = 24
): Promise<any[]> {
  if (!duplicates || !duplicates.length) return [];

  const pricesCache = runtimeCache.collectionPrices as Map<number, any>;

  // Identify candidates with copies available whose liveDepth has not yet been fetched
  const candidates = duplicates.filter((d: any) => {
    const avail = book.get(d.characterId);
    const hasCopies = avail.spare > 0 || ((avail as any).recyclable ?? 0) > 0;
    if (!hasCopies) return false;
    const cached = pricesCache.get(d.characterId);
    return !cached?.liveDepth;
  });

  // Prioritize borderline cards (R/E or C/U with median) up to maxProbes
  const toProbe = candidates
    .sort((a, b) => probePriority(b) - probePriority(a))
    .slice(0, maxProbes);

  if (toProbe.length > 0) {
    const probeResults = await mapLimit(toProbe, 6, async (d: any) => {
      try {
        const stats = await fetchLiveStats(d);
        return { characterId: d.characterId, stats };
      } catch {
        return null;
      }
    });

    const now = Date.now();
    for (const res of probeResults) {
      if (res.status === 'fulfilled' && res.value) {
        const { characterId, stats } = res.value;
        const existing = pricesCache.get(characterId) || {};
        pricesCache.set(characterId, {
          ...existing,
          median7d: stats.median7d,
          median30d: stats.median30d,
          sales7d: stats.sales7d,
          liveDepth: stats.liveDepth,
          lowestFixed: stats.lowestFixed,
          highestFixed: stats.highestFixed,
          bestBuyOrder: stats.bestBuyOrder,
          at: now
        });
      }
    }
  }

  const catalog = runtimeCache.catalogById;
  const recycleMap = runtimeCache.recycleMap || { ...DEFAULT_RECYCLE_VALUES };

  // Re-evaluate all duplicates with the enriched market stats
  return duplicates.map((d: any) => {
    const charId = Number(d.characterId);
    const avail = book.get(charId);
    const card = catalog?.get(charId) || {
      id: charId,
      name: d.name,
      rarity: d.rarity,
      series: d.series
    };
    const stats = pricesCache.get(charId) || {};
    const reEvaluated = evaluateDuplicate(
      card,
      avail.entry || { characterId: charId, qty: d.owned ?? 1 },
      stats,
      recycleMap,
      settings,
      avail.listed,
      avail.pinned
    );
    const candRecyclable = d.recyclableSpare ?? (avail as any).recyclable ?? reEvaluated.spare;
    (reEvaluated as any).recyclableSpare = candRecyclable;
    return reEvaluated;
  });
}
