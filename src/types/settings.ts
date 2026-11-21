import type { Rarity } from './kyara';

export type Language = 'fr' | 'en' | 'es' | 'auto';

export type PricingStrategy =
  | 'recent20_median'
  | 'recent20_avg'
  | 'flash'
  | 'quick'
  | 'balanced'
  | 'max';

/** `adaptive` picks fast/normal/patient per card from its market price. */
export type SellMode = 'adaptive' | 'fast' | 'normal' | 'patient';
export type SellTier = 'fast' | 'normal' | 'patient';

export interface KyaraSettings {
  masterEnabled: boolean;
  autoSellEnabled: boolean;
  autoSellStrategy: PricingStrategy;
  autoSellMode: SellMode;
  autoSellCheapBelow: number;
  autoSellPremiumAbove: number;
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
  autoOpenGoldenSniper?: boolean;
  autoOpenUseBonusPacks?: boolean;
  buyOrderDiscountPct?: number;
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
  autoGamesEnabled?: boolean;
  autoGamesDailyEnabled?: boolean;
  autoGamesSolverOverlay?: boolean;
  autoGamesTargetGame?: 'plus-aime' | 'qui-est-ce' | 'serie-express' | 'memoire' | 'kyara-21';
  antiAfkEnabled: boolean;
  refreshIntervalMinutes: number;
  loopIntervalSec?: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  dryRun: boolean;
  language: Language;
  renaissanceFocusEnabled?: boolean;
  renaissanceTargetRarities?: Rarity[];
  renaissanceTargets?: Partial<Record<Rarity, number>>;
  batchBuyDefaultMaxPrice?: Partial<Record<Rarity, number>>;
}

const VALID_RARITIES: Rarity[] = ['C', 'U', 'R', 'E', 'L', 'M'];

export const DEFAULT_SETTINGS: KyaraSettings = {
  masterEnabled: true,
  autoSellEnabled: true,
  autoSellStrategy: 'recent20_median',
  autoSellMode: 'adaptive',
  autoSellCheapBelow: 12,
  autoSellPremiumAbove: 60,
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
  autoSellRepriceDiscountPct: 6,
  wishlistAutoBuyEnabled: false,
  speculateHoldSurging: true,
  autoRecycleEnabled: true,
  autoRecycleRarities: ['C', 'U', 'R'],
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
  autoOpenGoldenSniper: true,
  autoOpenUseBonusPacks: false,
  buyOrderDiscountPct: 25,
  autoMarketEnabled: false,
  autoMarketMinMarginPct: 20,
  autoMarketMinProfit: 5,
  autoMarketReserveChakra: 200,
  autoBuyFlipEnabled: false,
  autoBuyMissingEnabled: false,
  autoBuyMinChakraReserve: 200,
  autoClaimMissionsEnabled: true,
  autoClaimMissions: true,
  autoGamesEnabled: true,
  autoGamesDailyEnabled: true,
  autoGamesSolverOverlay: true,
  autoGamesTargetGame: 'plus-aime',
  antiAfkEnabled: true,
  refreshIntervalMinutes: 5,
  loopIntervalSec: 45,
  notificationsEnabled: true,
  soundEnabled: false,
  dryRun: false,
  language: 'fr',
  renaissanceFocusEnabled: false,
  renaissanceTargetRarities: ['C', 'U', 'R', 'E'],
  renaissanceTargets: {},
  batchBuyDefaultMaxPrice: { C: 5, U: 6, R: 10, E: 35, L: 140, M: 600 }
};

// Public UI keys are canonical; legacy keys remain synchronized for compatibility.
export function normalizeSettings(raw: Partial<KyaraSettings> = {}): KyaraSettings {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  settings.autoBoosterEnabled = raw.autoBoosterEnabled ?? raw.autoOpenEnabled ?? DEFAULT_SETTINGS.autoBoosterEnabled;
  settings.autoOpenEnabled = settings.autoBoosterEnabled;
  settings.autoClaimMissionsEnabled = raw.autoClaimMissionsEnabled ?? raw.autoClaimMissions ?? DEFAULT_SETTINGS.autoClaimMissionsEnabled;
  settings.autoClaimMissions = settings.autoClaimMissionsEnabled;
  settings.autoMarketEnabled = raw.autoMarketEnabled ?? raw.autoBuyFlipEnabled ?? DEFAULT_SETTINGS.autoMarketEnabled;
  settings.autoBuyFlipEnabled = settings.autoMarketEnabled;
  settings.autoBuyMinChakraReserve = raw.autoMarketReserveChakra ?? raw.autoBuyMinChakraReserve ?? DEFAULT_SETTINGS.autoMarketReserveChakra;
  settings.autoMarketReserveChakra = settings.autoBuyMinChakraReserve;
  if (!['adaptive', 'fast', 'normal', 'patient'].includes(settings.autoSellMode)) {
    settings.autoSellMode = DEFAULT_SETTINGS.autoSellMode;
  }
  const cheap = Number(settings.autoSellCheapBelow);
  settings.autoSellCheapBelow = Number.isFinite(cheap) ? Math.max(2, Math.min(500, Math.round(cheap))) : DEFAULT_SETTINGS.autoSellCheapBelow;
  const premium = Number(settings.autoSellPremiumAbove);
  settings.autoSellPremiumAbove = Number.isFinite(premium)
    ? Math.max(settings.autoSellCheapBelow + 1, Math.min(5000, Math.round(premium)))
    : Math.max(settings.autoSellCheapBelow + 1, DEFAULT_SETTINGS.autoSellPremiumAbove);
  if (Array.isArray(settings.autoRecycleRarities)) {
    const list = settings.autoRecycleRarities;
    if (list.length === 2 && list.includes('C') && list.includes('U') && !list.includes('R')) {
      settings.autoRecycleRarities = ['C', 'U', 'R'];
    }
  } else {
    settings.autoRecycleRarities = ['C', 'U', 'R'];
  }
  settings.renaissanceFocusEnabled = Boolean(settings.renaissanceFocusEnabled ?? false);
  const rawFocus = Array.isArray(settings.renaissanceTargetRarities)
    ? settings.renaissanceTargetRarities.filter((r): r is Rarity => VALID_RARITIES.includes(r))
    : [];
  settings.renaissanceTargetRarities = rawFocus.length > 0 ? Array.from(new Set(rawFocus)) : [...(DEFAULT_SETTINGS.renaissanceTargetRarities as Rarity[])];

  const rawTargets =
    settings.renaissanceTargets && typeof settings.renaissanceTargets === 'object' && !Array.isArray(settings.renaissanceTargets)
      ? settings.renaissanceTargets
      : {};
  const cleanTargets: Partial<Record<Rarity, number>> = {};
  for (const r of VALID_RARITIES) {
    const rawVal = (rawTargets as Record<string, unknown>)[r];
    if (rawVal === undefined || rawVal === null || rawVal === '') continue;
    const val = Number(rawVal);
    if (!Number.isFinite(val) || val < 0) continue;
    const floored = Math.floor(val);
    // Drop legacy v2.1 catalog-sized overrides accidentally saved for E/L/M.
    if ((r === 'E' && floored >= 900) || (r === 'L' && floored >= 200) || (r === 'M' && floored >= 150)) {
      continue;
    }
    cleanTargets[r] = floored;
  }
  settings.renaissanceTargets = cleanTargets;

  const rawMaxPrices =
    settings.batchBuyDefaultMaxPrice && typeof settings.batchBuyDefaultMaxPrice === 'object' && !Array.isArray(settings.batchBuyDefaultMaxPrice)
      ? settings.batchBuyDefaultMaxPrice
      : {};
  const isLegacyTightDefaults =
    Number((rawMaxPrices as any).C) === 3 &&
    Number((rawMaxPrices as any).U) === 4 &&
    Number((rawMaxPrices as any).R) === 6 &&
    Number((rawMaxPrices as any).E) === 18;
  const mergedMaxPrices: Partial<Record<Rarity, number>> = { ...DEFAULT_SETTINGS.batchBuyDefaultMaxPrice };
  if (!isLegacyTightDefaults) {
    for (const r of VALID_RARITIES) {
      const rawVal = (rawMaxPrices as Record<string, unknown>)[r];
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;
      const val = Number(rawVal);
      if (Number.isFinite(val) && val >= 0) {
        mergedMaxPrices[r] = Math.round(val);
      }
    }
  }
  settings.batchBuyDefaultMaxPrice = mergedMaxPrices;
  settings.autoOpenGoldenSniper = raw.autoOpenGoldenSniper !== false;
  settings.autoOpenUseBonusPacks = Boolean(raw.autoOpenUseBonusPacks ?? false);
  settings.autoGamesEnabled = raw.autoGamesEnabled !== false;
  settings.autoGamesDailyEnabled = raw.autoGamesDailyEnabled !== false;
  settings.autoGamesSolverOverlay = raw.autoGamesSolverOverlay !== false;
  const validGames = ['plus-aime', 'qui-est-ce', 'serie-express', 'memoire', 'kyara-21'];
  settings.autoGamesTargetGame = validGames.includes(String(raw.autoGamesTargetGame))
    ? (raw.autoGamesTargetGame as KyaraSettings['autoGamesTargetGame'])
    : DEFAULT_SETTINGS.autoGamesTargetGame;
  const rawDiscount = settings.buyOrderDiscountPct;
  const parsedDiscount =
    rawDiscount === undefined || rawDiscount === null || (rawDiscount as unknown) === ''
      ? NaN
      : Number(rawDiscount);
  settings.buyOrderDiscountPct = Number.isFinite(parsedDiscount)
    ? Math.max(10, Math.min(60, Math.round(parsedDiscount)))
    : DEFAULT_SETTINGS.buyOrderDiscountPct;
  return settings;
}

export function mergeSettings(current: Partial<KyaraSettings>, patch: Partial<KyaraSettings>): KyaraSettings {
  const synced = { ...patch };
  for (const [canonical, legacy] of [
    ['autoBoosterEnabled', 'autoOpenEnabled'],
    ['autoClaimMissionsEnabled', 'autoClaimMissions'],
    ['autoMarketEnabled', 'autoBuyFlipEnabled'],
    ['autoMarketReserveChakra', 'autoBuyMinChakraReserve']
  ] as const) {
    if (patch[canonical] !== undefined) (synced as any)[legacy] = patch[canonical];
    else if (patch[legacy] !== undefined) (synced as any)[canonical] = patch[legacy];
  }
  return normalizeSettings({ ...current, ...synced });
}
