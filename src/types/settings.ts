export type Language = 'fr' | 'en' | 'es' | 'auto';

export type PricingStrategy =
  | 'recent20_median'
  | 'recent20_avg'
  | 'flash'
  | 'quick'
  | 'balanced'
  | 'max';

export interface KyaraSettings {
  masterEnabled: boolean;
  autoSellEnabled: boolean;
  autoSellStrategy: PricingStrategy;
  autoSellMinNetOverRecycle: number;
  autoSellDurationHours: number;
  autoSellMedianFloorPct: number;
  autoSellMaxListings: number;
  autoSellVelocityFirst: boolean;
  autoSellCrashProtection: boolean;
  autoSellTurboLiquidity: boolean;
  autoSellTurboMaxNetProfit: number;
  autoSellExpireHours: number;
  autoSellRecycleExpired?: boolean;
  autoSellRepriceDiscountPct?: number;
  wishlistAutoBuyEnabled: boolean;
  speculateHoldSurging: boolean;
  autoRecycleEnabled: boolean;
  autoRecycleRarities: string[];
  autoRecycleKeepCopies: number;
  autoBoosterEnabled: boolean;
  autoBoosterStrategy: 'new' | 'ev';
  autoBoosterReserveFree: number;
  autoOpenEnabled?: boolean;
  autoOpenDailyPack?: boolean;
  autoOpenMode?: string;
  autoOpenCustomPackId?: string;
  autoOpenMinBatch?: number;
  autoOpenPitySniper?: boolean;
  autoMarketEnabled: boolean;
  autoMarketMinMarginPct: number;
  autoMarketMinProfit: number;
  autoMarketReserveChakra: number;
  autoBuyFlipEnabled?: boolean;
  autoBuyMissingEnabled?: boolean;
  autoBuyMinChakraReserve?: number;
  autoBuyMissingMaxPrice?: number;
  autoBuyMinDiscountPct?: number;
  autoBuyMinFlipProfit?: number;
  autoBuyMinSales7d?: number;
  autoBuyMaxUnitPrice?: number;
  autoSellIncludeL?: boolean;
  autoSellIncludeM?: boolean;
  autoClaimMissionsEnabled: boolean;
  autoClaimMissions?: boolean;
  antiAfkEnabled: boolean;
  refreshIntervalMinutes: number;
  loopIntervalSec?: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  dryRun: boolean;
  language: Language;
}

export const DEFAULT_SETTINGS: KyaraSettings = {
  masterEnabled: true,
  autoSellEnabled: true,
  autoSellStrategy: 'recent20_median',
  autoSellMinNetOverRecycle: 2,
  autoSellDurationHours: 12,
  autoSellMedianFloorPct: 70,
  autoSellMaxListings: 10,
  autoSellVelocityFirst: true,
  autoSellCrashProtection: true,
  autoSellTurboLiquidity: true,
  autoSellTurboMaxNetProfit: 4,
  autoSellExpireHours: 12,
  autoSellRecycleExpired: true,
  autoSellRepriceDiscountPct: 5,
  wishlistAutoBuyEnabled: false,
  speculateHoldSurging: true,
  autoRecycleEnabled: true,
  autoRecycleRarities: ['C', 'U'],
  autoRecycleKeepCopies: 1,
  autoBoosterEnabled: true,
  autoBoosterStrategy: 'new',
  autoBoosterReserveFree: 0,
  autoOpenEnabled: true,
  autoOpenDailyPack: true,
  autoOpenMode: 'recommended_new',
  autoOpenCustomPackId: '',
  autoOpenMinBatch: 1,
  autoOpenPitySniper: true,
  autoMarketEnabled: false,
  autoMarketMinMarginPct: 20,
  autoMarketMinProfit: 5,
  autoMarketReserveChakra: 200,
  autoBuyFlipEnabled: false,
  autoBuyMissingEnabled: false,
  autoBuyMinChakraReserve: 200,
  autoClaimMissionsEnabled: true,
  autoClaimMissions: true,
  antiAfkEnabled: true,
  refreshIntervalMinutes: 5,
  loopIntervalSec: 45,
  notificationsEnabled: true,
  soundEnabled: false,
  dryRun: false,
  language: 'fr'
};
