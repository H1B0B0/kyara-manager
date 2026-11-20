import { kyaraApi } from '../api';
import { appendJournal } from '../journal';
import { isInterrupted, positiveInteger } from '../safety';
import { state } from '../state';
import { fulfilled, mapLimit } from '../../lib/concurrency';
import type { BuyOrderOpportunity, Rarity } from '../../types/kyara';

interface BuyOrderCandidate {
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  source: 'wishlist' | 'renaissance' | 'series';
  estimatedPrice?: number;
  maxBudget?: number;
}

function collectCandidates(dashboard: any, cap: number): BuyOrderCandidate[] {
  const seen = new Set<number>();
  const list: BuyOrderCandidate[] = [];
  const push = (c: BuyOrderCandidate) => {
    if (Number.isFinite(c.characterId) && c.characterId > 0 && !seen.has(c.characterId)) {
      seen.add(c.characterId);
      list.push(c);
    }
  };

  for (const w of Array.isArray(dashboard?.wishlist) ? dashboard.wishlist : []) {
    const id = Number(w?.characterId);
    const maxBudget = Number(w?.maxBudget ?? w?.budgetChakra);
    push({
      characterId: id, name: String(w?.name || `Carte #${id}`), series: String(w?.series || ''),
      rarity: (w?.rarity || 'C') as Rarity, source: 'wishlist',
      estimatedPrice: Number.isFinite(Number(w?.lowestMarketPrice)) ? Number(w.lowestMarketPrice) : undefined,
      maxBudget: Number.isFinite(maxBudget) && maxBudget > 0 ? maxBudget : undefined
    });
  }
  for (const sp of Array.isArray(dashboard?.seriesProgress) ? dashboard.seriesProgress : []) {
    for (const mc of Array.isArray(sp?.missingCards) ? sp.missingCards : []) {
      const id = Number(mc?.characterId);
      push({
        characterId: id, name: String(mc?.name || `Carte #${id}`), series: String(sp?.series || ''),
        rarity: (mc?.rarity || 'C') as Rarity, source: 'series',
        estimatedPrice: Number.isFinite(Number(mc?.estimatedPrice)) ? Number(mc.estimatedPrice) : undefined
      });
    }
  }
  for (const d of Array.isArray(dashboard?.deals) ? dashboard.deals : []) {
    if (!d?.isRenaissanceNeed) continue;
    const id = Number(d?.characterId);
    push({
      characterId: id, name: String(d?.name || `Carte #${id}`), series: String(d?.series || ''),
      rarity: (d?.rarity || 'C') as Rarity, source: 'renaissance',
      estimatedPrice: Number.isFinite(Number(d?.refMedian ?? d?.buyPrice)) ? Number(d.refMedian ?? d.buyPrice) : undefined
    });
  }
  return list.slice(0, cap);
}

export async function scanBuyOrderOpportunities(
  dashboard: any,
  options: { limit?: number; discountPct?: number } = {}
): Promise<BuyOrderOpportunity[]> {
  const [rawColl, myMarket] = await Promise.all([
    kyaraApi('/me/collection?lean=1').catch(() => null),
    kyaraApi('/me/market').catch(() => null)
  ]);
  const ownedSet = new Set<number>();
  if (Array.isArray(rawColl)) {
    for (const e of rawColl) {
      const cid = Number(e?.characterId ?? e?.id);
      if (Number.isFinite(cid) && Number(e?.qty) > 0) ownedSet.add(cid);
    }
  }
  const activeOrderCharIds = new Set<number>();
  const myOrders = Array.isArray(myMarket?.buyOrders)
    ? myMarket.buyOrders
    : Array.isArray(myMarket?.orders)
      ? myMarket.orders
      : [];
  for (const ord of myOrders) {
    if (ord?.status && ord.status !== 'active' && ord.status !== 'pending') continue;
    const cid = Number(ord?.character?.id ?? ord?.characterId);
    if (Number.isFinite(cid) && cid > 0) activeOrderCharIds.add(cid);
  }
  const cap = Math.max(1, Math.min(20, Number(options.limit) || 16));
  const candidates = collectCandidates(dashboard, cap * 2)
    .filter((c) => !ownedSet.has(c.characterId) && !activeOrderCharIds.has(c.characterId))
    .slice(0, cap);
  if (candidates.length === 0) return [];

  const discountPct = Number(options.discountPct ?? state.currentSettings.buyOrderDiscountPct ?? 25);
  const results = await mapLimit(candidates, 5, async (cand): Promise<BuyOrderOpportunity> => {
    const id = cand.characterId;
    const [orders, prices, listings] = await Promise.all([
      kyaraApi(`/market/buy-orders?characterId=${id}`, { auth: true }).catch(() => null),
      kyaraApi(`/market/prices/${id}`, { auth: false }).catch(() => null),
      kyaraApi(`/market/listings?characterId=${id}&type=fixed&sort=price_asc&pageSize=3`, { auth: true }).catch(() => null)
    ]);

    const orderList = Array.isArray(orders) ? orders : Array.isArray(orders?.items) ? orders.items : [];
    const bids = orderList
      .filter((o: any) => !o?.isMine)
      .map((o: any) => Number(o?.price))
      .filter((p: number) => Number.isFinite(p) && p > 0);
    const bestExistingBid = bids.length > 0 ? Math.max(...bids) : null;
    const median7d = Number.isFinite(Number(prices?.median7d)) && Number(prices.median7d) > 0 ? Number(prices.median7d) : null;
    const fixedPrices = (Array.isArray(listings?.items) ? listings.items : [])
      .filter((l: any) => (!l?.status || l.status === 'active') && !l?.isMine)
      .map((l: any) => Number(l?.price))
      .filter((p: number) => Number.isFinite(p) && p > 0);
    const lowestFixed = fixedPrices.length > 0 ? Math.min(...fixedPrices) : null;

    const ref = median7d ?? lowestFixed ?? cand.estimatedPrice ?? 5;
    const discounted = Math.max(2, Math.floor(ref * (1 - discountPct / 100)));
    const marketCap = lowestFixed ? lowestFixed - 1 : ref;
    const hardCap = cand.source === 'wishlist' && cand.maxBudget !== undefined ? Math.min(marketCap, cand.maxBudget) : marketCap;
    const rawBid = bestExistingBid ? Math.max(discounted, bestExistingBid + 1) : discounted;
    const suggestedBid = Math.max(1, Math.min(rawBid, Math.floor(hardCap)));
    const savingsPct = ref > 0 ? Math.max(0, Math.round(((ref - suggestedBid) / ref) * 100)) : 0;

    return {
      characterId: id, name: cand.name, series: cand.series, rarity: cand.rarity,
      median7d, lowestFixed, bestExistingBid, suggestedBid, savingsPct, source: cand.source
    };
  });

  return fulfilled(results).sort((a, b) => {
    const wishDiff = Number(b.source === 'wishlist') - Number(a.source === 'wishlist');
    return wishDiff || b.savingsPct - a.savingsPct;
  });
}

export async function placeBuyOrder(characterId: number, price: number, name = ''): Promise<{ ok: boolean; error?: string }> {
  try {
    const charId = positiveInteger(characterId, 'Carte');
    const bidPrice = positiveInteger(price, 'Prix');
    const bootstrap = await kyaraApi('/me/bootstrap');
    const chakra = Number((bootstrap?.me || bootstrap)?.chakra ?? 0);
    const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 200));
    if (chakra - bidPrice < minReserve) return { ok: false, error: `Réserve Chakra (${minReserve} ◆) atteinte` };

    const label = name || `Carte #${charId}`;
    if (state.currentSettings.dryRun) {
      await appendJournal('buy', `[SIMULATION] Placerait un ordre d'achat : ${label} à ${bidPrice} ◆`);
      return { ok: true };
    }
    await kyaraApi('/market/buy-orders', { method: 'POST', withPass: true, priority: 'high', body: { characterId: charId, price: bidPrice, qty: 1 } });
    await appendJournal('buy', `Ordre d'achat placé : ${label} à ${bidPrice} ◆`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function placeBatchBuyOrders(
  orders: Array<{ characterId: number; price: number; name?: string }>
): Promise<{ placedCount: number; totalLocked: number; failedCount: number }> {
  let placedCount = 0;
  let totalLocked = 0;
  let failedCount = 0;
  if (!Array.isArray(orders) || orders.length === 0) return { placedCount, totalLocked, failedCount };

  const bootstrap = await kyaraApi('/me/bootstrap');
  let currentChakra = Number((bootstrap?.me || bootstrap)?.chakra ?? 0);
  const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 200));

  for (const order of orders) {
    if (isInterrupted()) break;
    let charId: number;
    let bidPrice: number;
    try {
      charId = positiveInteger(order?.characterId, 'Carte');
      bidPrice = positiveInteger(order?.price, 'Prix');
    } catch { failedCount += 1; continue; }
    if (currentChakra - bidPrice < minReserve) break;
    if (state.currentSettings.dryRun) {
      placedCount += 1; totalLocked += bidPrice; currentChakra -= bidPrice;
      continue;
    }
    try {
      const res = await kyaraApi('/market/buy-orders', { method: 'POST', withPass: true, priority: 'high', body: { characterId: charId, price: bidPrice, qty: 1 } });
      placedCount += 1; totalLocked += bidPrice;
      currentChakra = Number(res?.user?.chakra ?? currentChakra - bidPrice);
    } catch { failedCount += 1; }
  }

  const prefix = state.currentSettings.dryRun ? '[SIMULATION] ' : '';
  await appendJournal('buy', `${prefix}Ordres d'achat groupés : ${placedCount} ordre(s) placé(s) (${totalLocked} ◆ bloqués${failedCount > 0 ? `, ${failedCount} échec(s)` : ''})`);
  return { placedCount, totalLocked, failedCount };
}
