export type Rarity = 'C' | 'U' | 'R' | 'E' | 'L' | 'M';

export interface Card {
  id?: number | string;
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  count?: number;
  recycleValue?: number;
}

export interface DuplicateCard {
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  owned: number;
  spare: number;
  recyclableSpare?: number;
  recycleValue: number;
  referenceMedian: number | null;
  lowestFixed: number | null;
  highestFixed: number | null;
  sales7d: number;
  sales12h?: number;
  isSurging?: boolean;
  trendPct?: number;
  verdict: 'VENDRE' | 'RECYCLER' | 'CONSERVER' | 'PROTÉGÉ';
  verdictReason: string;
  pinned?: boolean;
  canAutoSell?: boolean;
  canAutoRecycle?: boolean;
  sellTier?: 'fast' | 'normal' | 'patient';
  sellProfile?: import('../lib/analytics/sell-profile').SellProfile;
  score?: number;
  isSlowMover?: boolean;
  hourlyExpectedChakra?: number;
  isCrash?: boolean;
  crashDiscountPct?: number;
  liveMedian20?: number | null;
  liveAvg20?: number | null;
  prices?: {
    recommended: number;
    undercut: number;
    median: number;
    minSafe: number;
    quick?: number;
    recent20Median?: number;
    recent20Avg?: number;
    flash?: number;
    balanced?: number;
    max?: number;
  };
  fees?: {
    sellerTax: number;
    depositFee: number;
    netProceeds: number;
    netGainOverRecycle: number;
  };
  saleProb?: {
    p12h?: number;
    p24h?: number;
    p48h?: number;
    label?: string;
  };
  pedagogy?: DecisionPedagogy;
}

export interface DecisionPedagogy {
  decision: 'VENDRE' | 'RECYCLER' | 'CONSERVER' | 'PROTÉGÉ';
  title: string;
  why: string;
  delayEstimate: string;
  gainAnalysis: string;
  competition: string;
  isCrash?: boolean;
  crashDiscountPct?: number;
  hourlyExpectedChakra?: number;
}

export interface MarketListing {
  id: string;
  characterId: number;
  name?: string;
  rarity?: Rarity;
  series?: string;
  price: number;
  type?: 'fixed' | 'auction';
  seller?: { id: number; pseudo?: string };
  endsAt?: string;
  createdAt?: string;
}

export interface MarketDeal {
  listingId: string;
  characterId: number;
  name: string;
  rarity: Rarity;
  series: string;
  buyPrice: number;
  refMedian: number | null;
  targetResalePrice: number | null;
  flipProfit: number | null;
  roiPct: number | null;
  isGoodFlip: boolean;
  isMissing: boolean;
  discountPct: number;
  sales7d: number;
  isGoodMissingBuy?: boolean;
  isRenaissanceNeed?: boolean;
  isWishlistMatch?: boolean;
  wishlistMatch?: any;
  autoBuyWish?: boolean;
  type?: string;
  netResale?: number | null;
}

export interface ProfitableTrade {
  listingId: string;
  tradeId?: string;
  wanted: {
    characterId: number;
    name: string;
    rarity: Rarity;
    median7d: number;
  };
  offered: {
    characterId: number;
    name: string;
    rarity: Rarity;
    median7d: number;
    isMissing: boolean;
  };
  profit: number;
  roiPct: number;
}

export interface BoosterPack {
  packId: string;
  name: string;
  series: string;
  bannerUrl?: string;
  totalPool: number;
  totalMissing: number;
  completionPct: number;
  probAtLeastOneNewPct: number;
  expectedNewCards: number;
  expectedRenaissanceCards?: number;
  expectedChakraValue: number;
  openableFreeCount: number;
  autoOpenableFreeCount?: number;
  canOpenNow: boolean;
  usesFreePacks?: boolean;
  grantOnly?: boolean;
  chakraPrice?: number;
  cardsByRarity?: Record<Rarity, number>;
  missingByRarity?: Record<Rarity, number>;
  totalByRarity?: Record<Rarity, number>;
  goldenEligible?: boolean;
}

export interface BoosterRecommendations {
  recommendedNew: BoosterPack | null;
  recommendedEv: BoosterPack | null;
  recommendedPity: BoosterPack | null;
  recommendedGolden?: BoosterPack | null;
  recommendedRenaissance?: BoosterPack | null;
  isPityNear: boolean;
  isGoldenNext?: boolean;
  all: BoosterPack[];
}

export interface CollectionStats {
  totalCards: number;
  uniqueOwned: number;
  catalogSize: number;
  completionPct: number;
  sellableDuplicatesCount: number;
  sellableNetTotal: number;
  recyclableDuplicatesCount: number;
  recyclableChakraTotal: number;
  rarityBreakdown?: Record<Rarity, { owned: number; total: number; missing: number }>;
}

export interface RarityProgress {
  rarity: Rarity;
  owned: number;
  total: number;
  missing: number;
  target: number;
  remainingForTarget: number;
  pct: number;
  targetPct: number;
  estimatedCostChakra: number;
}

export interface RenaissanceSummary {
  enabled: boolean;
  focusRarities: Rarity[];
  totalOwned: number;
  totalTarget: number;
  overallPct: number;
  ready: boolean;
  byRarity: Record<Rarity, RarityProgress>;
  priorityRarities: Rarity[];
  estimatedRemainingCost: number;
  boostersOpened?: number;
  boostersTarget?: number;
  blockingListingsCount?: number;
  rebirthPayoutChakra?: number;
  estimatedRenown?: number;
  conditionsMet?: number;
  conditionsTotal?: number;
}

export interface BatchMissingPreviewItem {
  listingId: string;
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  price: number;
  median7d: number | null;
}

export interface BatchMissingPreview {
  rarity: Rarity | 'RENAISSANCE';
  maxUnitPrice: number;
  requestedQty: number;
  items: BatchMissingPreviewItem[];
  totalCost: number;
  avgPrice: number;
  totalFound: number;
}

export interface UserProfile {
  id?: number | string;
  pseudo?: string;
  chakra: number;
  chakraHeld?: number;
  freePacks: number;
  freePacksMax: number;
  bonusPacks?: number;
  pity: number;
  goldenIn?: number | null;
}

export interface MarketWatchTelemetry {
  active: boolean;
  lastScanAt: number;
  scannedListings: number;
  dealsFound: number;
  boughtLastTick: number;
  totalBoughtSession: number;
  lastNote?: string;
}

export interface ArcadeSummary {
  enabled: boolean;
  blocked?: string | null;
  balance: number;
  today: number;
  dayCap: number;
  week: number;
  weekCap: number;
  bestLotLabel?: string | null;
  bestLotPrice?: number | null;
  canBuyLot?: boolean;
  bossName?: string | null;
  bossDefeated?: boolean;
  secretGoldenReady?: boolean;
}

export interface DashboardState {
  authenticated: boolean;
  error?: string | null;
  me?: UserProfile;
  collectionStats?: CollectionStats;
  duplicates?: DuplicateCard[];
  activeListings?: MarketListing[];
  deals?: MarketDeal[];
  trades?: ProfitableTrade[];
  boosters?: BoosterRecommendations;
  wishlist?: WishlistItem[];
  wishlistSuggestions?: WishlistSuggestion[];
  pinnedCards?: number[];
  bestPulls?: AutopilotPullRecord[];
  renaissance?: RenaissanceSummary;
  seriesProgress?: SeriesProgress[];
  marketWatch?: MarketWatchTelemetry;
  arcade?: ArcadeSummary | null;
  updatedAt?: number;
}

export interface AutopilotPullRecord {
  characterId: number;
  name: string;
  rarity: Rarity;
  series: string;
  packName: string;
  pulledAt: number;
  isNew: boolean;
  image?: string;
  medianPrice?: number;
}

export interface WishlistItem {
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  budgetChakra: number;
  autoBuy?: boolean;
  lowestMarketPrice: number | null;
  bestListingId: string | null;
  addedAt: number;
}

export interface WishlistSuggestion {
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  completionPct: number;
  seriesCompletionPct?: number;
  refMedian: number;
  priorityScore: number;
}

export interface SeriesMissingCard {
  characterId: number;
  name: string;
  rarity: Rarity;
  estimatedPrice: number;
}

export interface SeriesProgress {
  series: string;
  owned: number;
  total: number;
  missingCount: number;
  completionPct: number;
  estimatedCostToComplete: number;
  missingCards: SeriesMissingCard[];
}

export interface BuyOrderOpportunity {
  characterId: number;
  name: string;
  series: string;
  rarity: Rarity;
  median7d: number | null;
  lowestFixed: number | null;
  bestExistingBid: number | null;
  suggestedBid: number;
  savingsPct: number;
  source: 'wishlist' | 'renaissance' | 'series';
}
