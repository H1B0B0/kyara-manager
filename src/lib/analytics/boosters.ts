import { Rarity, BoosterPack, BoosterRecommendations } from '../../types/kyara';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { RARITIES } from './constants';

export function evaluateBoosterPack(
  pack: any,
  poolOrOwned: any = null,
  catalogById: Map<number, any> | Record<number, any> | null = null,
  ownedSet: Set<number> | number[] | null = null,
  rarityAvgPrices: Record<string, number> = {},
  config: any = {},
  me: any = null,
  packState: any = null
): BoosterPack {
  const packId = String(pack.id || pack.packId || '');
  const name = String(pack.name || packId || 'Booster');
  const series = String(pack.series || name);
  const bannerUrl = pack.bannerUrl || pack.image || '';

  // Determine call signature: simple test mode (pack, ownedIds) vs full mode
  const isSimpleMode = poolOrOwned instanceof Set || Array.isArray(poolOrOwned) || poolOrOwned === null;
  const effectiveOwned = isSimpleMode ? poolOrOwned : ownedSet;
  const poolIds: number[] = !isSimpleMode && Array.isArray(poolOrOwned)
    ? poolOrOwned.map(Number).filter(Number.isFinite)
    : Array.isArray(pack.characters)
      ? pack.characters.map((c: any) => Number(c.id || c.characterId)).filter(Number.isFinite)
      : [];

  const totalByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const missingByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };

  const isCharOwned = (id: number) => {
    if (effectiveOwned instanceof Set) return effectiveOwned.has(id);
    if (Array.isArray(effectiveOwned)) return effectiveOwned.includes(id);
    return false;
  };

  if (poolIds.length > 0) {
    for (const id of poolIds) {
      const ch = catalogById instanceof Map ? catalogById.get(id) : catalogById?.[id];
      const r: Rarity = ch?.rarity || 'C';
      if (RARITIES.includes(r)) {
        totalByRarity[r] = (totalByRarity[r] || 0) + 1;
        if (!isCharOwned(id)) {
          missingByRarity[r] = (missingByRarity[r] || 0) + 1;
        }
      }
    }
  } else if (pack.missingByRarity || pack.totalByRarity) {
    for (const r of RARITIES) {
      totalByRarity[r] = Number(pack.totalByRarity?.[r] ?? pack.cardsByRarity?.[r] ?? 0);
      missingByRarity[r] = Number(pack.missingByRarity?.[r] ?? 0);
    }
  }

  const computedTotalPool = Object.values(totalByRarity).reduce((a, b) => a + b, 0);
  const totalPool = computedTotalPool > 0 ? computedTotalPool : Number(pack.totalPool || 100);
  const totalMissing = Object.values(missingByRarity).reduce((a, b) => a + b, 0);

  const completionPct = totalPool > 0 ? Math.round(((totalPool - totalMissing) / totalPool) * 100) : 0;

  // Availability & Free openings check
  const now = Date.now();
  const inSchedule = !pack.schedule || (now >= Date.parse(pack.schedule.start) && now < Date.parse(pack.schedule.end));
  const granted = Number(me?.grants?.[packId] ?? 0);
  const usesFreePacks = Boolean(pack.usesFreePacks ?? pack.price === 0);
  const freeLeft = usesFreePacks ? Number(me?.freePacks ?? 0) + Number(me?.bonusPacks ?? 0) : 0;
  const dailyLeft = pack.limit ? Number(packState?.limits?.[packId]?.left ?? pack.limit.perDay) : null;
  const chakraPrice = Number(pack.chakraPrice ?? (pack.price || 150));

  let openableFreeCount = 0;
  if (isSimpleMode && me === null) {
    openableFreeCount = Math.max(0, Number(pack.openableFreeCount ?? (pack.usesFreePacks !== false ? (pack.freePacks ?? 0) : 0)));
  } else {
    openableFreeCount =
      !inSchedule || (pack.grantOnly && granted <= 0) || (dailyLeft !== null && dailyLeft <= 0)
        ? 0
        : dailyLeft !== null
          ? Math.min(dailyLeft, granted + freeLeft)
          : granted + freeLeft;
  }

  const canOpenNow = inSchedule && (!pack.grantOnly || granted > 0) && (dailyLeft === null || dailyLeft > 0) && openableFreeCount > 0;

  const probAtLeastOneNewPct =
    totalPool > 0
      ? Math.round((1 - Math.pow(Math.max(0, totalPool - totalMissing) / totalPool, 5)) * 100)
      : 0;

  const expectedNewCards = Math.round((5 * (totalMissing / Math.max(1, totalPool))) * 10) / 10;
  const expectedChakraValue = Math.round(15 + (100 - completionPct) * 0.5);

  return {
    packId,
    name,
    series,
    bannerUrl,
    totalPool,
    totalMissing,
    completionPct,
    probAtLeastOneNewPct,
    expectedNewCards,
    expectedChakraValue,
    openableFreeCount,
    canOpenNow,
    usesFreePacks,
    chakraPrice,
    cardsByRarity: pack.cardsByRarity || totalByRarity,
    missingByRarity,
    totalByRarity
  };
}

export function rankBoostersForCollection(
  packs: any[],
  arg2: any = null,
  arg3: any = null,
  arg4: any = null,
  arg5: any = null,
  arg6: any = null,
  arg7: any = null,
  arg8: any = null,
  arg9: any = null
): BoosterRecommendations {
  const isSimpleMode = arg2 instanceof Set || Array.isArray(arg2) || arg2 === null;

  let evaluated: BoosterPack[] = [];
  let userPity = 0;
  let settings = arg9 || DEFAULT_SETTINGS;

  if (isSimpleMode) {
    evaluated = (packs || []).map((p) => evaluateBoosterPack(p, arg2));
    userPity = typeof arg3 === 'number' ? arg3 : 0;
  } else {
    // Full mode: packs, packPools, catalogById, ownedSet, rarityAvgPrices, config, me, packState, settings
    const packPools = arg2;
    const catalogById = arg3;
    const ownedSet = arg4;
    const rarityAvgPrices = arg5 || {};
    const config = arg6 || {};
    const me = arg7 || null;
    const packState = arg8 || null;
    userPity = Number(me?.pity ?? 0);

    evaluated = (packs || []).map((pack) =>
      evaluateBoosterPack(
        pack,
        packPools?.[pack.id] || [],
        catalogById,
        ownedSet,
        rarityAvgPrices,
        config,
        me,
        packState
      )
    );
  }

  const isPityNear = userPity >= 240;
  let recommendedPity: BoosterPack | null = null;
  if (isPityNear) {
    const candidates = evaluated.filter((p) => (p.missingByRarity?.M || 0) > 0);
    candidates.sort((a, b) => {
      if (Number(b.canOpenNow) !== Number(a.canOpenNow)) return Number(b.canOpenNow) - Number(a.canOpenNow);
      return (b.missingByRarity?.M || 0) - (a.missingByRarity?.M || 0);
    });
    recommendedPity = candidates[0] || null;
  }

  // Sort packs prioritizing: 1. canOpenNow, 2. usesFreePacks, 3. expectedNewCards, 4. expectedChakraValue
  const sortedNew = [...evaluated].sort((a, b) => {
    if (Number(b.canOpenNow) !== Number(a.canOpenNow)) return Number(b.canOpenNow) - Number(a.canOpenNow);
    if (Number(b.usesFreePacks) !== Number(a.usesFreePacks)) return Number(b.usesFreePacks) - Number(a.usesFreePacks);
    return b.expectedNewCards - a.expectedNewCards || b.probAtLeastOneNewPct - a.probAtLeastOneNewPct;
  });

  const sortedEv = [...evaluated].sort((a, b) => {
    if (Number(b.canOpenNow) !== Number(a.canOpenNow)) return Number(b.canOpenNow) - Number(a.canOpenNow);
    if (Number(b.usesFreePacks) !== Number(a.usesFreePacks)) return Number(b.usesFreePacks) - Number(a.usesFreePacks);
    return b.expectedChakraValue - a.expectedChakraValue;
  });

  const activeRecommendedNew =
    isPityNear && recommendedPity && settings?.autoOpenPitySniper !== false
      ? recommendedPity
      : sortedNew[0] || null;

  return {
    recommendedNew: activeRecommendedNew,
    recommendedEv: sortedEv[0] || null,
    recommendedPity,
    isPityNear,
    all: sortedNew
  };
}
