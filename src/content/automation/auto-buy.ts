import { kyaraApi } from '../api';
import { runtimeCache } from '../cache';
import { state } from '../state';
import { appendJournal } from '../journal';
import { notifyDesktop } from '../utils';
import { getLastScannedListingsCount, scanMarketDealsInternal } from '../scanner';
import { evaluateDeal } from '../../lib/analytics/deals';
import { OFFICIAL_REBIRTH_1_TARGETS } from '../../lib/analytics/renaissance';
import type { MarketWatchTelemetry, Rarity } from '../../types/kyara';

const ALL_RARITIES: Rarity[] = ['C', 'U', 'R', 'E', 'L', 'M'];
const DEFAULT_REN_MAX_PRICE: Record<Rarity, number> = { C: 5, U: 6, R: 10, E: 35, L: 140, M: 600 };
let totalBoughtSession = 0;

export async function executeAutoBuy(
  dashboard: any,
  options: { manual?: boolean } = {}
): Promise<{ boughtCount: number; dealsFound: number }> {
  const s = state.currentSettings;
  const marketBuyEnabled = Boolean(
    s.autoBuyFlipEnabled ||
    s.autoMarketEnabled ||
    s.autoBuyMissingEnabled ||
    s.wishlistAutoBuyEnabled ||
    s.renaissanceFocusEnabled
  );
  if (!marketBuyEnabled && !options.manual) {
    return { boughtCount: 0, dealsFound: 0 };
  }

  const ownedSet = new Set<number>();
  const [rawColl, initialBoot] = await Promise.all([
    kyaraApi('/me/collection?lean=1'),
    kyaraApi('/me/bootstrap').catch(() => null)
  ]);
  if (!Array.isArray(rawColl)) throw new Error('Collection indisponible. Achats suspendus.');
  for (const e of rawColl) {
    if (e.qty > 0) ownedSet.add(Number(e.characterId));
  }

  const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
  const wishlistMap = new Map((Array.isArray(kmWishlist) ? kmWishlist : []).map((w: any) => [Number(w.characterId), w]));

  const rawBootChakra = (initialBoot?.me || initialBoot)?.chakra;
  const bootChakra = rawBootChakra != null && rawBootChakra !== '' ? Number(rawBootChakra) : NaN;
  const rawDashChakra = dashboard?.me?.chakra;
  const dashChakra = rawDashChakra != null && rawDashChakra !== '' ? Number(rawDashChakra) : NaN;
  let currentChakra = Number.isFinite(bootChakra)
    ? bootChakra
    : Number.isFinite(dashChakra)
      ? dashChakra
      : 0;

  const remainingByRarity: Partial<Record<Rarity, number>> = {};
  const renByRarity = dashboard?.renaissance?.byRarity;
  if (renByRarity && typeof renByRarity === 'object') {
    for (const r of ALL_RARITIES) {
      const rem = renByRarity[r]?.remainingForTarget;
      if (typeof rem === 'number' && Number.isFinite(rem)) {
        remainingByRarity[r] = Math.max(0, rem);
      }
    }
  } else if (runtimeCache.catalogById && runtimeCache.catalogById.size > 0) {
    const ownedCounts: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
    for (const [cid, ch] of runtimeCache.catalogById.entries()) {
      const r = (ch?.rarity || 'C') as Rarity;
      if (ALL_RARITIES.includes(r) && ownedSet.has(Number(cid))) {
        ownedCounts[r] += 1;
      }
    }
    for (const r of ALL_RARITIES) {
      const target = Number(s.renaissanceTargets?.[r]) || OFFICIAL_REBIRTH_1_TARGETS[r];
      remainingByRarity[r] = Math.max(0, target - ownedCounts[r]);
    }
  }

  const configuredFocus: Rarity[] =
    Array.isArray(s.renaissanceTargetRarities) && s.renaissanceTargetRarities.length
      ? [...s.renaissanceTargetRarities]
      : ['C', 'U', 'R', 'E'];
  const isLegacyCurDefault =
    configuredFocus.length === 3 &&
    configuredFocus.includes('C') &&
    configuredFocus.includes('U') &&
    configuredFocus.includes('R') &&
    !configuredFocus.includes('E');
  if (s.renaissanceFocusEnabled && isLegacyCurDefault && (remainingByRarity.E === undefined || remainingByRarity.E > 0)) {
    configuredFocus.push('E');
  }
  let activeFocusRarities = configuredFocus.filter(
    (r) => remainingByRarity[r] === undefined || remainingByRarity[r]! > 0
  );
  if (s.renaissanceFocusEnabled && activeFocusRarities.length === 0) {
    // If all explicitly focused rarities are already 100% done, advance to any incomplete Rebirth rarity (C..L)
    activeFocusRarities = (['C', 'U', 'R', 'E', 'L'] as Rarity[]).filter(
      (r) => (remainingByRarity[r] ?? 0) > 0
    );
  }
  const effectiveFocus = activeFocusRarities.length > 0 ? activeFocusRarities : configuredFocus;
  const evalSettings = { ...s, renaissanceTargetRarities: effectiveFocus };

  const deals = await scanMarketDealsInternal(
    ownedSet,
    wishlistMap,
    currentChakra,
    s.renaissanceFocusEnabled ? { focusRarities: effectiveFocus } : {}
  );

  const getRenMaxPrice = (rarity: Rarity, refMedian?: number | null): number => {
    const configured = Number(s.batchBuyDefaultMaxPrice?.[rarity]);
    const baseCap =
      Number.isFinite(configured) && configured > 0
        ? configured
        : Number(s.autoBuyMissingMaxPrice) || DEFAULT_REN_MAX_PRICE[rarity] || 25;
    if (refMedian && Number.isFinite(refMedian) && refMedian > baseCap) {
      return Math.min(Math.round(baseCap * 1.6), Math.round(refMedian));
    }
    return baseCap;
  };

  // Deep scan fallback: when the player already owns ~90%+ of a rarity (e.g. 487/505 Epics),
  // pages 1-2 of price_asc often contain only already-owned cards. Walk pages 3-5 to find unowned ones.
  if (s.renaissanceFocusEnabled && activeFocusRarities.length > 0) {
    const existingIds = new Set<string>(deals.map((d: any) => String(d.listingId)));
    for (const r of activeFocusRarities) {
      const hasBuyableForRarity = deals.some(
        (d: any) =>
          d.rarity === r &&
          !ownedSet.has(d.characterId) &&
          d.buyPrice <= getRenMaxPrice(r, d.refMedian)
      );
      if (hasBuyableForRarity) continue;
      const capPrice = getRenMaxPrice(r, null);
      for (let page = 3; page <= 5; page += 1) {
        const res = await kyaraApi(
          `/market/listings?type=fixed&sort=price_asc&rarity=${encodeURIComponent(r)}&pageSize=50&page=${page}`,
          { auth: true }
        ).catch(() => ({ items: [] }));
        const items = Array.isArray(res?.items) ? res.items : [];
        if (items.length === 0) break;
        let foundInPage = 0;
        let lowestInPage = Infinity;
        for (const item of items) {
          const price = Number(item?.price);
          if (Number.isFinite(price) && price < lowestInPage) lowestInPage = price;
          if (!item?.id || existingIds.has(String(item.id))) continue;
          const cid = Number(item.character?.id ?? item.characterId);
          if (!Number.isFinite(cid) || cid <= 0 || ownedSet.has(cid)) continue;
          const d: any = evaluateDeal(item, runtimeCache.collectionPrices.get(cid) || {}, ownedSet, evalSettings);
          if (d && d.isRenaissanceNeed && d.buyPrice <= getRenMaxPrice(r, d.refMedian)) {
            existingIds.add(String(item.id));
            deals.push(d);
            foundInPage += 1;
          }
        }
        if (foundInPage >= 5 || lowestInPage > capPrice * 1.6) break;
      }
    }
  }

  const minReserve = Math.max(0, Number(s.autoBuyMinChakraReserve ?? 500));
  let boughtCount = 0;

  for (const deal of deals) {
    const rarity = deal.rarity as Rarity;
    const rarityRemaining = remainingByRarity[rarity];
    const rarityStillNeededForRenaissance = rarityRemaining === undefined || rarityRemaining > 0;
    const shouldBuyFlip = Boolean((s.autoBuyFlipEnabled || s.autoMarketEnabled) && deal.isGoodFlip);
    const renMaxPrice = getRenMaxPrice(rarity, deal.refMedian);
    const isRenaissanceBuy =
      Boolean(s.renaissanceFocusEnabled) &&
      (Boolean(deal.isRenaissanceNeed) || effectiveFocus.includes(rarity)) &&
      rarityStillNeededForRenaissance &&
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
      const [freshListing, bootstrap] = await Promise.all([
        kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}`, { auth: true }),
        kyaraApi('/me/bootstrap').catch(() => null)
      ]);
      if (!freshListing || freshListing.status !== 'active' || freshListing.isMine) continue;
      const freshPrice = freshListing.type === 'fixed' ? freshListing.price : freshListing.buyoutPrice;
      if (!Number.isFinite(freshPrice) || freshPrice <= 0 || freshPrice > deal.buyPrice) continue;
      const rawBalance = (bootstrap?.me || bootstrap)?.chakra;
      const balance = rawBalance != null && rawBalance !== '' ? Number(rawBalance) : NaN;
      if (Number.isFinite(balance)) {
        currentChakra = balance;
      }
      if (currentChakra - freshPrice < minReserve) continue;

      if (s.dryRun) {
        boughtCount += 1;
        currentChakra -= freshPrice;
        ownedSet.add(deal.characterId);
        if (isRenaissanceBuy && remainingByRarity[rarity] !== undefined) {
          remainingByRarity[rarity] = Math.max(0, (remainingByRarity[rarity] || 0) - 1);
        }
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
        withPass: true,
        priority: 'high'
      });
      boughtCount += 1;
      currentChakra = Number(buyRes?.user?.chakra ?? currentChakra - freshPrice);
      ownedSet.add(deal.characterId);
      if (isRenaissanceBuy && remainingByRarity[rarity] !== undefined) {
        remainingByRarity[rarity] = Math.max(0, (remainingByRarity[rarity] || 0) - 1);
      }
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
      const code = String(err?.code || '');
      const status = Number(err?.status);
      const isAlreadyGone =
        status === 404 || status === 409 || code === 'listing_closed' || code === 'listing_already_sold';
      if (!isAlreadyGone) {
        await appendJournal('warn', `Achat annulé sur ${deal.name} : ${err?.message || code || 'erreur inconnue'}`);
      }
      if (code === 'pass_required' || code === 'market_locked' || code === 'insufficient_chakra') {
        break;
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
