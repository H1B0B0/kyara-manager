import { kyaraApi } from './api';
import { ensureCatalog, ensurePackPools, ensureCollectionPrices, runtimeCache } from './cache';
import { state, loadSettings } from './state';
import { recordCumulativeMetric, appendJournal } from './journal';
import { notifyDesktop } from './utils';
import { updateFloatingHud } from './hud';
import { scanMarketDealsInternal, scanProfitableTrades } from './scanner';
import { computeNetProceeds } from '../lib/analytics/fees';
import { evaluateDuplicate } from '../lib/analytics/duplicates';
import { rankBoostersForCollection } from '../lib/analytics/boosters';
import { generateDailyWishlist } from '../lib/analytics/wishlist';
import { yieldIfNeeded } from '../lib/analytics/fees';
import { DEFAULT_RECYCLE_VALUES, RARITIES } from '../lib/analytics/constants';

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

export async function refreshDashboardSnapshot({ forcePrices = false, scanMarketDeals = false } = {}): Promise<any> {
  await loadSettings();

  let bootstrap: any = null;
  try {
    bootstrap = await kyaraApi('/me/bootstrap');
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

  const [config, collection, myMarket, packs, catalogById] = await Promise.all([
    kyaraApi('/config', { auth: false }).catch(() => ({ recycle: DEFAULT_RECYCLE_VALUES })),
    kyaraApi('/me/collection?lean=1').catch(() => []),
    kyaraApi('/me/market').catch(() => ({ listings: [], bids: [], buyOrders: [] })),
    kyaraApi('/packs', { auth: false }).catch(() => []),
    ensureCatalog(false)
  ]);

  const packState = bootstrap?.packs || null;
  const progress = bootstrap?.progress || null;
  const recycleMap = config?.recycle || DEFAULT_RECYCLE_VALUES;
  runtimeCache.recycleMap = recycleMap;

  const now = Date.now();
  const activeListings = extractActiveListings(myMarket, now);

  const currentIds = new Set(activeListings.map((l: any) => String(l.id)));
  if (state.previousActiveListings.size > 0) {
    for (const [oldId, oldInfo] of state.previousActiveListings.entries()) {
      if (!currentIds.has(oldId)) {
        const expired = oldInfo.endsAt && Date.parse(oldInfo.endsAt) <= now;
        if (!expired) {
          const net = computeNetProceeds(oldInfo.price);
          await recordCumulativeMetric({ chakraFromSales: net, cardsSold: 1 });
          await appendJournal('sold', `Carte vendue : ${oldInfo.name} pour ${oldInfo.price} ◆ (net +${net} ◆)`);
          notifyDesktop(
            'Carte vendue sur Kyara !',
            `${oldInfo.name} vendue pour ${oldInfo.price} ◆ (+${net} ◆ net)`,
            'km-sold'
          );
        }
      }
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

  const dupeIds = duplicateEntries.map((e) => Number(e.characterId ?? e.id));
  const [, packPools] = await Promise.all([
    ensureCollectionPrices(dupeIds, forcePrices),
    ensurePackPools(packs, false)
  ]);

  const rarityBuckets: Record<string, number[]> = { C: [], U: [], R: [], E: [], L: [], M: [] };
  for (const [cid, p] of runtimeCache.collectionPrices.entries()) {
    const ch = catalogById.get(cid);
    const val = p.median7d ?? p.median30d;
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

  const { kmPinnedCards } = (await chrome.storage.local.get('kmPinnedCards')) as { kmPinnedCards?: number[] };
  const pinnedSet = new Set<number>((kmPinnedCards || []).map(Number));

  let deadline = performance.now() + 50;
  const evaluatedDuplicates: any[] = [];
  for (const entry of duplicateEntries) {
    const cid = Number(entry.characterId ?? entry.id);
    const card = catalogById.get(cid) || { id: cid, name: `Carte #${cid}`, rarity: 'C', series: '' };
    const stats = runtimeCache.collectionPrices.get(cid) || {};
    const activeQty = activeQtyByChar.get(cid) || 0;
    const ev = evaluateDuplicate(card, entry, stats, recycleMap, state.currentSettings, activeQty, pinnedSet);
    if (ev.spare > 0 || activeQty > 0 || ev.pinned) {
      evaluatedDuplicates.push(ev);
    }
    deadline = await yieldIfNeeded(deadline);
  }

  evaluatedDuplicates.sort((a, b) => {
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

  const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
  const wishlistMap = new Map((Array.isArray(kmWishlist) ? kmWishlist : []).map((w: any) => [Number(w.characterId), w]));
  const dailyWishlistSuggestions = generateDailyWishlist(
    catalogById,
    ownedSet,
    runtimeCache.collectionPrices,
    20
  );

  let deals: any[] = [];
  let trades: any[] = [];
  if (scanMarketDeals) {
    const [dealsRes, tradesRes] = await Promise.all([
      scanMarketDealsInternal(ownedSet, wishlistMap, me?.chakra ?? 0),
      scanProfitableTrades(ownedSet, evaluatedDuplicates, wishlistMap)
    ]);
    deals = dealsRes;
    trades = tradesRes;
  } else {
    const stored = (await chrome.storage.local.get('kmDashboard')) as { kmDashboard?: any };
    deals = stored?.kmDashboard?.deals || [];
    trades = stored?.kmDashboard?.trades || [];
  }

  const sellCandidates = evaluatedDuplicates.filter((d) => d.verdict === 'VENDRE' && d.spare > 0);
  const recycleCandidates = evaluatedDuplicates.filter((d) => d.verdict === 'RECYCLER' && d.spare > 0);

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
      recyclableDuplicatesCount: recycleCandidates.reduce((s, d) => s + d.spare, 0),
      recyclableChakraTotal: recycleCandidates.reduce((s, d) => s + d.spare * d.recycleValue, 0)
    },
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
    duplicates: evaluatedDuplicates.slice(0, 250),
    boosters: boosterRankings,
    deals: deals.slice(0, 50),
    trades: trades.slice(0, 30),
    wishlist: Array.isArray(kmWishlist) ? kmWishlist : [],
    wishlistSuggestions: dailyWishlistSuggestions,
    claimableMissions: progress?.claimable ?? 0
  };

  await chrome.storage.local.set({ kmDashboard: dashboard });
  updateFloatingHud(dashboard);
  return dashboard;
}
