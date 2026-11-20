import type { Rarity, RarityProgress, RenaissanceSummary } from '../../types/kyara';
import { DEFAULT_SETTINGS, type KyaraSettings } from '../../types/settings';
import { DEFAULT_RECYCLE_VALUES, RARITIES, RARITY_PRICE_FLOORS } from './constants';

export const OFFICIAL_REBIRTH_1_TARGETS: Record<Rarity, number> = {
  C: 1432,
  U: 1432,
  R: 1432,
  E: 505,
  L: 70,
  M: 10
};

export const OFFICIAL_REBIRTH_BOOSTERS_TARGET = 1500;

export const RENOWN_BY_RARITY: Record<Rarity, number> = {
  C: 1,
  U: 2,
  R: 5,
  E: 15,
  L: 50,
  M: 200
};

const REBIRTH_RECYCLE_RARITIES: Rarity[] = ['C', 'U', 'R', 'E'];

export interface RenaissanceExtraContext {
  boostersOpened?: number;
  activeListings?: any[];
  collection?: any[];
  recycleMap?: Record<string, number>;
}

function resolveTarget(
  rarity: Rarity,
  total: number,
  settings: Partial<KyaraSettings>,
  serverRebirth: any
): number {
  const customTarget = Number(settings?.renaissanceTargets?.[rarity]);
  if (Number.isFinite(customTarget) && customTarget > 0) {
    const floored = Math.floor(customTarget);
    return total > 0 ? Math.min(total, floored) : floored;
  }

  const rawServerReq =
    serverRebirth?.requirements?.[rarity] ??
    serverRebirth?.targets?.[rarity] ??
    serverRebirth?.[rarity];
  if (rawServerReq !== undefined && rawServerReq !== null && rawServerReq !== '') {
    const parsed = Number(rawServerReq);
    if (Number.isFinite(parsed) && parsed > 0) {
      const floored = Math.floor(parsed);
      const isHighTier = rarity === 'E' || rarity === 'L' || rarity === 'M';
      const maxOfficial = OFFICIAL_REBIRTH_1_TARGETS[rarity];
      if (!isHighTier || (floored <= maxOfficial && (total <= 0 || floored < total))) {
        return total > 0 ? Math.min(total, floored) : floored;
      }
    }
  }

  const official = OFFICIAL_REBIRTH_1_TARGETS[rarity];
  return total > 0 ? Math.min(total, official) : official;
}

/** Compute per-rarity and aggregate Renaissance readiness metrics across focus rarities. */
export function computeRenaissanceSummary(
  catalogById: Map<number, any> | Record<number, any>,
  ownedSet: Set<number> | number[],
  settings: Partial<KyaraSettings> = DEFAULT_SETTINGS,
  rarityAvgPrices: Record<string, number> = {},
  serverRebirth: any = null,
  extra?: RenaissanceExtraContext
): RenaissanceSummary {
  const ownedIds =
    ownedSet instanceof Set
      ? ownedSet
      : new Set(Array.isArray(ownedSet) ? ownedSet.map(Number).filter(Number.isFinite) : []);

  const ownedByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const totalByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const cardRarityById = new Map<number, Rarity>();

  const entries: Iterable<[unknown, any]> =
    catalogById instanceof Map
      ? catalogById.entries()
      : catalogById && typeof catalogById === 'object'
        ? Object.entries(catalogById)
        : [];

  for (const [key, ch] of entries) {
    const r = (ch?.rarity || 'C') as Rarity;
    if (!RARITIES.includes(r)) continue;
    totalByRarity[r] += 1;
    const id = Number(ch?.id ?? ch?.characterId ?? key);
    if (Number.isFinite(id)) {
      cardRarityById.set(id, r);
      if (ownedIds.has(id)) {
        ownedByRarity[r] += 1;
      }
    }
  }

  const byRarity = {} as Record<Rarity, RarityProgress>;
  for (const r of RARITIES) {
    const owned = ownedByRarity[r];
    const total = totalByRarity[r];
    const target = resolveTarget(r, total, settings, serverRebirth);
    const missing = Math.max(0, total - owned);
    const remainingForTarget = Math.max(0, target - owned);
    const pct = total > 0 ? Math.round((owned / total) * 1000) / 10 : 0;
    const targetPct = target > 0 ? Math.min(100, Math.round((owned / target) * 1000) / 10) : 100;
    const floor = RARITY_PRICE_FLOORS[r] || 3;
    const avgPrice = Number(rarityAvgPrices?.[r]) || floor;
    const unitCost = Math.max(floor, Math.round(avgPrice * 0.85));

    byRarity[r] = {
      rarity: r,
      owned,
      total,
      missing,
      target,
      remainingForTarget,
      pct,
      targetPct,
      estimatedCostChakra: remainingForTarget * unitCost
    };
  }

  const rawFocus = Array.isArray(settings?.renaissanceTargetRarities)
    ? settings.renaissanceTargetRarities.filter((r): r is Rarity => RARITIES.includes(r))
    : [];
  const focusRarities: Rarity[] = rawFocus.length > 0 ? Array.from(new Set(rawFocus)) : ['C', 'U', 'R'];

  const priorityRarities = focusRarities
    .filter((r) => byRarity[r].remainingForTarget > 0)
    .sort(
      (a, b) =>
        byRarity[b].remainingForTarget - byRarity[a].remainingForTarget ||
        byRarity[a].targetPct - byRarity[b].targetPct
    );

  const totalOwned = focusRarities.reduce((sum, r) => sum + byRarity[r].owned, 0);
  const totalTarget = focusRarities.reduce((sum, r) => sum + byRarity[r].target, 0);
  const totalRemaining = focusRarities.reduce((sum, r) => sum + byRarity[r].remainingForTarget, 0);
  const overallPct =
    totalTarget > 0
      ? Math.min(100, Math.round(((totalTarget - totalRemaining) / totalTarget) * 1000) / 10)
      : 100;

  const rawBoostersOpened = Number(extra?.boostersOpened ?? 0);
  const boostersOpened = Number.isFinite(rawBoostersOpened) ? Math.max(0, rawBoostersOpened) : 0;
  const rawBoostersTarget = Number(serverRebirth?.boostersTarget ?? OFFICIAL_REBIRTH_BOOSTERS_TARGET);
  const boostersTarget = Number.isFinite(rawBoostersTarget)
    ? Math.max(0, rawBoostersTarget)
    : OFFICIAL_REBIRTH_BOOSTERS_TARGET;

  const activeListings = Array.isArray(extra?.activeListings) ? extra.activeListings : [];
  const blockingListingsCount = activeListings.filter((l) => {
    const r = String(l?.rarity || l?.character?.rarity || 'C') as Rarity;
    return REBIRTH_RECYCLE_RARITIES.includes(r);
  }).length;

  const recycleMap = extra?.recycleMap || {};
  let rebirthPayoutChakra = 0;
  if (Array.isArray(extra?.collection) && extra.collection.length > 0) {
    for (const entry of extra.collection) {
      const cid = Number(entry?.characterId ?? entry?.id ?? entry?.character?.id);
      const r = (entry?.rarity ?? entry?.character?.rarity ?? cardRarityById.get(cid)) as Rarity;
      if (!REBIRTH_RECYCLE_RARITIES.includes(r)) continue;
      const qty =
        entry?.qty !== undefined
          ? Math.max(0, Number(entry.qty) || 0)
          : Math.max(0, Number(entry?.count ?? 1) || 0);
      const unitValue = Number(recycleMap[r] ?? DEFAULT_RECYCLE_VALUES[r] ?? 0);
      rebirthPayoutChakra += qty * unitValue;
    }
  } else {
    for (const r of REBIRTH_RECYCLE_RARITIES) {
      const unitValue = Number(recycleMap[r] ?? DEFAULT_RECYCLE_VALUES[r] ?? 0);
      rebirthPayoutChakra += byRarity[r].owned * unitValue;
    }
  }

  const estimatedRenown = RARITIES.reduce(
    (sum, r) => sum + byRarity[r].owned * RENOWN_BY_RARITY[r],
    0
  );

  const rarityConditionsMet = RARITIES.filter((r) => byRarity[r].remainingForTarget === 0).length;
  const conditionsTotal = 8;
  const conditionsMet =
    rarityConditionsMet +
    (boostersOpened >= boostersTarget ? 1 : 0) +
    (blockingListingsCount === 0 ? 1 : 0);

  return {
    enabled: Boolean(settings?.renaissanceFocusEnabled),
    focusRarities,
    totalOwned,
    totalTarget,
    overallPct,
    ready: priorityRarities.length === 0,
    byRarity,
    priorityRarities,
    estimatedRemainingCost: focusRarities.reduce((sum, r) => sum + byRarity[r].estimatedCostChakra, 0),
    boostersOpened,
    boostersTarget,
    blockingListingsCount,
    rebirthPayoutChakra,
    estimatedRenown,
    conditionsMet,
    conditionsTotal
  };
}
