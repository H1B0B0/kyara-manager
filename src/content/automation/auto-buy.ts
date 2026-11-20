import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';
import { notifyDesktop } from '../utils';
import { getLastScannedListingsCount, scanMarketDealsInternal } from '../scanner';
import type { MarketWatchTelemetry, Rarity } from '../../types/kyara';

let totalBoughtSession = 0;

export async function executeAutoBuy(
  dashboard: any,
  options: { manual?: boolean } = {}
): Promise<{ boughtCount: number; dealsFound: number }> {
  const s = state.currentSettings;
  const marketBuyEnabled = Boolean(
    s.autoBuyFlipEnabled ||
    s.autoBuyMissingEnabled ||
    s.wishlistAutoBuyEnabled ||
    (s.renaissanceFocusEnabled && s.autoMarketEnabled)
  );
  if (!marketBuyEnabled && !options.manual) {
    return { boughtCount: 0, dealsFound: 0 };
  }

  const ownedSet = new Set<number>();
  const rawColl = await kyaraApi('/me/collection?lean=1');
  if (!Array.isArray(rawColl)) throw new Error('Collection indisponible. Achats suspendus.');
  for (const e of rawColl) {
    if (e.qty > 0) ownedSet.add(Number(e.characterId));
  }

  const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
  const wishlistMap = new Map((Array.isArray(kmWishlist) ? kmWishlist : []).map((w: any) => [Number(w.characterId), w]));

  let currentChakra = Number(dashboard?.me?.chakra ?? NaN);
  if (!Number.isFinite(currentChakra)) {
    const boot = await kyaraApi('/me/bootstrap').catch(() => null);
    currentChakra = Number((boot?.me || boot)?.chakra ?? 0);
  }

  const deals = await scanMarketDealsInternal(ownedSet, wishlistMap, currentChakra);
  const minReserve = Math.max(0, Number(s.autoBuyMinChakraReserve ?? 500));
  let boughtCount = 0;

  for (const deal of deals) {
    const shouldBuyFlip = Boolean(s.autoBuyFlipEnabled && deal.isGoodFlip);
    const renMaxPrice =
      s.batchBuyDefaultMaxPrice?.[deal.rarity as Rarity] ??
      s.autoBuyMissingMaxPrice ??
      25;
    const isRenaissanceBuy =
      Boolean(s.renaissanceFocusEnabled && (s.autoBuyMissingEnabled || s.autoMarketEnabled)) &&
      Boolean(deal.isRenaissanceNeed) &&
      !ownedSet.has(deal.characterId) &&
      deal.buyPrice <= renMaxPrice;
    const shouldBuyMissing =
      (Boolean(s.autoBuyMissingEnabled) && !ownedSet.has(deal.characterId) && Boolean(deal.isGoodMissingBuy)) ||
      isRenaissanceBuy;
    const shouldBuyWish = Boolean(s.wishlistAutoBuyEnabled && deal.autoBuyWish && !ownedSet.has(deal.characterId));
    if (!shouldBuyFlip && !shouldBuyMissing && !shouldBuyWish) continue;

    if (currentChakra - deal.buyPrice < minReserve) {
      continue;
    }

    try {
      const freshListing = await kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}`, { auth: true });
      if (!freshListing || freshListing.status !== 'active' || freshListing.isMine) continue;
      const freshPrice = freshListing.type === 'fixed' ? freshListing.price : freshListing.buyoutPrice;
      if (!Number.isFinite(freshPrice) || freshPrice <= 0 || freshPrice > deal.buyPrice) continue;
      const bootstrap = await kyaraApi('/me/bootstrap');
      const balance = Number((bootstrap?.me || bootstrap)?.chakra);
      if (!Number.isFinite(balance)) continue;
      currentChakra = Math.min(currentChakra, balance);
      if (currentChakra - freshPrice < minReserve) continue;

      if (s.dryRun) {
        boughtCount += 1;
        currentChakra -= freshPrice;
        ownedSet.add(deal.characterId);
        await appendJournal(
          'buy',
          `[SIMULATION] Achèterait ${deal.name} [${deal.rarity}] à ${freshPrice} ◆ (${
            shouldBuyWish ? 'Envie de collection' : shouldBuyFlip ? `Flip net +${deal.flipProfit} ◆` : isRenaissanceBuy ? `Renaissance [${deal.rarity}]` : 'Carte manquante'
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
          : isRenaissanceBuy
            ? `Renaissance [${deal.rarity}] (médiane ${deal.refMedian ?? '?'} ◆)`
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

  totalBoughtSession += boughtCount;
  const scannedListings = Math.max(deals.length, getLastScannedListingsCount());
  const lastNote =
    boughtCount > 0
      ? `${boughtCount} achat(s) effectué(s) sur ${deals.length} opportunité(s)`
      : deals.length > 0
        ? `${deals.length} opportunité(s) analysée(s)`
        : 'Aucune opportunité sur ce scan';
  const marketWatch: MarketWatchTelemetry = {
    active: Boolean(s.masterEnabled && marketBuyEnabled),
    lastScanAt: Date.now(),
    scannedListings,
    dealsFound: deals.length,
    boughtLastTick: boughtCount,
    totalBoughtSession,
    lastNote
  };

  const { kmDashboard } = (await chrome.storage.local.get('kmDashboard')) as { kmDashboard?: any };
  const baseDashboard =
    kmDashboard && typeof kmDashboard === 'object'
      ? kmDashboard
      : dashboard && typeof dashboard === 'object'
        ? dashboard
        : null;
  if (baseDashboard) {
    await chrome.storage.local
      .set({
        kmDashboard: {
          ...baseDashboard,
          deals: deals.slice(0, 100),
          marketWatch,
          me: baseDashboard.me
            ? { ...baseDashboard.me, chakra: Number.isFinite(currentChakra) ? currentChakra : baseDashboard.me.chakra }
            : baseDashboard.me,
          updatedAt: Date.now()
        }
      })
      .catch(() => {});
  }

  if (boughtCount > 0 || options.manual) {
    await appendJournal('info', `Observation marché : ${deals.length} opportunité(s) analysée(s), ${boughtCount} achat(s)`);
  }

  return { boughtCount, dealsFound: deals.length };
}
