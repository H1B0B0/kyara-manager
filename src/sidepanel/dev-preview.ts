import type {
  DashboardState, DuplicateCard, MarketDeal, ProfitableTrade, BoosterRecommendations,
  BoosterPack, WishlistItem, WishlistSuggestion, AutopilotPullRecord, Rarity, MarketListing,
  RenaissanceSummary, RarityProgress, BatchMissingPreview, BatchMissingPreviewItem,
  SeriesProgress, BuyOrderOpportunity
} from '../types/kyara';
import { DEFAULT_SETTINGS, type KyaraSettings } from '../types/settings';
import type { CumulativeStats, HourlyChakraBucket, JournalItem } from '../types/journal';
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
  freePacks: 7, freePacksMax: 10, bonusPacks: 2, pity: 244, goldenIn: 1,
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
  makeDup(1001, 'Makima', 'Chainsaw Man', 'M', 2, 3, 30, 1790, 1890, 1840, 1747, 12, '12 v/7j', 'patient', 'VENDRE', 'SELL', 'Forte valeur Mythique', '#ff4655'),
  makeDup(1002, 'Gojo Satoru', 'Jujutsu Kaisen', 'L', 3, 4, 15, 320, 340, 330, 312, 28, '28 v/7j (Élevée)', 'patient', 'VENDRE', 'SELL', 'Top-tier JJK forte rotation', '#ffaa00'),
  makeDup(1003, 'Lelouch Lamperouge', 'Code Geass', 'L', 4, 5, 12, 245, 265, 255, 241, 19, '19 v/7j', 'normal', 'VENDRE', 'SELL', 'Prix optimal Médiane 20', '#ffaa00'),
  makeDup(1004, 'Zero Two', 'Darling in the Franxx', 'E', 9, 10, 8, 88, 95, 90, 84, 34, '34 v/7j (Hyper-active)', 'normal', 'VENDRE', 'SELL', 'Forte vélocité garantie', '#a855f7'),
  makeDup(1005, 'Tanjiro Kamado', 'Demon Slayer', 'R', 18, 19, 4, 24, 28, 25, 23, 46, '46 v/7j', 'fast', 'VENDRE', 'SELL', 'Écoulement rapide Demon Slayer', '#3b82f6'),
  makeDup(1006, 'Natsu Dragneel', 'Fairy Tail', 'R', 25, 26, 4, 4, 5, 4, 2, 8, '8 v/7j (Lente)', 'fast', 'RECYCLER', 'RECYCLE', 'Net proceeds nul après frais', '#3b82f6'),
  makeDup(1007, 'Genos', 'One Punch Man', 'U', 38, 39, 2, 2, 3, 2, 1, 14, '14 v/7j', 'fast', 'RECYCLER', 'RECYCLE', 'Prix plancher, recyclage conseillé', '#10b981'),
  makeDup(1008, 'Ichigo Kurosaki', 'Bleach', 'C', 42, 43, 1, 2, 2, 2, 1, 6, '6 v/7j', 'fast', 'RECYCLER', 'RECYCLE', 'Marché saturé au plancher', '#9ca3af')
];

const mockActiveListings: PreviewListing[] = [
  { id: 'lst-1', listingId: 'lst-1', characterId: 1003, cardId: 1003, name: 'Lelouch Lamperouge', rarity: 'L', price: 255, listedAt: now - 600000, createdAt: new Date(now - 600000).toISOString() },
  { id: 'lst-2', listingId: 'lst-2', characterId: 1004, cardId: 1004, name: 'Zero Two', rarity: 'E', price: 90, listedAt: now - 4500000, createdAt: new Date(now - 4500000).toISOString() },
  { id: 'lst-3', listingId: 'lst-3', characterId: 1005, cardId: 1005, name: 'Tanjiro Kamado', rarity: 'R', price: 25, listedAt: now - 720000, createdAt: new Date(now - 720000).toISOString() },
  { id: 'lst-4', listingId: 'lst-4', characterId: 1002, cardId: 1002, name: 'Gojo Satoru', rarity: 'L', price: 330, listedAt: now - 5100000, createdAt: new Date(now - 5100000).toISOString() },
  { id: 'lst-5', listingId: 'lst-5', characterId: 1009, cardId: 1009, name: 'Levi Ackerman', rarity: 'E', price: 78, listedAt: now - 480000, createdAt: new Date(now - 480000).toISOString() },
  { id: 'lst-6', listingId: 'lst-6', characterId: 1001, cardId: 1001, name: 'Makima', rarity: 'M', price: 1840, listedAt: now - 6600000, createdAt: new Date(now - 6600000).toISOString() }
];

const mockDeals: MarketDeal[] = [
  { listingId: 'deal-1', characterId: 1002, name: 'Gojo Satoru', series: 'Jujutsu Kaisen', rarity: 'L', buyPrice: 210, refMedian: 340, targetResalePrice: 330, flipProfit: 102, roiPct: 49, isGoodFlip: true, isMissing: false, discountPct: 38, sales7d: 18 },
  { listingId: 'deal-2', characterId: 1005, name: 'Tanjiro Kamado', series: 'Demon Slayer', rarity: 'R', buyPrice: 12, refMedian: 28, targetResalePrice: 25, flipProfit: 11, roiPct: 92, isGoodFlip: true, isMissing: true, isRenaissanceNeed: true, discountPct: 57, sales7d: 34 },
  { listingId: 'deal-3', characterId: 2003, name: 'Mikasa Ackerman', series: 'Attack on Titan', rarity: 'E', buyPrice: 48, refMedian: 82, targetResalePrice: 78, flipProfit: 25, roiPct: 52, isGoodFlip: true, isMissing: true, discountPct: 41, sales7d: 16 },
  { listingId: 'deal-4', characterId: 2001, name: 'Roronoa Zoro', series: 'One Piece', rarity: 'L', buyPrice: 195, refMedian: 285, targetResalePrice: 275, flipProfit: 65, roiPct: 33, isGoodFlip: true, isMissing: false, discountPct: 32, sales7d: 22, isWishlistMatch: true },
  { listingId: 'deal-5', characterId: 2004, name: 'Ryomen Sukuna', series: 'Jujutsu Kaisen', rarity: 'M', buyPrice: 980, refMedian: 1480, targetResalePrice: 1420, flipProfit: 368, roiPct: 38, isGoodFlip: true, isMissing: false, discountPct: 34, sales7d: 9 },
  { listingId: 'deal-6', characterId: 2005, name: 'Denji', series: 'Chainsaw Man', rarity: 'C', buyPrice: 2, refMedian: null, targetResalePrice: null, flipProfit: null, roiPct: null, isGoodFlip: false, isMissing: true, isRenaissanceNeed: true, discountPct: 33, sales7d: 24 },
  { listingId: 'deal-7', characterId: 2006, name: 'Megumi Fushiguro', series: 'Jujutsu Kaisen', rarity: 'U', buyPrice: 3, refMedian: 6, targetResalePrice: 5, flipProfit: 1, roiPct: 33, isGoodFlip: false, isMissing: true, discountPct: 50, sales7d: 19 },
  { listingId: 'deal-8', characterId: 2007, name: 'Nezuko Kamado', series: 'Demon Slayer', rarity: 'R', buyPrice: 11, refMedian: 24, targetResalePrice: 22, flipProfit: 9, roiPct: 82, isGoodFlip: true, isMissing: true, isRenaissanceNeed: true, discountPct: 54, sales7d: 29 }
];

const mockTrades: ProfitableTrade[] = [
  { listingId: 'tr-1', tradeId: 'tr-1', wanted: { characterId: 301, name: 'Saitama', rarity: 'E', median7d: 35 }, offered: { characterId: 1007, name: 'Genos', rarity: 'L', median7d: 55, isMissing: true }, profit: 20, roiPct: 57 },
  { listingId: 'tr-2', tradeId: 'tr-2', wanted: { characterId: 302, name: 'Eren Yeager', rarity: 'R', median7d: 14 }, offered: { characterId: 303, name: 'Armin Arlert', rarity: 'E', median7d: 26, isMissing: false }, profit: 12, roiPct: 85 },
  { listingId: 'tr-3', tradeId: 'tr-3', wanted: { characterId: 3004, name: 'Killua Zoldyck', rarity: 'E', median7d: 30 }, offered: { characterId: 305, name: 'Kurapika', rarity: 'L', median7d: 48, isMissing: true }, profit: 18, roiPct: 60 }
];

const packs: BoosterPack[] = [
  { packId: 'p-shonen', name: 'Pack Shonen Legends', series: 'Shonen', totalPool: 64, totalMissing: 5, completionPct: 92, probAtLeastOneNewPct: 35, expectedNewCards: 0.4, expectedRenaissanceCards: 1.1, expectedChakraValue: 34, canOpenNow: true, openableFreeCount: 7, goldenEligible: true },
  { packId: 'p-mecha', name: 'Pack Mecha Horizon', series: 'Mecha', totalPool: 48, totalMissing: 14, completionPct: 70, probAtLeastOneNewPct: 88, expectedNewCards: 1.4, expectedRenaissanceCards: 2.6, expectedChakraValue: 22, canOpenNow: true, openableFreeCount: 7 },
  { packId: 'p-dark', name: 'Pack Dark Fantasy', series: 'Fantasy', totalPool: 56, totalMissing: 18, completionPct: 67, probAtLeastOneNewPct: 76, expectedNewCards: 1.1, expectedRenaissanceCards: 1.9, expectedChakraValue: 26, canOpenNow: true, openableFreeCount: 7 },
  { packId: 'p-isekai', name: 'Pack Isekai Reborn', series: 'Isekai', totalPool: 40, totalMissing: 8, completionPct: 80, probAtLeastOneNewPct: 45, expectedNewCards: 0.6, expectedRenaissanceCards: 1.4, expectedChakraValue: 20, canOpenNow: true, openableFreeCount: 7 }
];

const mockBoosters: BoosterRecommendations & { boosterTargets: BoosterPack[] } = {
  recommendedNew: packs[1], recommendedEv: packs[0], recommendedPity: packs[2], recommendedGolden: packs[0],
  recommendedRenaissance: packs[1], isPityNear: true, isGoldenNext: true, all: packs, boosterTargets: packs
};

const mockWishlist: WishlistItem[] = [
  { characterId: 2001, name: 'Roronoa Zoro', series: 'One Piece', rarity: 'L', budgetChakra: 220, lowestMarketPrice: 195, bestListingId: 'deal-4', addedAt: now - 86400000 },
  { characterId: 2002, name: 'Naruto Uzumaki', series: 'Naruto', rarity: 'E', budgetChakra: 65, lowestMarketPrice: 84, bestListingId: null, addedAt: now - 43200000 },
  { characterId: 1001, name: 'Makima', series: 'Chainsaw Man', rarity: 'M', budgetChakra: 1650, lowestMarketPrice: 1790, bestListingId: 'lst-6', addedAt: now - 12000000 }
];

const mockWishlistSuggestions: WishlistSuggestion[] = [
  { characterId: 3001, name: 'Rukia Kuchiki', series: 'Bleach', rarity: 'E', completionPct: 91, refMedian: 72, priorityScore: 88 },
  { characterId: 3002, name: 'Erza Scarlet', series: 'Fairy Tail', rarity: 'L', completionPct: 88, refMedian: 275, priorityScore: 82 },
  { characterId: 3003, name: 'Rimuru Tempest', series: 'Slime', rarity: 'E', completionPct: 85, refMedian: 86, priorityScore: 78 },
  { characterId: 3004, name: 'Killua Zoldyck', series: 'Hunter x Hunter', rarity: 'E', completionPct: 80, refMedian: 94, priorityScore: 74 }
];

const mockBestPulls: AutopilotPullRecord[] = [
  { characterId: 1001, name: 'Makima', rarity: 'M', series: 'Chainsaw Man', packName: 'Pack Dark Fantasy', pulledAt: now - 2400000, isNew: true, medianPrice: 1890, image: cardSvg('#ff4655', 'M') },
  { characterId: 1010, name: 'Shinji Ikari', rarity: 'M', series: 'Neon Genesis Evangelion', packName: 'Pack Mecha Horizon', pulledAt: now - 7200000, isNew: true, medianPrice: 1225, image: cardSvg('#ff4655', 'M') },
  { characterId: 1002, name: 'Gojo Satoru', rarity: 'L', series: 'Jujutsu Kaisen', packName: 'Pack Shonen Legends', pulledAt: now - 14400000, isNew: false, medianPrice: 340, image: cardSvg('#ffaa00', 'L') },
  { characterId: 1004, name: 'Zero Two', rarity: 'E', series: 'Darling in the Franxx', packName: 'Pack Mecha Horizon', pulledAt: now - 21600000, isNew: false, medianPrice: 95, image: cardSvg('#a855f7', 'E') }
];

const baseHour = Math.floor(now / 3600000) * 3600000;
const HOURLY_VALS = [42, 68, 55, 92, 118, 84, 136, 162, 145, 188, 214, 195];
const mockHourlyHistory: HourlyChakraBucket[] = HOURLY_VALS.map((tot, idx) => ({
  hourTs: baseHour - (HOURLY_VALS.length - 1 - idx) * 3600000,
  salesChakra: Math.round(tot * 0.72),
  recycleChakra: tot - Math.round(tot * 0.72),
  totalChakra: tot
}));

const mockCumulativeStats: CumulativeStats = {
  ...DEFAULT_CUMULATIVE_STATS, chakraFromSales: 1680, chakraFromRecycle: 520, cardsSold: 36, cardsRecycled: 184,
  boostersOpenedCount: 52, newCardsPulledCount: 14, mythicsPulledCount: 3, legendariesPulledCount: 9,
  startedAt: now - 86400000 * 3, hourlyHistory: mockHourlyHistory
};

const mockJournal: JournalItem[] = [
  { type: 'sell', message: 'Mise en vente : Lelouch Lamperouge à 255 ◆ (Médiane 265)', ts: now - 180000 },
  { type: 'recycle', message: 'Turbo Liquidité : 5 cartes communes recyclées (+10 ◆)', ts: now - 900000 },
  { type: 'booster', message: 'Booster Pack Dark Fantasy ouvert en live : Makima (Mythique · 1890 ◆ !)', ts: now - 2520000 },
  { type: 'market', message: 'Opportunité saisie : Gojo Satoru à 210 ◆ (-38% sous la cote)', ts: now - 4500000 },
  { type: 'afk', message: 'Anti-AFK : Présence confirmée automatiquement', ts: now - 7200000 }
];

const REN_COST: Record<Rarity, number> = { C: 2, U: 3, R: 5, E: 15, L: 65, M: 190 };
const REN_BASE: Record<Rarity, { owned: number; total: number; target: number }> = {
  C: { owned: 1120, total: 1520, target: 1432 }, U: { owned: 890, total: 1490, target: 1432 },
  R: { owned: 410, total: 1450, target: 1432 }, E: { owned: 210, total: 540, target: 505 },
  L: { owned: 62, total: 90, target: 70 }, M: { owned: 14, total: 25, target: 10 }
};

let blockingListingsCountState = 3;

function buildRenaissance(ownedMap: Record<Rarity, number>, targetOverrides: Partial<Record<Rarity, number>>, focusRarities: Rarity[], enabled: boolean): RenaissanceSummary {
  const byRarity = {} as Record<Rarity, RarityProgress>;
  let totalOwned = 0; let totalTarget = 0; let estimatedRemainingCost = 0;
  for (const r of ['C', 'U', 'R', 'E', 'L', 'M'] as Rarity[]) {
    const owned = Math.min(REN_BASE[r].total, ownedMap[r] ?? REN_BASE[r].owned);
    const total = REN_BASE[r].total;
    const target = targetOverrides[r] ?? REN_BASE[r].target;
    const remainingForTarget = Math.max(0, target - owned);
    const estCost = remainingForTarget * REN_COST[r];
    byRarity[r] = {
      rarity: r, owned, total, missing: Math.max(0, total - owned), target, remainingForTarget,
      pct: Math.round((owned / total) * 100), targetPct: target > 0 ? Math.min(100, Math.round((owned / target) * 100)) : 100, estimatedCostChakra: estCost
    };
    totalOwned += Math.min(owned, target); totalTarget += target; estimatedRemainingCost += estCost;
  }
  const metRarities = (['C', 'U', 'R', 'E', 'L', 'M'] as Rarity[]).filter((r) => byRarity[r].remainingForTarget === 0).length;
  return {
    enabled, focusRarities, totalOwned, totalTarget,
    overallPct: totalTarget > 0 ? Math.round((totalOwned / totalTarget) * 100) : 100, ready: totalOwned >= totalTarget, byRarity,
    priorityRarities: [...focusRarities].sort((a, b) => byRarity[b].remainingForTarget - byRarity[a].remainingForTarget), estimatedRemainingCost,
    boostersOpened: 1180, boostersTarget: 1500, blockingListingsCount: blockingListingsCountState,
    rebirthPayoutChakra: 5340, estimatedRenown: 13250,
    conditionsMet: metRarities + (blockingListingsCountState === 0 ? 1 : 0) + 1, conditionsTotal: 8
  };
}

const mockSeriesProgress: SeriesProgress[] = [
  { series: 'Chainsaw Man', owned: 24, total: 25, missingCount: 1, completionPct: 96, estimatedCostToComplete: 62, missingCards: [{ characterId: 4001, name: 'Kobeni Higashiyama', rarity: 'E', estimatedPrice: 62 }] },
  { series: 'Jujutsu Kaisen', owned: 44, total: 47, missingCount: 3, completionPct: 94, estimatedCostToComplete: 382, missingCards: [{ characterId: 4002, name: 'Yuta Okkotsu', rarity: 'L', estimatedPrice: 290 }, { characterId: 4003, name: 'Panda', rarity: 'R', estimatedPrice: 22 }, { characterId: 4004, name: 'Toge Inumaki', rarity: 'E', estimatedPrice: 70 }] },
  { series: 'Demon Slayer', owned: 35, total: 38, missingCount: 3, completionPct: 92, estimatedCostToComplete: 118, missingCards: [{ characterId: 4005, name: 'Kyojuro Rengoku', rarity: 'E', estimatedPrice: 78 }, { characterId: 4006, name: 'Inosuke Hashibira', rarity: 'R', estimatedPrice: 21 }, { characterId: 4007, name: 'Zenitsu Agatsuma', rarity: 'R', estimatedPrice: 19 }] },
  { series: 'Frieren', owned: 22, total: 25, missingCount: 3, completionPct: 88, estimatedCostToComplete: 332, missingCards: [{ characterId: 4008, name: 'Serie', rarity: 'L', estimatedPrice: 240 }, { characterId: 4009, name: 'Stark', rarity: 'E', estimatedPrice: 68 }, { characterId: 4010, name: 'Himmel', rarity: 'R', estimatedPrice: 24 }] }
];

const mockSettings: KyaraSettings & { sellPace?: string } = {
  ...DEFAULT_SETTINGS, autoSellMode: 'adaptive', sellPace: 'adaptive', masterEnabled: true,
  renaissanceFocusEnabled: true, renaissanceTargetRarities: ['C', 'R']
};

const renOwnedState: Record<Rarity, number> = { C: 1120, U: 890, R: 410, E: 210, L: 62, M: 14 };
const mockRenaissance = buildRenaissance(renOwnedState, {}, ['C', 'R'], true);

const mockDashboard: DashboardState & { marketWatch?: any } = {
  authenticated: true, me: mockMe, collectionStats: mockCollectionStats, duplicates: mockDuplicates, activeListings: mockActiveListings,
  deals: mockDeals, trades: mockTrades, boosters: mockBoosters, wishlist: mockWishlist, wishlistSuggestions: mockWishlistSuggestions,
  bestPulls: mockBestPulls, pinnedCards: [1001], renaissance: mockRenaissance, seriesProgress: mockSeriesProgress,
  arcade: { enabled: true, blocked: null, balance: 145, today: 24, dayCap: 60, week: 148, weekCap: 300, bestLotLabel: 'Lot de la salle', bestLotPrice: 200, canBuyLot: false, bossName: 'Shogun des Étoiles', bossDefeated: false, secretGoldenReady: false },
  marketWatch: { active: true, lastScanAt: now - 8000, scannedListings: 142, dealsFound: 8, boughtLastTick: 0, totalBoughtSession: 3 }, updatedAt: now
};

const store: Record<string, any> = {
  kmDashboard: mockDashboard, 'km:dashboard': mockDashboard, settings: mockSettings, kmSettings: mockSettings, 'km:settings': mockSettings,
  kmCumulativeStats: mockCumulativeStats, 'km:cumulative_stats': mockCumulativeStats, kmJournal: mockJournal, 'km:activity_journal': mockJournal,
  kmWishlist: mockWishlist, 'km:wishlist': mockWishlist, kmBestPulls: mockBestPulls, 'km:best_pulls': mockBestPulls,
  kmPinnedCards: [1001], kmUpdate: { status: 'idle', currentVersion: '2.8.3', cwsInstall: true, cwsUrl: 'https://chromewebstore.google.com/detail/kyara-manager' }
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

let lastBatchPreview: BatchMissingPreview | null = null;
const BATCH_NAMES = ['Asta', 'Yuno', 'Nobara Kugisaki', 'Megumi', 'Power', 'Aki Hayakawa', 'Tomioka Giyu', 'Shinobu Kocho', 'Kaguya Shinomiya', 'Violet Evergarden', 'Spike Spiegel', 'Thorfinn', 'Frieren', 'Fern'];
const BATCH_SERIES = ['Black Clover', 'Jujutsu Kaisen', 'Chainsaw Man', 'Demon Slayer', 'Frieren', 'Vinland Saga', 'One Piece', 'Bleach'];

function generateBatchPreview(cmd: any): BatchMissingPreview {
  const rarity: Rarity | 'RENAISSANCE' = cmd?.rarity || 'RENAISSANCE';
  const maxUnitPrice = Math.max(1, Number(cmd?.maxUnitPrice) || 6);
  const requestedQty = Math.max(1, Math.min(150, Number(cmd?.qty) || 25));
  const focus: Rarity[] = (store.settings?.renaissanceTargetRarities?.length ? store.settings.renaissanceTargetRarities : ['C', 'R']) as Rarity[];
  const pool: Rarity[] = rarity === 'RENAISSANCE' ? focus : [rarity];
  const spendable = Math.max(0, (store.kmDashboard.me?.chakra || 0) - (store.settings?.autoBuyMinChakraReserve ?? 200));
  const budgetCap = cmd?.maxTotalBudget ? Math.min(spendable, Number(cmd.maxTotalBudget)) : spendable;
  const items: BatchMissingPreviewItem[] = [];
  let totalCost = 0;

  if (Array.isArray(cmd?.characterIds) && cmd.characterIds.length > 0) {
    const idSet = new Set<number>(cmd.characterIds.map(Number));
    for (const s of mockSeriesProgress) {
      for (const c of s.missingCards) {
        if (!idSet.has(c.characterId) || totalCost + c.estimatedPrice > budgetCap) continue;
        items.push({ listingId: `batch-ser-${c.characterId}`, characterId: c.characterId, name: c.name, series: s.series, rarity: c.rarity, price: c.estimatedPrice, median7d: Math.round(c.estimatedPrice * 1.2) });
        totalCost += c.estimatedPrice;
      }
    }
  } else {
    for (let i = 0; i < requestedQty; i++) {
      const r = pool[i % pool.length];
      const price = Math.max(1, Math.min(maxUnitPrice, Math.max(1, REN_COST[r] - (i % 2) + (i % 3))));
      if (price > maxUnitPrice || totalCost + price > budgetCap) continue;
      items.push({ listingId: `batch-${Date.now()}-${i}`, characterId: 5000 + i, name: `${BATCH_NAMES[i % BATCH_NAMES.length]} #${i + 1}`, series: BATCH_SERIES[i % BATCH_SERIES.length], rarity: r, price, median7d: Math.round(price * 1.4) });
      totalCost += price;
    }
  }
  return { rarity, maxUnitPrice, requestedQty, items, totalCost, avgPrice: items.length ? Number((totalCost / items.length).toFixed(1)) : 0, totalFound: items.length };
}

function handleMessage(cmd: any): any {
  const type = cmd?.type || '';
  if (['km:cmd:refresh', 'km:get-dashboard', 'km:refresh-snapshot', 'km:cmd:scan-deals', 'km:scan-deals'].includes(type)) return { ok: true, data: store.kmDashboard, dashboard: store.kmDashboard };
  if (type === 'km:cmd:run-cycle' || type === 'km:run-autopilot-now') {
    const journal = [{ type: 'sell' as const, message: 'Lot Vente Rapide : 3 cartes listées + 1 repricée (-4%)', ts: Date.now() }, ...store.kmJournal];
    const stats = { ...store.kmCumulativeStats, cardsSold: store.kmCumulativeStats.cardsSold + 3, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 12, chakraFromSales: store.kmCumulativeStats.chakraFromSales + 114, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 60 };
    notifyStorage({ kmJournal: journal, kmCumulativeStats: stats, kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 174 } } });
    return { ok: true, data: { summary: '3 ventes listées, 1 repricée, 12 recyclées (+60 ◆)' }, summary: { opened: 1, recycledCopies: 12, listed: 3, repriced: 1, bought: 0 } };
  }
  if (type === 'km:cmd:sell-now' || type === 'km:sell-duplicates-live') {
    notifyStorage({ kmJournal: [{ type: 'sell' as const, message: 'Mise en vente optimisée : 4 cartes placées au prix conseillé', ts: Date.now() }, ...store.kmJournal], kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, marketListingsUsed: 10 } } });
    return { ok: true, data: { listedCount: 4, repricedCount: 1, slotsFull: false }, sellRes: { listedCount: 4, repriced: 1 } };
  }
  if (type === 'km:cmd:recycle-now' || type === 'km:quick-recycle-card' || type === 'km:cmd:bulk-recycle') {
    const stats = { ...store.kmCumulativeStats, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 8, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 26 };
    notifyStorage({ kmJournal: [{ type: 'recycle' as const, message: 'Recyclage : 8 cartes communes/peu communes (+26 ◆)', ts: Date.now() }, ...store.kmJournal], kmCumulativeStats: stats, kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 26 } } });
    return { ok: true, data: { recycledCopies: 8, chakraGained: 26 }, recRes: { recycledCopies: 8, chakraGained: 26 }, recycledCount: 8, chakraGained: 26 };
  }
  if (['km:cmd:open-pack', 'km:cmd:open-recommended', 'km:open-booster'].includes(type)) {
    const me = { ...store.kmDashboard.me, freePacks: Math.max(0, store.kmDashboard.me.freePacks - 1), pity: (store.kmDashboard.me.pity + 1) % 250 };
    const pull: AutopilotPullRecord = { characterId: 1003, name: 'Lelouch Lamperouge', rarity: 'L', series: 'Code Geass', packName: cmd?.packName || 'Pack Mecha Horizon', pulledAt: Date.now(), isNew: false, medianPrice: 265, image: cardSvg('#ffaa00', 'L') };
    const bestPulls = [pull, ...store.kmBestPulls];
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me, bestPulls }, kmBestPulls: bestPulls, kmJournal: [{ type: 'booster' as const, message: `Booster ${cmd?.packName || 'Shonen'} ouvert en live : ${pull.name} (Légendaire !)`, ts: Date.now() }, ...store.kmJournal], kmCumulativeStats: { ...store.kmCumulativeStats, boostersOpenedCount: store.kmCumulativeStats.boostersOpenedCount + 1, legendariesPulledCount: store.kmCumulativeStats.legendariesPulledCount + 1 } });
    return { ok: true, data: { opened: 1, newCards: 0 }, openRes: { openedCount: 1, newCardsCount: 0 } };
  }
  if (type === 'km:cmd:buy-listing' || type === 'km:buy-listing') {
    const price = cmd.price || 20;
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - price) }, deals: (store.kmDashboard.deals || []).filter((d: any) => d.listingId !== cmd.listingId) }, kmJournal: [{ type: 'market' as const, message: `Achat marché validé : ${cmd.name || 'Carte'} (${price} ◆)`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, data: { bought: 1 } };
  }
  if (type === 'km:cmd:single-sell' || type === 'km:quick-list-card') {
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, marketListingsUsed: Math.min(10, store.kmDashboard.me.marketListingsUsed + 1) } }, kmJournal: [{ type: 'sell' as const, message: `Mise en vente : Carte #${cmd.characterId} à ${cmd.price || 10} ◆`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, sellRes: { listedCount: 1 } };
  }
  if (type === 'km:cmd:single-recycle') {
    const qty = cmd.qty || 1; const chakra = qty * 3;
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + chakra } }, kmJournal: [{ type: 'recycle' as const, message: `Recyclage : ${cmd.name || 'Carte'} ×${qty} (+${chakra} ◆)`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, recRes: { recycledCopies: qty, chakraGained: chakra } };
  }
  if (type === 'km:cmd:cancel-listing') {
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, marketListingsUsed: Math.max(0, store.kmDashboard.me.marketListingsUsed - 1) }, activeListings: (store.kmDashboard.activeListings || []).filter((l: any) => l.id !== cmd.listingId) }, kmJournal: [{ type: 'market' as const, message: `Annonce retirée : ${cmd.name || cmd.listingId}`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true };
  }
  if (type === 'km:cmd:toggle-pin') {
    const set = new Set<number>(store.kmPinnedCards || []);
    if (set.has(cmd.characterId)) set.delete(cmd.characterId); else set.add(cmd.characterId);
    const pins = Array.from(set);
    notifyStorage({ kmPinnedCards: pins, kmDashboard: { ...store.kmDashboard, pinnedCards: pins } });
    return { ok: true, isPinned: set.has(cmd.characterId), dashboard: store.kmDashboard };
  }
  if (type === 'km:cmd:wishlist-add') {
    const wishlist = [...(store.kmWishlist || []), { characterId: cmd.characterId, name: cmd.name, series: cmd.series || 'Kyara', rarity: cmd.rarity || 'E', budgetChakra: cmd.budgetChakra || 30, lowestMarketPrice: null, bestListingId: null, addedAt: Date.now() }];
    notifyStorage({ kmWishlist: wishlist, kmDashboard: { ...store.kmDashboard, wishlist } });
    return { ok: true, wishlist };
  }
  if (type === 'km:cmd:wishlist-remove') {
    const wishlist = (store.kmWishlist || []).filter((w: any) => w.characterId !== cmd.characterId);
    notifyStorage({ kmWishlist: wishlist, kmDashboard: { ...store.kmDashboard, wishlist } });
    return { ok: true, wishlist };
  }
  if (type === 'km:cmd:preview-batch-buy') { lastBatchPreview = generateBatchPreview(cmd); return { ok: true, preview: lastBatchPreview }; }
  if (type === 'km:cmd:execute-batch-buy') {
    const preview = lastBatchPreview || generateBatchPreview(cmd);
    const wantedIds = Array.isArray(cmd?.listingIds) && cmd.listingIds.length ? new Set(cmd.listingIds) : null;
    const bought = wantedIds ? preview.items.filter((i) => wantedIds.has(i.listingId)) : preview.items;
    const totalSpent = bought.reduce((sum, i) => sum + i.price, 0);
    for (const item of bought) renOwnedState[item.rarity] = Math.min(REN_BASE[item.rarity].total, renOwnedState[item.rarity] + 1);
    const ren = buildRenaissance(renOwnedState, store.settings.renaissanceTargets || {}, store.settings.renaissanceTargetRarities || ['C', 'R'], Boolean(store.settings.renaissanceFocusEnabled));
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - totalSpent) }, renaissance: ren }, kmJournal: [{ type: 'market' as const, message: `Achat par lot : ${bought.length} carte(s) manquante(s) (-${totalSpent} ◆)`, ts: Date.now() }, ...store.kmJournal] });
    lastBatchPreview = null;
    return { ok: true, boughtCount: bought.length, totalSpent };
  }
  if (type === 'km:cmd:scan-buy-orders') {
    const pct = Math.max(10, Math.min(60, Number(cmd?.discountPct ?? store.settings?.buyOrderDiscountPct ?? 25)));
    const mult = (100 - pct) / 100;
    const ops: BuyOrderOpportunity[] = [
      { characterId: 2002, name: 'Naruto Uzumaki', series: 'Naruto', rarity: 'E', median7d: 84, lowestFixed: 88, bestExistingBid: 48, suggestedBid: Math.max(2, Math.round(84 * mult)), savingsPct: pct, source: 'wishlist' },
      { characterId: 4002, name: 'Yuta Okkotsu', series: 'Jujutsu Kaisen', rarity: 'L', median7d: 290, lowestFixed: 305, bestExistingBid: 185, suggestedBid: Math.max(2, Math.round(290 * mult)), savingsPct: pct, source: 'series' },
      { characterId: 4005, name: 'Kyojuro Rengoku', series: 'Demon Slayer', rarity: 'E', median7d: 78, lowestFixed: 82, bestExistingBid: null, suggestedBid: Math.max(2, Math.round(78 * mult)), savingsPct: pct, source: 'series' },
      { characterId: 5101, name: 'Power', series: 'Chainsaw Man', rarity: 'R', median7d: 26, lowestFixed: 29, bestExistingBid: 14, suggestedBid: Math.max(2, Math.round(26 * mult)), savingsPct: pct, source: 'renaissance' }
    ];
    return { ok: true, opportunities: ops };
  }
  if (type === 'km:cmd:place-buy-order') {
    const price = Math.max(1, Number(cmd?.price) || 5);
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - price) } }, kmJournal: [{ type: 'market' as const, message: `Ordre d'achat placé : ${cmd?.name || 'Carte'} à ${price} ◆`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true };
  }
  if (type === 'km:cmd:place-batch-buy-orders') {
    const orders = Array.isArray(cmd?.orders) ? cmd.orders : [];
    const totalLocked = orders.reduce((s: number, o: any) => s + (Number(o?.price) || 0), 0);
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - totalLocked) } }, kmJournal: [{ type: 'market' as const, message: `${orders.length} ordre(s) d'achat placé(s) (-${totalLocked} ◆)`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, placedCount: orders.length, totalLocked };
  }
  if (type === 'km:cmd:cancel-rebirth-blocking-listings') {
    const cancelledCount = blockingListingsCountState; blockingListingsCountState = 0;
    const ren = buildRenaissance(renOwnedState, store.settings.renaissanceTargets || {}, store.settings.renaissanceTargetRarities || ['C', 'R'], Boolean(store.settings.renaissanceFocusEnabled));
    notifyStorage({ kmDashboard: { ...store.kmDashboard, renaissance: ren }, kmJournal: [{ type: 'market' as const, message: `Renaissance : ${cancelledCount} annonce(s) C/U/R/E retirée(s)`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, cancelledCount };
  }
  if (type === 'km:save-settings') {
    const nextSettings = { ...store.settings, ...cmd.settings };
    const ren = buildRenaissance(renOwnedState, nextSettings.renaissanceTargets || {}, nextSettings.renaissanceTargetRarities || ['C', 'R'], Boolean(nextSettings.renaissanceFocusEnabled));
    notifyStorage({ settings: nextSettings, kmDashboard: { ...store.kmDashboard, renaissance: ren } });
    return { ok: true };
  }
  if (type === 'km:cmd:run-market-watch') {
    const prevMw = store.kmDashboard.marketWatch || { active: true, scannedListings: 142, dealsFound: 8, totalBoughtSession: 3 };
    const nextMw = { active: true, lastScanAt: Date.now(), scannedListings: prevMw.scannedListings + 45, dealsFound: store.kmDashboard.deals?.length ?? 8, boughtLastTick: 1, totalBoughtSession: (prevMw.totalBoughtSession || 0) + 1 };
    notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: Math.max(0, store.kmDashboard.me.chakra - 5) }, marketWatch: nextMw }, kmJournal: [{ type: 'market' as const, message: 'Radar marché : Tanjiro Kamado [R] snipe à 5 ◆ (manquante Renaissance)', ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, boughtCount: 1, dealsFound: nextMw.dealsFound, marketWatch: nextMw };
  }
  if (type === 'km:cmd:run-games-farm') {
    const gid = String(cmd?.gameId || store.settings?.autoGamesTargetGame || 'all');
    const LABELS: Record<string, [string, number, number]> = {
      all: ['Rotation 12 jeux', 5, 18], 'main-du-jour': ['Main du Jour', 1, 10], 'raid-du-jour': ['Raid du Jour', 1, 8],
      expedition: ['L\'Expédition', 2, 12], 'trois-arcs': ['Les Trois Arcs', 3, 9], 'main-kyara': ['Main Kyara', 3, 9],
      raid: ['Kyara Raid', 3, 9], 'kyara-21': ['Kyara 21', 3, 9], 'qui-est-ce': ['Qui est-ce ?', 3, 9],
      'serie-express': ['Série Express', 3, 9], 'blind-test': ['Blind Test', 3, 9], memoire: ['Mémoire', 3, 9], 'plus-aime': ['Plus aimé', 3, 9]
    };
    const [label, playedGames, ticketsEarned] = LABELS[gid] || [gid, 3, 9];
    const cur = store.kmDashboard.arcade;
    const arcade = { ...cur, today: Math.min(cur.dayCap, cur.today + ticketsEarned), week: Math.min(cur.weekCap, cur.week + ticketsEarned), balance: cur.balance + ticketsEarned, canBuyLot: cur.balance + ticketsEarned >= (cur.bestLotPrice || 200) };
    notifyStorage({ kmDashboard: { ...store.kmDashboard, arcade }, kmJournal: [{ type: 'info' as const, message: `Salle de Jeux (${label}) : ${playedGames} partie(s), +${ticketsEarned} 🎟 (Solde ${arcade.balance} 🎟)`, ts: Date.now() }, ...store.kmJournal] });
    return { ok: true, playedGames, ticketsEarned, arcade };
  }
  if (type === 'km:cmd:close-games-tab') return { ok: true, closed: true };
  if (type === 'km:cmd:focus-games-tab') return { ok: true, tabId: null };
  if (type === 'km:cmd:reset-roi') { notifyStorage({ kmCumulativeStats: { ...DEFAULT_CUMULATIVE_STATS, startedAt: Date.now() } }); return { ok: true }; }
  const cwsUrl = 'https://chromewebstore.google.com/detail/kyara-manager';
  if (type === 'km:update-check') { notifyStorage({ kmUpdate: { status: 'available', currentVersion: '2.8.3', availableVersion: '2.9.0', source: 'cws', cwsInstall: true, cwsUrl } }); return { ok: true, kmUpdate: store.kmUpdate }; }
  if (type === 'km:update-apply') {
    notifyStorage({ kmUpdate: { status: 'installing', currentVersion: '2.8.3', availableVersion: '2.9.0', source: 'cws', cwsInstall: true, cwsUrl } });
    setTimeout(() => { if (store.kmUpdate?.status === 'installing') notifyStorage({ kmUpdate: { status: 'updated', currentVersion: '2.9.0', source: 'cws', cwsInstall: true, cwsUrl } }); }, 1600);
    return { ok: true, kmUpdate: store.kmUpdate };
  }
  if (type === 'km:update-dismiss') { const p = store.kmUpdate; notifyStorage({ kmUpdate: p?.status === 'updated' || p?.status === 'error' ? { ...p, status: 'idle', error: undefined } : { ...p, dismissedVersion: p?.availableVersion } }); return { ok: true }; }
  return { ok: true, data: {} };
}

function installChromeMock() {
  if (typeof window !== 'undefined' && window.location.search.includes('kmUpdate=available')) {
    store.kmUpdate = { status: 'available', currentVersion: '2.8.3', availableVersion: '2.9.0', source: 'cws', cwsInstall: true, cwsUrl: 'https://chromewebstore.google.com/detail/kyara-manager' };
  }
  (globalThis as any).chrome = {
    runtime: {
      lastError: null, getManifest: () => ({ version: '2.8.3', name: 'Kyara Manager', side_panel: { default_path: 'sidepanel/index.html' } }), getURL: (p: string) => p,
      sendMessage: (cmd: any, cb?: (res: any) => void) => { const res = handleMessage(cmd); if (cb) setTimeout(() => cb(res), 15); return Promise.resolve(res); },
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
          const changes: Record<string, chrome.storage.StorageChange> = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => { changes[k] = { oldValue: store[k], newValue: undefined }; delete store[k]; });
          storageListeners.forEach((fn) => fn(changes, 'local')); if (cb) cb(); return Promise.resolve();
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
  const btn365 = document.createElement('button'); btn365.innerText = '365px'; btn365.onclick = () => applyMode('365px');
  const btn440 = document.createElement('button'); btn440.innerText = '440px'; btn440.onclick = () => applyMode('440px');
  const btnOverlay = document.createElement('button'); btnOverlay.innerText = 'Overlay Cockpit'; btnOverlay.onclick = () => applyMode('overlay');
  let backdrop = document.getElementById('km-preview-overlay-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'km-preview-overlay-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(6,6,10,0.72);backdrop-filter:blur(8px);display:none;';
    backdrop.onclick = () => applyMode('365px');
    document.body.appendChild(backdrop);
  }
  const applyMode = (mode: '365px' | '440px' | 'overlay') => {
    const root = document.getElementById('root');
    const isOverlay = mode === 'overlay';
    if (root) {
      Object.assign(root.style, isOverlay
        ? { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(1160px, 95vw)', maxWidth: 'min(1160px, 95vw)', height: '88vh', margin: '0', overflow: 'auto', borderRadius: '14px', zIndex: '99999', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 80px rgba(0,0,0,0.75)' }
        : { position: '', top: '', left: '', transform: '', height: '', overflow: '', borderRadius: '', border: '', zIndex: '', width: mode, maxWidth: mode, margin: '0 auto', boxShadow: '0 0 35px rgba(0,0,0,0.55)' });
    }
    if (backdrop) backdrop.style.display = isOverlay ? 'block' : 'none';
    document.documentElement.classList.toggle('km-mode-overlay', isOverlay);
    document.documentElement.classList.toggle('km-mode-full', isOverlay);
    btn365.style.cssText = btnStyle(mode === '365px'); btn440.style.cssText = btnStyle(mode === '440px'); btnOverlay.style.cssText = btnStyle(isOverlay);
  };
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'km:close-overlay') applyMode('365px');
  });
  let simTimer: any = null; let liveIndex = 0;
  const btnLive = document.createElement('button');
  const updateLiveBtn = (active: boolean) => {
    btnLive.style.cssText = `border:1px solid ${active ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'};cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:500;background:${active ? 'rgba(34,197,94,0.12)' : 'transparent'};color:${active ? '#22c55e' : '#71717a'};`;
    btnLive.innerText = active ? 'Simulation : On' : 'Simulation : Off';
  };
  updateLiveBtn(false);
  const btnUpd = document.createElement('button'); btnUpd.style.cssText = btnStyle(false); btnUpd.innerText = 'Pop-up Maj';
  btnUpd.onclick = () => {
    const isAvail = ['available', 'waiting', 'installing', 'updated'].includes(store.kmUpdate?.status);
    notifyStorage({ kmUpdate: isAvail ? { status: 'idle', currentVersion: '2.8.3', cwsInstall: true } : { status: 'available', currentVersion: '2.8.3', availableVersion: '2.9.0', source: 'cws', cwsInstall: true, cwsUrl: 'https://chromewebstore.google.com/detail/kyara-manager' } });
    btnUpd.style.cssText = btnStyle(!isAvail);
  };
  const simulateStep = () => {
    liveIndex = (liveIndex + 1) % 4; const nowTs = Date.now();
    if (liveIndex === 0) {
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 28 } }, kmCumulativeStats: { ...store.kmCumulativeStats, chakraFromSales: store.kmCumulativeStats.chakraFromSales + 28, cardsSold: store.kmCumulativeStats.cardsSold + 1 }, kmJournal: [{ type: 'sell' as const, message: 'Vente confirmée en direct : Zero Two pour 28 ◆ (+25 ◆ net)', ts: nowTs }, ...store.kmJournal.slice(0, 19)] });
    } else if (liveIndex === 1) {
      const pull: AutopilotPullRecord = { characterId: 1002, name: 'Gojo Satoru', rarity: 'L', series: 'Jujutsu Kaisen', packName: 'Pack Shonen Legends', pulledAt: nowTs, isNew: false, medianPrice: 340, image: cardSvg('#ffaa00', 'L') };
      const bestPulls = [pull, ...store.kmBestPulls.slice(0, 9)];
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, pity: (store.kmDashboard.me.pity + 1) % 250 }, bestPulls }, kmBestPulls: bestPulls, kmJournal: [{ type: 'booster' as const, message: 'Tirage live : Gojo Satoru (Légendaire) tiré du Pack Shonen !', ts: nowTs }, ...store.kmJournal.slice(0, 19)] });
    } else if (liveIndex === 2) {
      notifyStorage({ kmDashboard: { ...store.kmDashboard, me: { ...store.kmDashboard.me, chakra: store.kmDashboard.me.chakra + 16 } }, kmCumulativeStats: { ...store.kmCumulativeStats, chakraFromRecycle: store.kmCumulativeStats.chakraFromRecycle + 16, cardsRecycled: store.kmCumulativeStats.cardsRecycled + 4 }, kmJournal: [{ type: 'recycle' as const, message: 'Recyclage automatique : 4 doublons communs (+16 ◆)', ts: nowTs }, ...store.kmJournal.slice(0, 19)] });
    } else {
      notifyStorage({ kmJournal: [{ type: 'market' as const, message: 'Marché : Nouvelle offre détectée sur Mikasa Ackerman à 20 ◆ (-43%)', ts: nowTs }, ...store.kmJournal.slice(0, 19)] });
    }
  };
  btnLive.onclick = () => { if (simTimer) { clearInterval(simTimer); simTimer = null; updateLiveBtn(false); } else { updateLiveBtn(true); simulateStep(); simTimer = setInterval(simulateStep, 4000); } };
  const sep = document.createElement('span'); sep.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.15);margin:0 2px;';
  bar.append(btn365, btn440, btnOverlay, sep, btnLive, btnUpd); document.body.appendChild(bar);
  const initialOverlay = window.location.search.includes('mode=overlay') || window.location.search.includes('mode=full');
  applyMode(initialOverlay ? 'overlay' : '365px');
}

export function initDevPreviewIfNeeded(): void {
  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome?.storage?.local) return;
  installChromeMock();
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPreviewStudioBar);
  else mountPreviewStudioBar();
}
