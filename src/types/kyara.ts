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
  prices?: {
    recommended: number;
    undercut: number;
    median: number;
    minSafe: number;
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
  refMedian: number;
  targetResalePrice: number;
  flipProfit: number;
  roiPct: number;
  isGoodFlip: boolean;
  isMissing: boolean;
  discountPct: number;
  sales7d: number;
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
  expectedChakraValue: number;
  openableFreeCount: number;
  canOpenNow: boolean;
  usesFreePacks?: boolean;
  chakraPrice?: number;
  cardsByRarity?: Record<Rarity, number>;
  missingByRarity?: Record<Rarity, number>;
  totalByRarity?: Record<Rarity, number>;
}

export interface BoosterRecommendations {
  recommendedNew: BoosterPack | null;
  recommendedEv: BoosterPack | null;
  recommendedPity: BoosterPack | null;
  isPityNear: boolean;
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
}

export interface UserProfile {
  id?: number | string;
  pseudo?: string;
  chakra: number;
  freePacks: number;
  freePacksMax: number;
  bonusPacks?: number;
  pity: number;
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
  refMedian: number;
  priorityScore: number;
}
