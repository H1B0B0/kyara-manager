import { kyaraApi } from './api';
import * as cacheModule from './cache';
import { state, loadSettings } from './state';
import { recordConfirmedSale } from './journal';
import { clearRepriceHint } from './automation/reprice';
import { mapLimit } from '../lib/concurrency';
import { notifyDesktop } from './utils';
import { updateFloatingHud } from './hud';
import { fetchArcadeSummary } from './automation/games';
import { scanMarketDealsInternal, scanProfitableTrades } from './scanner';
import { computeNetProceeds } from '../lib/analytics/fees';
import { evaluateDuplicate } from '../lib/analytics/duplicates';
import { rankBoostersForCollection } from '../lib/analytics/boosters';
import { computeRenaissanceSummary } from '../lib/analytics/renaissance';
import { computeSeriesProgress } from '../lib/analytics/series';
import { generateDailyWishlist } from '../lib/analytics/wishlist';
import { yieldIfNeeded } from '../lib/analytics/fees';
import { DEFAULT_RECYCLE_VALUES, RARITIES, RARITY_PRICE_FLOORS } from '../lib/analytics/constants';
import type { Rarity } from '../types/kyara';

const RARITY_ORDER: Record<string, number> = { M: 5, L: 4, E: 3, R: 2, U: 1, C: 0 };

function collectPriorityMissingIds(
  catalogById: Map<number, any>,
  ownedSet: Set<number>,
  excludeSet: Set<number>,
  maxIds = 600
): number[] {
  if (!(catalogById instanceof Map) || catalogById.size === 0 || maxIds <= 0) return [];
  const groups = new Map<string, { owned: number; total: number; missing: Array<{ id: number; r: string }> }>();
  const highMissing: Array<{ id: number; r: string }> = [];
  for (const [cid, card] of catalogById.entries()) {
    const id = Number(card?.characterId ?? card?.id ?? cid);
    if (!Number.isFinite(id) || id <= 0) continue;
    const series = String(card?.series || 'Autre').trim() || 'Autre';
    const r = String(card?.rarity || 'C').toUpperCase();
    const g = groups.get(series) || { owned: 0, total: 0, missing: [] };
    groups.set(series, g);
    g.total += 1;
    if (ownedSet.has(id)) g.owned += 1;
    else if (!excludeSet.has(id)) {
      g.missing.push({ id, r });
      if (r === 'M' || r === 'L' || r === 'E') highMissing.push({ id, r });
    }
  }
  const ranked = [...groups.values()]
    .filter((g) => g.total >= 3 && g.missing.length > 0)
    .sort((a, b) => b.owned / b.total - a.owned / a.total || a.missing.length - b.missing.length);
  const picked = new Set<number>();
  const byRarity = (a: { r: string }, b: { r: string }) => (RARITY_ORDER[b.r] || 0) - (RARITY_ORDER[a.r] || 0);
  for (const g of ranked) {
    if (picked.size >= Math.min(maxIds, 420)) break;
    for (const m of g.missing.sort(byRarity)) {
      picked.add(m.id);
      if (picked.size >= Math.min(maxIds, 420)) break;
    }
  }
  for (const m of highMissing.sort(byRarity)) {
    if (picked.size >= maxIds) break;
    picked.add(m.id);
  }
  return Array.from(picked);
}

function buildFallbackDetailIds(
  bestPulls: any[],
  activeListings: any[],
  ownedSet: Set<number>,
  wishlist: any[],
  catalogById: Map<number, any>,
  prices: Map<number, any>
): number[] {
  const out = new Set<number>();
  const maybeAdd = (cid: number, rarity: string, storedPrice?: unknown) => {
    if (!Number.isFinite(cid) || cid <= 0) return;
    const p = prices.get(cid);
    const med = Number(p?.median7d ?? p?.median30d ?? p?.lastPrice);
    const floor = RARITY_PRICE_FLOORS[rarity as Rarity];
    const sp = Number(storedPrice);
    if (!Number.isFinite(med) || med <= 0 || (p?.source !== 'detail' && floor !== undefined && (med === floor || (sp === floor && med === floor)))) {
      out.add(cid);
    }
  };
  const pulls = [...bestPulls].sort((a, b) => (RARITY_ORDER[String(b?.rarity || 'C')] || 0) - (RARITY_ORDER[String(a?.rarity || 'C')] || 0));
  for (const p of pulls) maybeAdd(Number(p?.characterId), String(p?.rarity || catalogById.get(Number(p?.characterId))?.rarity || 'C').toUpperCase(), p?.medianPrice);
  for (const l of activeListings) {
    const cid = Number(l?.character?.id ?? l?.characterId);
    const r = String(l?.character?.rarity || catalogById.get(cid)?.rarity || 'C').toUpperCase();
    if (r === 'M' || r === 'L') maybeAdd(cid, r);
  }
  for (const cid of ownedSet) {
    const r = String(catalogById.get(cid)?.rarity || '').toUpperCase();
    if (r === 'M' || r === 'L') maybeAdd(cid, r);
  }
  for (const w of wishlist) {
    const cid = Number(w?.characterId ?? w?.id);
    maybeAdd(cid, String(w?.rarity || catalogById.get(cid)?.rarity || 'C').toUpperCase());
  }
  return Array.from(out);
}

function rehydrateBestPulls(bestPulls: any[], prices: Map<number, any>): { list: any[]; changed: boolean } {
  let changed = false;
  const list = bestPulls.map((pull) => {
    const cid = Number(pull?.characterId);
    const p = cid > 0 ? (prices.get(cid) as any) : null;
    const realMedian = Number(p?.median7d ?? p?.median30d ?? p?.lastPrice);
    if (Number.isFinite(realMedian) && realMedian > 0 && (pull?.medianPrice !== realMedian || pull?.isFloorFallback)) {
      changed = true;
      const next = { ...pull, medianPrice: realMedian };
      delete next.isFloorFallback;
      return next;
    }
    return pull;
  });
  return { list, changed };
}

export function extractActiveListings(myMarket: any, now = Date.now()): any[] {
  const rawListings = Array.isArray(myMarket?.listings) ? myMarket.listings : [];
  return rawListings.filter((l: any) => {
    if (!l || (l.status !== 'active' && l.status !== 'pending')) return false;
    if (l.endsAt && Date.parse(l.endsAt) <= now) return false;
    return true;
  });
}

function RARITY_BucketsHas(buckets: Record<string, any>, r: string): boolean {
  return Object.prototype.hasOwnProperty.call(buckets, r);
}

export interface RefreshSnapshotOptions {
  forcePrices?: boolean;
  scanMarketDeals?: boolean;
  rarity?: string;
  focusRarities?: Rarity[];
}

let inFlight: Promise<any> | null = null;
let inFlightOptions: RefreshSnapshotOptions = { forcePrices: false, scanMarketDeals: false };
let accountId: string | null = null;

export function refreshDashboardSnapshot(options: RefreshSnapshotOptions = {}): Promise<any> {
  if (inFlight) {
    if (
      (options.forcePrices && !inFlightOptions.forcePrices) ||
      (options.scanMarketDeals && !inFlightOptions.scanMarketDeals) ||
      (options.rarity && options.rarity !== inFlightOptions.rarity)
    ) {
      return inFlight.then(() => refreshDashboardSnapshot(options));
    }
    return inFlight;
  }
  inFlightOptions = {
    forcePrices: !!options.forcePrices,
    scanMarketDeals: !!options.scanMarketDeals,
    rarity: options.rarity,
    focusRarities: options.focusRarities
  };
  inFlight = buildDashboardSnapshot(inFlightOptions).finally(() => { inFlight = null; });
  return inFlight;
}

async function buildDashboardSnapshot({
  forcePrices = false,
  scanMarketDeals = false,
  rarity,
  focusRarities
}: RefreshSnapshotOptions = {}): Promise<any> {
  await loadSettings();

  let bootstrap: any = null;
  let rebirthData: any = null;
  try {
    [bootstrap, rebirthData] = await Promise.all([
      kyaraApi('/me/bootstrap'),
      kyaraApi('/me/renaissance').catch(() => kyaraApi('/me/rebirth').catch(() => null))
    ]);
  } catch (err: any) {
    const unauthState = {
      updatedAt: Date.now(),
      authenticated: false,
      error:
        err?.status === 401
          ? 'Session expirée ou non connectée sur kyara.games.'
          : `Connexion à kyara.games en cours (${err?.message || "vérifie l'onglet"})…`
    };
    await chrome.storage.local.set({ kmDashboard: unauthState });
    updateFloatingHud(unauthState);
    return unauthState;
  }

  const me = bootstrap?.me || bootstrap;
  if (!me || !me.id) {
    const unauthState = {
      updatedAt: Date.now(),
      authenticated: false,
      error: 'Connecte-toi à ton compte sur kyara.games pour activer Kyara Manager.'
    };
    await chrome.storage.local.set({ kmDashboard: unauthState });
    updateFloatingHud(unauthState);
    return unauthState;
  }

  const { ensureCatalog, ensurePackPools, ensureCollectionPrices, runtimeCache } = cacheModule;
  const [config, collection, myMarket, packs, catalogById, arcade] = await Promise.all([
    kyaraApi('/config', { auth: false }).catch(() => ({ recycle: DEFAULT_RECYCLE_VALUES })),
    kyaraApi('/me/collection?lean=1'),
    kyaraApi('/me/market'),
    kyaraApi('/packs', { auth: false }).catch(() => []),
    ensureCatalog(false),
    fetchArcadeSummary()
  ]);
  if (!Array.isArray(collection) || !Array.isArray(myMarket?.listings)) {
    throw new Error('Synchronisation incomplète : collection ou annonces indisponibles.');
  }
  if (accountId !== String(me.id)) {
    accountId = String(me.id);
    state.previousActiveListings.clear();
  }

  const packState = bootstrap?.packs || null;
  const progress = bootstrap?.progress || null;
  const recycleMap = config?.recycle || DEFAULT_RECYCLE_VALUES;
  runtimeCache.recycleMap = recycleMap;

  const now = Date.now();
  const activeListings = extractActiveListings(myMarket, now);

  const currentIds = new Set(activeListings.map((l: any) => String(l.id)));
  // Listings that vanished are checked together: each one is either sold, cancelled or expired.
  const vanished = [...state.previousActiveListings.entries()].filter(([oldId]) => !currentIds.has(oldId));
  const verdicts = await mapLimit(vanished, 4, async ([oldId, oldInfo]) => {
    const expired = oldInfo.endsAt && Date.parse(oldInfo.endsAt) <= now;
    const listing = !expired ? await kyaraApi(`/market/listings/${encodeURIComponent(oldId)}`).catch(() => null) : null;
    return { oldId, oldInfo, sold: listing?.status === 'sold' };
  });
  for (const verdict of verdicts) {
    if (verdict.status !== 'fulfilled' || !verdict.value.sold) continue;
    const { oldId, oldInfo } = verdict.value;
    const net = computeNetProceeds(oldInfo.price);
    if (await recordConfirmedSale(oldId, oldInfo)) {
      await clearRepriceHint(oldInfo.characterId).catch(() => {});
      notifyDesktop('Carte vendue sur Kyara !', `${oldInfo.name} vendue pour ${oldInfo.price} ◆ (+${net} ◆ net)`, 'km-sold');
    }
  }
  state.previousActiveListings = new Map(
    activeListings.map((l: any) => [
      String(l.id),
      {
        characterId: Number(l.character?.id ?? l.characterId),
        name: l.character?.name || `Carte #${l.characterId}`,
        price: Number(l.price) || 0,
        endsAt: l.endsAt || null,
        createdAt: l.createdAt || null
      }
    ])
  );

  const activeQtyByChar = new Map<number, number>();
  for (const l of activeListings) {
    const cid = Number(l.character?.id ?? l.characterId);
    const qty = Math.max(1, Number(l.qty) || 1);
    if (Number.isFinite(cid)) {
      activeQtyByChar.set(cid, (activeQtyByChar.get(cid) || 0) + qty);
    }
  }

  const ownedSet = new Set<number>();
  const duplicateEntries: any[] = [];
  for (const entry of Array.isArray(collection) ? collection : []) {
    const cid = Number(entry.characterId ?? entry.id);
    if (!Number.isFinite(cid) || entry.qty <= 0) continue;
    ownedSet.add(cid);
    if (entry.qty >= 2) {
      duplicateEntries.push(entry.characterId !== undefined ? entry : { ...entry, characterId: cid });
    }
  }
  runtimeCache.ownedIds = ownedSet;

  const storedMeta = (await chrome.storage.local.get(['kmBestPulls', 'kmWishlist', 'kmPinnedCards', 'kmDashboard'])) as {
    kmBestPulls?: any[];
    kmWishlist?: any[];
    kmPinnedCards?: number[];
    kmDashboard?: any;
  };
  const bestPullsList = Array.isArray(storedMeta?.kmBestPulls) ? storedMeta.kmBestPulls : [];
  const wishlistList = Array.isArray(storedMeta?.kmWishlist) ? storedMeta.kmWishlist : [];

  const primarySet = new Set<number>(ownedSet);
  const addId = (raw: unknown) => {
    const cid = Number(raw);
    if (Number.isFinite(cid) && cid > 0) primarySet.add(cid);
  };
  for (const p of bestPullsList) addId(p?.characterId);
  for (const w of wishlistList) addId(w?.characterId ?? w?.id);
  for (const l of activeListings) addId(l?.character?.id ?? l?.characterId);

  const primaryIds = Array.from(primarySet);
  const priorityMissingIds = collectPriorityMissingIds(catalogById, ownedSet, primarySet, 600);
  const fallbackDetailIds = buildFallbackDetailIds(bestPullsList, activeListings, ownedSet, wishlistList, catalogById, runtimeCache.collectionPrices);
  const safeExport = <T>(read: () => T): T | undefined => {
    try { return read(); } catch { return undefined; }
  };
  const hydrateFn = safeExport(() => (cacheModule as any).hydrateCharacterPrices);
  const fairPlayFn = safeExport(() => (cacheModule as any).ensureFairPlayPrices);

  const [, , packPools] = await Promise.all([
    typeof hydrateFn === 'function'
      ? hydrateFn(primaryIds, { force: forcePrices, fallbackDetailIds, detailLimit: 30 })
      : ensureCollectionPrices(primaryIds, forcePrices),
    priorityMissingIds.length > 0 && typeof fairPlayFn === 'function' ? fairPlayFn(priorityMissingIds, forcePrices) : Promise.resolve(),
    ensurePackPools(packs, false)
  ]);

  const { list: updatedBestPulls, changed: bestPullsChanged } = rehydrateBestPulls(bestPullsList, runtimeCache.collectionPrices);
  if (bestPullsChanged) await chrome.storage.local.set({ kmBestPulls: updatedBestPulls }).catch(() => {});

  const rarityBuckets: Record<string, number[]> = { C: [], U: [], R: [], E: [], L: [], M: [] };
  for (const [cid, p] of runtimeCache.collectionPrices.entries()) {
    const ch = catalogById.get(cid);
    const val = p.median7d ?? p.median30d ?? (p as any).lastPrice;
    if (ch && RARITY_BucketsHas(rarityBuckets, ch.rarity) && Number.isFinite(val) && val! > 0) {
      rarityBuckets[ch.rarity].push(val!);
    }
  }
  for (const r of RARITIES) {
    const arr = rarityBuckets[r];
    if (arr.length >= 3) {
      arr.sort((a, b) => a - b);
      runtimeCache.rarityAvgPrices[r] = arr[Math.floor(arr.length / 2)];
    }
  }

  const pinnedSet = new Set<number>((storedMeta?.kmPinnedCards || []).map(Number));
  for (const entry of Array.isArray(collection) ? collection : []) {
    if (entry?.pinned) {
      const cid = Number(entry.characterId ?? entry.id);
      if (Number.isFinite(cid) && cid > 0) pinnedSet.add(cid);
    }
  }

  let deadline = performance.now() + 50;
  const evaluatedDuplicates: any[] = [];
  for (const entry of duplicateEntries) {
    const cid = Number(entry.characterId ?? entry.id);
    const card = catalogById.get(cid) || { id: cid, name: `Carte #${cid}`, rarity: 'C', series: '' };
    const stats = runtimeCache.collectionPrices.get(cid) || {};
    const activeQty = activeQtyByChar.get(cid) || 0;
    const ev = evaluateDuplicate(card, entry, stats, recycleMap, state.currentSettings, activeQty, pinnedSet);
    const candRecyclable = ev.recyclableSpare ?? ev.spare;
    if (ev.spare > 0 || candRecyclable > 0 || activeQty > 0 || ev.pinned) {
      evaluatedDuplicates.push(ev);
    }
    deadline = await yieldIfNeeded(deadline);
  }

  // Prioritize actionable cards so they are never truncated
  evaluatedDuplicates.sort((a, b) => {
    const aAction = a.canAutoSell || a.canAutoRecycle || a.pinned ? 1 : 0;
    const bAction = b.canAutoSell || b.canAutoRecycle || b.pinned ? 1 : 0;
    if (bAction !== aAction) return bAction - aAction;
    if (b.score !== a.score) return b.score - a.score;
    return b.fees.netProceeds - a.fees.netProceeds;
  });

  const boosterRankings = rankBoostersForCollection(
    packs,
    packPools,
    catalogById,
    ownedSet,
    runtimeCache.rarityAvgPrices,
    config,
    me,
    packState,
    state.currentSettings
  );

  const wishlistMap = new Map(wishlistList.map((w: any) => [Number(w.characterId), w]));
  const dailyWishlistSuggestions = generateDailyWishlist(
    catalogById,
    ownedSet,
    runtimeCache.collectionPrices,
    20,
    runtimeCache.rarityAvgPrices
  );

  const sameAccount = String(storedMeta?.kmDashboard?.me?.id) === String(me.id);
  const marketWatch = sameAccount ? storedMeta?.kmDashboard?.marketWatch : undefined;
  let deals: any[] = [];
  let trades: any[] = [];
  if (scanMarketDeals) {
    const [dealsRes, tradesRes] = await Promise.all([
      scanMarketDealsInternal(ownedSet, wishlistMap, me?.chakra ?? 0, {
        rarity,
        focusRarities
      }),
      scanProfitableTrades(ownedSet, evaluatedDuplicates, wishlistMap)
    ]);
    deals = dealsRes;
    trades = tradesRes;
  } else {
    deals = sameAccount ? storedMeta?.kmDashboard?.deals || [] : [];
    trades = sameAccount ? storedMeta?.kmDashboard?.trades || [] : [];
  }

  const validRebirth = rebirthData && typeof rebirthData === 'object' && !Array.isArray(rebirthData) ? rebirthData : null;
  const renaissance = computeRenaissanceSummary(
    catalogById,
    ownedSet,
    state.currentSettings,
    runtimeCache.rarityAvgPrices,
    validRebirth || bootstrap?.rebirth || bootstrap?.renaissance || config?.rebirth || null,
    { boostersOpened: me.boostersOpened ?? 0, activeListings, collection, recycleMap }
  );
  const seriesProgress = computeSeriesProgress(
    catalogById,
    ownedSet,
    runtimeCache.collectionPrices,
    25,
    runtimeCache.rarityAvgPrices
  );
  const rarityBreakdown = Object.fromEntries(
    RARITIES.map((r) => [
      r,
      {
        owned: renaissance.byRarity[r].owned,
        total: renaissance.byRarity[r].total,
        missing: renaissance.byRarity[r].missing
      }
    ])
  ) as Record<Rarity, { owned: number; total: number; missing: number }>;

  const sellCandidates = evaluatedDuplicates.filter((d) => d.verdict === 'VENDRE' && d.spare > 0);
  const recycleCandidates = evaluatedDuplicates.filter((d) => d.canAutoRecycle && (d.recyclableSpare ?? d.spare) > 0);

  const dashboard = {
    updatedAt: Date.now(),
    authenticated: true,
    me: {
      id: me.id,
      pseudo: me.pseudo || me.discord?.username || 'Joueur',
      chakra: me.chakra ?? 0,
      chakraHeld: me.chakraHeld ?? 0,
      freePacks: me.freePacks ?? 0,
      freePacksMax: me.freePacksMax ?? 10,
      nextFreeAt: me.nextFreeAt || null,
      bonusPacks: me.bonusPacks ?? 0,
      grants: me.grants || {},
      pity: me.pity ?? 0,
      goldenIn: me.goldenIn ?? null,
      boostersOpened: me.boostersOpened ?? 0
    },
    collectionStats: {
      uniqueOwned: ownedSet.size,
      catalogSize: catalogById.size || config?.catalogSize || 6736,
      completionPct: catalogById.size ? Math.round((ownedSet.size / catalogById.size) * 1000) / 10 : 0,
      sellableDuplicatesCount: sellCandidates.reduce((s, d) => s + d.spare, 0),
      sellableNetTotal: sellCandidates.reduce((s, d) => s + d.spare * d.fees.netProceeds, 0),
      recyclableDuplicatesCount: recycleCandidates.reduce((s, d) => s + (d.recyclableSpare ?? d.spare), 0),
      recyclableChakraTotal: recycleCandidates.reduce((s, d) => s + (d.recyclableSpare ?? d.spare) * d.recycleValue, 0),
      rarityBreakdown
    },
    renaissance,
    seriesProgress,
    activeListings: activeListings.map((l: any) => ({
      id: l.id,
      characterId: Number(l.character?.id ?? l.characterId),
      name: l.character?.name || `Carte #${l.characterId}`,
      rarity: l.character?.rarity || 'C',
      series: l.character?.series || '',
      type: l.type || 'fixed',
      price: l.price,
      createdAt: l.createdAt,
      endsAt: l.endsAt
    })),
    duplicates: evaluatedDuplicates.slice(0, 1000),
    boosters: boosterRankings,
    deals: deals.slice(0, 100),
    trades: trades.slice(0, 30),
    wishlist: wishlistList,
    wishlistSuggestions: dailyWishlistSuggestions,
    bestPulls: updatedBestPulls,
    claimableMissions: progress?.claimable ?? 0,
    arcade,
    ...(marketWatch ? { marketWatch } : {})
  };

  await chrome.storage.local.set({ kmDashboard: dashboard });
  updateFloatingHud(dashboard);
  return dashboard;
}
