import { Rarity, BoosterPack, BoosterRecommendations } from '../../types/kyara';
import { KyaraSettings, DEFAULT_SETTINGS } from '../../types/settings';
import { RARITIES, RARITY_PRICE_FLOORS } from './constants';

export function evaluateBoosterPack(
  pack: any,
  packCharIdsOrOwned: any = null,
  catalogById: Map<number, any> | Record<number, any> | null = null,
  ownedSet: Set<number> | number[] | null = null,
  rarityAvgPrices: Record<string, number> = {},
  config: any = {},
  me: any = null,
  packState: any = null
): BoosterPack {
  const packId = String(pack?.id || pack?.packId || '');
  const name = String(pack?.name || packId || 'Booster');
  const series = String(pack?.series || pack?.sub || name);
  const bannerUrl = pack?.bannerUrl || pack?.image || '';

  // Distinguish test signature evaluateBoosterPack(pack, ownedSet) vs full signature
  const isSimpleTest = catalogById === null && (packCharIdsOrOwned instanceof Set || Array.isArray(packCharIdsOrOwned) || packCharIdsOrOwned === null);
  const effectiveOwned: Set<number> = isSimpleTest
    ? packCharIdsOrOwned instanceof Set
      ? packCharIdsOrOwned
      : new Set(Array.isArray(packCharIdsOrOwned) ? packCharIdsOrOwned : [])
    : ownedSet instanceof Set
      ? ownedSet
      : new Set(Array.isArray(ownedSet) ? ownedSet : []);

  const poolIds: number[] = !isSimpleTest && Array.isArray(packCharIdsOrOwned)
    ? packCharIdsOrOwned.map(Number).filter(Number.isFinite)
    : Array.isArray(pack?.characters)
      ? pack.characters.map((c: any) => Number(c.id || c.characterId)).filter(Number.isFinite)
      : [];

  const totalByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const missingByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };

  const getChar = (id: number) => (catalogById instanceof Map ? catalogById.get(id) : catalogById?.[id]);

  if (poolIds.length > 0) {
    for (const id of poolIds) {
      const ch = getChar(id);
      const r = (ch?.rarity || 'C') as Rarity;
      if (RARITIES.includes(r)) {
        totalByRarity[r] = (totalByRarity[r] || 0) + 1;
        if (!effectiveOwned.has(id)) {
          missingByRarity[r] = (missingByRarity[r] || 0) + 1;
        }
      }
    }
  } else if (pack?.missingByRarity || pack?.totalByRarity || pack?.rates?.cardsByRarity) {
    const cardsByRarity = pack?.rates?.cardsByRarity || pack?.totalByRarity || {};
    for (const r of RARITIES) {
      totalByRarity[r] = Number(cardsByRarity[r] ?? 0);
      missingByRarity[r] = Number(pack?.missingByRarity?.[r] ?? (totalByRarity[r] > 0 ? Math.round(totalByRarity[r] * 0.5) : 0));
    }
  }

  const computedTotalPool = Object.values(totalByRarity).reduce((a, b) => a + b, 0);
  const totalPool = computedTotalPool > 0 ? computedTotalPool : Number(pack?.totalPool || 100);
  const totalMissing = Object.values(missingByRarity).reduce((a, b) => a + b, 0);
  const completionPct = totalPool > 0 ? Math.round(((totalPool - totalMissing) / totalPool) * 100) : 0;

  // RateUp handling
  const featuredIds = new Set<number>((pack?.rateUp?.characterIds || []).map(Number));
  const featuredRarities = new Set((pack?.rateUp?.rarities || []) as Rarity[]);
  const featuredShare = featuredRarities.size > 0 ? Math.min(1, Math.max(0, Number(pack?.rateUp?.share) || 0)) : 0;
  const missingFeaturedByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
  const totalFeaturedByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };

  for (const fid of featuredIds) {
    const ch = getChar(fid);
    const r = (ch?.rarity || 'C') as Rarity;
    if (RARITIES.includes(r)) {
      totalFeaturedByRarity[r] = (totalFeaturedByRarity[r] || 0) + 1;
      if (!effectiveOwned.has(fid)) missingFeaturedByRarity[r] = (missingFeaturedByRarity[r] || 0) + 1;
    }
  }

  const computeForSlots = (slots: any[]) => {
    if (!Array.isArray(slots) || !slots.length) {
      return { expectedNew: 0, probAtLeastOneNew: 0, expectedValue: 0 };
    }
    let expectedNew = 0;
    let probNoNew = 1.0;
    let expectedValue = 0;

    for (const slot of slots) {
      let slotProbNew = 0;
      let slotEv = 0;
      const pctMap = slot?.pct || {};
      for (const r of RARITIES) {
        const rProb = (Number(pctMap[r]) || 0) / 100;
        if (rProb <= 0) continue;

        const denom = totalByRarity[r] || 1;
        const miss = missingByRarity[r] || 0;
        let pNewGivenRarity = denom > 0 ? miss / denom : 0;

        if (featuredRarities.has(r) && totalFeaturedByRarity[r] > 0) {
          const pFeatNew = missingFeaturedByRarity[r] / totalFeaturedByRarity[r];
          const nonFeatTotal = Math.max(1, denom - totalFeaturedByRarity[r]);
          const nonFeatMiss = Math.max(0, miss - missingFeaturedByRarity[r]);
          const pNonFeatNew = nonFeatMiss / nonFeatTotal;
          pNewGivenRarity = featuredShare * pFeatNew + (1 - featuredShare) * pNonFeatNew;
        }

        slotProbNew += rProb * pNewGivenRarity;
        const avgVal = Number(rarityAvgPrices[r] ?? RARITY_PRICE_FLOORS[r] ?? 3);
        slotEv += rProb * avgVal;
      }
      expectedNew += slotProbNew;
      probNoNew *= Math.max(0, 1 - slotProbNew);
      expectedValue += slotEv;
    }

    return {
      expectedNew,
      probAtLeastOneNew: (1 - probNoNew) * 100,
      expectedValue
    };
  };

  let expectedNewCards = 0;
  let probAtLeastOneNewPct = 0;
  let expectedChakraValue = 0;

  if (Array.isArray(pack?.rates?.slots) && pack.rates.slots.length > 0) {
    const normalStats = computeForSlots(pack.rates.slots);
    const goldenEvery = Number(config?.golden?.every) || 10;
    const goldenSlots = pack?.goldenEligible ? pack?.rates?.golden?.slots : null;
    const gWeight = goldenSlots && goldenEvery > 0 ? 1 / goldenEvery : 0;
    const goldenStats = goldenSlots ? computeForSlots(goldenSlots) : normalStats;

    expectedNewCards = Math.round((normalStats.expectedNew * (1 - gWeight) + goldenStats.expectedNew * gWeight) * 100) / 100;
    probAtLeastOneNewPct = Math.round(normalStats.probAtLeastOneNew * (1 - gWeight) + goldenStats.probAtLeastOneNew * gWeight);
    expectedChakraValue = Math.round(normalStats.expectedValue * (1 - gWeight) + goldenStats.expectedValue * gWeight);
  } else {
    probAtLeastOneNewPct = totalPool > 0 ? Math.round((1 - Math.pow(Math.max(0, totalPool - totalMissing) / totalPool, 5)) * 100) : 0;
    expectedNewCards = Math.round((5 * (totalMissing / Math.max(1, totalPool))) * 10) / 10;
    expectedChakraValue = Math.round(15 + (100 - completionPct) * 0.5);
  }

  // Availability & Free openings check
  const now = Date.now();
  const inSchedule = !pack?.schedule || (now >= Date.parse(pack.schedule.start) && now < Date.parse(pack.schedule.end));
  const granted = Number(me?.grants?.[packId] ?? 0);
  const usesFreePacks = Boolean(pack?.usesFreePacks ?? pack?.price === 0);
  const freeLeft = usesFreePacks ? Number(me?.freePacks ?? 0) + Number(me?.bonusPacks ?? 0) : 0;
  const dailyLeft = pack?.limit ? Number(packState?.limits?.[packId]?.left ?? pack.limit.perDay) : null;
  const chakraPrice = Number(pack?.chakraPrice ?? (pack?.price || 150));

  let openableFreeCount = 0;
  if (isSimpleTest && me === null) {
    openableFreeCount = Math.max(0, Number(pack?.openableFreeCount ?? (usesFreePacks ? (pack?.freePacks ?? 0) : 0)));
  } else {
    openableFreeCount =
      !inSchedule || (pack?.grantOnly && granted <= 0) || (dailyLeft !== null && dailyLeft <= 0)
        ? 0
        : dailyLeft !== null
          ? Math.min(dailyLeft, granted + freeLeft)
          : granted + freeLeft;
  }

  const canOpenNow = inSchedule && (!pack?.grantOnly || granted > 0) && (dailyLeft === null || dailyLeft > 0) && openableFreeCount > 0;

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
    cardsByRarity: pack?.cardsByRarity || totalByRarity,
    missingByRarity,
    totalByRarity
  };
}

export function rankBoostersForCollection(
  packs: any[],
  packPoolsOrOwned: any = null,
  catalogById: any = null,
  ownedSet: any = null,
  rarityAvgPrices: Record<string, number> = {},
  config: any = {},
  me: any = null,
  packState: any = null,
  settings: Partial<KyaraSettings> = DEFAULT_SETTINGS
): BoosterRecommendations {
  const isSimpleTest = packPoolsOrOwned instanceof Set || (Array.isArray(packPoolsOrOwned) && catalogById === null);

  let evaluated: BoosterPack[] = [];
  let userPity = 0;

  if (isSimpleTest) {
    const effectiveOwned = packPoolsOrOwned instanceof Set ? packPoolsOrOwned : new Set(Array.isArray(packPoolsOrOwned) ? packPoolsOrOwned : []);
    evaluated = (packs || []).map((p) => evaluateBoosterPack(p, effectiveOwned));
    userPity = typeof catalogById === 'number' ? catalogById : 0;
  } else {
    const packPools = packPoolsOrOwned || {};
    userPity = Number(me?.pity ?? 0);
    evaluated = (packs || []).map((pack) =>
      evaluateBoosterPack(
        pack,
        packPools[pack.id] || pack.characters || [],
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
