import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';
import { notifyDesktop } from '../utils';
import { scanMarketDealsInternal } from '../scanner';

export async function executeAutoBuy(dashboard: any): Promise<{ boughtCount: number; dealsFound?: number }> {
  if (
    !state.currentSettings.autoBuyFlipEnabled &&
    !state.currentSettings.autoBuyMissingEnabled &&
    !state.currentSettings.wishlistAutoBuyEnabled
  ) {
    return { boughtCount: 0 };
  }

  const ownedSet = new Set<number>();
  const rawColl = await kyaraApi('/me/collection?lean=1').catch(() => []);
  for (const e of Array.isArray(rawColl) ? rawColl : []) {
    if (e.qty > 0) ownedSet.add(Number(e.characterId));
  }

  const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
  const wishlistMap = new Map((Array.isArray(kmWishlist) ? kmWishlist : []).map((w: any) => [Number(w.characterId), w]));

  const deals = await scanMarketDealsInternal(ownedSet, wishlistMap, Number(dashboard?.me?.chakra ?? 0));
  let currentChakra = Number(dashboard?.me?.chakra ?? 0);
  const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 500));
  let boughtCount = 0;

  for (const deal of deals) {
    const shouldBuyFlip = state.currentSettings.autoBuyFlipEnabled && deal.isGoodFlip;
    const shouldBuyMissing =
      state.currentSettings.autoBuyMissingEnabled && deal.isGoodMissingBuy && !ownedSet.has(deal.characterId);
    const shouldBuyWish = state.currentSettings.wishlistAutoBuyEnabled && deal.autoBuyWish;
    if (!shouldBuyFlip && !shouldBuyMissing && !shouldBuyWish) continue;

    if (currentChakra - deal.buyPrice < minReserve) {
      continue;
    }

    try {
      const freshListing = await kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}`, { auth: true });
      if (!freshListing || freshListing.status !== 'active' || freshListing.isMine) continue;
      const freshPrice = freshListing.type === 'fixed' ? freshListing.price : freshListing.buyoutPrice;
      if (!Number.isFinite(freshPrice) || freshPrice > deal.buyPrice) continue;

      if (state.currentSettings.dryRun) {
        boughtCount += 1;
        currentChakra -= freshPrice;
        await appendJournal(
          'buy',
          `[SIMULATION] Achèterait ${deal.name} [${deal.rarity}] à ${freshPrice} ◆ (${
            shouldBuyWish ? 'Envie de collection' : shouldBuyFlip ? `Flip net +${deal.flipProfit} ◆` : 'Carte manquante'
          })`
        );
        continue;
      }

      const buyRes = await kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}/buy`, {
        method: 'POST',
        withPass: true
      });
      boughtCount += 1;
      currentChakra = Number(buyRes?.user?.chakra ?? currentChakra - freshPrice);
      ownedSet.add(deal.characterId);
      const reasonTag = shouldBuyWish
        ? `Envie de collection (budget max : ${deal.wishlistMatch?.maxBudget} ◆)`
        : shouldBuyFlip
          ? `Flip : revente cible ~${deal.targetResalePrice} ◆ (net +${deal.flipProfit} ◆, -${deal.discountPct}%)`
          : `Nouvelle carte pour la collection (médiane ${deal.refMedian ?? '?'} ◆)`;
      await appendJournal('buy', `Achat auto : ${deal.name} [${deal.rarity}] pour ${freshPrice} ◆ · ${reasonTag}`);
      notifyDesktop(
        shouldBuyWish ? 'Carte de vos envies achetée !' : 'Bon plan acheté !',
        `${deal.name} [${deal.rarity}] achetée à ${freshPrice} ◆ (${reasonTag})`,
        'km-buy'
      );
    } catch (err: any) {
      if (err.code !== 'listing_closed' && err.status !== 404) {
        await appendJournal('warn', `Achat annulé sur ${deal.name} : ${err.message}`);
      }
    }
  }

  return { boughtCount, dealsFound: deals.length };
}
