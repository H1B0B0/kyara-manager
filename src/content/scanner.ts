import { kyaraApi } from './api';
import { ensureCollectionPrices, runtimeCache } from './cache';
import { state } from './state';
import { notifyDesktop } from './utils';
import { evaluateDeal } from '../lib/analytics/deals';
import { evaluateWishlistMatch } from '../lib/analytics/wishlist';
import { mapLimit } from '../lib/concurrency';
import type { Rarity } from '../types/kyara';

let previousTradesCount = 0;
let lastScannedListingsCount = 0;

export function getLastScannedListingsCount(): number {
  return lastScannedListingsCount;
}

export async function scanMarketDealsInternal(
  ownedSet: Set<number>,
  wishlistMap: Map<number, any> = new Map(),
  userChakra = 0,
  options: { rarity?: string; focusRarities?: Rarity[] } = {}
): Promise<any[]> {
  const queries = [
    '/market/listings?sort=newest&pageSize=50&page=1',
    '/market/listings?type=fixed&sort=price_asc&pageSize=50&page=1',
    '/market/listings?type=fixed&sort=price_asc&pageSize=50&page=2'
  ];

  if (options.rarity && options.rarity !== 'ALL') {
    queries.push(`/market/listings?type=fixed&sort=price_asc&rarity=${encodeURIComponent(options.rarity)}&pageSize=50&page=1`);
  } else if (state.currentSettings.renaissanceFocusEnabled || options.focusRarities?.length) {
    const rawFocus = options.focusRarities?.length
      ? options.focusRarities
      : state.currentSettings.renaissanceTargetRarities?.length
        ? state.currentSettings.renaissanceTargetRarities
        : (['C', 'U', 'R'] as Rarity[]);
    for (const r of rawFocus) {
      queries.push(`/market/listings?type=fixed&sort=price_asc&rarity=${encodeURIComponent(r)}&pageSize=50&page=1`);
    }
  } else if (state.currentSettings.autoBuyMissingEnabled || state.currentSettings.autoMarketEnabled || state.currentSettings.autoBuyFlipEnabled) {
    for (const r of ['U', 'R', 'E'] as Rarity[]) {
      queries.push(`/market/listings?type=fixed&sort=price_asc&rarity=${r}&pageSize=50&page=1`);
    }
  }

  const pages = await Promise.all(
    queries.map((q) => kyaraApi(q, { auth: true }).catch(() => ({ items: [] })))
  );

  const seen = new Set<string>();
  const combined: any[] = [];
  for (const page of pages) {
    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      if (!item?.id) continue;
      const idKey = String(item.id);
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      combined.push(item);
    }
  }

  lastScannedListingsCount = combined.length;

  // Hydrate inline & collection prices first, then probe /market/prices/:id for unowned cards
  const now = Date.now();
  const missingPriceIds = new Set<number>();
  for (const item of combined) {
    const charId = Number(item.character?.id ?? item.characterId);
    if (!Number.isFinite(charId) || charId <= 0) continue;
    const cached = runtimeCache.collectionPrices.get(charId);
    const inlineMedian = Number(item.median7d ?? item.prices?.median7d ?? item.character?.median7d);
    if (Number.isFinite(inlineMedian) && inlineMedian > 0 && !(cached && Number(cached.median7d) > 0)) {
      const inlineM30 = Number(item.median30d ?? item.prices?.median30d ?? item.character?.median30d);
      const inlineS7 = Number(item.sales7d ?? item.prices?.sales7d ?? item.character?.sales7d);
      const inlineS30 = Number(item.sales30d ?? item.prices?.sales30d ?? item.character?.sales30d);
      runtimeCache.collectionPrices.set(charId, {
        median7d: inlineMedian,
        median30d: Number.isFinite(inlineM30) && inlineM30 > 0 ? inlineM30 : null,
        sales7d: Number.isFinite(inlineS7) && inlineS7 >= 0 ? inlineS7 : 0,
        sales30d: Number.isFinite(inlineS30) && inlineS30 >= 0 ? inlineS30 : null,
        at: now
      });
      continue;
    }
    if (!cached) {
      missingPriceIds.add(charId);
    }
  }
  if (missingPriceIds.size > 0) {
    await ensureCollectionPrices(Array.from(missingPriceIds), false);
  }

  const hasMedian7d = (cid: number): boolean => {
    const p = runtimeCache.collectionPrices.get(cid);
    return Boolean(p && Number.isFinite(Number(p.median7d)) && Number(p.median7d) > 0);
  };
  const newestItems = Array.isArray(pages[0]?.items) ? pages[0].items : [];
  const cheapestItems = [...combined].sort((a, b) => (Number(a?.price) || Infinity) - (Number(b?.price) || Infinity));
  const stillMissingSet = new Set<number>();
  const maxLen = Math.max(newestItems.length, cheapestItems.length);
  for (let i = 0; i < maxLen && stillMissingSet.size < 24; i += 1) {
    for (const candidate of [newestItems[i], cheapestItems[i]]) {
      if (!candidate || stillMissingSet.size >= 24) continue;
      const cid = Number(candidate.character?.id ?? candidate.characterId);
      if (Number.isFinite(cid) && cid > 0 && !hasMedian7d(cid)) {
        stillMissingSet.add(cid);
      }
    }
  }
  if (stillMissingSet.size > 0) {
    await mapLimit(Array.from(stillMissingSet), 6, async (cid) => {
      const res = await kyaraApi(`/market/prices/${cid}`, { auth: false }).catch(() => null);
      if (!res || typeof res !== 'object') return;
      const m7 = Number(res.median7d);
      const m30 = Number(res.median30d);
      if ((Number.isFinite(m7) && m7 > 0) || (Number.isFinite(m30) && m30 > 0)) {
        runtimeCache.collectionPrices.set(cid, {
          median7d: Number.isFinite(m7) && m7 > 0 ? m7 : null,
          median30d: Number.isFinite(m30) && m30 > 0 ? m30 : null,
          sales7d: Number.isFinite(Number(res.sales7d)) ? Number(res.sales7d) : 0,
          sales30d: Number.isFinite(Number(res.sales30d)) ? Number(res.sales30d) : null,
          at: Date.now()
        });
      }
    });
  }

  const deals: any[] = [];
  const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 500));

  for (const item of combined) {
    const charId = Number(item.character?.id ?? item.characterId);
    const deal: any = evaluateDeal(item, runtimeCache.collectionPrices.get(charId) || {}, ownedSet, state.currentSettings);
    if (!deal) continue;

    // Croisement Wishlist (Mes envies)
    if (wishlistMap && wishlistMap.has(charId)) {
      const wish = wishlistMap.get(charId);
      const match = evaluateWishlistMatch(wish, item, userChakra, minReserve);
      if (match) {
        deal.isWishlistMatch = true;
        deal.wishlistMatch = match;
        if (match.shouldAutoBuy && state.currentSettings.wishlistAutoBuyEnabled) {
          deal.autoBuyWish = true;
        }
      }
    }

    if (
      deal.isWishlistMatch ||
      deal.isGoodFlip ||
      deal.isGoodMissingBuy ||
      deal.isRenaissanceNeed ||
      (deal.discountPct && deal.discountPct >= 15) ||
      (deal.isMissing && deal.buyPrice <= 10)
    ) {
      deals.push(deal);
    }
  }

  const renaissanceFocus = Boolean(state.currentSettings.renaissanceFocusEnabled);
  deals.sort((a, b) => {
    const wishDiff = Number(Boolean(b.isWishlistMatch)) - Number(Boolean(a.isWishlistMatch));
    if (wishDiff !== 0) return wishDiff;
    if (renaissanceFocus) {
      const renDiff = Number(Boolean(b.isRenaissanceNeed)) - Number(Boolean(a.isRenaissanceNeed));
      if (renDiff !== 0) return renDiff;
      if (a.isRenaissanceNeed && b.isRenaissanceNeed) {
        const renPriceDiff = (a.buyPrice ?? Infinity) - (b.buyPrice ?? Infinity);
        if (renPriceDiff !== 0) return renPriceDiff;
      }
    }
    const flipDiff = Number(Boolean(b.isGoodFlip)) - Number(Boolean(a.isGoodFlip));
    if (flipDiff !== 0) return flipDiff;
    if (a.isGoodFlip && b.isGoodFlip) {
      const profitDiff = (b.flipProfit ?? -9999) - (a.flipProfit ?? -9999);
      if (profitDiff !== 0) return profitDiff;
    }
    const missDiff = Number(Boolean(b.isMissing)) - Number(Boolean(a.isMissing));
    if (missDiff !== 0) return missDiff;
    return (a.buyPrice ?? Infinity) - (b.buyPrice ?? Infinity);
  });

  return deals;
}

export async function scanProfitableTrades(
  ownedSet: Set<number>,
  duplicateEntries: any[],
  wishlistMap: Map<number, any> = new Map()
): Promise<any[]> {
  try {
    const res =
      (await kyaraApi('/market/listings?type=trade&pageSize=40&page=1', { auth: true }).catch(() => null)) ||
      (await kyaraApi('/trades', { auth: true }).catch(() => null)) ||
      (await kyaraApi('/market/trades', { auth: true }).catch(() => null));

    const rawItems = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    if (!rawItems.length) return [];

    const spareMap = new Map<number, any>();
    for (const d of duplicateEntries || []) {
      if (d.spare > 0 && !d.pinned) {
        spareMap.set(Number(d.characterId), d);
      }
    }

    const profitable: any[] = [];
    for (const item of rawItems) {
      if (!item || item.isMine || (item.status && item.status !== 'active')) continue;

      const offeredChar = item.character || item.offered || {};
      const offeredId = Number(offeredChar.id ?? item.characterId);
      const wantedId = Number(
        item.wantedCharacterId ??
        item.wantedCharacter?.id ??
        item.targetCharacterId ??
        item.wantedId ??
        item.wanted?.id
      );

      if (!Number.isFinite(wantedId) || !spareMap.has(wantedId)) continue;

      const myCard = spareMap.get(wantedId);
      const offeredPrice = runtimeCache.collectionPrices.get(offeredId)?.median7d || 0;
      const myPrice = runtimeCache.collectionPrices.get(wantedId)?.median7d || 0;
      const isMissing = ownedSet ? !ownedSet.has(offeredId) : false;
      const isWish = wishlistMap && wishlistMap.has(offeredId);
      const profit = offeredPrice - myPrice;

      if (isWish || profit >= 3 || (isMissing && profit >= -5)) {
        profitable.push({
          listingId: String(item.id),
          seller: item.seller?.pseudo || '?',
          isWish: Boolean(isWish),
          offered: {
            characterId: offeredId,
            name: offeredChar.name || `Carte #${offeredId}`,
            rarity: offeredChar.rarity || 'C',
            median7d: offeredPrice,
            isMissing,
            isWish: Boolean(isWish)
          },
          wanted: {
            characterId: wantedId,
            name: myCard.name,
            rarity: myCard.rarity,
            median7d: myPrice
          },
          profit,
          roiPct: myPrice > 0 ? Math.round((profit / myPrice) * 100) : 0,
          createdAt: item.createdAt || null
        });
      }
    }

    profitable.sort((a, b) => {
      if (Number(b.isWish) !== Number(a.isWish)) return Number(b.isWish) - Number(a.isWish);
      return b.profit - a.profit;
    });

    if (profitable.length > previousTradesCount && profitable.length > 0) {
      const top = profitable[0];
      notifyDesktop(
        top.isWish ? 'Échange pour carte de vos envies !' : 'Échange rentable disponible !',
        `Donne ${top.wanted.name} (${top.wanted.median7d} ◆) contre ${top.offered.name} (${top.offered.median7d} ◆) ${top.isWish ? '★ Dans vos envies !' : `· Gain +${top.profit} ◆`}`,
        'km-trade'
      );
    }
    previousTradesCount = profitable.length;
    return profitable;
  } catch {
    return [];
  }
}
