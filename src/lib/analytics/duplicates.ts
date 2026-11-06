import { Rarity, DuplicateCard, DecisionPedagogy } from '../../types/kyara';
import { KyaraSettings, DEFAULT_SETTINGS, PricingStrategy } from '../../types/settings';
import { DEFAULT_RECYCLE_VALUES, RARITY_PRICE_FLOORS, RARITY_LABELS } from './constants';
import { computeSpareCopies, computeNetProceeds, computeListingFee, computeSaleTax } from './fees';
import { LiveMarketDepth, computeLiveMarketDepth, estimateSaleProbability } from './market-depth';

export function evaluateDuplicate(
  card: any,
  collectionEntry: any,
  marketStats: any = {},
  recycleMap: Record<string, number> = DEFAULT_RECYCLE_VALUES,
  settings: Partial<KyaraSettings> = DEFAULT_SETTINGS,
  activeListedQty = 0,
  pinnedCardIds: Set<number> | number[] | null = null
): DuplicateCard {
  const charId = Number(card?.id ?? collectionEntry?.characterId);
  const rarity: Rarity = card?.rarity || collectionEntry?.rarity || 'C';
  const recycleValue = Number(recycleMap[rarity] ?? DEFAULT_RECYCLE_VALUES[rarity] ?? 1);
  const rarityFloor = Number(RARITY_PRICE_FLOORS[rarity] ?? 3);
  const spare = computeSpareCopies(collectionEntry, activeListedQty);

  const median7d = Number.isFinite(marketStats.median7d) && marketStats.median7d > 0 ? marketStats.median7d : null;
  const median30d = Number.isFinite(marketStats.median30d) && marketStats.median30d > 0 ? marketStats.median30d : null;
  const referenceMedian = median7d ?? median30d ?? null;
  const sales7d = Number.isFinite(marketStats.sales7d) && marketStats.sales7d >= 0 ? marketStats.sales7d : null;

  const liveDepth: LiveMarketDepth | null =
    marketStats.liveDepth ||
    (Array.isArray(marketStats.liveListings) ? computeLiveMarketDepth(marketStats.liveListings, referenceMedian) : null);
  const lowestFixed = Number.isFinite(liveDepth?.lowestFixed)
    ? liveDepth!.lowestFixed
    : Number.isFinite(marketStats.lowestFixed) && marketStats.lowestFixed > 0
      ? marketStats.lowestFixed
      : null;
  const highestFixed = Number.isFinite(liveDepth?.highestFixed)
    ? liveDepth!.highestFixed
    : Number.isFinite(marketStats.highestFixed) && marketStats.highestFixed > 0
      ? marketStats.highestFixed
      : null;
  const liveMedian20 = Number.isFinite(liveDepth?.liveMedian20) ? liveDepth!.liveMedian20 : lowestFixed;
  const liveAvg20 = Number.isFinite(liveDepth?.liveAvg20) ? liveDepth!.liveAvg20 : lowestFixed;

  const isCrash = Boolean(liveDepth?.isCrashDetected);
  const crashDiscountPct = liveDepth?.crashDiscountPct || 0;
  const bestBuyOrder = Number.isFinite(marketStats.bestBuyOrder) && marketStats.bestBuyOrder > 0 ? marketStats.bestBuyOrder : null;

  const surgeThresholdPct = Number(settings?.speculateHoldSurging ?? 20);
  const trendPct = median7d && median30d ? Math.round(((median7d - median30d) / median30d) * 100) : 0;
  const isSurging = Boolean(
    median7d &&
    median30d &&
    trendPct >= surgeThresholdPct &&
    median7d - median30d >= 3 &&
    (sales7d ?? 0) >= 2
  );

  const isPinned = Boolean(
    collectionEntry?.pinned ||
    (pinnedCardIds &&
      (pinnedCardIds instanceof Set ? pinnedCardIds.has(charId) : Array.isArray(pinnedCardIds) && pinnedCardIds.includes(charId)))
  );

  const medianFloorPct = Math.max(30, Math.min(100, Number(settings?.autoSellMedianFloorPct ?? 70)));
  const baseMedianGuardFloor = referenceMedian ? Math.ceil((referenceMedian * medianFloorPct) / 100) : 0;
  const liveGuardFloor = liveMedian20 ? Math.ceil(liveMedian20 * 0.85) : lowestFixed || 0;
  const effectiveGuardFloor =
    isCrash && settings?.autoSellCrashProtection !== false && liveGuardFloor > 0
      ? Math.min(baseMedianGuardFloor, liveGuardFloor)
      : baseMedianGuardFloor;

  const minSafePrice = Math.max(recycleValue + 1, rarityFloor, effectiveGuardFloor);

  let rawQuick = referenceMedian ?? rarityFloor;
  if (bestBuyOrder && referenceMedian && bestBuyOrder >= referenceMedian * 0.85) {
    rawQuick = bestBuyOrder;
  } else if (lowestFixed !== null) {
    rawQuick = Math.max(rarityFloor, lowestFixed - 1);
  } else if (referenceMedian !== null) {
    rawQuick = Math.max(rarityFloor, Math.round(referenceMedian * 0.95));
  }
  const quickPrice = Math.max(minSafePrice, Math.round(rawQuick));

  let rawRecent20Median =
    liveMedian20 !== null
      ? Math.max(rarityFloor, lowestFixed !== null ? Math.min(liveMedian20, lowestFixed - 1) : liveMedian20)
      : rawQuick;
  const recent20MedianPrice = Math.max(minSafePrice, Math.round(rawRecent20Median));

  let rawRecent20Avg =
    liveAvg20 !== null
      ? Math.max(rarityFloor, lowestFixed !== null ? Math.min(Math.round(liveAvg20), lowestFixed - 1) : Math.round(liveAvg20))
      : rawQuick;
  const recent20AvgPrice = Math.max(minSafePrice, Math.round(rawRecent20Avg));

  let rawFlash = lowestFixed !== null ? Math.max(rarityFloor, lowestFixed - 1) : bestBuyOrder || minSafePrice;
  const flashPrice = Math.max(recycleValue + 1, rarityFloor, Math.round(rawFlash));

  const rawBalanced = referenceMedian ?? lowestFixed ?? rarityFloor;
  const balancedPrice = Math.max(minSafePrice, Math.round(rawBalanced));

  const rawMax = highestFixed
    ? Math.min(highestFixed, referenceMedian ? Math.round(referenceMedian * 1.25) : highestFixed)
    : referenceMedian
      ? Math.round(referenceMedian * 1.15)
      : balancedPrice;
  const maxPrice = Math.max(balancedPrice, Math.round(rawMax));

  const strategy: PricingStrategy = settings?.autoSellStrategy || 'quick';
  const recommendedPrice =
    strategy === 'recent20_median'
      ? recent20MedianPrice
      : strategy === 'recent20_avg'
        ? recent20AvgPrice
        : strategy === 'flash'
          ? flashPrice
          : strategy === 'max'
            ? maxPrice
            : strategy === 'balanced'
              ? balancedPrice
              : quickPrice;

  const netProceeds = computeNetProceeds(recommendedPrice);
  const listingFee = computeListingFee(recommendedPrice);
  const saleTax = computeSaleTax(recommendedPrice);
  const netGainOverRecycle = netProceeds - recycleValue;

  const saleProb = estimateSaleProbability(sales7d, recommendedPrice, referenceMedian, lowestFixed);

  const minNetDiff = Number(settings?.autoSellMinNetOverRecycle ?? 2);
  const minSalesForLowMargin = 2;
  const maxRecycleNet = 6;

  const velocityFirst = settings?.autoSellVelocityFirst !== false;
  const turboEnabled = settings?.autoSellTurboLiquidity !== false;
  const turboMaxNet = Number(settings?.autoSellTurboMaxNetProfit ?? 4);
  const minVelocity12h = 20;
  const estimatedSales48h = sales7d !== null ? Math.round(((sales7d / 7) * 2) * 10) / 10 : null;
  const isSlowMover = sales7d !== null && (sales7d < 3 || saleProb.p12h < minVelocity12h);

  let verdict: 'VENDRE' | 'RECYCLER' | 'CONSERVER' | 'PROTÉGÉ' = 'VENDRE';
  let verdictReason = `Net ${netProceeds} ◆ (+${netGainOverRecycle} ◆ vs recyclage ${recycleValue} ◆)`;

  if (isPinned) {
    verdict = 'PROTÉGÉ';
    verdictReason = "Carte favorite protégée (exclue de l'auto-vente et de l'auto-recyclage)";
  } else if (isSurging && settings?.speculateHoldSurging !== false) {
    verdict = 'CONSERVER';
    verdictReason = `📈 En forte hausse (+${trendPct}% sur 7j vs 30j) · Conservation conseillée`;
  } else if (referenceMedian === null && lowestFixed === null) {
    verdict = 'CONSERVER';
    verdictReason = 'Prix de marché inconnu';
  } else if (rarity === 'L') {
    verdict = 'VENDRE';
    verdictReason = `Légendaire en surplus : mise en vente conseillée à ${recommendedPrice} ◆ (net ${netProceeds} ◆)`;
  } else if (turboEnabled && (rarity === 'C' || rarity === 'U') && netGainOverRecycle <= turboMaxNet) {
    verdict = 'RECYCLER';
    verdictReason = `⚡ Turbo Liquidité : gain modeste (+${netGainOverRecycle} ◆ net, ~${estimatedSales48h ?? 0} vte/48h) · Recyclage immédiat (+${recycleValue} ◆)`;
  } else if (turboEnabled && isSlowMover && (rarity === 'C' || rarity === 'U' || netProceeds <= 15)) {
    verdict = 'RECYCLER';
    verdictReason = `⚡ Turbo Liquidité : vente trop lente (~${estimatedSales48h ?? 0} vte/48h) · Recyclage ${recycleValue} ◆ conseillé`;
  } else if (isCrash && strategy === 'flash' && netGainOverRecycle >= minNetDiff) {
    verdict = 'VENDRE';
    verdictReason = `⚡ Vente Flash Krach (-${crashDiscountPct}% vs 7j) : placé à ${recommendedPrice} ◆ · Net ${netProceeds} ◆ (+${netGainOverRecycle} ◆ vs recyclage)`;
  } else if (isCrash && netGainOverRecycle < minNetDiff) {
    verdict = 'RECYCLER';
    verdictReason = `Krach boursier (${lowestFixed} ◆) : vente nette (${netProceeds} ◆) trop proche du recyclage (${recycleValue} ◆)`;
  } else if (velocityFirst && isSlowMover && (rarity === 'C' || rarity === 'U' || netProceeds <= 15)) {
    verdict = 'RECYCLER';
    verdictReason = `Vente stagnante pour une ${RARITY_LABELS[rarity] || rarity} (~${estimatedSales48h ?? 0} vte/48h) · Recyclage ${recycleValue} ◆ conseillé`;
  } else if (velocityFirst && isSlowMover && netProceeds > 15) {
    verdict = 'CONSERVER';
    verdictReason = `Vente lente sur 12h-48h (${saleProb.p12h}% probabilité 12h) · Évite de saturer l'un des 10 créneaux`;
  } else if (netGainOverRecycle < minNetDiff) {
    verdict = 'RECYCLER';
    verdictReason = `Rentabilité faible : net ${netProceeds} ◆ vs recyclage immédiat ${recycleValue} ◆`;
  } else if (netProceeds <= maxRecycleNet && sales7d !== null && sales7d < minSalesForLowMargin) {
    verdict = 'RECYCLER';
    verdictReason = `Trop peu liquide (${sales7d} vente(s)/7j) pour un gain net de ${netProceeds} ◆`;
  } else if (
    lowestFixed !== null &&
    lowestFixed <= rarityFloor &&
    referenceMedian !== null &&
    referenceMedian <= rarityFloor + 1 &&
    sales7d !== null &&
    sales7d < 5
  ) {
    verdict = 'RECYCLER';
    verdictReason = `Marché saturé au prix plancher (${lowestFixed} ◆) · recyclage ${recycleValue} ◆ conseillé`;
  }

  const hourlyExpectedChakra = Math.round(((netProceeds * (saleProb.p12h / 100)) / 12) * 100) / 100;

  const pedagogy: DecisionPedagogy = {
    decision: verdict,
    title: `${verdict === 'VENDRE' ? 'Mise en vente conseillée' : verdict === 'RECYCLER' ? 'Recyclage conseillé' : verdict === 'CONSERVER' ? 'Conservation (HODL)' : 'Carte Protégée'} : ${card?.name || `Carte #${charId}`}`,
    why: verdictReason,
    delayEstimate:
      saleProb.p12h >= 60 ? 'Rapide (< 12h)' : saleProb.p24h >= 50 ? 'Moyen (~24h)' : 'Lent (> 48h)',
    gainAnalysis: `${netProceeds} ◆ net (${netGainOverRecycle > 0 ? `+${netGainOverRecycle} ◆ net vs ${recycleValue} ◆ recyclage` : `vs ${recycleValue} ◆ recyclage`})`,
    competition: lowestFixed ? `${lowestFixed} ◆ (Offre min sur ${liveDepth?.count || 1} annonce(s))` : 'Aucune concurrence directe',
    isCrash,
    crashDiscountPct,
    hourlyExpectedChakra
  };

  return {
    characterId: charId,
    name: card?.name || collectionEntry?.name || `Carte #${charId}`,
    series: card?.series || collectionEntry?.series || '',
    rarity,
    owned: Math.max(0, Number(collectionEntry?.qty) || 1),
    spare,
    recycleValue,
    referenceMedian,
    lowestFixed,
    highestFixed,
    sales7d: sales7d || 0,
    sales12h: estimatedSales48h ? Math.round(estimatedSales48h / 4) : 0,
    isSurging,
    trendPct,
    verdict,
    verdictReason,
    pinned: isPinned,
    prices: {
      recommended: recommendedPrice,
      undercut: quickPrice,
      median: referenceMedian || recommendedPrice,
      minSafe: minSafePrice
    },
    fees: {
      sellerTax: saleTax,
      depositFee: listingFee,
      netProceeds,
      netGainOverRecycle
    },
    saleProb,
    pedagogy
  };
}
