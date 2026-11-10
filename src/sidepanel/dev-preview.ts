import type {
  DashboardState, DuplicateCard, MarketDeal, ProfitableTrade, BoosterRecommendations,
  BoosterPack, WishlistItem, WishlistSuggestion, AutopilotPullRecord, Rarity, MarketListing
} from '../types/kyara';
import { DEFAULT_SETTINGS, type KyaraSettings } from '../types/settings';
import type { CumulativeStats, JournalItem } from '../types/journal';
import { DEFAULT_CUMULATIVE_STATS } from './hooks/useJournal';

export interface PreviewCard extends DuplicateCard {
  count?: number; marketLowest?: number; recommendedPrice?: number; expectedNet?: number;
  recycleChakra?: number; recommendation?: 'SELL' | 'RECYCLE'; reason?: string; velocityLabel?: string; image?: string;
}
export interface PreviewListing extends MarketListing { listingId?: string; cardId?: number; listedAt?: number; }

const cardSvg = (color: string, letter: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="170" viewBox="0 0 120 170"><rect width="120" height="170" rx="8" fill="%23181a24"/><circle cx="60" cy="68" r="30" fill="${encodeURIComponent(color)}" opacity="0.35"/><text x="60" y="78" font-size="28" font-family="sans-serif" font-weight="bold" fill="${encodeURIComponent(color)}" text-anchor="middle">${letter}</text><text x="60" y="128" font-size="10" font-family="sans-serif" font-weight="600" fill="%23ffffff" text-anchor="middle" opacity="0.75">KYARA TCG</text></svg>`;

const now = Date.now();
const mockMe = {
  id: 1, pseudo: 'KyaraMaster', username: 'KyaraMaster', chakra: 4850, chakraHeld: 340,
  freePacks: 7, freePacksMax: 10, bonusPacks: 2, pity: 244,
  boosterRecharge: { freeRemaining: 7, maxFree: 10, nextFreeInSec: 420 },
  pityCounters: { LEGENDARY: 244, MYTHIC: 88 }, marketListingsUsed: 6, marketListingsMax: 10
};
const mockCollectionStats = {
  totalCards: 842, totalCardsOwned: 842, totalCardsInGame: 1020, uniqueOwned: 842, catalogSize: 1020,
  completionPct: 82.5, duplicatesCount: 141, sellableDuplicatesCount: 5, sellableNetTotal: 324, recyclableDuplicatesCount: 3, recyclableChakraTotal: 150
};

const makeDup = (id: number, name: string, series: string, rarity: Rarity, count: number, owned: number, recycle: number, lowest: number, median: number, recPrice: number, net: number, s7d: number, vLabel: string, tier: 'fast' | 'normal' | 'patient', verdict: 'VENDRE' | 'RECYCLER', rec: 'SELL' | 'RECYCLE', reason: string, color: string): PreviewCard => ({
  characterId: id, name, series, rarity, count, owned, spare: count, recycleValue: recycle, recycleChakra: recycle, referenceMedian: median, lowestFixed: lowest, marketLowest: lowest, highestFixed: Math.round(median * 1.15), recommendedPrice: recPrice, expectedNet: net, sales7d: s7d, velocityLabel: vLabel, sellTier: tier, verdict, recommendation: rec, reason, verdictReason: reason,
  prices: { recommended: recPrice, undercut: Math.max(1, recPrice - 1), median, minSafe: Math.round(recPrice * 0.75) },
  fees: { sellerTax: Math.max(1, Math.round(recPrice * 0.05)), depositFee: 1, netProceeds: net, netGainOverRecycle: net - recycle },
  pedagogy: { decision: verdict, title: `${name} (${rarity})`, why: reason, delayEstimate: tier === 'fast' ? '< 4h' : tier === 'normal' ? '6h - 12h' : '24h - 48h', gainAnalysis: `+${net} ◆ net`, competition: '4 offres' },
  image: cardSvg(color, rarity)
});

const mockDuplicates: PreviewCard[] = [
  makeDup(1001, 'Makima', 'Chainsaw Man', 'M', 2, 3, 30, 195, 220, 195, 181, 12, '12 v/7j', 'patient', 'VENDRE', 'SELL', 'Forte valeur Mythique', '#ff4655'),
  makeDup(1002, 'Gojo Satoru', 'Jujutsu Kaisen', 'L', 3, 4, 15, 82, 88, 80, 74, 28, '28 v/7j (Élevée)', 'patient', 'VENDRE', 'SELL', 'Top-tier JJK forte rotation', '#ffaa00'),
  makeDup(1003, 'Lelouch Lamperouge', 'Code Geass', 'L', 4, 5, 12, 42, 45, 40, 37, 19, '19 v/7j', 'normal', 'VENDRE', 'SELL', 'Prix optimal Médiane 20', '#ffaa00'),
  makeDup(1004, 'Zero Two', 'Darling in the Franxx', 'E', 9, 10, 8, 28, 30, 27, 25, 34, '34 v/7j (Hyper-active)', 'normal', 'VENDRE', 'SELL', 'Forte vélocité garantie', '#a855f7'),
  makeDup(1005, 'Tanjiro Kamado', 'Demon Slayer', 'R', 18, 19, 4, 9, 12, 9, 7, 46, '46 v/7j', 'fast', 'VENDRE', 'SELL', 'Écoulement rapide Demon Slayer', '#3b82f6'),
  makeDup(1006, 'Natsu Dragneel', 'Fairy Tail', 'R', 25, 26, 4, 4, 5, 4, 2, 8, '8 v/7j (Lente)', 'fast', 'RECYCLER', 'RECYCLE', 'Net proceeds nul après frais', '#3b82f6'),
  makeDup(1007, 'Genos', 'One Punch Man', 'U', 38, 39, 2, 2, 3, 2, 1, 14, '14 v/7j', 'fast', 'RECYCLER', 'RECYCLE', 'Prix plancher, recyclage conseillé', '#10b981'),
  makeDup(1008, 'Ichigo Kurosaki', 'Bleach', 'C', 42, 43, 1, 2, 2, 2, 1, 6, '6 v/7j', 'fast', 'RECYCLER', 'RECYCLE', 'Marché saturé au plancher', '#9ca3af')
];

const mockActiveListings: PreviewListing[] = [
  { id: 'lst-1', listingId: 'lst-1', characterId: 1003, cardId: 1003, name: 'Lelouch Lamperouge', rarity: 'L', price: 42, listedAt: now - 600000, createdAt: new Date(now - 600000).toISOString() },
  { id: 'lst-2', listingId: 'lst-2', characterId: 1004, cardId: 1004, name: 'Zero Two', rarity: 'E', price: 28, listedAt: now - 4500000, createdAt: new Date(now - 4500000).toISOString() },
  { id: 'lst-3', listingId: 'lst-3', characterId: 1005, cardId: 1005, name: 'Tanjiro Kamado', rarity: 'R', price: 14, listedAt: now - 720000, createdAt: new Date(now - 720000).toISOString() },
  { id: 'lst-4', listingId: 'lst-4', characterId: 1002, cardId: 1002, name: 'Gojo Satoru', rarity: 'L', price: 85, listedAt: now - 5100000, createdAt: new Date(now - 5100000).toISOString() },
  { id: 'lst-5', listingId: 'lst-5', characterId: 1009, cardId: 1009, name: 'Levi Ackerman', rarity: 'E', price: 32, listedAt: now - 480000, createdAt: new Date(now - 480000).toISOString() },
  { id: 'lst-6', listingId: 'lst-6', characterId: 1001, cardId: 1001, name: 'Makima', rarity: 'M', price: 198, listedAt: now - 6600000, createdAt: new Date(now - 6600000).toISOString() }
];

const mockDeals: MarketDeal[] = [
  { listingId: 'deal-1', characterId: 1002, name: 'Gojo Satoru', series: 'Jujutsu Kaisen', rarity: 'L', buyPrice: 45, refMedian: 78, targetResalePrice: 75, flipProfit: 25, roiPct: 55, isGoodFlip: true, isMissing: false, discountPct: 42, sales7d: 18 },
  { listingId: 'deal-2', characterId: 1005, name: 'Tanjiro Kamado', series: 'Demon Slayer', rarity: 'R', buyPrice: 12, refMedian: 22, targetResalePrice: 21, flipProfit: 7, roiPct: 58, isGoodFlip: true, isMissing: true, discountPct: 45, sales7d: 34 },
  { listingId: 'deal-3', characterId: 2003, name: 'Mikasa Ackerman', series: 'Attack on Titan', rarity: 'E', buyPrice: 20, refMedian: 35, targetResalePrice: 33, flipProfit: 10, roiPct: 50, isGoodFlip: true, isMissing: true, discountPct: 43, sales7d: 16 },
  { listingId: 'deal-4', characterId: 2001, name: 'Roronoa Zoro', series: 'One Piece', rarity: 'L', buyPrice: 52, refMedian: 72, targetResalePrice: 70, flipProfit: 14, roiPct: 27, isGoodFlip: true, isMissing: false, discountPct: 28, sales7d: 22, isWishlistMatch: true },
  { listingId: 'deal-5', characterId: 2004, name: 'Ryomen Sukuna', series: 'Jujutsu Kaisen', rarity: 'M', buyPrice: 140, refMedian: 210, targetResalePrice: 200, flipProfit: 46, roiPct: 33, isGoodFlip: true, isMissing: false, discountPct: 33, sales7d: 9 }
];

const mockTrades: ProfitableTrade[] = [
  { listingId: 'tr-1', tradeId: 'tr-1', wanted: { characterId: 301, name: 'Saitama', rarity: 'E', median7d: 35 }, offered: { characterId: 1007, name: 'Genos', rarity: 'L', median7d: 55, isMissing: false }, profit: 20, roiPct: 57 },
  { listingId: 'tr-2', tradeId: 'tr-2', wanted: { characterId: 302, name: 'Eren Yeager', rarity: 'R', median7d: 14 }, offered: { characterId: 303, name: 'Armin Arlert', rarity: 'E', median7d: 26, isMissing: false }, profit: 12, roiPct: 85 },
  { listingId: 'tr-3', tradeId: 'tr-3', wanted: { characterId: 3004, name: 'Killua Zoldyck', rarity: 'E', median7d: 30 }, offered: { characterId: 305, name: 'Kurapika', rarity: 'L', median7d: 48, isMissing: false }, profit: 18, roiPct: 60 }
];

const packs: BoosterPack[] = [
  { packId: 'p-shonen', name: 'Pack Shonen Legends', series: 'Shonen', totalPool: 64, totalMissing: 5, completionPct: 92, probAtLeastOneNewPct: 35, expectedNewCards: 0.4, expectedChakraValue: 34, canOpenNow: true, openableFreeCount: 7 },
  { packId: 'p-mecha', name: 'Pack Mecha Horizon', series: 'Mecha', totalPool: 48, totalMissing: 14, completionPct: 70, probAtLeastOneNewPct: 88, expectedNewCards: 1.4, expectedChakraValue: 22, canOpenNow: true, openableFreeCount: 7 },
  { packId: 'p-dark', name: 'Pack Dark Fantasy', series: 'Fantasy', totalPool: 56, totalMissing: 18, completionPct: 67, probAtLeastOneNewPct: 76, expectedNewCards: 1.1, expectedChakraValue: 26, canOpenNow: true, openableFreeCount: 7 },
  { packId: 'p-isekai', name: 'Pack Isekai Reborn', series: 'Isekai', totalPool: 40, totalMissing: 8, completionPct: 80, probAtLeastOneNewPct: 45, expectedNewCards: 0.6, expectedChakraValue: 20, canOpenNow: true, openableFreeCount: 7 }
];

const mockBoosters: BoosterRecommendations & { boosterTargets: BoosterPack[] } = {
  recommendedNew: packs[1], recommendedEv: packs[0], recommendedPity: packs[2], isPityNear: true, all: packs, boosterTargets: packs
};

const mockWishlist: WishlistItem[] = [
  { characterId: 2001, name: 'Roronoa Zoro', series: 'One Piece', rarity: 'L', budgetChakra: 60, lowestMarketPrice: 52, bestListingId: 'deal-4', addedAt: now - 86400000 },
  { characterId: 2002, name: 'Naruto Uzumaki', series: 'Naruto', rarity: 'E', budgetChakra: 25, lowestMarketPrice: 32, bestListingId: null, addedAt: now - 43200000 },
  { characterId: 1001, name: 'Makima', series: 'Chainsaw Man', rarity: 'M', budgetChakra: 190, lowestMarketPrice: 195, bestListingId: 'lst-6', addedAt: now - 12000000 }
];

const mockWishlistSuggestions: WishlistSuggestion[] = [
  { characterId: 3001, name: 'Rukia Kuchiki', series: 'Bleach', rarity: 'E', completionPct: 91, refMedian: 24, priorityScore: 88 },
  { characterId: 3002, name: 'Erza Scarlet', series: 'Fairy Tail', rarity: 'L', completionPct: 88, refMedian: 60, priorityScore: 82 },
  { characterId: 3003, name: 'Rimuru Tempest', series: 'Slime', rarity: 'E', completionPct: 85, refMedian: 28, priorityScore: 78 },
  { characterId: 3004, name: 'Killua Zoldyck', series: 'Hunter x Hunter', rarity: 'E', completionPct: 80, refMedian: 32, priorityScore: 74 }
];

const mockBestPulls: AutopilotPullRecord[] = [
  { characterId: 1004, name: 'Zero Two', rarity: 'L', series: 'Darling in the Franxx', packName: 'Pack Mecha Horizon', pulledAt: now - 2400000, isNew: true, medianPrice: 65, image: cardSvg('#ffaa00', 'L') },
  { characterId: 1003, name: 'Lelouch Lamperouge', rarity: 'L', series: 'Code Geass', packName: 'Pack Mecha Horizon', pulledAt: now - 10800000, isNew: false, medianPrice: 55, image: cardSvg('#ffaa00', 'L') },
  { characterId: 1001, name: 'Makima', rarity: 'M', series: 'Chainsaw Man', packName: 'Pack Dark Fantasy', pulledAt: now - 21600000, isNew: true, medianPrice: 220, image: cardSvg('#ff4655', 'M') }
];

const mockCumulativeStats: CumulativeStats = {
  ...DEFAULT_CUMULATIVE_STATS, chakraFromSales: 1680, chakraFromRecycle: 520, cardsSold: 36, cardsRecycled: 184,
  boostersOpenedCount: 52, newCardsPulledCount: 14, mythicsPulledCount: 3, legendariesPulledCount: 9, startedAt: now - 86400000 * 3
};

const mockJournal: JournalItem[] = [
  { type: 'sell', message: 'Mise en vente : Lelouch Lamperouge à 42 ◆ (Médiane 20)', ts: now - 180000 },
  { type: 'recycle', message: 'Turbo Liquidité : 5 cartes communes recyclées (+10 ◆)', ts: now - 900000 },
  { type: 'booster', message: 'Booster Pack Mecha Horizon ouvert en live : Zero Two (Épique !)', ts: now - 2520000 },
  { type: 'market', message: 'Opportunité saisie : Gojo Satoru à 45 ◆ (-42% sous la cote)', ts: now - 4500000 },
  { type: 'afk', message: 'Anti-AFK : Présence confirmée automatiquement', ts: now - 7200000 }
];

const mockSettings: KyaraSettings & { sellPace?: string } = { ...DEFAULT_SETTINGS, autoSellMode: 'adaptive', sellPace: 'adaptive', masterEnabled: true };

const mockDashboard: DashboardState = {
  authenticated: true, me: mockMe, collectionStats: mockCollectionStats, duplicates: mockDuplicates, activeListings: mockActiveListings,
  deals: mockDeals, trades: mockTrades, boosters: mockBoosters, wishlist: mockWishlist, wishlistSuggestions: mockWishlistSuggestions,
  bestPulls: mockBestPulls, pinnedCards: [1001], updatedAt: now
};

const store: Record<string, any> = {
  kmDashboard: mockDashboard, 'km:dashboard': mockDashboard, settings: mockSettings, kmSettings: mockSettings, 'km:settings': mockSettings,
  kmCumulativeStats: mockCumulativeStats, 'km:cumulative_stats': mockCumulativeStats, kmJournal: mockJournal, 'km:activity_journal': mockJournal,
  kmWishlist: mockWishlist, 'km:wishlist': mockWishlist, kmBestPulls: mockBestPulls, 'km:best_pulls': mockBestPulls,
  kmPinnedCards: [1001], kmUpdate: { status: 'idle', currentVersion: '2.0.0' }
};

const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();

function notifyStorage(patch: Record<string, any>) {
  const changes: Record<string, chrome.storage.StorageChange> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { oldValue: store[k], newValue: v };
    store[k] = v;
    if (k === 'kmDashboard' || k === 'km:dashboard') { store.kmDashboard = v; store['km:dashboard'] = v; }
    if (k === 'settings' || k === 'kmSettings' || k === 'km:settings') { store.settings = v; store.kmSettings = v; store['km:settings'] = v; }
    if (k === 'kmCumulativeStats' || k === 'km:cumulative_stats') { store.kmCumulativeStats = v; store['km:cumulative_stats'] = v; }
    if (k === 'kmJournal' || k === 'km:activity_journal') { store.kmJournal = v; store['km:activity_journal'] = v; }
    if (k === 'kmWishlist' || k === 'km:wishlist') { store.kmWishlist = v; store['km:wishlist'] = v; }
    if (k === 'kmBestPulls' || k === 'km:best_pulls') { store.kmBestPulls = v; store['km:best_pulls'] = v; }
  }
  storageListeners.forEach((fn) => { try { fn(changes, 'local'); } catch (e) { console.error(e); } });
}

function handleMessage(cmd: any): any {
  const type = cmd?.type || '';
  if (['km:cmd:refresh', 'km:get-dashboard', 'km:refresh-snapshot', 'km:cmd:scan-deals', 'km:scan-deals'].includes(type)) {
    return { ok: true, data: store.kmDashboard, dashboard: store.kmDashboard };
  }
  if (type === 'km:cmd:run-cycle' || type === 'km:run-autopilot-now') {
    const journal = [{ type: 'sell' as const, message: 'Lot Vente Rapide : 3 cartes listées + 1 repricée (-4%)', ts: Date.now() }, ...store.kmJournal];
    const stats = { ...store.kmCumulativeStats, cardsSold: store.kmCumulativeStats.cardsSold + 3, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 12, chakraFromSales: store.kmCumulativeStats.chakraFromSales + 114, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 60 };
    notifyStorage({ kmJournal: journal, kmCumulativeStats: stats, kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 174 } } });
    return { ok: true, data: { summary: '3 ventes listées, 1 repricée, 12 recyclées (+60 ◆)' }, summary: { opened: 1, recycledCopies: 12, listed: 3, repriced: 1, bought: 0 } };
  }
  if (type === 'km:cmd:sell-now' || type === 'km:sell-duplicates-live') {
    const journal = [{ type: 'sell' as const, message: 'Mise en vente optimisée : 4 cartes placées au prix conseillé', ts: Date.now() }, ...store.kmJournal];
    notifyStorage({ kmJournal: journal, kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, marketListingsUsed: 10 } } });
    return { ok: true, data: { listedCount: 4, repricedCount: 1, slotsFull: false }, sellRes: { listedCount: 4, repriced: 1 } };
  }
  if (type === 'km:cmd:recycle-now' || type === 'km:quick-recycle-card' || type === 'km:cmd:bulk-recycle') {
    const journal = [{ type: 'recycle' as const, message: 'Recyclage : 8 cartes communes/peu communes (+26 ◆)', ts: Date.now() }, ...store.kmJournal];
    const stats = { ...store.kmCumulativeStats, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 8, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 26 };
    notifyStorage({ kmJournal: journal, kmCumulativeStats: stats, kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 26 } } });
    return { ok: true, data: { recycledCopies: 8, chakraGained: 26 }, recRes: { recycledCopies: 8, chakraGained: 26 }, recycledCount: 8, chakraGained: 26 };
  }
  if (['km:cmd:open-pack', 'km:cmd:open-recommended', 'km:open-booster'].includes(type)) {
    const me = { ...store.kmDashboard.me, freePacks: Math.max(0, store.kmDashboard.me.freePacks - 1), pity: (store.kmDashboard.me.pity + 1) % 250 };
    const pull: AutopilotPullRecord = { characterId: 1003, name: 'Lelouch Lamperouge', rarity: 'L', series: 'Code Geass', packName: cmd?.packName || 'Pack Mecha Horizon', pulledAt: Date.now(), isNew: false, medianPrice: 55, image: cardSvg('#ffaa00', 'L') };
    const bestPulls = [pull, ...store.kmBestPulls];
    const journal = [{ type: 'booster' as const, message: `Booster ${cmd?.packName || 'Shonen'} ouvert en live : ${pull.name} (Légendaire !)`, ts: Date.now() }, ...store.kmJournal];
    const stats = { ...store.kmCumulativeStats, boostersOpenedCount: store.kmCumulativeStats.boostersOpenedCount + 1, legendariesPulledCount: store.kmCumulativeStats.legendariesPulledCount + 1 };
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me, bestPulls }, kmBestPulls: bestPulls, kmJournal: journal, kmCumulativeStats: stats });
    return { ok: true, data: { opened: 1, newCards: 0 }, openRes: { openedCount: 1, newCardsCount: 0 } };
  }
  if (type === 'km:cmd:buy-listing' || type === 'km:buy-listing') {
    const price = cmd.price || 20;
    const deals = (store.kmDashboard.deals || []).filter((d: any) => d.listingId !== cmd.listingId);
    const journal = [{ type: 'market' as const, message: `Achat marché validé : ${cmd.name || 'Carte'} (${price} ◆)`, ts: Date.now() }, ...store.kmJournal];
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - price) }, deals }, kmJournal: journal });
    return { ok: true, data: { bought: 1 } };
  }
  if (type === 'km:cmd:single-sell' || type === 'km:quick-list-card') {
    const me = { ...store.kmDashboard.me, marketListingsUsed: Math.min(10, store.kmDashboard.me.marketListingsUsed + 1) };
    const journal = [{ type: 'sell' as const, message: `Mise en vente : Carte #${cmd.characterId} à ${cmd.price || 10} ◆`, ts: Date.now() }, ...store.kmJournal];
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me }, kmJournal: journal });
    return { ok: true, sellRes: { listedCount: 1 } };
  }
  if (type === 'km:cmd:single-recycle') {
    const qty = cmd.qty || 1;
    const chakra = qty * 3;
    const journal = [{ type: 'recycle' as const, message: `Recyclage : ${cmd.name || 'Carte'} ×${qty} (+${chakra} ◆)`, ts: Date.now() }, ...store.kmJournal];
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + chakra } }, kmJournal: journal });
    return { ok: true, recRes: { recycledCopies: qty, chakraGained: chakra } };
  }
  if (type === 'km:cmd:cancel-listing') {
    const activeListings = (store.kmDashboard.activeListings || []).filter((l: any) => l.id !== cmd.listingId);
    const me = { ...store.kmDashboard.me, marketListingsUsed: Math.max(0, store.kmDashboard.me.marketListingsUsed - 1) };
    const journal = [{ type: 'market' as const, message: `Annonce retirée : ${cmd.name || cmd.listingId}`, ts: Date.now() }, ...store.kmJournal];
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me, activeListings }, kmJournal: journal });
    return { ok: true };
  }
  if (type === 'km:cmd:toggle-pin') {
    const cid = cmd.characterId;
    const set = new Set<number>(store.kmPinnedCards || []);
    if (set.has(cid)) set.delete(cid); else set.add(cid);
    const pins = Array.from(set);
    notifyStorage({ kmPinnedCards: pins, kmDashboard: { ...store.kmDashboard, pinnedCards: pins } });
    return { ok: true, isPinned: set.has(cid), dashboard: store.kmDashboard };
  }
  if (type === 'km:cmd:wishlist-add') {
    const item = { characterId: cmd.characterId, name: cmd.name, series: cmd.series || 'Kyara', rarity: cmd.rarity || 'E', budgetChakra: cmd.budgetChakra || 30, lowestMarketPrice: null, bestListingId: null, addedAt: Date.now() };
    const wishlist = [...(store.kmWishlist || []), item];
    notifyStorage({ kmWishlist: wishlist, kmDashboard: { ...store.kmDashboard, wishlist } });
    return { ok: true, wishlist };
  }
  if (type === 'km:cmd:wishlist-remove') {
    const wishlist = (store.kmWishlist || []).filter((w: any) => w.characterId !== cmd.characterId);
    notifyStorage({ kmWishlist: wishlist, kmDashboard: { ...store.kmDashboard, wishlist } });
    return { ok: true, wishlist };
  }
  if (type === 'km:save-settings') { notifyStorage({ settings: { ...store.settings, ...cmd.settings } }); return { ok: true }; }
  if (type === 'km:cmd:reset-roi') { notifyStorage({ kmCumulativeStats: { ...DEFAULT_CUMULATIVE_STATS, startedAt: Date.now() } }); return { ok: true }; }
  if (type === 'km:update-check') { notifyStorage({ kmUpdate: { status: 'no_update', currentVersion: '2.0.0' } }); return { ok: true }; }
  return { ok: true, data: {} };
}

function installChromeMock() {
  (globalThis as any).chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: '2.0.0', name: 'Kyara Manager', side_panel: { default_path: 'sidepanel/index.html' } }),
      getURL: (p: string) => p,
      sendMessage: (cmd: any, cb?: (res: any) => void) => {
        const res = handleMessage(cmd);
        if (cb) setTimeout(() => cb(res), 15);
        return Promise.resolve(res);
      },
      onMessage: { addListener: () => {}, removeListener: () => {} }
    },
    tabs: { create: async (opts: { url: string }) => { window.open(opts.url, '_blank'); } },
    storage: {
      local: {
        get: (keys?: any, cb?: (res: any) => void) => {
          let res: Record<string, any> = {};
          if (typeof keys === 'string') res[keys] = store[keys];
          else if (Array.isArray(keys)) keys.forEach((k) => { res[k] = store[k]; });
          else res = { ...store };
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (items: Record<string, any>, cb?: () => void) => { notifyStorage(items); if (cb) cb(); return Promise.resolve(); },
        remove: (keys: string | string[], cb?: () => void) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, chrome.storage.StorageChange> = {};
          arr.forEach((k) => { changes[k] = { oldValue: store[k], newValue: undefined }; delete store[k]; });
          storageListeners.forEach((fn) => fn(changes, 'local'));
          if (cb) cb();
          return Promise.resolve();
        }
      },
      onChanged: { addListener: (fn: any) => storageListeners.add(fn), removeListener: (fn: any) => storageListeners.delete(fn) }
    }
  };
}

function mountPreviewStudioBar() {
  if (document.getElementById('km-preview-studio-bar')) return;
  const bar = document.createElement('aside');
  bar.id = 'km-preview-studio-bar';
  bar.setAttribute('aria-label', 'Studio de prévisualisation');
  bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999999;display:flex;align-items:center;gap:6px;padding:5px 8px;background:#111114;border:1px solid rgba(255,255,255,0.12);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-family:var(--font-sans,system-ui,sans-serif);font-size:11px;color:#e2e8f0;user-select:none;';

  const btnStyle = (active: boolean) => `border:1px solid ${active ? 'rgba(255,255,255,0.2)' : 'transparent'};cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:500;transition:all .15s ease;background:${active ? 'rgba(255,255,255,0.12)' : 'transparent'};color:${active ? '#ffffff' : '#a1a1aa'};`;
  const btn365 = document.createElement('button'); btn365.innerText = '365px'; btn365.onclick = () => applyWidth('365px');
  const btn440 = document.createElement('button'); btn440.innerText = '440px'; btn440.onclick = () => applyWidth('440px');
  const btnFull = document.createElement('button'); btnFull.innerText = 'Plein écran'; btnFull.onclick = () => applyWidth('100%');

  const applyWidth = (w: '365px' | '440px' | '100%') => {
    const root = document.getElementById('root');
    const isFull = w === '100%';
    if (root) {
      root.style.width = w; root.style.maxWidth = w; root.style.margin = isFull ? '0' : '0 auto';
      root.style.boxShadow = isFull ? 'none' : '0 0 35px rgba(0,0,0,0.55)';
    }
    if (isFull) document.documentElement.classList.add('km-mode-full');
    else document.documentElement.classList.remove('km-mode-full');
    btn365.style.cssText = btnStyle(w === '365px'); btn440.style.cssText = btnStyle(w === '440px'); btnFull.style.cssText = btnStyle(w === '100%');
  };

  let simTimer: any = null;
  let liveIndex = 0;
  const btnLive = document.createElement('button');
  const updateLiveBtn = (active: boolean) => {
    btnLive.style.cssText = `border:1px solid ${active ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'};cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:500;background:${active ? 'rgba(34,197,94,0.12)' : 'transparent'};color:${active ? '#22c55e' : '#71717a'};`;
    btnLive.innerText = active ? 'Simulation : On' : 'Simulation : Off';
  };
  updateLiveBtn(false);

  const simulateStep = () => {
    liveIndex = (liveIndex + 1) % 4;
    const nowTs = Date.now();
    if (liveIndex === 0) {
      const me = { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 28 };
      const stats = { ...store.kmCumulativeStats, chakraFromSales: store.kmCumulativeStats.chakraFromSales + 28, cardsSold: store.kmCumulativeStats.cardsSold + 1 };
      const journal = [{ type: 'sell' as const, message: 'Vente confirmée en direct : Zero Two pour 28 ◆ (+25 ◆ net)', ts: nowTs }, ...store.kmJournal.slice(0, 19)];
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me }, kmCumulativeStats: stats, kmJournal: journal });
    } else if (liveIndex === 1) {
      const me = { ...store.kmDashboard.me, pity: (store.kmDashboard.me.pity + 1) % 250 };
      const pull: AutopilotPullRecord = { characterId: 1002, name: 'Gojo Satoru', rarity: 'L', series: 'Jujutsu Kaisen', packName: 'Pack Shonen Legends', pulledAt: nowTs, isNew: false, medianPrice: 85, image: cardSvg('#ffaa00', 'L') };
      const bestPulls = [pull, ...store.kmBestPulls.slice(0, 9)];
      const journal = [{ type: 'booster' as const, message: 'Tirage live : Gojo Satoru (Légendaire) tiré du Pack Shonen !', ts: nowTs }, ...store.kmJournal.slice(0, 19)];
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me, bestPulls }, kmBestPulls: bestPulls, kmJournal: journal });
    } else if (liveIndex === 2) {
      const me = { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 16 };
      const stats = { ...store.kmCumulativeStats, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 16, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 4 };
      const journal = [{ type: 'recycle' as const, message: 'Recyclage automatique : 4 doublons communs (+16 ◆)', ts: nowTs }, ...store.kmJournal.slice(0, 19)];
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me }, kmCumulativeStats: stats, kmJournal: journal });
    } else {
      const journal = [{ type: 'market' as const, message: 'Marché : Nouvelle offre détectée sur Mikasa Ackerman à 20 ◆ (-43%)', ts: nowTs }, ...store.kmJournal.slice(0, 19)];
      notifyStorage({ kmJournal: journal });
    }
  };

  btnLive.onclick = () => {
    if (simTimer) { clearInterval(simTimer); simTimer = null; updateLiveBtn(false); }
    else { updateLiveBtn(true); simulateStep(); simTimer = setInterval(simulateStep, 4000); }
  };

  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.15);margin:0 2px;';
  bar.appendChild(btn365); bar.appendChild(btn440); bar.appendChild(btnFull); bar.appendChild(sep); bar.appendChild(btnLive);
  document.body.appendChild(bar);
  applyWidth(window.location.search.includes('mode=full') ? '100%' : '365px');
}

export function initDevPreviewIfNeeded(): void {
  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome?.storage?.local) return;
  installChromeMock();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPreviewStudioBar);
    else mountPreviewStudioBar();
  }
}
