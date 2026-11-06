import { kyaraApi } from './api';
import { runtimeCache } from './cache';
import { state } from './state';
import { notifyDesktop } from './utils';
import { evaluateDeal } from '../lib/analytics/deals';
import { evaluateWishlistMatch } from '../lib/analytics/wishlist';

let previousTradesCount = 0;

export async function scanMarketDealsInternal(
  ownedSet: Set<number>,
  wishlistMap: Map<number, any> = new Map(),
  userChakra = 0
): Promise<any[]> {
  const [newestPage, cheapPage] = await Promise.all([
    kyaraApi('/market/listings?sort=newest&pageSize=50&page=1', { auth: true }).catch(() => ({ items: [] })),
    kyaraApi('/market/listings?type=fixed&sort=price_asc&pageSize=50&page=1', { auth: true }).catch(() => ({
      items: []
    }))
  ]);

  const seen = new Set<string>();
  const combined = [
    ...(Array.isArray(newestPage?.items) ? newestPage.items : []),
    ...(Array.isArray(cheapPage?.items) ? cheapPage.items : [])
  ];

  const deals: any[] = [];
  const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 500));

  for (const item of combined) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);

    const charId = Number(item.character?.id ?? item.characterId);
    const deal: any = evaluateDeal(item, {}, ownedSet, state.currentSettings);
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

    if (deal.isWishlistMatch || deal.isGoodFlip || deal.isGoodMissingBuy || (deal.discountPct && deal.discountPct >= 15)) {
      deals.push(deal);
    }
  }

  deals.sort((a, b) => {
    if (Number(Boolean(b.isWishlistMatch)) !== Number(Boolean(a.isWishlistMatch))) {
      return Number(Boolean(b.isWishlistMatch)) - Number(Boolean(a.isWishlistMatch));
    }
    if (Number(b.isGoodFlip) !== Number(a.isGoodFlip)) return Number(b.isGoodFlip) - Number(a.isGoodFlip);
    return (b.flipProfit ?? -9999) - (a.flipProfit ?? -9999);
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
          id: item.id,
          seller: item.seller?.pseudo || '?',
          isWish: Boolean(isWish),
          offered: {
            id: offeredId,
            name: offeredChar.name || `Carte #${offeredId}`,
            rarity: offeredChar.rarity || 'C',
            median7d: offeredPrice,
            isMissing,
            isWish: Boolean(isWish)
          },
          wanted: {
            id: wantedId,
            name: myCard.name,
            rarity: myCard.rarity,
            median7d: myPrice
          },
          profit,
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
