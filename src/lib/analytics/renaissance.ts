import type { Rarity, RarityProgress, RenaissanceSummary } from '../../types/kyara';
import { DEFAULT_SETTINGS, type KyaraSettings } from '../../types/settings';
import { RARITIES, RARITY_PRICE_FLOORS } from './constants';

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
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  return total;
}

/** Compute per-rarity and aggregate Renaissance readiness metrics across focus rarities. */
export function computeRenaissanceSummary(
  catalogById: Map<number, any> | Record<number, any>,
  ownedSet: Set<number> | number[],
  settings: Partial<KyaraSettings> = DEFAULT_SETTINGS,
  rarityAvgPrices: Record<string, number> = {},
  serverRebirth: any = null
): RenaissanceSummary {
  const ownedIds =
    ownedSet instanceof Set
      ? ownedSet
      : new Set(Array.isArray(ownedSet) ? ownedSet.map(Number).filter(Number.isFinite) : []);

  const ownedByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const totalByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };

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
    if (Number.isFinite(id) && ownedIds.has(id)) {
      ownedByRarity[r] += 1;
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

  return {
    enabled: Boolean(settings?.renaissanceFocusEnabled),
    focusRarities,
    totalOwned,
    totalTarget,
    overallPct,
    ready: priorityRarities.length === 0,
    byRarity,
    priorityRarities,
    estimatedRemainingCost: focusRarities.reduce((sum, r) => sum + byRarity[r].estimatedCostChakra, 0)
  };
}
