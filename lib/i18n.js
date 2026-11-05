(function () {
  "use strict";

  const TRANSLATIONS = {
    fr: {
      brandTitle: "KYARA MANAGER",
      accountStatusDefault: "Synchronisation avec kyara.games…",
      accountStatusConnected: "{pseudo} · {owned}/{total} cartes ({pct}%)",
      refresh: "Actualiser",
      openKyara: "Ouvrir kyara.games",
      connectionBannerText: "Connexion à kyara.games…",

      // KPIs
      kpiChakra: "CHAKRA",
      kpiBoosters: "BOOSTERS",
      kpiMarket: "MARCHÉ ACTIF",
      kpiPity: "PITIÉ MYTHIQUE",

      // Tabs
      tabAutopilot: "Pilote",
      tabDuplicates: "Doublons",
      tabMarket: "Marché",
      tabWishlist: "Envies",
      tabBoosters: "Boosters",
      tabSettings: "Réglages",
      btnFullscreen: "Plein écran",

      // Autopilot
      heroTitle: "Pilote Automatique Global",
      heroDesc: "Orchestration en continu : vente des doublons, recyclage des cartes sous-cotées, scans d'arbitrage et ouverture live.",
      runCycleNow: "Lancer un cycle maintenant",
      dryRunPill: "Mode Simulation",
      statusActive: "PILOTE ACTIF",
      statusIdle: "PILOTE EN VEILLE",

      // Modules
      modSellTitle: "Auto-Vente des doublons",
      modSellDesc: "Remplit tes 10 emplacements dès qu'une carte est vendue.",
      modRecycleTitle: "Auto-Recyclage intelligent",
      modRecycleDesc: "Convertit en Chakra les doublons au prix plancher (garde ≥1 copie).",
      modBoostersTitle: "Ouverture Live des Boosters",
      modBoostersDesc: "Pilote l'interface d'ouverture en direct sur le booster #1 conseillé.",
      modMarketTitle: "Achat-Revente (Flip Marché)",
      modMarketDesc: "Achète les annonces sous-cotées rentables après taxe (5% + 2%).",
      modBuyMissing: "Acheter aussi les personnages manquants à bas prix",
      modMissionsTitle: "Auto-Missions",
      modAntiAfkTitle: "Anti-AFK",
      sellNow: "Vendre maintenant",
      recycleNow: "Recycler maintenant",
      openLive: "Ouvrir en live",
      openLiveFree: "Ouvrir en live (Gratuit)",
      noFreeReady: "0 gratuit prêt",
      potentialNet: "Potentiel net : ",
      recyclable: "Recyclable : ",
      recommended: "Conseillé : ",
      copiesCount: "{n} copie(s)",

      // ROI Dashboard
      roiTitle: "Tableau de bord des gains (ROI)",
      roiSubtitle: "Gains nets cumulés générés par Kyara Manager",
      roiTotalChakra: "CHAKRA TOTAL GÉNÉRÉ",
      roiSales: "VENTES MARCHÉ",
      roiRecycle: "RECYCLAGES",
      roiBoosters: "BOOSTERS GRATUITS",
      reset: "Reset",
      soldStat: "{n} vendue(s) · +{amount}",
      recycledStat: "{n} recyclée(s) · +{amount}",
      boostersStat: "{opened} ouverts · {rares} L/M",

      // Pity Sniper
      pityImminent: "Pitié Mythique imminente ({count}/250) !",
      pityDescAutopilot: "Cible prioritaire optimisée : {target} (maximise les chances de nouveau Mythique).",
      pityDescBoosters: "Cible prioritaire optimisée : {target}. Ouvre ce booster pour maximiser tes chances d'obtenir un Mythique non possédé !",

      // Journal
      journalTitle: "Journal d'activité en direct",
      clear: "Effacer",
      journalEmpty: "Aucune opération enregistrée.",

      // Duplicates Tab
      dupSummarySell: "Conseillés à vendre",
      dupSummaryRecycle: "Conseillés à recycler",
      turboBannerTitle: "⚡ Mode Turbo Liquidité actif",
      turboBannerDesc: "{n} carte(s) à rotation lente ou faible marge identifiée(s).",
      btnBulkRecycle: "⚡ Vider la file ({n} cartes · +{chakra} ◆)",
      searchPlaceholder: "Nom, série ou rareté (C, U, R, E, L, M)…",
      filterAll: "Tous",
      filterSell: "À Vendre",
      filterRecycle: "À Recycler",
      filterHold: "En Hausse (Conserver)",
      filterProtected: "Protégés / Favoris",
      thCharacter: "Personnage",
      thSpare: "Surplus",
      thMedian7d: "Médiane 7j",
      thPriceNet: "Prix (Net)",
      thRecycle: "Recyclage",
      thDecision: "Décision",
      thProtect: "Protéger",
      noDuplicates: "Aucun doublon correspondant aux critères.",
      activeListingsTitle: "Annonces actives sur le marché",
      thPrice: "Prix",
      thExpires: "Expire",
      thAction: "Action",
      btnCancel: "Retirer",
      btnSell: "Vendre",
      btnRecycleCount: "Recycler ×{n}",
      noActiveListings: "Aucune annonce en cours.",
      pinTooltipProtect: "Protéger (ne jamais vendre ni recycler)",
      pinTooltipUnprotect: "Déprotéger cette carte",
      surgeTooltip: "+{pct}% vs médiane 30j",

      // Verdicts
      verdict: {
        VENDRE: "VENDRE",
        RECYCLER: "RECYCLER",
        CONSERVER: "CONSERVER",
        PROTÉGÉ: "PROTÉGÉ",
        ATTENDRE: "ATTENDRE"
      },

      // Market Tab
      btnScanDeals: "Scanner les annonces",
      filterAllDeals: "Toutes les opportunités",
      filterFlipsOnly: "Flips rentables uniquement",
      filterMissingOnly: "Cartes manquantes uniquement",
      thCard: "Carte",
      thBuy: "Achat",
      thResale: "Revente",
      thNetMargin: "Marge nette",
      btnBuy: "Acheter",
      noDeals: "Lance un scan pour analyser les annonces actives du marché.",

      // Wishlist Tab (Mes envies)
      wishlistTitle: "Mes Envies de Collection",
      wishlistDesc: "Suivi ciblé des personnages convoités. Alertes live et auto-achat dès qu'une offre respecte votre budget.",
      wishlistSearchPlaceholder: "Ajouter un personnage aux envies…",
      wishlistBudgetLabel: "Budget max (◆)",
      wishlistBtnAdd: "Ajouter aux envies",
      wishlistEmpty: "Aucune carte dans vos envies. Cherchez un personnage ci-dessus pour l'ajouter !",
      wishlistDailySuggestions: "Suggestions intelligentes du jour (séries avancées & bons plans)",
      wishlistTagMatch: "ENVIE !",
      thWishCharacter: "Personnage",
      thWishRarity: "Rareté",
      thWishFloor: "Marché Min",
      thWishBudget: "Mon Budget",
      thWishStatus: "État",
      thWishAction: "Action",
      wishStatusAvailable: "Disponible !",
      wishStatusOverBudget: "Trop cher",
      wishStatusNone: "Aucune offre",

      // Boosters Tab
      recTagNew: "Recommandation #1 · Collection",
      recTagEv: "Recommandation #2 · Rentabilité Chakra",
      probAtLeastOneNew: "P(≥1 nouv.) : {prob}%",
      expectedNewPerPack: "E[Nouv.] : {exp}/booster",
      freeCountTag: "Gratuits : {n}",
      missingCountTag: "Manquants : {n}",
      openRec1Btn: "Ouvrir ×1 en live (Gratuit)",
      openRecMaxBtn: "Ouvrir max en live (×{n})",
      rechargeNotice: "0 gratuit (Recharge…)",
      maxUnavailable: "Max indisponible",
      allPacksTitle: "Tous les boosters du jeu",
      thPack: "Booster",
      thCompletion: "Complétion",
      thProbNew: "P(≥1 nouv.)",
      thExpectedNew: "E[Nouv.]",
      thExpectedChakra: "EV ◆",
      thLive: "Live",

      // Settings Tab
      groupAutoSell: "売 · Auto-Vente",
      priceStrategyLabel: "Stratégie de prix",
      optStrategyQuick: "Vente rapide (-1 ◆ sous le min)",
      optStrategyBalanced: "Équilibré (médiane 7j)",
      optStrategyMax: "Marge haute (+15% médiane)",
      maxListingsLabel: "Emplacements max utilisés (1–10)",
      minNetGainLabel: "Gain net min au-dessus du recyclage (◆)",
      sellDurationLabel: "Durée des annonces",
      opt12h: "12 heures",
      opt24h: "24 heures",
      opt48h: "48 heures",
      guardrail70Label: "Garde-fou 70% de la médiane 7j (anti-bradage)",
      velocityCheckLabel: "Vélocité rapide (48h) : ne lister que les cartes vendables en 12h",
      relistExpiredLabel: "Retirer et relister les annonces expirées",
      holdSurgingLabel: "Conserver les cartes en forte hausse de prix (+20% vs 30j)",
      surgeThresholdLabel: "Seuil de hausse pour conservation (%)",

      groupAutoRecycle: "転 · Auto-Recyclage",
      keepCopiesLabel: "Exemplaires toujours conservés",
      recycleMaxMarketLabel: "Seuil net max pour recycler si peu liquide (◆)",
      raritiesLabel: "Raretés :",

      groupMarketFlip: "市 · Achat-Revente (Flip)",
      buyReserveLabel: "Réserve minimale de Chakra (◆)",
      buyMaxPriceLabel: "Prix d'achat max unitaire (◆)",
      buyMinProfitLabel: "Marge nette minimale après taxes (◆)",
      buyMinDiscountLabel: "Décote minimale sous médiane 7j (%)",
      buyMinSales7dLabel: "Ventes 7j minimum (liquidité)",

      groupBoostersSettings: "札 · Ouverture Live des Boosters",
      openModeLabel: "Cible d'ouverture",
      optModeNew: "Booster #1 Nouveaux Personnages",
      optModeEv: "Booster #1 Rentabilité Chakra (EV)",
      openMinBatchLabel: "Ouvrir dès que N boosters gratuits sont prêts",
      pitySniperLabel: "Pity Sniper (cibler le pack avec les meilleurs Mythiques à pitié ≥ 240)",
      dailyPackLabel: "Pack Journalier Gratuit (réclamer chaque jour sans toucher au Chakra)",

      groupSystem: "守 · Système & Cadence",
      loopIntervalLabel: "Intervalle du cycle auto (secondes)",
      notificationsLabel: "Notifications bureau (ventes, flips, tirages L/M)",
      dryRunLabel: "Mode Simulation (Dry-Run : aucune écriture API)",

      groupLanguage: "文 · Langue / Language / Idioma",
      languageLabel: "Langue de l'interface",
      optLangAuto: "Automatique (Langue de Kyara)",
      optLangFr: "Français",
      optLangEn: "English",
      optLangEs: "Español",

      btnSaveSettings: "Enregistrer",
      btnDefaultSettings: "Valeurs par défaut",

      // Toasts
      toastSaved: "Réglages enregistrés",
      toastReset: "Réglages réinitialisés",
      toastRoiReset: "Compteurs de gains réinitialisés",
      toastCardProtected: "Carte #{id} protégée",
      toastCardUnprotected: "Protection retirée pour la carte #{id}",
      toastModuleToggled: "{name} {state}",
      stateActivated: "activé",
      stateDeactivated: "désactivé",
      toastRunningCycle: "Lancement du cycle en tâche de fond…"
    },

    en: {
      brandTitle: "KYARA MANAGER",
      accountStatusDefault: "Syncing with kyara.games…",
      accountStatusConnected: "{pseudo} · {owned}/{total} cards ({pct}%)",
      refresh: "Refresh",
      openKyara: "Open kyara.games",
      connectionBannerText: "Connecting to kyara.games…",

      // KPIs
      kpiChakra: "CHAKRA",
      kpiBoosters: "BOOSTERS",
      kpiMarket: "ACTIVE MARKET",
      kpiPity: "MYTHIC PITY",

      // Tabs
      tabAutopilot: "Pilot",
      tabDuplicates: "Duplicates",
      tabMarket: "Market",
      tabBoosters: "Boosters",
      tabSettings: "Settings",

      // Autopilot
      heroTitle: "Global Autopilot",
      heroDesc: "Continuous orchestration: duplicate selling, floor-price recycling, market arbitrage, and live booster opening.",
      runCycleNow: "Run cycle now",
      dryRunPill: "Simulation Mode",
      statusActive: "AUTOPILOT ACTIVE",
      statusIdle: "AUTOPILOT IDLE",

      // Modules
      modSellTitle: "Duplicate Auto-Sell",
      modSellDesc: "Refills your 10 listing slots as soon as a card is sold.",
      modRecycleTitle: "Smart Auto-Recycle",
      modRecycleDesc: "Converts floor-price duplicates into Chakra (preserves ≥1 copy).",
      modBoostersTitle: "Live Booster Opening",
      modBoostersDesc: "Pilots the live opening interface on the #1 recommended booster.",
      modMarketTitle: "Market Flip (Arbitrage)",
      modMarketDesc: "Buys profitable underpriced listings after fees (5% + 2%).",
      modBuyMissing: "Also buy missing collection characters at bargain prices",
      modMissionsTitle: "Auto-Missions",
      modAntiAfkTitle: "Anti-AFK",
      sellNow: "Sell now",
      recycleNow: "Recycle now",
      openLive: "Open live",
      openLiveFree: "Open live (Free)",
      noFreeReady: "0 free ready",
      potentialNet: "Net potential: ",
      recyclable: "Recyclable: ",
      recommended: "Recommended: ",
      copiesCount: "{n} copy(ies)",

      // ROI Dashboard
      roiTitle: "Earnings Dashboard (ROI)",
      roiSubtitle: "Cumulative net earnings generated by Kyara Manager",
      roiTotalChakra: "TOTAL CHAKRA GENERATED",
      roiSales: "MARKET SALES",
      roiRecycle: "RECYCLING",
      roiBoosters: "FREE BOOSTERS",
      reset: "Reset",
      soldStat: "{n} sold · +{amount}",
      recycledStat: "{n} recycled · +{amount}",
      boostersStat: "{opened} opened · {rares} L/M",

      // Pity Sniper
      pityImminent: "Mythic Pity imminent ({count}/250)!",
      pityDescAutopilot: "Optimized priority target: {target} (maximizes chances of new Mythic).",
      pityDescBoosters: "Optimized priority target: {target}. Open this pack to maximize chances of unowned Mythic!",

      // Journal
      journalTitle: "Live Activity Journal",
      clear: "Clear",
      journalEmpty: "No recorded activity yet.",

      // Duplicates Tab
      dupSummarySell: "Recommended to sell",
      dupSummaryRecycle: "Recommended to recycle",
      searchPlaceholder: "Name, series, or rarity (C, U, R, E, L, M)...",
      filterAll: "All",
      filterSell: "To Sell",
      filterRecycle: "To Recycle",
      filterHold: "Surging (Hold)",
      filterProtected: "Protected / Favorites",
      thCharacter: "Character",
      thSpare: "Spare",
      thMedian7d: "7d Median",
      thPriceNet: "Price (Net)",
      thRecycle: "Recycle",
      thDecision: "Decision",
      thProtect: "Protect",
      noDuplicates: "No duplicates matching criteria.",
      activeListingsTitle: "Active market listings",
      thPrice: "Price",
      thExpires: "Expires",
      thAction: "Action",
      btnCancel: "Cancel",
      btnSell: "Sell",
      btnRecycleCount: "Recycle ×{n}",
      noActiveListings: "No active listings.",
      pinTooltipProtect: "Protect (never auto-sell or recycle)",
      pinTooltipUnprotect: "Unprotect this card",
      surgeTooltip: "+{pct}% vs 30d median",

      // Verdicts
      verdict: {
        VENDRE: "SELL",
        RECYCLER: "RECYCLE",
        CONSERVER: "HOLD",
        PROTÉGÉ: "PROTECTED",
        ATTENDRE: "WAIT"
      },

      // Market Tab
      btnScanDeals: "Scan market listings",
      filterAllDeals: "All opportunities",
      filterFlipsOnly: "Profitable flips only",
      filterMissingOnly: "Missing cards only",
      thCard: "Card",
      thBuy: "Buy",
      thResale: "Resale",
      thNetMargin: "Net margin",
      btnBuy: "Buy",
      noDeals: "Run a scan to analyze active market listings.",

      // Wishlist Tab (My Wishlist)
      wishlistTitle: "My Collection Wishlist",
      wishlistDesc: "Targeted tracking for wanted characters. Live market alerts and auto-buy when an offer matches your budget.",
      wishlistSearchPlaceholder: "Search character to add to wishlist…",
      wishlistBudgetLabel: "Max budget (◆)",
      wishlistBtnAdd: "Add to wishlist",
      wishlistEmpty: "No cards in your wishlist yet. Search a character above to add one!",
      wishlistDailySuggestions: "Daily smart suggestions (near album completion & bargains)",
      wishlistTagMatch: "WISH!",
      thWishCharacter: "Character",
      thWishRarity: "Rarity",
      thWishFloor: "Market Min",
      thWishBudget: "My Budget",
      thWishStatus: "Status",
      thWishAction: "Action",
      wishStatusAvailable: "Available!",
      wishStatusOverBudget: "Over budget",
      wishStatusNone: "No listings",

      // Boosters Tab
      recTagNew: "Recommendation #1 · Collection",
      recTagEv: "Recommendation #2 · Chakra EV",
      probAtLeastOneNew: "P(≥1 new): {prob}%",
      expectedNewPerPack: "E[New]: {exp}/pack",
      freeCountTag: "Free: {n}",
      missingCountTag: "Missing: {n}",
      openRec1Btn: "Open ×1 live (Free)",
      openRecMaxBtn: "Open max live (×{n})",
      rechargeNotice: "0 free (Recharging…)",
      maxUnavailable: "Max unavailable",
      allPacksTitle: "All available boosters",
      thPack: "Booster",
      thCompletion: "Completion",
      thProbNew: "P(≥1 new)",
      thExpectedNew: "E[New]",
      thExpectedChakra: "EV ◆",
      thLive: "Live",

      // Settings Tab
      groupAutoSell: "売 · Auto-Sell",
      priceStrategyLabel: "Pricing Strategy",
      optStrategyQuick: "Quick sell (-1 ◆ below minimum)",
      optStrategyBalanced: "Balanced (7d median)",
      optStrategyMax: "High margin (+15% median)",
      maxListingsLabel: "Max listing slots used (1–10)",
      minNetGainLabel: "Min net gain over recycling (◆)",
      sellDurationLabel: "Listing duration",
      opt12h: "12 hours",
      opt24h: "24 hours",
      opt48h: "48 hours",
      guardrail70Label: "70% 7d-median guardrail (anti-dumping)",
      velocityCheckLabel: "Fast sales velocity (48h): only list cards likely to sell within 12h",
      relistExpiredLabel: "Cancel and relist expired listings",
      holdSurgingLabel: "Hold surging cards (+20% vs 30d median)",
      surgeThresholdLabel: "Surge hold threshold (%)",

      groupAutoRecycle: "転 · Auto-Recycle",
      keepCopiesLabel: "Copies always preserved",
      recycleMaxMarketLabel: "Max net threshold to recycle illiquid cards (◆)",
      raritiesLabel: "Rarities:",

      groupMarketFlip: "市 · Market Flip",
      buyReserveLabel: "Minimum Chakra reserve (◆)",
      buyMaxPriceLabel: "Max unit buy price (◆)",
      buyMinProfitLabel: "Min net profit after fees (◆)",
      buyMinDiscountLabel: "Min discount under 7d median (%)",
      buyMinSales7dLabel: "Min 7d sales (liquidity)",

      groupBoostersSettings: "札 · Live Booster Opening",
      openModeLabel: "Opening Target",
      optModeNew: "Booster #1 New Characters",
      optModeEv: "Booster #1 Chakra Return (EV)",
      openMinBatchLabel: "Open once N free boosters are ready",
      pitySniperLabel: "Pity Sniper (target pack with best Mythics when pity ≥ 240)",
      dailyPackLabel: "Daily Free Pack (auto-claim daily pack without spending Chakra)",

      groupSystem: "守 · System & Cadence",
      loopIntervalLabel: "Auto cycle interval (seconds)",
      notificationsLabel: "Desktop notifications (sales, flips, L/M pulls)",
      dryRunLabel: "Simulation Mode (Dry-Run: no API writes)",

      groupLanguage: "文 · Language / Langue / Idioma",
      languageLabel: "Interface Language",
      optLangAuto: "Automatic (Kyara's language)",
      optLangFr: "Français",
      optLangEn: "English",
      optLangEs: "Español",

      btnSaveSettings: "Save Settings",
      btnDefaultSettings: "Default Values",

      // Toasts
      toastSaved: "Settings saved",
      toastReset: "Settings reset to defaults",
      toastRoiReset: "Earnings counters reset",
      toastCardProtected: "Card #{id} protected",
      toastCardUnprotected: "Protection removed for card #{id}",
      toastModuleToggled: "{name} {state}",
      stateActivated: "enabled",
      stateDeactivated: "disabled",
      toastRunningCycle: "Starting automation cycle in background…"
    },

    es: {
      brandTitle: "KYARA MANAGER",
      accountStatusDefault: "Sincronizando con kyara.games…",
      accountStatusConnected: "{pseudo} · {owned}/{total} cartas ({pct}%)",
      refresh: "Actualizar",
      openKyara: "Abrir kyara.games",
      connectionBannerText: "Conectando a kyara.games…",

      // KPIs
      kpiChakra: "CHAKRA",
      kpiBoosters: "SOBRES",
      kpiMarket: "MERCADO ACTIVO",
      kpiPity: "PIEDAD MÍTICA",

      // Tabs
      tabAutopilot: "Piloto",
      tabDuplicates: "Duplicados",
      tabMarket: "Mercado",
      tabBoosters: "Sobres",
      tabSettings: "Ajustes",

      // Autopilot
      heroTitle: "Piloto Automático Global",
      heroDesc: "Orquestación continua: venta de duplicados, reciclaje al precio suelo, escaneo de arbitraje y apertura en vivo.",
      runCycleNow: "Ejecutar ciclo ahora",
      dryRunPill: "Modo Simulación",
      statusActive: "PILOTO ACTIVO",
      statusIdle: "PILOTO EN ESPERA",

      // Modules
      modSellTitle: "Auto-Venta de duplicados",
      modSellDesc: "Rellena tus 10 ranuras en cuanto se vende una carta.",
      modRecycleTitle: "Auto-Reciclaje inteligente",
      modRecycleDesc: "Convierte duplicados a precio suelo en Chakra (guarda ≥1 copia).",
      modBoostersTitle: "Apertura en vivo de sobres",
      modBoostersDesc: "Controla la interfaz de apertura en vivo en el sobre #1 recomendado.",
      modMarketTitle: "Compra-Venta (Flip Mercado)",
      modMarketDesc: "Compra anuncios infravalorados rentables tras tasas (5% + 2%).",
      modBuyMissing: "Comprar también personajes faltantes a bajo precio",
      modMissionsTitle: "Auto-Misiones",
      modAntiAfkTitle: "Anti-AFK",
      sellNow: "Vender ahora",
      recycleNow: "Reciclar ahora",
      openLive: "Abrir en vivo",
      openLiveFree: "Abrir en vivo (Gratis)",
      noFreeReady: "0 gratis listo",
      potentialNet: "Potencial neto: ",
      recyclable: "Reciclable: ",
      recommended: "Recomendado: ",
      copiesCount: "{n} copia(s)",

      // ROI Dashboard
      roiTitle: "Panel de ganancias (ROI)",
      roiSubtitle: "Ganancias netas acumuladas generadas por Kyara Manager",
      roiTotalChakra: "CHAKRA TOTAL GENERADO",
      roiSales: "VENTAS EN MERCADO",
      roiRecycle: "RECICLAJES",
      roiBoosters: "SOBRES GRATIS",
      reset: "Reiniciar",
      soldStat: "{n} vendida(s) · +{amount}",
      recycledStat: "{n} reciclada(s) · +{amount}",
      boostersStat: "{opened} abiertos · {rares} L/M",

      // Pity Sniper
      pityImminent: "¡Piedad Mítica inminente ({count}/250)!",
      pityDescAutopilot: "Objetivo prioritario optimizado: {target} (maximiza posibilidades de nuevo Mítico).",
      pityDescBoosters: "Objetivo prioritario optimizado: {target}. ¡Abre este sobre para maximizar tus opciones de conseguir un Mítico nuevo!",

      // Journal
      journalTitle: "Diario de actividad en vivo",
      clear: "Borrar",
      journalEmpty: "Ninguna operación registrada.",

      // Duplicates Tab
      dupSummarySell: "Recomendados para venta",
      dupSummaryRecycle: "Recomendados para reciclar",
      searchPlaceholder: "Nombre, serie o rareza (C, U, R, E, L, M)…",
      filterAll: "Todos",
      filterSell: "A Vender",
      filterRecycle: "A Reciclar",
      filterHold: "Al Alza (Conservar)",
      filterProtected: "Protegidos / Favoritos",
      thCharacter: "Personaje",
      thSpare: "Sobrante",
      thMedian7d: "Mediana 7d",
      thPriceNet: "Precio (Neto)",
      thRecycle: "Reciclaje",
      thDecision: "Decisión",
      thProtect: "Proteger",
      noDuplicates: "Sin duplicados que coincidan con los criterios.",
      activeListingsTitle: "Anuncios activos en el mercado",
      thPrice: "Precio",
      thExpires: "Expira",
      thAction: "Acción",
      btnCancel: "Retirar",
      btnSell: "Vender",
      btnRecycleCount: "Reciclar ×{n}",
      noActiveListings: "Sin anuncios activos.",
      pinTooltipProtect: "Proteger (nunca vender ni reciclar)",
      pinTooltipUnprotect: "Desproteger esta carta",
      surgeTooltip: "+{pct}% vs mediana 30d",

      // Verdicts
      verdict: {
        VENDRE: "VENDER",
        RECYCLER: "RECICLAR",
        CONSERVER: "CONSERVAR",
        PROTÉGÉ: "PROTEGIDO",
        ATTENDRE: "ESPERAR"
      },

      // Market Tab
      btnScanDeals: "Escanear anuncios",
      filterAllDeals: "Todas las oportunidades",
      filterFlipsOnly: "Solo flips rentables",
      filterMissingOnly: "Solo cartas faltantes",
      thCard: "Carta",
      thBuy: "Compra",
      thResale: "Reventa",
      thNetMargin: "Margen neto",
      btnBuy: "Comprar",
      noDeals: "Ejecuta un escaneo para analizar los anuncios activos del mercado.",

      // Wishlist Tab (My Wishlist)
      wishlistTitle: "My Collection Wishlist",
      wishlistDesc: "Targeted tracking for wanted characters. Live market alerts and auto-buy when an offer matches your budget.",
      wishlistSearchPlaceholder: "Search character to add to wishlist…",
      wishlistBudgetLabel: "Max budget (◆)",
      wishlistBtnAdd: "Add to wishlist",
      wishlistEmpty: "No cards in your wishlist yet. Search a character above to add one!",
      wishlistDailySuggestions: "Daily smart suggestions (near album completion & bargains)",
      wishlistTagMatch: "WISH!",
      thWishCharacter: "Character",
      thWishRarity: "Rarity",
      thWishFloor: "Market Min",
      thWishBudget: "My Budget",
      thWishStatus: "Status",
      thWishAction: "Action",
      wishStatusAvailable: "Available!",
      wishStatusOverBudget: "Over budget",
      wishStatusNone: "No listings",

      // Boosters Tab
      recTagNew: "Recomendación #1 · Colección",
      recTagEv: "Recomendación #2 · Rentabilidad Chakra",
      probAtLeastOneNew: "P(≥1 nuevo): {prob}%",
      expectedNewPerPack: "E[Nuevos]: {exp}/sobre",
      freeCountTag: "Gratis: {n}",
      missingCountTag: "Faltantes: {n}",
      openRec1Btn: "Abrir ×1 en vivo (Gratis)",
      openRecMaxBtn: "Abrir máx en vivo (×{n})",
      rechargeNotice: "0 gratis (Recargando…)",
      maxUnavailable: "Máx no disponible",
      allPacksTitle: "Todos los sobres del juego",
      thPack: "Sobre",
      thCompletion: "Colección",
      thProbNew: "P(≥1 nuevo)",
      thExpectedNew: "E[Nuevos]",
      thExpectedChakra: "EV ◆",
      thLive: "En vivo",

      // Settings Tab
      groupAutoSell: "売 · Auto-Venta",
      priceStrategyLabel: "Estrategia de precios",
      optStrategyQuick: "Venta rápida (-1 ◆ bajo el mínimo)",
      optStrategyBalanced: "Equilibrado (mediana 7d)",
      optStrategyMax: "Margen alto (+15% mediana)",
      maxListingsLabel: "Ranuras de venta máximas (1–10)",
      minNetGainLabel: "Ganancia neta mínima sobre reciclaje (◆)",
      sellDurationLabel: "Duración de los anuncios",
      opt12h: "12 horas",
      opt24h: "24 horas",
      opt48h: "48 horas",
      guardrail70Label: "Protección 70% de la mediana 7d (anti-derrumbes)",
      velocityCheckLabel: "Velocidad rápida (48h): solo listar cartas con venta rápida en 12h",
      relistExpiredLabel: "Retirar y relistar anuncios expirados",
      holdSurgingLabel: "Conservar cartas en fuerte alza (+20% vs 30d)",
      surgeThresholdLabel: "Umbral de alza para conservar (%)",

      groupAutoRecycle: "転 · Auto-Reciclaje",
      keepCopiesLabel: "Copias siempre conservadas",
      recycleMaxMarketLabel: "Umbral neto máx para reciclar cartas poco líquidas (◆)",
      raritiesLabel: "Rarezas:",

      groupMarketFlip: "市 · Compra-Venta (Flip)",
      buyReserveLabel: "Reserva mínima de Chakra (◆)",
      buyMaxPriceLabel: "Precio de compra máx unitario (◆)",
      buyMinProfitLabel: "Margen neto mínimo tras tasas (◆)",
      buyMinDiscountLabel: "Descuento mínimo bajo mediana 7d (%)",
      buyMinSales7dLabel: "Ventas 7d mínimas (liquidez)",

      groupBoostersSettings: "札 · Apertura en vivo de sobres",
      openModeLabel: "Objetivo de apertura",
      optModeNew: "Sobre #1 Nuevos Personajes",
      optModeEv: "Sobre #1 Retorno de Chakra (EV)",
      openMinBatchLabel: "Abrir en cuanto N sobres gratis estén listos",
      pitySniperLabel: "Pity Sniper (apuntar al sobre con mejores Míticos cuando piedad ≥ 240)",
      dailyPackLabel: "Sobre Diario Gratis (reclamar cada día sin gastar Chakra)",

      groupSystem: "守 · Sistema y Frecuencia",
      loopIntervalLabel: "Intervalo del ciclo auto (segundos)",
      notificationsLabel: "Notificaciones de escritorio (ventas, flips, tiradas L/M)",
      dryRunLabel: "Modo Simulación (Dry-Run: sin escrituras API)",

      groupLanguage: "文 · Idioma / Language / Langue",
      languageLabel: "Idioma de la interfaz",
      optLangAuto: "Automático (Idioma de Kyara)",
      optLangFr: "Français",
      optLangEn: "English",
      optLangEs: "Español",

      btnSaveSettings: "Guardar Ajustes",
      btnDefaultSettings: "Valores por defecto",

      // Toasts
      toastSaved: "Ajustes guardados",
      toastReset: "Ajustes restablecidos",
      toastRoiReset: "Contadores de ganancias reiniciados",
      toastCardProtected: "Carta #{id} protegida",
      toastCardUnprotected: "Protección retirada para la carta #{id}",
      toastModuleToggled: "{name} {state}",
      stateActivated: "activado",
      stateDeactivated: "desactivado",
      toastRunningCycle: "Iniciando ciclo en segundo plano…"
    }
  };

  let activeLang = "fr";

  function detectLanguage() {
    try {
      // 1. Check Kyara's own stored language in localStorage
      const kyaraLang = localStorage.getItem("kyara_lang") || localStorage.getItem("lang");
      if (kyaraLang && ["fr", "en", "es"].includes(kyaraLang.toLowerCase())) {
        return kyaraLang.toLowerCase();
      }

      // 2. Check HTML document lang
      const docLang = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
      if (["fr", "en", "es"].includes(docLang)) {
        return docLang;
      }

      // 3. Check browser navigator language
      const navLang = (navigator.language || "").slice(0, 2).toLowerCase();
      if (["fr", "en", "es"].includes(navLang)) {
        return navLang;
      }
    } catch {
      // Ignore security/sandboxing restrictions
    }
    return "fr";
  }

  function setLanguage(lang) {
    if (lang === "auto" || !lang) {
      activeLang = detectLanguage();
    } else if (["fr", "en", "es"].includes(lang.toLowerCase())) {
      activeLang = lang.toLowerCase();
    } else {
      activeLang = "fr";
    }
    return activeLang;
  }

  function getLanguage() {
    return activeLang;
  }

  function t(path, params = {}) {
    const dict = TRANSLATIONS[activeLang] || TRANSLATIONS.fr;
    const parts = String(path).split(".");
    let val = dict;
    for (const p of parts) {
      if (val && typeof val === "object" && p in val) {
        val = val[p];
      } else {
        // Fallback to French if missing
        val = TRANSLATIONS.fr;
        for (const fp of parts) {
          if (val && typeof val === "object" && fp in val) {
            val = val[fp];
          } else {
            return path;
          }
        }
        break;
      }
    }

    if (typeof val !== "string") {
      return String(val ?? path);
    }

    return val.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  const KyaraI18n = {
    TRANSLATIONS,
    detectLanguage,
    setLanguage,
    getLanguage,
    t
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KyaraI18n;
  }
  globalThis.KyaraI18n = KyaraI18n;
})();
