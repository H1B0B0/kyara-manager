import { kyaraApi } from '../api';
import { computeLiveMarketDepth } from '../../lib/analytics/market-depth';

export interface LiveStats {
  median7d: number | null;
  median30d: number | null;
  sales7d: number | null;
  liveDepth: ReturnType<typeof computeLiveMarketDepth>;
  lowestFixed: number | null;
  highestFixed: number | null;
  bestBuyOrder: number | null;
}

/** Reads the live market for one card (three independent GETs, run together). */
export async function fetchLiveStats(cand: any): Promise<LiveStats> {
  const id = cand.characterId;
  const [listings, orders, prices] = await Promise.all([
    kyaraApi(`/market/listings?characterId=${id}&type=fixed&sort=price_asc&pageSize=20`, { auth: false }).catch(() => null),
    kyaraApi(`/market/buy-orders?characterId=${id}`, { auth: false }).catch(() => null),
    kyaraApi(`/market/prices/${id}`, { auth: false }).catch(() => null)
  ]);
  const refMedian = prices?.median7d ?? cand.referenceMedian ?? null;
  const liveDepth = computeLiveMarketDepth(listings?.items, refMedian);
  const bids = (Array.isArray(orders) ? orders : []).map((o: any) => Number(o.price) || 0);
  const bestBid = bids.length ? Math.max(...bids) : 0;
  return {
    median7d: refMedian,
    median30d: prices?.median30d ?? cand.referenceMedian ?? null,
    sales7d: prices?.sales7d ?? cand.sales7d ?? null,
    liveDepth,
    lowestFixed: liveDepth.lowestFixed,
    highestFixed: liveDepth.highestFixed,
    bestBuyOrder: bestBid > 0 ? bestBid : null
  };
}
