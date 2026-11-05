(function (root) {
  "use strict";

  const RARITIES = ["C", "U", "R", "E", "L", "M"];
  const RARITY_LABELS = {
    C: "Commune",
    U: "Peu commune",
    R: "Rare",
    E: "Épique",
    L: "Légendaire",
    M: "Mythique"
  };

  const DEFAULT_RECYCLE_VALUES = {
    C: 1,
    U: 1,
    R: 3,
    E: 10,
    L: 40,
    M: 150
  };

  // Floor table of minimum fixed prices practiced on Kyara by rarity
  const RARITY_PRICE_FLOORS = {
    C: 3,
    U: 3,
    R: 5,
    E: 15,
    L: 100,
    M: 815
  };

  const MARKET_FEES = {
    saleTaxPct: 5,
    listingFeePct: 2,
    listingFeeMin: 1
  };

  const DEFAULT_SETTINGS = {
    masterEnabled: false,
    dryRun: false,

    // 1. Auto-Vente des doublons
    autoSellEnabled: true,
    autoSellMaxListings: 10,
    autoSellStrategy: "quick", // "quick" | "recent20_median" | "recent20_avg" | "flash" | "balanced" | "max"
    autoSellDurationHours: 12, // 12 | 24 | 48
    autoSellMedianFloorPct: 70, // Garde-fou Kyara Helper : jamais sous 70% de la médiane
    autoSellCrashProtection: true, // Si krach détecté (ex: Fairy Tail), adapte le garde-fou aux 20 offres directes
    autoSellTurboLiquidity: true, // Mode Turbo Liquidité : désengorge les 10 créneaux en recyclant direct les cartes lentes/faible marge
    autoSellTurboMaxNetProfit: 4, // Recyclage direct si gain net de vente ≤ ce montant au-dessus du recyclage
    autoSellMinNetOverRecycle: 2, // Au moins +2 ◆ net au-dessus du recyclage pour vendre plutôt que recycler
    autoSellVelocityFirst: true, // Vérifie la vélocité rapide sur 48h : priorise et ne liste que les cartes fluides en 12h
    autoSellMinVelocity12hPct: 20, // Probabilité min de vente en 12h (20%) pour occuper 1 des 10 créneaux
    autoSellIncludeL: true,
    autoSellIncludeM: false,
    autoSellExpireHours: 2, // Retirer/réajuster les annonces non vendues après 2 heures (baisse prix ou recyclage)
    autoSellRepriceDiscountPct: 5, // Rabais pour réajuster une annonce stagnante (>2h) si au-dessus du plancher
    autoSellRecycleIfUnsoldLowMargin: true, // Si net proche du recyclage et non vendue en 2h, recycler immédiatement
    autoSellRecycleExpired: false,

    // 2. Auto-Recyclage des cartes conseillées au recyclage
    autoRecycleEnabled: true,
    autoRecycleRarities: ["C", "U", "R", "E"], // L et M exclues par défaut
    autoRecycleMaxMarketNet: 6, // Recycle si le net de vente estimé est ≤ recycleValue + autoSellMinNetOverRecycle ou ≤ ce seuil avec faible liquidité
    autoRecycleMinSales7dToKeepForSale: 2, // Si ventes 7j < 2 et net faible, préférer recycler

    // 3. Auto-Achat / Achat-Revente (Bons plans & Flip)
    autoBuyFlipEnabled: false,
    autoBuyMissingEnabled: false,
    autoBuyMinChakraReserve: 500, // Toujours garder au moins X ◆ en réserve
    autoBuyMaxUnitPrice: 400, // Prix max d'achat unitaire en auto
    autoBuyMinDiscountPct: 28, // Au moins 28% sous la médiane 7j
    autoBuyMinFlipProfit: 15, // Bénéfice net de revente minimum (après taxe 5% + frais 2%)
    autoBuyMinSales7d: 4, // Liquidité minimale (ventes sur 7 jours) pour un flip
    autoBuyMissingMaxPrice: 25, // Prix max pour acheter auto une carte manquante de la collection

    // 4. Mes envies (Wishlist & suivi personnalisé)
    wishlistAutoBuyEnabled: false,
    wishlistMaxPriceDefault: 30,

    // 5. Auto-Ouverture des boosters conseillés
    autoOpenEnabled: true,
    autoOpenMode: "recommended_new", // "recommended_new" (max nouveaux persos) | "recommended_ev" (max chakra EV) | "custom"
    autoOpenCustomPackId: "all",
    autoOpenMinBatch: 1, // Ouvrir dès que X boosters gratuits sont disponibles
    autoOpenAllowChakra: false, // N'utiliser que les boosters gratuits/bonus/grants par défaut
    autoOpenMaxChakraBudget: 0,
    autoOpenPitySniper: true, // Optimiseur : si pitié >= 240, basculer sur le booster avec les meilleurs Mythiques
    autoOpenDailyPack: true, // Réclamer automatiquement le pack gratuit du jour

    // Spéculation & Tendance de prix (HODL)
    speculateHoldSurging: true, // Conserver les cartes en forte hausse de prix (+20% vs 30j)
    speculateSurgeThresholdPct: 20,

    // 6. Confort & Missions
    autoClaimMissions: true,
    antiAfkEnabled: true,
    notificationsEnabled: true,
    loopIntervalSec: 45,
    language: "auto" // "auto" (Kyara / navigateur) | "fr" | "en" | "es"
  };

  /**
   * Break up long tasks (>50ms) using scheduler.yield() with setTimeout fallback.
   */
  async function yieldIfNeeded(deadline) {
    if (typeof performance !== "undefined" && performance.now() >= deadline) {
      if (typeof window !== "undefined" && "scheduler" in window && "yield" in window.scheduler) {
        await window.scheduler.yield();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return performance.now() + 50;
    }
    return deadline;
  }

  /**
   * Listing fee: 2% of listing price, minimum 1 chakra.
   */
  function computeListingFee(price) {
    const p = Math.max(0, Math.floor(Number(price) || 0));
    if (p <= 0) return 0;
    return Math.max(MARKET_FEES.listingFeeMin, Math.ceil((p * MARKET_FEES.listingFeePct) / 100));
  }

  /**
   * Sale tax: 5% deducted when sold.
   */
  function computeSaleTax(price) {
    const p = Math.max(0, Math.floor(Number(price) || 0));
    if (p <= 0) return 0;
    return Math.ceil((p * MARKET_FEES.saleTaxPct) / 100);
  }

  /**
   * Net chakra received after listing fee (2%, min 1) and sale tax (5%).
   */
  function computeNetProceeds(price) {
    const p = Math.max(0, Math.floor(Number(price) || 0));
    if (p <= 0) return 0;
    const fee = computeListingFee(p);
    const tax = computeSaleTax(p);
    return Math.max(0, p - fee - tax);
  }

  /**
   * Check whether an entry is blocked from market resale (sellBlock, boolean resaleLocked, or future resaleUntil).
   */
  function isResaleBlocked(entry, now = Date.now()) {
    if (!entry) return false;
    if (entry.sellBlock || entry.resaleLocked === true) return true;
    if (entry.resaleUntil) {
      const untilMs = Date.parse(entry.resaleUntil);
      if (Number.isFinite(untilMs) && untilMs > now) return true;
    }
    return false;
  }

  /**
   * Spare copies available to sell or recycle while keeping at least 1 copy for the album,
   * respecting server `listable`, `locked`, `resaleLocked`, `pinned`, and copies already listed.
   */
  function computeSpareCopies(entry, activeListedQty = 0) {
    if (!entry || entry.pinned || isResaleBlocked(entry)) return 0;
    const qty = Math.max(0, Math.floor(Number(entry.qty) || 0));
    if (qty < 2) return 0;
    const locked = Math.max(0, Math.floor(Number(entry.locked) || 0));
    const resaleLocked =
      typeof entry.resaleLocked === "number" ? Math.max(0, Math.floor(entry.resaleLocked)) : 0;
    const byFormula = Math.max(0, qty - locked - resaleLocked - 1);
    const serverListable =
      entry.listable !== undefined && entry.listable !== null
        ? Math.max(0, Math.min(qty - 1, Math.floor(Number(entry.listable))))
        : byFormula;
    const available = Math.min(byFormula, serverListable);
    return Math.max(0, available - Math.max(0, Math.floor(Number(activeListedQty) || 0)));
  }

  /**
   * Analyse la profondeur et la distribution des 20 offres les plus compétitives du marché.
   * Calcule le prix plancher compétitif, la médiane et la moyenne des 20 offres, et détecte les krachs boursiers (ex: Fairy Tail).
   * @param {Array<{price: number, status: string, endsAt?: string}>} listings
   * @param {number|null} referenceMedian
   * @returns {object} Statistiques live et diagnostic de krach
   */
  function computeLiveMarketDepth(listings, referenceMedian = null) {
    const activePrices = (Array.isArray(listings) ? listings : [])
      .filter((l) => l && (l.status === "active" || l.status === undefined) && (!l.endsAt || Date.parse(l.endsAt) > Date.now()))
      .map((l) => (typeof l === "number" ? l : Number(l.price)))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);

    if (activePrices.length === 0) {
      return {
        count: 0,
        lowestFixed: null,
        highestFixed: null,
        liveMedian20: null,
        liveAvg20: null,
        isCrashDetected: false,
        crashDiscountPct: 0,
        activePrices: []
      };
    }

    const count = activePrices.length;
    const lowestFixed = activePrices[0];
    const highestFixed = activePrices[count - 1];

    // Médiane des offres (jusqu'à 20 offres)
    const mid = Math.floor(count / 2);
    const liveMedian20 =
      count % 2 !== 0
        ? activePrices[mid]
        : Math.round((activePrices[mid - 1] + activePrices[mid]) / 2);

    // Moyenne des offres
    const sum = activePrices.reduce((acc, p) => acc + p, 0);
    const liveAvg20 = Math.round((sum / count) * 10) / 10;

    // Détection de krach : si le marché live est au moins 30% plus bas que la médiane 7j
    const isCrashDetected = Boolean(
      referenceMedian &&
      referenceMedian > 0 &&
      count >= 2 &&
      liveMedian20 <= referenceMedian * 0.70
    );

    const crashDiscountPct = referenceMedian && referenceMedian > 0
      ? Math.max(0, Math.round(((referenceMedian - liveMedian20) / referenceMedian) * 100))
      : 0;

    return {
      count,
      lowestFixed,
      highestFixed,
      liveMedian20,
      liveAvg20,
      isCrashDetected,
      crashDiscountPct,
      activePrices
    };
  }

  /**
   * Estimate probability of selling within 12h, 24h, 48h based on 7-day sales volume and price ratio to median.
   */
  function estimateSaleProbability(sales7d, price, median, lowestCompetition) {
    const vol = Number.isFinite(sales7d) && sales7d >= 0 ? sales7d : 0;
    const dailyRate = vol / 7;
    if (dailyRate <= 0) {
      return { p12h: 5, p24h: 10, p48h: 18, label: "Faible" };
    }
    let priceFactor = 1.0;
    if (Number.isFinite(lowestCompetition) && lowestCompetition > 0) {
      if (price < lowestCompetition) priceFactor = 1.35;
      else if (price === lowestCompetition) priceFactor = 1.1;
      else priceFactor = Math.max(0.25, lowestCompetition / price);
    } else if (Number.isFinite(median) && median > 0) {
      priceFactor = Math.max(0.25, Math.min(1.4, median / price));
    }
    const effectiveDaily = dailyRate * priceFactor;
    const prob = (days) => Math.round(Math.min(99, Math.max(5, (1 - Math.exp(-effectiveDaily * days)) * 100)));
    const p12h = prob(0.5);
    const p24h = prob(1.0);
    const p48h = prob(2.0);
    const label = p24h >= 75 ? "Élevée" : p24h >= 40 ? "Moyenne" : "Faible";
    return { p12h, p24h, p48h, label };
  }

  /**
   * Evaluate a duplicate card and decide whether it should be SOLD ("VENDRE") or RECYCLED ("RECYCLER"),
   * along with recommended prices for each strategy ("quick", "recent20_median", "recent20_avg", "flash", "balanced", "max") and liquidity score.
   */
  function evaluateDuplicate(card, collectionEntry, marketStats = {}, recycleMap = DEFAULT_RECYCLE_VALUES, settings = DEFAULT_SETTINGS, activeListedQty = 0, pinnedCardIds = null) {
    const charId = Number(card?.id ?? collectionEntry?.characterId);
    const rarity = card?.rarity || collectionEntry?.rarity || "C";
    const recycleValue = Number(recycleMap?.[rarity] ?? DEFAULT_RECYCLE_VALUES[rarity] ?? 1);
    const rarityFloor = Number(RARITY_PRICE_FLOORS[rarity] ?? 3);
    const spare = computeSpareCopies(collectionEntry, activeListedQty);

    const median7d = Number.isFinite(marketStats.median7d) && marketStats.median7d > 0 ? marketStats.median7d : null;
    const median30d = Number.isFinite(marketStats.median30d) && marketStats.median30d > 0 ? marketStats.median30d : null;
    const referenceMedian = median7d ?? median30d ?? null;
    const sales7d = Number.isFinite(marketStats.sales7d) && marketStats.sales7d >= 0 ? marketStats.sales7d : null;

    // Analyse du carnet d'ordres live (jusqu'à 20 offres les plus compétitives)
    const liveDepth = marketStats.liveDepth || (Array.isArray(marketStats.liveListings) ? computeLiveMarketDepth(marketStats.liveListings, referenceMedian) : null);
    const lowestFixed = Number.isFinite(liveDepth?.lowestFixed)
      ? liveDepth.lowestFixed
      : (Number.isFinite(marketStats.lowestFixed) && marketStats.lowestFixed > 0 ? marketStats.lowestFixed : null);
    const highestFixed = Number.isFinite(liveDepth?.highestFixed)
      ? liveDepth.highestFixed
      : (Number.isFinite(marketStats.highestFixed) && marketStats.highestFixed > 0 ? marketStats.highestFixed : null);
    const liveMedian20 = Number.isFinite(liveDepth?.liveMedian20) ? liveDepth.liveMedian20 : lowestFixed;
    const liveAvg20 = Number.isFinite(liveDepth?.liveAvg20) ? liveDepth.liveAvg20 : lowestFixed;

    // Détection de krach (ex: Fairy Tail en chute libre où la médiane 7j est obsolète)
    // Nécessite au moins 3 offres concordantes sur le marché pour éviter de confondre un krach avec une erreur de saisie d'un seul vendeur
    const isCrash = Boolean(liveDepth?.isCrashDetected);
    const crashDiscountPct = liveDepth?.crashDiscountPct || 0;

    const bestBuyOrder = Number.isFinite(marketStats.bestBuyOrder) && marketStats.bestBuyOrder > 0 ? marketStats.bestBuyOrder : null;

    // Price Trend / Momentum Detection (Spéculation HODL)
    const surgeThresholdPct = Number(settings?.speculateSurgeThresholdPct ?? 20);
    const trendPct = median7d && median30d ? Math.round(((median7d - median30d) / median30d) * 100) : 0;
    const isSurging = Boolean(
      median7d &&
      median30d &&
      trendPct >= surgeThresholdPct &&
      median7d - median30d >= 3 &&
      (sales7d ?? 0) >= 2
    );
    const priceTrend = !median7d || !median30d
      ? "stable"
      : trendPct >= 15
        ? "up"
        : trendPct <= -15
          ? "down"
          : "stable";

    // Pinned Card Protection (Favoris protégés)
    const isPinned = Boolean(
      collectionEntry?.pinned ||
      (pinnedCardIds && (pinnedCardIds instanceof Set ? pinnedCardIds.has(charId) : Array.isArray(pinnedCardIds) && pinnedCardIds.includes(charId)))
    );

    // Garde-fou dynamique :
    // Par défaut, ne jamais vendre sous 70% de la médiane 7j.
    // Si un krach boursier est détecté (Fairy Tail etc.) et que le garde-fou krach est actif,
    // on adapte le plancher à 85% de la médiane des 20 offres directes pour ne pas bloquer les cartes à un prix pré-krach invendable !
    const medianFloorPct = Math.max(30, Math.min(100, Number(settings?.autoSellMedianFloorPct ?? 70)));
    const baseMedianGuardFloor = referenceMedian ? Math.ceil((referenceMedian * medianFloorPct) / 100) : 0;
    const liveGuardFloor = liveMedian20 ? Math.ceil(liveMedian20 * 0.85) : (lowestFixed || 0);
    const effectiveGuardFloor = (isCrash && settings?.autoSellCrashProtection !== false && liveGuardFloor > 0)
      ? Math.min(baseMedianGuardFloor, liveGuardFloor)
      : baseMedianGuardFloor;

    const minSafePrice = Math.max(recycleValue + 1, rarityFloor, effectiveGuardFloor);

    // Calcul des prix selon chaque stratégie :
    // 1. Quick (-1 ◆ sous le plus bas ou match buy-order)
    let rawQuick = referenceMedian ?? rarityFloor;
    if (bestBuyOrder && referenceMedian && bestBuyOrder >= referenceMedian * 0.85) {
      rawQuick = bestBuyOrder;
    } else if (lowestFixed !== null) {
      rawQuick = Math.max(rarityFloor, lowestFixed - 1);
    } else if (referenceMedian !== null) {
      rawQuick = Math.max(rarityFloor, Math.round(referenceMedian * 0.95));
    }
    const quickPrice = Math.max(minSafePrice, Math.round(rawQuick));

    // 2. Recent 20 Median (médiane des 20 offres les plus compétitives)
    let rawRecent20Median = liveMedian20 !== null
      ? Math.max(rarityFloor, lowestFixed !== null ? Math.min(liveMedian20, lowestFixed - 1) : liveMedian20)
      : rawQuick;
    const recent20MedianPrice = Math.max(minSafePrice, Math.round(rawRecent20Median));

    // 3. Recent 20 Average (moyenne des 20 offres)
    let rawRecent20Avg = liveAvg20 !== null
      ? Math.max(rarityFloor, lowestFixed !== null ? Math.min(Math.round(liveAvg20), lowestFixed - 1) : Math.round(liveAvg20))
      : rawQuick;
    const recent20AvgPrice = Math.max(minSafePrice, Math.round(rawRecent20Avg));

    // 4. Flash Price (liquidité ultra-rapide au plus bas concurrentiel)
    let rawFlash = lowestFixed !== null ? Math.max(rarityFloor, lowestFixed - 1) : (bestBuyOrder || minSafePrice);
    const flashPrice = Math.max(recycleValue + 1, rarityFloor, Math.round(rawFlash));

    // 5. Balanced (médiane 7j standard)
    const rawBalanced = referenceMedian ?? lowestFixed ?? rarityFloor;
    const balancedPrice = Math.max(minSafePrice, Math.round(rawBalanced));

    // 6. Max (marge haute)
    const rawMax = highestFixed
      ? Math.min(highestFixed, referenceMedian ? Math.round(referenceMedian * 1.25) : highestFixed)
      : referenceMedian
        ? Math.round(referenceMedian * 1.15)
        : balancedPrice;
    const maxPrice = Math.max(balancedPrice, Math.round(rawMax));

    const strategy = settings?.autoSellStrategy || "quick";
    const recommendedPrice =
      strategy === "recent20_median"
        ? recent20MedianPrice
        : strategy === "recent20_avg"
          ? recent20AvgPrice
          : strategy === "flash"
            ? flashPrice
            : strategy === "max"
              ? maxPrice
              : strategy === "balanced"
                ? balancedPrice
                : quickPrice;

    const netProceeds = computeNetProceeds(recommendedPrice);
    const listingFee = computeListingFee(recommendedPrice);
    const saleTax = computeSaleTax(recommendedPrice);
    const netGainOverRecycle = netProceeds - recycleValue;

    const saleProb = estimateSaleProbability(sales7d, recommendedPrice, referenceMedian, lowestFixed);

    // Score 0-100 combinant 70% liquidité (sales7d) et 30% valeur nette
    const volScore = sales7d !== null ? Math.min(100, Math.round((Math.log10(sales7d + 1) / Math.log10(150)) * 100)) : 20;
    const priceScore = Math.min(100, Math.round((Math.log10(Math.max(1, netProceeds)) / Math.log10(1000)) * 100));
    const rawScore = Math.round(volScore * 0.7 + priceScore * 0.3);
    const score = sales7d === null ? Math.min(30, rawScore) : Math.max(0, Math.min(100, rawScore));

    // Verdict: VENDRE vs RECYCLER
    const minNetDiff = Number(settings?.autoSellMinNetOverRecycle ?? 2);
    const minSalesForLowMargin = Number(settings?.autoRecycleMinSales7dToKeepForSale ?? 2);
    const maxRecycleNet = Number(settings?.autoRecycleMaxMarketNet ?? 6);
    const allowedRecycleRarities = Array.isArray(settings?.autoRecycleRarities)
      ? settings.autoRecycleRarities
      : ["C", "U", "R", "E"];

    // 48h / 12h Sales Velocity Check (ne pas bloquer un créneau de 12h avec une carte lente)
    const velocityFirst = settings?.autoSellVelocityFirst !== false;
    const turboEnabled = settings?.autoSellTurboLiquidity !== false;
    const turboMaxNet = Number(settings?.autoSellTurboMaxNetProfit ?? 4);
    const minVelocity12h = Number(settings?.autoSellMinVelocity12hPct ?? 20);
    const estimatedSales48h = sales7d !== null ? Math.round(((sales7d / 7) * 2) * 10) / 10 : null;
    const isSlowMover = sales7d !== null && (sales7d < 3 || saleProb.p12h < minVelocity12h);

    let verdict = "VENDRE";
    let verdictReason = `Net ${netProceeds} ◆ (+${netGainOverRecycle} ◆ vs recyclage ${recycleValue} ◆)`;

    if (isPinned) {
      verdict = "PROTÉGÉ";
      verdictReason = "Carte favorite protégée (exclue de l'auto-vente et de l'auto-recyclage)";
    } else if (isSurging && settings?.speculateHoldSurging !== false) {
      verdict = "CONSERVER";
      verdictReason = `📈 En forte hausse (+${trendPct}% sur 7j vs 30j) · Conservation conseillée pour vente ultérieure au pic`;
    } else if (referenceMedian === null && lowestFixed === null) {
      verdict = "ATTENDRE";
      verdictReason = "Prix de marché inconnu (aucune médiane ni annonce)";
    } else if (rarity === "L" && settings?.autoSellIncludeL !== false) {
      // Les Légendaires en surplus doivent TOUJOURS être mises en vente (valeur 100+ ◆) sans blocage de vélocité
      verdict = "VENDRE";
      verdictReason = `Légendaire en surplus : mise en vente conseillée à ${recommendedPrice} ◆ (net ${netProceeds} ◆)`;
    } else if (turboEnabled && (rarity === "C" || rarity === "U") && netGainOverRecycle <= turboMaxNet) {
      // Turbo Liquidité : désengorge les 10 créneaux face aux 70 cartes en attente
      verdict = "RECYCLER";
      verdictReason = `⚡ Turbo Liquidité : gain modeste (+${netGainOverRecycle} ◆ net, ~${estimatedSales48h ?? 0} vte/48h) · Recyclage immédiat (+${recycleValue} ◆) pour libérer les 10 créneaux`;
    } else if (turboEnabled && isSlowMover && (rarity === "C" || rarity === "U" || netProceeds <= 15)) {
      verdict = "RECYCLER";
      verdictReason = `⚡ Turbo Liquidité : vente trop lente (~${estimatedSales48h ?? 0} vte/48h) · Recyclage ${recycleValue} ◆ conseillé pour rotation rapide`;
    } else if (isCrash && strategy === "flash" && netGainOverRecycle >= minNetDiff) {
      verdict = "VENDRE";
      verdictReason = `⚡ Vente Flash Krach (-${crashDiscountPct}% vs 7j) : placé à ${recommendedPrice} ◆ (-1 sous min ${lowestFixed} ◆) · Net ${netProceeds} ◆ (+${netGainOverRecycle} ◆ vs recyclage)`;
    } else if (isCrash && netGainOverRecycle < minNetDiff) {
      verdict = "RECYCLER";
      verdictReason = `Krach boursier (${lowestFixed} ◆) : vente nette (${netProceeds} ◆) trop proche du recyclage (${recycleValue} ◆)`;
    } else if (velocityFirst && isSlowMover && (rarity === "C" || rarity === "U" || netProceeds <= 15)) {
      // Communes / Peu communes ou cartes à faible marge trop lentes : recycler immédiatement pour libérer les 10 créneaux
      verdict = "RECYCLER";
      verdictReason = `Vente stagnante pour une ${RARITY_LABELS[rarity] || rarity} (~${estimatedSales48h ?? 0} vte/48h) · Recyclage ${recycleValue} ◆ conseillé pour libérer les 10 créneaux`;
    } else if (velocityFirst && isSlowMover && netProceeds > 15 && rarity !== "L") {
      verdict = "ATTENDRE";
      verdictReason = `Vente lente sur 12h-48h (${saleProb.p12h}% probabilité 12h) · Évite de saturer l'un des 10 créneaux`;
    } else if (netGainOverRecycle < minNetDiff) {
      verdict = "RECYCLER";
      verdictReason = `Rentabilité faible : net ${netProceeds} ◆ vs recyclage immédiat ${recycleValue} ◆`;
    } else if (
      netProceeds <= maxRecycleNet &&
      sales7d !== null &&
      sales7d < minSalesForLowMargin
    ) {
      verdict = "RECYCLER";
      verdictReason = `Trop peu liquide (${sales7d} vente(s)/7j) pour un gain net de ${netProceeds} ◆`;
    } else if (
      lowestFixed !== null &&
      lowestFixed <= rarityFloor &&
      referenceMedian !== null &&
      referenceMedian <= rarityFloor + 1 &&
      sales7d !== null &&
      sales7d < 5
    ) {
      verdict = "RECYCLER";
      verdictReason = `Marché saturé au prix plancher (${lowestFixed} ◆) · recyclage ${recycleValue} ◆ conseillé`;
    }

    // Protect L/M from auto-recycle unless explicitly allowed in autoRecycleRarities
    const canAutoRecycle =
      verdict === "RECYCLER" &&
      !isPinned &&
      spare > 0 &&
      allowedRecycleRarities.includes(rarity);

    const canAutoSell =
      verdict === "VENDRE" &&
      !isPinned &&
      spare > 0 &&
      (rarity !== "L" || settings?.autoSellIncludeL !== false) &&
      (rarity !== "M" || Boolean(settings?.autoSellIncludeM));

    const hourlyExpectedChakra = Math.round(((netProceeds * (saleProb.p12h / 100)) / 12) * 100) / 100;

    const pedagogy = {
      decision: verdict,
      title: verdict === "VENDRE"
        ? `Vendre à ${recommendedPrice} ◆ (net ${netProceeds} ◆)`
        : verdict === "RECYCLER"
          ? `Recycler immédiatement (+${recycleValue} ◆)`
          : verdict === "CONSERVER"
            ? "Conserver dans la collection (HODL)"
            : verdict === "PROTÉGÉ"
              ? "Carte favorite protégée"
              : "Attendre une opportunité de marché",
      why: verdictReason,
      delayEstimate: saleProb.p12h >= 75 ? "< 3 heures" : saleProb.p12h >= 40 ? "4 à 12 heures" : "> 12 heures",
      gainAnalysis: `Gain net : ${netProceeds} ◆ (frais annonce : ${listingFee} ◆ · taxe : ${saleTax} ◆) · Écart vs recyclage : +${netGainOverRecycle} ◆`,
      competition: lowestFixed !== null ? `Min actuel : ${lowestFixed} ◆ · Médiane 20 : ${liveMedian20 ?? "—"} ◆ · Moyenne 20 : ${liveAvg20 ?? "—"} ◆` : "Aucune offre concurrente active",
      isCrash: Boolean(isCrash),
      crashDiscountPct,
      hourlyExpectedChakra
    };

    return {
      characterId: charId,
      name: card?.name || `Carte #${charId}`,
      series: card?.series || "Série inconnue",
      rarity,
      qty: collectionEntry?.qty ?? 0,
      spare,
      activeListedQty,
      pinned: isPinned,
      isSurging,
      priceTrend,
      trendPct,
      sellBlock: collectionEntry?.sellBlock || null,
      resaleUntil: collectionEntry?.resaleUntil || null,
      median7d,
      median30d,
      referenceMedian,
      sales7d,
      estimatedSales48h,
      isSlowMover,
      lowestFixed,
      highestFixed,
      liveMedian20,
      liveAvg20,
      liveDepth,
      isCrash,
      crashDiscountPct,
      strategy,
      bestBuyOrder,
      recycleValue,
      prices: {
        quick: quickPrice,
        recent20Median: recent20MedianPrice,
        recent20Avg: recent20AvgPrice,
        flash: flashPrice,
        balanced: balancedPrice,
        max: maxPrice,
        recommended: recommendedPrice,
        minSafe: minSafePrice
      },
      fees: {
        listingFee,
        saleTax,
        netProceeds,
        netGainOverRecycle
      },
      saleProb,
      hourlyExpectedChakra,
      score,
      verdict,
      verdictReason,
      pedagogy,
      canAutoSell,
      canAutoRecycle
    };
  }

  /**
   * Evaluate a market listing to detect profitable flips (Achat-Revente) and missing collection deals.
   */
  function evaluateDeal(listing, ownedSet, settings = DEFAULT_SETTINGS) {
    if (!listing || listing.status !== "active" || listing.isMine) return null;
    const endsAtMs = listing.endsAt ? Date.parse(listing.endsAt) : Infinity;
    if (Number.isFinite(endsAtMs) && endsAtMs <= Date.now()) return null;

    const buyPrice =
      listing.type === "fixed"
        ? listing.price
        : Number.isFinite(listing.buyoutPrice) && listing.buyoutPrice > 0
          ? listing.buyoutPrice
          : null;
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) return null;

    const char = listing.character || {};
    const characterId = Number(char.id ?? listing.characterId);
    const isMissing = ownedSet ? !ownedSet.has(characterId) : false;

    const prices = listing.prices || {};
    const median7d = Number.isFinite(prices.median7d) && prices.median7d > 0 ? prices.median7d : null;
    const median30d = Number.isFinite(prices.median30d) && prices.median30d > 0 ? prices.median30d : null;
    const refMedian = median7d ?? median30d ?? null;
    const sales7d = Number.isFinite(prices.sales7d) && prices.sales7d >= 0 ? prices.sales7d : 0;

    if (!refMedian || refMedian <= 0) {
      return {
        listingId: listing.id,
        characterId,
        name: char.name || `Carte #${characterId}`,
        series: char.series || "",
        rarity: char.rarity || "C",
        type: listing.type,
        buyPrice,
        refMedian: null,
        sales7d,
        discountPct: 0,
        targetResalePrice: null,
        netResale: null,
        flipProfit: null,
        roiPct: null,
        isMissing,
        isGoodFlip: false,
        isGoodMissingBuy: Boolean(isMissing && buyPrice <= (settings?.autoBuyMissingMaxPrice ?? 25))
      };
    }

    const discountPct = Math.round(((refMedian - buyPrice) / refMedian) * 100);
    // Target resale at 98% of reference median (to sell fast)
    const targetResalePrice = Math.max(buyPrice + 1, Math.round(refMedian * 0.98));
    const netResale = computeNetProceeds(targetResalePrice);
    const flipProfit = netResale - buyPrice;
    const roiPct = Math.round((flipProfit / buyPrice) * 100);

    const minDiscount = Number(settings?.autoBuyMinDiscountPct ?? 28);
    const minProfit = Number(settings?.autoBuyMinFlipProfit ?? 15);
    const minSales = Number(settings?.autoBuyMinSales7d ?? 4);
    const maxUnit = Number(settings?.autoBuyMaxUnitPrice ?? 400);

    const isGoodFlip =
      discountPct >= minDiscount &&
      flipProfit >= minProfit &&
      sales7d >= minSales &&
      buyPrice <= maxUnit;

    const isGoodMissingBuy =
      isMissing &&
      buyPrice <= Number(settings?.autoBuyMissingMaxPrice ?? 25) &&
      discountPct >= 0;

    return {
      listingId: listing.id,
      characterId,
      name: char.name || `Carte #${characterId}`,
      series: char.series || "",
      rarity: char.rarity || "C",
      seller: listing.seller?.pseudo || "?",
      type: listing.type,
      buyPrice,
      refMedian,
      sales7d,
      discountPct,
      targetResalePrice,
      netResale,
      flipProfit,
      roiPct,
      isMissing,
      isGoodFlip,
      isGoodMissingBuy
    };
  }

  /**
   * Compute exact booster recommendation metrics for a pack given:
   * - pack object from `GET /api/packs`
   * - packCharIds from `GET /api/packs/:id/characters`
   * - catalogById Map(id -> character)
   * - ownedSet Set(characterId)
   * - rarityAvgPrices object { C, U, R, E, L, M }
   * - config from `GET /api/config`
   * - me from `GET /api/me`
   * - packState from `GET /api/me/packs`
   */
  function evaluateBoosterPack(pack, packCharIds, catalogById, ownedSet, rarityAvgPrices = {}, config = {}, me = null, packState = null) {
    const poolIds = Array.isArray(packCharIds) ? packCharIds.map(Number).filter(Number.isFinite) : [];
    const totalByRarity = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
    const missingByRarity = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };

    for (const id of poolIds) {
      const ch = catalogById?.get(id);
      const r = ch?.rarity;
      if (r && RARITIES.includes(r)) {
        totalByRarity[r] += 1;
        if (!ownedSet?.has(id)) {
          missingByRarity[r] += 1;
        }
      }
    }

    // Fallback if packCharIds wasn't loaded yet: use pack.rates.cardsByRarity + catalog completion estimate
    const cardsByRarity = pack?.rates?.cardsByRarity || {};
    if (poolIds.length === 0) {
      const catTotal = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
      const catOwned = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
      if (catalogById && catalogById.size > 0) {
        for (const [cid, ch] of catalogById.entries()) {
          if (ch?.rarity && RARITIES.includes(ch.rarity)) {
            catTotal[ch.rarity] += 1;
            if (ownedSet?.has(cid)) catOwned[ch.rarity] += 1;
          }
        }
      }
      for (const r of RARITIES) {
        if (totalByRarity[r] === 0 && Number.isFinite(cardsByRarity[r]) && cardsByRarity[r] > 0) {
          totalByRarity[r] = Number(cardsByRarity[r]);
          const ownedRatio = catTotal[r] > 0 ? catOwned[r] / catTotal[r] : 0;
          const estOwned = Math.min(totalByRarity[r], Math.round(totalByRarity[r] * ownedRatio));
          missingByRarity[r] = Math.max(0, totalByRarity[r] - estOwned);
        }
      }
    } else {
      for (const r of RARITIES) {
        if (totalByRarity[r] === 0 && Number.isFinite(cardsByRarity[r]) && cardsByRarity[r] > 0) {
          totalByRarity[r] = Number(cardsByRarity[r]);
        }
      }
    }

    const totalPool = Object.values(totalByRarity).reduce((a, b) => a + b, 0);
    const totalMissing = Object.values(missingByRarity).reduce((a, b) => a + b, 0);
    const completionPct = totalPool > 0 ? Math.round(((totalPool - totalMissing) / totalPool) * 1000) / 10 : 0;

    // Featured (rateUp) handling
    const featuredIds = new Set((pack?.rateUp?.characterIds || []).map(Number));
    const featuredRarities = new Set(pack?.rateUp?.rarities || []);
    const featuredShare = featuredRarities.size > 0 ? Math.min(1, Math.max(0, Number(pack?.rateUp?.share) || 0)) : 0;

    const missingFeaturedByRarity = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
    const totalFeaturedByRarity = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
    for (const fid of featuredIds) {
      const ch = catalogById?.get(fid);
      if (ch && RARITIES.includes(ch.rarity)) {
        totalFeaturedByRarity[ch.rarity] += 1;
        if (!ownedSet?.has(fid)) missingFeaturedByRarity[ch.rarity] += 1;
      }
    }

    // Helper: given a slot list, compute expected new cards, prob of >=1 new card, and expected chakra value
    const computeForSlots = (slots) => {
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

    const normalStats = computeForSlots(pack?.rates?.slots || []);
    const goldenEvery = Number(config?.golden?.every) || 10;
    const goldenSlots = pack?.goldenEligible ? pack?.rates?.golden?.slots : null;
    const gWeight = goldenSlots && goldenEvery > 0 ? 1 / goldenEvery : 0;
    const goldenStats = goldenSlots ? computeForSlots(goldenSlots) : normalStats;

    const expectedNewCards = normalStats.expectedNew * (1 - gWeight) + goldenStats.expectedNew * gWeight;
    const probAtLeastOneNewPct =
      normalStats.probAtLeastOneNew * (1 - gWeight) + goldenStats.probAtLeastOneNew * gWeight;
    const expectedChakraValue =
      normalStats.expectedValue * (1 - gWeight) + goldenStats.expectedValue * gWeight;

    // Availability & Free openings check
    const now = Date.now();
    const inSchedule =
      !pack?.schedule ||
      (now >= Date.parse(pack.schedule.start) && now < Date.parse(pack.schedule.end));
    const granted = Number(me?.grants?.[pack?.id] ?? 0);
    const usesFree = pack?.usesFreePacks ?? pack?.price === 0;
    const freeLeft = usesFree ? Number(me?.freePacks ?? 0) + Number(me?.bonusPacks ?? 0) : 0;
    const dailyLeft = pack?.limit ? Number(packState?.limits?.[pack.id]?.left ?? pack.limit.perDay) : null;
    const chakraPrice = Number(pack?.chakraPrice ?? (pack?.price || 150));

    const openableFreeCount =
      !inSchedule || (pack?.grantOnly && granted <= 0) || (dailyLeft !== null && dailyLeft <= 0)
        ? 0
        : dailyLeft !== null
          ? Math.min(dailyLeft, granted + freeLeft)
          : granted + freeLeft;

    const canOpenNow =
      inSchedule &&
      (!pack?.grantOnly || granted > 0) &&
      (dailyLeft === null || dailyLeft > 0) &&
      openableFreeCount > 0;

    return {
      packId: pack?.id,
      name: pack?.name || pack?.id,
      sub: pack?.sub || "",
      usesFreePacks: Boolean(usesFree),
      chakraPrice,
      granted,
      openableFreeCount,
      dailyLeft,
      canOpenNow,
      inSchedule,
      totalPool,
      totalMissing,
      completionPct,
      missingByRarity,
      totalByRarity,
      expectedNewCards: Math.round(expectedNewCards * 1000) / 1000,
      probAtLeastOneNewPct: Math.round(probAtLeastOneNewPct * 10) / 10,
      expectedChakraValue: Math.round(expectedChakraValue * 10) / 10,
      evReturnPct: chakraPrice > 0 ? Math.round((expectedChakraValue / chakraPrice) * 100) : null
    };
  }

  /**
   * Rank all packs to recommend the best booster to open for new characters (and EV).
   */
  function rankBoostersForCollection(packs, packPools, catalogById, ownedSet, rarityAvgPrices = {}, config = {}, me = null, packState = null, settings = DEFAULT_SETTINGS) {
    const evaluated = (Array.isArray(packs) ? packs : []).map((pack) =>
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

    // Pity Sniper: if player is within 10 pulls of guaranteed Mythic (pity >= 240/250)
    const pity = Number(me?.pity ?? 0);
    const isPityNear = pity >= 240;
    let recommendedPity = null;

    if (isPityNear) {
      const candidates = evaluated.filter((p) => p.canOpenNow && (p.totalByRarity?.M || 0) > 0);
      candidates.sort((a, b) => {
        const missM = (b.missingByRarity?.M || 0) - (a.missingByRarity?.M || 0);
        if (missM !== 0) return missM;
        const totalM = (b.totalByRarity?.M || 0) - (a.totalByRarity?.M || 0);
        if (totalM !== 0) return totalM;
        return (b.expectedChakraValue || 0) - (a.expectedChakraValue || 0);
      });
      recommendedPity = candidates[0] || null;
    }

    // Filter openable packs first, sort by expectedNewCards descending (or EV if tied)
    const sortedByNew = [...evaluated].sort((a, b) => {
      if (Number(b.canOpenNow) !== Number(a.canOpenNow)) return Number(b.canOpenNow) - Number(a.canOpenNow);
      if (Number(b.usesFreePacks || b.granted > 0) !== Number(a.usesFreePacks || a.granted > 0)) {
        return Number(b.usesFreePacks || b.granted > 0) - Number(a.usesFreePacks || a.granted > 0);
      }
      if (b.expectedNewCards !== a.expectedNewCards) return b.expectedNewCards - a.expectedNewCards;
      return b.expectedChakraValue - a.expectedChakraValue;
    });

    const sortedByEv = [...evaluated].sort((a, b) => {
      if (Number(b.canOpenNow) !== Number(a.canOpenNow)) return Number(b.canOpenNow) - Number(a.canOpenNow);
      if (Number(b.usesFreePacks || b.granted > 0) !== Number(a.usesFreePacks || a.granted > 0)) {
        return Number(b.usesFreePacks || b.granted > 0) - Number(a.usesFreePacks || a.granted > 0);
      }
      return b.expectedChakraValue - a.expectedChakraValue;
    });

    // If Pity Sniper is active and we are near guaranteed Mythic, prioritize the pack with the best Mythic pool
    const activeRecommendedNew =
      isPityNear && recommendedPity && settings?.autoOpenPitySniper !== false
        ? recommendedPity
        : sortedByNew[0] || null;

    return {
      all: sortedByNew,
      recommendedNew: activeRecommendedNew,
      recommendedEv: sortedByEv[0] || null,
      recommendedPity,
      isPityNear,
      pityCount: pity
    };
  }

  /**
   * Génère la sélection des cartes suggérées pour l'onglet « Mes envies » (Wishlist) :
   * Priorise les cartes manquantes dont l'album est presque complété (≥70%), à prix abordable et avec liquidité active.
   */
  function generateDailyWishlist(catalogById, ownedSet, collectionPrices = new Map(), limit = 20) {
    if (!catalogById) {
      return [];
    }

    const entries = catalogById instanceof Map
      ? Array.from(catalogById.entries())
      : typeof catalogById === "object"
        ? Object.entries(catalogById)
        : [];

    if (!entries.length) return [];

    // 1. Calcul de complétion par série
    const seriesStats = new Map();
    for (const [id, card] of entries) {
      const s = card?.series || "Autre";
      if (!seriesStats.has(s)) {
        seriesStats.set(s, { total: 0, owned: 0 });
      }
      const st = seriesStats.get(s);
      st.total += 1;
      if (ownedSet && (ownedSet instanceof Set ? ownedSet.has(Number(id)) : Array.isArray(ownedSet) && ownedSet.includes(Number(id)))) {
        st.owned += 1;
      }
    }

    // 2. Évaluation des cartes manquantes
    const missingCandidates = [];
    for (const [id, card] of entries) {
      const numId = Number(id);
      if (ownedSet && (ownedSet instanceof Set ? ownedSet.has(numId) : Array.isArray(ownedSet) && ownedSet.includes(numId))) {
        continue; // Ne suggérer que des cartes non possédées
      }

      const rarity = card?.rarity || "C";
      const s = card?.series || "Autre";
      const st = seriesStats.get(s);
      const completionPct = st && st.total > 0 ? (st.owned / st.total) * 100 : 0;

      const priceData = collectionPrices instanceof Map ? collectionPrices.get(numId) : collectionPrices?.[numId];
      const median7d = Number.isFinite(priceData?.median7d) ? priceData.median7d : Number(RARITY_PRICE_FLOORS[rarity] ?? 5);
      const sales7d = Number.isFinite(priceData?.sales7d) ? priceData.sales7d : 0;

      // Score composite :
      // - 40% avancement de l'album de la série
      // - 40% accessibilité du prix (les cartes à 5-30 ◆ sont plus prioritaires que 800 ◆)
      // - 20% liquidité du marché
      const affordabilityScore = Math.max(0, 100 - Math.min(100, median7d));
      const liquidityScore = Math.min(100, sales7d * 10);
      const score = Math.round((completionPct * 0.4) + (affordabilityScore * 0.4) + (liquidityScore * 0.2));

      missingCandidates.push({
        characterId: numId,
        name: card?.name || `Carte #${numId}`,
        series: s,
        rarity,
        median7d,
        sales7d,
        seriesCompletionPct: Math.round(completionPct),
        suggestedBudget: Math.max(Number(RARITY_PRICE_FLOORS[rarity] ?? 3), Math.round(median7d * 0.9)),
        score
      });
    }

    missingCandidates.sort((a, b) => b.score - a.score);
    return missingCandidates.slice(0, limit);
  }

  /**
   * Évalue si une annonce du marché correspond à une envie (Wishlist) et si elle est abordable.
   */
  function evaluateWishlistMatch(wishItem, listing, userChakra = 0, reserve = 0) {
    if (!wishItem || !listing) return null;
    const wishCharId = Number(wishItem.characterId || wishItem.id);
    const listingCharId = Number(listing.character?.id ?? listing.characterId);
    if (wishCharId !== listingCharId) return null;

    const buyPrice = listing.type === "fixed"
      ? Number(listing.price)
      : Number.isFinite(listing.buyoutPrice) && listing.buyoutPrice > 0
        ? Number(listing.buyoutPrice)
        : Number(listing.price);

    const maxBudget = Number(wishItem.maxBudget || wishItem.budget || Infinity);
    const isUnderBudget = buyPrice <= maxBudget;
    const canAfford = userChakra >= buyPrice + reserve;
    const savings = maxBudget !== Infinity ? Math.max(0, maxBudget - buyPrice) : 0;

    return {
      matches: true,
      listingId: listing.id,
      characterId: wishCharId,
      name: wishItem.name || listing.character?.name || `Carte #${wishCharId}`,
      series: wishItem.series || listing.character?.series || "",
      rarity: wishItem.rarity || listing.character?.rarity || "C",
      buyPrice,
      maxBudget,
      isUnderBudget,
      canAfford,
      savings,
      shouldAutoBuy: Boolean(wishItem.autoBuy && isUnderBudget && canAfford)
    };
  }

  const api = {
    RARITIES,
    RARITY_LABELS,
    DEFAULT_RECYCLE_VALUES,
    RARITY_PRICE_FLOORS,
    MARKET_FEES,
    DEFAULT_SETTINGS,
    yieldIfNeeded,
    computeListingFee,
    computeSaleTax,
    computeNetProceeds,
    computeSpareCopies,
    computeLiveMarketDepth,
    estimateSaleProbability,
    evaluateDuplicate,
    evaluateDeal,
    generateDailyWishlist,
    evaluateWishlistMatch,
    evaluateBoosterPack,
    rankBoostersForCollection
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KyaraAnalytics = api;
  }
})(globalThis);
