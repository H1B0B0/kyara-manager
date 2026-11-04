(function () {
  "use strict";

  // Clean up any stale HUD if re-injected after extension reload
  const existingHud = document.getElementById("km-floating-hud");
  if (existingHud && globalThis.__kyaraManagerInjected) {
    return;
  }
  globalThis.__kyaraManagerInjected = true;

  const Analytics = globalThis.KyaraAnalytics;
  const i18n = globalThis.KyaraI18n;
  const CATALOG_TTL_MS = 12 * 3600 * 1000;
  const PACK_POOLS_TTL_MS = 12 * 3600 * 1000;
  const PRICES_TTL_MS = 15 * 60 * 1000;
  const JOURNAL_MAX = 80;

  // Write-only rate-limit queue (GET requests run in parallel like Kyara's own frontend)
  let writeQueue = Promise.resolve();
  let lastWriteAt = 0;
  let rushMultiplier = 1;
  let cooldownUntil = 0;

  // Runtime state (mirrored to chrome.storage.local for sidepanel reactivity)
  let currentSettings = { ...Analytics.DEFAULT_SETTINGS };
  let isCycleRunning = false;
  let isLiveOpening = false;
  let loopTimer = null;
  let previousActiveListings = new Map();
  let lastPullEvents = [];

  const DEFAULT_CUMULATIVE_STATS = {
    chakraFromSales: 0,
    chakraFromRecycle: 0,
    cardsSold: 0,
    cardsRecycled: 0,
    boostersOpenedCount: 0,
    newCardsPulledCount: 0,
    mythicsPulledCount: 0,
    legendariesPulledCount: 0,
    startedAt: Date.now()
  };

  /**
   * Increment cumulative ROI stats in chrome.storage.local atomically.
   */
  async function recordCumulativeMetric(deltas = {}) {
    try {
      const { kmCumulativeStats = {} } = await chrome.storage.local.get("kmCumulativeStats");
      const current = { ...DEFAULT_CUMULATIVE_STATS, ...kmCumulativeStats };
      const updated = {
        chakraFromSales: (current.chakraFromSales || 0) + (deltas.chakraFromSales || 0),
        chakraFromRecycle: (current.chakraFromRecycle || 0) + (deltas.chakraFromRecycle || 0),
        cardsSold: (current.cardsSold || 0) + (deltas.cardsSold || 0),
        cardsRecycled: (current.cardsRecycled || 0) + (deltas.cardsRecycled || 0),
        boostersOpenedCount: (current.boostersOpenedCount || 0) + (deltas.boostersOpenedCount || 0),
        newCardsPulledCount: (current.newCardsPulledCount || 0) + (deltas.newCardsPulledCount || 0),
        mythicsPulledCount: (current.mythicsPulledCount || 0) + (deltas.mythicsPulledCount || 0),
        legendariesPulledCount: (current.legendariesPulledCount || 0) + (deltas.legendariesPulledCount || 0),
        startedAt: current.startedAt || Date.now()
      };
      await chrome.storage.local.set({ kmCumulativeStats: updated });
      return updated;
    } catch (err) {
      console.warn("[KyaraManager] Failed to record cumulative metric:", err);
      return null;
    }
  }

  const runtimeCache = {
    catalogById: null,
    catalogAt: 0,
    packPools: {},
    packPoolsAt: 0,
    collectionPrices: new Map(),
    rarityAvgPrices: { C: 3, U: 3, R: 6, E: 18, L: 130, M: 950 }
  };

  // Listen to native Kyara pull events dispatched by the SvelteKit app (`window.dispatchEvent(new CustomEvent("kyara:pull", { detail }))`)
  window.addEventListener("kyara:pull", (event) => {
    if (event?.detail) {
      lastPullEvents.push({ at: Date.now(), detail: event.detail });
      if (lastPullEvents.length > 20) lastPullEvents.shift();
    }
  });

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomJitter(maxMs = 110) {
    return Math.floor(Math.random() * maxMs);
  }

  function newRequestId() {
    return crypto.randomUUID().replace(/-/g, "");
  }

  function readSiteAuth() {
    let pass = null;
    try {
      const rawPass = localStorage.getItem("kyara_pass");
      const parsed = rawPass ? JSON.parse(rawPass) : null;
      if (parsed && typeof parsed.pass === "string" && Number(parsed.expiresAt) > Date.now()) {
        pass = parsed.pass;
      }
    } catch {
      pass = null;
    }

    let token = null;
    try {
      token = localStorage.getItem("kyara_token") || null;
    } catch {
      token = null;
    }

    let deviceId = "";
    try {
      deviceId = localStorage.getItem("kyara_device") || "";
    } catch {
      deviceId = "";
    }

    return { token, deviceId, pass };
  }

  async function waitForWriteSlot() {
    const turn = writeQueue.then(async () => {
      const now = Date.now();
      if (cooldownUntil > now) {
        await sleep(cooldownUntil - now);
      }
      const minGap = 340 * rushMultiplier + randomJitter(120);
      const waitMs = lastWriteAt + minGap - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      lastWriteAt = Date.now();
    });
    writeQueue = turn.catch(() => {});
    return turn;
  }

  async function kyaraApi(path, { method = "GET", body, withPass = false, extraHeaders = {}, auth = true } = {}) {
    const isWrite = method !== "GET";
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (isWrite) {
        await waitForWriteSlot();
      } else if (cooldownUntil > Date.now()) {
        await sleep(cooldownUntil - Date.now());
      }

      const siteAuth = readSiteAuth();
      const headers = {
        Accept: "application/json",
        ...extraHeaders
      };
      if (siteAuth.deviceId) {
        headers["x-device-id"] = siteAuth.deviceId;
      }
      if (auth && siteAuth.token) {
        headers.Authorization = `Bearer ${siteAuth.token}`;
      }
      if (withPass && siteAuth.pass) {
        headers["x-pass"] = siteAuth.pass;
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: "same-origin",
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });

      const rushHeader = Number(response.headers.get("x-kyara-rush"));
      if (Number.isFinite(rushHeader) && rushHeader >= 1) {
        rushMultiplier = Math.min(4, rushHeader);
      }

      const data = await response.json().catch(() => null);
      if (response.ok) {
        return data;
      }

      if (response.status === 429 || response.status === 503) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1500 * Math.pow(2, attempt) + randomJitter(400);
        cooldownUntil = Math.max(cooldownUntil, Date.now() + backoff);
        if (attempt + 1 < maxAttempts) {
          continue;
        }
      }

      const err = new Error(data?.message || data?.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = data?.error || `http_${response.status}`;
      throw err;
    }
  }

  async function appendJournal(kind, text, details = null) {
    try {
      const { kmJournal = [] } = await chrome.storage.local.get("kmJournal");
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        at: Date.now(),
        kind,
        type: kind,
        text,
        message: text,
        details
      };
      const updated = [entry, ...kmJournal].slice(0, JOURNAL_MAX);
      await chrome.storage.local.set({ kmJournal: updated });
    } catch (err) {
      console.warn("[Kyara Manager] Journal write error:", err);
    }
  }

  function notifyDesktop(title, message, idPrefix = "km") {
    chrome.runtime
      .sendMessage({
        type: "km:notify",
        title,
        message,
        idPrefix
      })
      .catch(() => {});
  }

  async function loadSettings() {
    try {
      const { settings } = await chrome.storage.local.get("settings");
      currentSettings = { ...Analytics.DEFAULT_SETTINGS, ...(settings || {}) };
      i18n?.setLanguage(currentSettings.language || "auto");
      if (!settings) {
        await chrome.storage.local.set({ settings: currentSettings });
      }
    } catch {
      currentSettings = { ...Analytics.DEFAULT_SETTINGS };
    }
    return currentSettings;
  }

  async function ensureCatalog(force = false) {
    const now = Date.now();
    if (!force && runtimeCache.catalogById && now - runtimeCache.catalogAt < CATALOG_TTL_MS) {
      return runtimeCache.catalogById;
    }
    try {
      const { kmCatalogCache } = await chrome.storage.local.get("kmCatalogCache");
      if (!force && kmCatalogCache?.list?.length && now - kmCatalogCache.at < CATALOG_TTL_MS) {
        const map = new Map();
        for (const c of kmCatalogCache.list) {
          map.set(Number(c.id), c);
        }
        runtimeCache.catalogById = map;
        runtimeCache.catalogAt = kmCatalogCache.at;
        return map;
      }
    } catch {
      // Fallback to network fetch
    }

    const raw = await kyaraApi("/characters", { auth: false });
    const slim = (Array.isArray(raw) ? raw : []).map((c) => ({
      id: Number(c.id),
      name: c.name,
      series: c.series || "",
      rarity: c.rarity || "C",
      rank: c.rank ?? 999999
    }));
    const map = new Map();
    for (const c of slim) {
      map.set(c.id, c);
    }
    runtimeCache.catalogById = map;
    runtimeCache.catalogAt = now;
    await chrome.storage.local
      .set({
        kmCatalogCache: { at: now, list: slim }
      })
      .catch(() => {});
    return map;
  }

  async function ensurePackPools(packs, force = false) {
    const now = Date.now();
    if (
      !force &&
      Object.keys(runtimeCache.packPools).length > 0 &&
      now - runtimeCache.packPoolsAt < PACK_POOLS_TTL_MS
    ) {
      return runtimeCache.packPools;
    }
    try {
      const { kmPackPoolsCache } = await chrome.storage.local.get("kmPackPoolsCache");
      if (!force && kmPackPoolsCache?.pools && now - kmPackPoolsCache.at < PACK_POOLS_TTL_MS) {
        runtimeCache.packPools = kmPackPoolsCache.pools;
        runtimeCache.packPoolsAt = kmPackPoolsCache.at;
        return runtimeCache.packPools;
      }
    } catch {
      // Fallback to network fetch
    }

    const pools = {};
    const validPacks = (Array.isArray(packs) ? packs : []).filter((p) => p?.id);
    // Fetch pack character pools in parallel batches of 6 for fast (<600ms) loading
    const batchSize = 6;
    for (let i = 0; i < validPacks.length; i += batchSize) {
      const batch = validPacks.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (pack) => {
          try {
            const ids = await kyaraApi(`/packs/${encodeURIComponent(pack.id)}/characters`, { auth: false });
            if (Array.isArray(ids)) {
              pools[pack.id] = ids.map(Number).filter(Number.isFinite);
            }
          } catch {
            pools[pack.id] = [];
          }
        })
      );
    }

    runtimeCache.packPools = pools;
    runtimeCache.packPoolsAt = now;
    await chrome.storage.local
      .set({
        kmPackPoolsCache: { at: now, pools }
      })
      .catch(() => {});
    return pools;
  }

  async function ensureCollectionPrices(characterIds, force = false) {
    const now = Date.now();
    const missingIds = characterIds.filter((id) => {
      if (force) return true;
      const cached = runtimeCache.collectionPrices.get(id);
      return !cached || now - cached.at > PRICES_TTL_MS;
    });

    const batchSize = 350;
    const chunks = [];
    for (let i = 0; i < missingIds.length; i += batchSize) {
      chunks.push(missingIds.slice(i, i + batchSize));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const res = await kyaraApi(`/me/collection/prices?ids=${chunk.join(",")}`);
          const list = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
          for (const item of list) {
            const cid = Number(item.characterId ?? item.id);
            if (Number.isFinite(cid)) {
              runtimeCache.collectionPrices.set(cid, {
                median7d: item.median7d ?? null,
                median30d: item.median30d ?? null,
                sales7d: item.sales7d ?? null,
                sales30d: item.sales30d ?? null,
                at: now
              });
            }
          }
        } catch {
          // Ignore individual chunk errors
        }
      })
    );

    return runtimeCache.collectionPrices;
  }

  function extractActiveListings(myMarket, now = Date.now()) {
    const rawListings = Array.isArray(myMarket?.listings) ? myMarket.listings : [];
    return rawListings.filter((l) => {
      if (!l || (l.status !== "active" && l.status !== "pending")) return false;
      if (l.endsAt && Date.parse(l.endsAt) <= now) return false;
      return true;
    });
  }

  function RARITY_BucketsHas(buckets, r) {
    return Object.prototype.hasOwnProperty.call(buckets, r);
  }

  /**
   * Build a complete dashboard snapshot.
   * Uses concurrent GET requests so initial sync completes in < 400ms.
   */
  async function refreshDashboardSnapshot({ forcePrices = false, scanMarketDeals = false } = {}) {
    await loadSettings();

    let bootstrap = null;
    try {
      bootstrap = await kyaraApi("/me/bootstrap");
    } catch (err) {
      const unauthState = {
        updatedAt: Date.now(),
        authenticated: false,
        error:
          err?.status === 401
            ? "Session expirée ou non connectée sur kyara.games."
            : `Connexion à kyara.games en cours (${err?.message || "vérifie l'onglet"})…`
      };
      await chrome.storage.local.set({ kmDashboard: unauthState });
      updateFloatingHud(unauthState);
      return unauthState;
    }

    const me = bootstrap?.me || bootstrap;
    if (!me || !me.id) {
      const unauthState = {
        updatedAt: Date.now(),
        authenticated: false,
        error: "Connecte-toi à ton compte sur kyara.games pour activer Kyara Manager."
      };
      await chrome.storage.local.set({ kmDashboard: unauthState });
      updateFloatingHud(unauthState);
      return unauthState;
    }

    const [config, collection, myMarket, packs, catalogById] = await Promise.all([
      kyaraApi("/config", { auth: false }).catch(() => ({ recycle: Analytics.DEFAULT_RECYCLE_VALUES })),
      kyaraApi("/me/collection?lean=1").catch(() => []),
      kyaraApi("/me/market").catch(() => ({ listings: [], bids: [], buyOrders: [] })),
      kyaraApi("/packs", { auth: false }).catch(() => []),
      ensureCatalog(false)
    ]);

    const packState = bootstrap?.packs || null;
    const progress = bootstrap?.progress || null;
    const recycleMap = config?.recycle || Analytics.DEFAULT_RECYCLE_VALUES;

    const now = Date.now();
    const activeListings = extractActiveListings(myMarket, now);

    // Detect newly completed sales since last snapshot
    const currentIds = new Set(activeListings.map((l) => String(l.id)));
    if (previousActiveListings.size > 0) {
      for (const [oldId, oldInfo] of previousActiveListings.entries()) {
        if (!currentIds.has(oldId)) {
          const expired = oldInfo.endsAt && Date.parse(oldInfo.endsAt) <= now;
          if (!expired) {
            const net = Analytics.computeNetProceeds(oldInfo.price);
            await recordCumulativeMetric({ chakraFromSales: net, cardsSold: 1 });
            await appendJournal("sold", `Carte vendue : ${oldInfo.name} pour ${oldInfo.price} ◆ (net +${net} ◆)`);
            notifyDesktop(
              "Carte vendue sur Kyara !",
              `${oldInfo.name} vendue pour ${oldInfo.price} ◆ (+${net} ◆ net)`,
              "km-sold"
            );
          }
        }
      }
    }
    previousActiveListings = new Map(
      activeListings.map((l) => [
        String(l.id),
        {
          characterId: Number(l.character?.id ?? l.characterId),
          name: l.character?.name || `Carte #${l.characterId}`,
          price: Number(l.price) || 0,
          endsAt: l.endsAt || null,
          createdAt: l.createdAt || null
        }
      ])
    );

    const activeQtyByChar = new Map();
    for (const l of activeListings) {
      const cid = Number(l.character?.id ?? l.characterId);
      const qty = Math.max(1, Number(l.qty) || 1);
      if (Number.isFinite(cid)) {
        activeQtyByChar.set(cid, (activeQtyByChar.get(cid) || 0) + qty);
      }
    }

    const ownedSet = new Set();
    const duplicateEntries = [];
    for (const entry of Array.isArray(collection) ? collection : []) {
      const cid = Number(entry.characterId ?? entry.id);
      if (!Number.isFinite(cid) || entry.qty <= 0) continue;
      ownedSet.add(cid);
      if (entry.qty >= 2) {
        duplicateEntries.push(entry);
      }
    }

    const dupeIds = duplicateEntries.map((e) => Number(e.characterId));
    const [ , packPools] = await Promise.all([
      ensureCollectionPrices(dupeIds, forcePrices),
      ensurePackPools(packs, false)
    ]);

    const rarityBuckets = { C: [], U: [], R: [], E: [], L: [], M: [] };
    for (const [cid, p] of runtimeCache.collectionPrices.entries()) {
      const ch = catalogById.get(cid);
      const val = p.median7d ?? p.median30d;
      if (ch && RARITY_BucketsHas(rarityBuckets, ch.rarity) && Number.isFinite(val) && val > 0) {
        rarityBuckets[ch.rarity].push(val);
      }
    }
    for (const r of Analytics.RARITIES) {
      const arr = rarityBuckets[r];
      if (arr.length >= 3) {
        arr.sort((a, b) => a - b);
        runtimeCache.rarityAvgPrices[r] = arr[Math.floor(arr.length / 2)];
      }
    }

    const { kmPinnedCards = [] } = await chrome.storage.local.get("kmPinnedCards");
    const pinnedSet = new Set((kmPinnedCards || []).map(Number));

    let deadline = performance.now() + 50;
    const evaluatedDuplicates = [];
    for (const entry of duplicateEntries) {
      const cid = Number(entry.characterId);
      const card = catalogById.get(cid) || { id: cid, name: `Carte #${cid}`, rarity: "C", series: "" };
      const stats = runtimeCache.collectionPrices.get(cid) || {};
      const activeQty = activeQtyByChar.get(cid) || 0;
      const ev = Analytics.evaluateDuplicate(card, entry, stats, recycleMap, currentSettings, activeQty, pinnedSet);
      if (ev.spare > 0 || activeQty > 0 || ev.pinned) {
        evaluatedDuplicates.push(ev);
      }
      deadline = await Analytics.yieldIfNeeded(deadline);
    }

    evaluatedDuplicates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.fees.netProceeds - a.fees.netProceeds;
    });

    const boosterRankings = Analytics.rankBoostersForCollection(
      packs,
      packPools,
      catalogById,
      ownedSet,
      runtimeCache.rarityAvgPrices,
      config,
      me,
      packState
    );

    let deals = [];
    if (scanMarketDeals) {
      deals = await scanMarketDealsInternal(ownedSet);
    } else {
      const stored = await chrome.storage.local.get("kmDashboard");
      deals = stored?.kmDashboard?.deals || [];
    }

    const sellCandidates = evaluatedDuplicates.filter((d) => d.verdict === "VENDRE" && d.spare > 0);
    const recycleCandidates = evaluatedDuplicates.filter((d) => d.verdict === "RECYCLER" && d.spare > 0);

    const dashboard = {
      updatedAt: Date.now(),
      authenticated: true,
      me: {
        id: me.id,
        pseudo: me.pseudo || me.discord?.username || "Joueur",
        chakra: me.chakra ?? 0,
        chakraHeld: me.chakraHeld ?? 0,
        freePacks: me.freePacks ?? 0,
        freePacksMax: me.freePacksMax ?? 10,
        nextFreeAt: me.nextFreeAt || null,
        bonusPacks: me.bonusPacks ?? 0,
        grants: me.grants || {},
        pity: me.pity ?? 0,
        goldenIn: me.goldenIn ?? null,
        boostersOpened: me.boostersOpened ?? 0
      },
      collectionStats: {
        uniqueOwned: ownedSet.size,
        catalogSize: catalogById.size || config?.catalogSize || 6736,
        completionPct: catalogById.size ? Math.round((ownedSet.size / catalogById.size) * 1000) / 10 : 0,
        sellableDuplicatesCount: sellCandidates.reduce((s, d) => s + d.spare, 0),
        sellableNetTotal: sellCandidates.reduce((s, d) => s + d.spare * d.fees.netProceeds, 0),
        recyclableDuplicatesCount: recycleCandidates.reduce((s, d) => s + d.spare, 0),
        recyclableChakraTotal: recycleCandidates.reduce((s, d) => s + d.spare * d.recycleValue, 0)
      },
      activeListings: activeListings.map((l) => ({
        id: l.id,
        characterId: Number(l.character?.id ?? l.characterId),
        name: l.character?.name || `Carte #${l.characterId}`,
        rarity: l.character?.rarity || "C",
        series: l.character?.series || "",
        type: l.type || "fixed",
        price: l.price,
        createdAt: l.createdAt,
        endsAt: l.endsAt
      })),
      duplicates: evaluatedDuplicates.slice(0, 250),
      boosters: boosterRankings,
      deals: deals.slice(0, 50),
      claimableMissions: progress?.claimable ?? 0
    };

    await chrome.storage.local.set({ kmDashboard: dashboard });
    updateFloatingHud(dashboard);
    return dashboard;
  }

  /**
   * Scan market listings (`newest` + `price_asc`) to find profitable flips and missing cards.
   */
  async function scanMarketDealsInternal(ownedSet) {
    const [newestPage, cheapPage] = await Promise.all([
      kyaraApi("/market/listings?sort=newest&pageSize=50&page=1", { auth: true }).catch(() => ({ items: [] })),
      kyaraApi("/market/listings?type=fixed&sort=price_asc&pageSize=50&page=1", { auth: true }).catch(() => ({
        items: []
      }))
    ]);

    const seen = new Set();
    const combined = [
      ...(Array.isArray(newestPage?.items) ? newestPage.items : []),
      ...(Array.isArray(cheapPage?.items) ? cheapPage.items : [])
    ];

    const deals = [];
    for (const item of combined) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      const deal = Analytics.evaluateDeal(item, ownedSet, currentSettings);
      if (!deal) continue;
      if (deal.isGoodFlip || deal.isGoodMissingBuy || (deal.discountPct && deal.discountPct >= 15)) {
        deals.push(deal);
      }
    }

    deals.sort((a, b) => {
      if (Number(b.isGoodFlip) !== Number(a.isGoodFlip)) return Number(b.isGoodFlip) - Number(a.isGoodFlip);
      return (b.flipProfit ?? -9999) - (a.flipProfit ?? -9999);
    });

    return deals;
  }

  /**
   * 1. AUTO-RECYCLAGE : Recycle duplicates whose verdict is RECYCLER.
   */
  async function executeAutoRecycle(dashboard) {
    const candidates = (dashboard?.duplicates || []).filter((d) => d.canAutoRecycle && d.spare > 0);
    if (!candidates.length) {
      return { recycledCards: 0, recycledCopies: 0, chakraGained: 0 };
    }

    const freshCollection = await kyaraApi("/me/collection?lean=1");
    const freshById = new Map(
      (Array.isArray(freshCollection) ? freshCollection : []).map((e) => [Number(e.characterId), e])
    );
    const activeByChar = new Map();
    for (const l of dashboard.activeListings || []) {
      activeByChar.set(l.characterId, (activeByChar.get(l.characterId) || 0) + 1);
    }

    let recycledCards = 0;
    let recycledCopies = 0;
    let chakraGained = 0;

    for (const cand of candidates) {
      const freshEntry = freshById.get(cand.characterId);
      const safeSpare = Analytics.computeSpareCopies(freshEntry, activeByChar.get(cand.characterId) || 0);
      if (safeSpare <= 0) continue;

      if (currentSettings.dryRun) {
        recycledCards += 1;
        recycledCopies += safeSpare;
        chakraGained += safeSpare * cand.recycleValue;
        await appendJournal(
          "recycle",
          `[SIMULATION] Recyclerait ${cand.name} [${cand.rarity}] ×${safeSpare} (+${safeSpare * cand.recycleValue} ◆)`
        );
        continue;
      }

      try {
        const res = await kyaraApi(`/me/collection/${cand.characterId}/recycle`, {
          method: "POST",
          body: { qty: safeSpare }
        });
        const gained = Number(res?.gained ?? safeSpare * cand.recycleValue);
        recycledCards += 1;
        recycledCopies += safeSpare;
        chakraGained += gained;
        await recordCumulativeMetric({ chakraFromRecycle: gained, cardsRecycled: safeSpare });
        await appendJournal("recycle", `Recyclé : ${cand.name} [${cand.rarity}] ×${safeSpare} (+${gained} ◆)`);
      } catch (err) {
        await appendJournal("warn", `Échec recyclage ${cand.name} : ${err.message}`);
      }
    }

    return { recycledCards, recycledCopies, chakraGained };
  }

  /**
   * 2. AUTO-VENTE : Keep listing slots full (up to autoSellMaxListings, max 10) and handle expired listings.
   */
  async function executeAutoSell(dashboard) {
    const now = Date.now();
    const expireHours = Number(currentSettings.autoSellExpireHours ?? 0);
    let activeListings = [...(dashboard?.activeListings || [])];

    if (expireHours > 0) {
      const maxAgeMs = expireHours * 3600 * 1000;
      for (const listing of [...activeListings]) {
        const createdMs = listing.createdAt ? Date.parse(listing.createdAt) : NaN;
        if (Number.isFinite(createdMs) && now - createdMs >= maxAgeMs) {
          if (currentSettings.dryRun) {
            await appendJournal("sell", `[SIMULATION] Retirerait l'annonce expirée ${listing.name} (${listing.price} ◆)`);
            continue;
          }
          try {
            await kyaraApi(`/market/listings/${encodeURIComponent(listing.id)}/cancel`, { method: "POST" });
            activeListings = activeListings.filter((x) => x.id !== listing.id);
            previousActiveListings.delete(String(listing.id));
            await appendJournal("sell", `Annonce retirée (> ${expireHours}h) : ${listing.name} (${listing.price} ◆)`);
            if (currentSettings.autoSellRecycleExpired) {
              await kyaraApi(`/me/collection/${listing.characterId}/recycle`, {
                method: "POST",
                body: { qty: 1 }
              }).catch(() => {});
              await appendJournal("recycle", `Annonce expirée recyclée : ${listing.name} ×1`);
            }
          } catch {
            // Listing may have bids or already closed
          }
        }
      }
    }

    const maxSlots = Math.max(1, Math.min(10, Number(currentSettings.autoSellMaxListings ?? 10)));
    let slotsAvailable = Math.max(0, maxSlots - activeListings.length);
    if (slotsAvailable <= 0) {
      return { listedCount: 0, slotsAvailable: 0 };
    }

    const alreadyListedCharIds = new Set(activeListings.map((l) => l.characterId));
    const candidates = (dashboard?.duplicates || []).filter(
      (d) => d.canAutoSell && d.spare > 0 && !alreadyListedCharIds.has(d.characterId)
    );

    let listedCount = 0;
    for (const cand of candidates) {
      if (slotsAvailable <= 0) break;

      const [liveListingsRes, liveOrdersRes, livePricesRes] = await Promise.all([
        kyaraApi(`/market/listings?characterId=${cand.characterId}&type=fixed&sort=price_asc&pageSize=20`, {
          auth: false
        }).catch(() => null),
        kyaraApi(`/market/buy-orders?characterId=${cand.characterId}`, { auth: false }).catch(() => null),
        kyaraApi(`/market/prices/${cand.characterId}`, { auth: false }).catch(() => null)
      ]);

      const activeComp = (Array.isArray(liveListingsRes?.items) ? liveListingsRes.items : []).filter(
        (item) => item.status === "active" && (!item.endsAt || Date.parse(item.endsAt) > Date.now())
      );
      const lowestFixed =
        activeComp.length > 0 ? Math.min(...activeComp.map((i) => Number(i.price) || Infinity)) : null;
      const highestFixed = activeComp.length > 0 ? Math.max(...activeComp.map((i) => Number(i.price) || 0)) : null;
      const orders = Array.isArray(liveOrdersRes) ? liveOrdersRes : [];
      const bestBuyOrder = orders.length > 0 ? Math.max(...orders.map((o) => Number(o.price) || 0)) : null;

      const liveStats = {
        median7d: livePricesRes?.median7d ?? cand.median7d,
        median30d: livePricesRes?.median30d ?? cand.median30d,
        sales7d: livePricesRes?.sales7d ?? cand.sales7d,
        lowestFixed: Number.isFinite(lowestFixed) ? lowestFixed : null,
        highestFixed: Number.isFinite(highestFixed) && highestFixed > 0 ? highestFixed : null,
        bestBuyOrder: Number.isFinite(bestBuyOrder) && bestBuyOrder > 0 ? bestBuyOrder : null
      };

      const reevaluated = Analytics.evaluateDuplicate(
        { id: cand.characterId, name: cand.name, rarity: cand.rarity, series: cand.series },
        { characterId: cand.characterId, qty: cand.qty },
        liveStats,
        { [cand.rarity]: cand.recycleValue },
        currentSettings,
        cand.activeListedQty
      );

      if (reevaluated.verdict !== "VENDRE") {
        continue;
      }

      const sellPrice = reevaluated.prices.recommended;
      const netProceeds = reevaluated.fees.netProceeds;
      const durationHours = [12, 24, 48].includes(Number(currentSettings.autoSellDurationHours))
        ? Number(currentSettings.autoSellDurationHours)
        : 12;

      if (currentSettings.dryRun) {
        listedCount += 1;
        slotsAvailable -= 1;
        alreadyListedCharIds.add(cand.characterId);
        await appendJournal(
          "sell",
          `[SIMULATION] Mettrait en vente ${cand.name} [${cand.rarity}] à ${sellPrice} ◆ (net ${netProceeds} ◆)`
        );
        continue;
      }

      try {
        const created = await kyaraApi("/market/listings", {
          method: "POST",
          withPass: true,
          body: {
            characterId: cand.characterId,
            type: "fixed",
            price: sellPrice,
            buyoutPrice: null,
            durationHours
          }
        });
        listedCount += 1;
        slotsAvailable -= 1;
        alreadyListedCharIds.add(cand.characterId);
        if (created?.id) {
          previousActiveListings.set(String(created.id), {
            characterId: cand.characterId,
            name: cand.name,
            price: sellPrice,
            endsAt: created.endsAt || null,
            createdAt: created.createdAt || new Date().toISOString()
          });
        }
        await appendJournal(
          "sell",
          `Mise en vente auto : ${cand.name} [${cand.rarity}] à ${sellPrice} ◆ (net +${netProceeds} ◆ · prob 24h ${reevaluated.saleProb.p24h}%)`
        );
      } catch (err) {
        await appendJournal("warn", `Échec mise en vente ${cand.name} : ${err.message}`);
        if (err.code === "too_many_listings" || err.code === "pass_required") {
          break;
        }
      }
    }

    return { listedCount, slotsAvailable };
  }

  /**
   * 3. AUTO-ACHAT / FLIP : Automatically buy underpriced market deals.
   */
  async function executeAutoBuy(dashboard) {
    if (!currentSettings.autoBuyFlipEnabled && !currentSettings.autoBuyMissingEnabled) {
      return { boughtCount: 0 };
    }

    const ownedSet = new Set();
    const rawColl = await kyaraApi("/me/collection?lean=1").catch(() => []);
    for (const e of Array.isArray(rawColl) ? rawColl : []) {
      if (e.qty > 0) ownedSet.add(Number(e.characterId));
    }

    const deals = await scanMarketDealsInternal(ownedSet);
    let currentChakra = Number(dashboard?.me?.chakra ?? 0);
    const minReserve = Math.max(0, Number(currentSettings.autoBuyMinChakraReserve ?? 500));
    let boughtCount = 0;

    for (const deal of deals) {
      const shouldBuyFlip = currentSettings.autoBuyFlipEnabled && deal.isGoodFlip;
      const shouldBuyMissing =
        currentSettings.autoBuyMissingEnabled && deal.isGoodMissingBuy && !ownedSet.has(deal.characterId);
      if (!shouldBuyFlip && !shouldBuyMissing) continue;

      if (currentChakra - deal.buyPrice < minReserve) {
        continue;
      }

      try {
        const freshListing = await kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}`, { auth: true });
        if (!freshListing || freshListing.status !== "active" || freshListing.isMine) continue;
        const freshPrice = freshListing.type === "fixed" ? freshListing.price : freshListing.buyoutPrice;
        if (!Number.isFinite(freshPrice) || freshPrice > deal.buyPrice) continue;

        if (currentSettings.dryRun) {
          boughtCount += 1;
          currentChakra -= freshPrice;
          await appendJournal(
            "buy",
            `[SIMULATION] Achèterait ${deal.name} [${deal.rarity}] à ${freshPrice} ◆ (${
              shouldBuyFlip ? `Flip net +${deal.flipProfit} ◆` : "Carte manquante"
            })`
          );
          continue;
        }

        const buyRes = await kyaraApi(`/market/listings/${encodeURIComponent(deal.listingId)}/buy`, {
          method: "POST",
          withPass: true
        });
        boughtCount += 1;
        currentChakra = Number(buyRes?.user?.chakra ?? currentChakra - freshPrice);
        ownedSet.add(deal.characterId);
        const reasonTag = shouldBuyFlip
          ? `Flip : revente cible ~${deal.targetResalePrice} ◆ (net +${deal.flipProfit} ◆, -${deal.discountPct}%)`
          : `Nouvelle carte pour la collection (médiane ${deal.refMedian ?? "?"} ◆)`;
        await appendJournal("buy", `Achat auto : ${deal.name} [${deal.rarity}] pour ${freshPrice} ◆ · ${reasonTag}`);
        notifyDesktop(
          "Bon plan acheté !",
          `${deal.name} [${deal.rarity}] achetée à ${freshPrice} ◆ (${reasonTag})`,
          "km-buy"
        );
      } catch (err) {
        if (err.code !== "listing_closed" && err.status !== 404) {
          await appendJournal("warn", `Achat annulé sur ${deal.name} : ${err.message}`);
        }
      }
    }

    return { boughtCount, dealsFound: deals.length };
  }

  /**
   * Navigate the SvelteKit SPA client-side without full page reload.
   */
  async function navigateSpaTo(targetPath) {
    if (location.pathname === targetPath) return true;
    const existingLink = document.querySelector(`a[href="${CSS.escape(targetPath)}"]`);
    if (existingLink) {
      existingLink.click();
    } else {
      const a = document.createElement("a");
      a.href = targetPath;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    const start = Date.now();
    while (Date.now() - start < 4000) {
      if (location.pathname === targetPath) return true;
      await sleep(80);
    }
    return location.pathname === targetPath;
  }

  /**
   * Wait for a DOM selector to appear and match an optional predicate.
   */
  async function waitForElement(selector, { timeoutMs = 6000, predicate = null } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const els = Array.from(document.querySelectorAll(selector));
      for (const el of els) {
        if (!predicate || predicate(el)) return el;
      }
      await sleep(90);
    }
    return null;
  }

  /**
   * 4. LIVE BOOSTER OPENING PILOT :
   * Pilots the actual Kyara.games `/ouvrir/<packId>` interface so the user sees the booster
   * opening animation, card flips, and summary live on screen!
   */
  async function pilotLiveBoosterOpening(packId, packName, requestedCount = 1) {
    if (isLiveOpening) {
      return { openedCount: 0, newCardsCount: 0, busy: true };
    }
    isLiveOpening = true;
    setHudStatusText(`Ouverture live : ${packName}…`);

    try {
      const targetPath = `/ouvrir/${encodeURIComponent(packId)}`;
      await navigateSpaTo(targetPath);

      // If we were already on /ouvrir/:id in summary state, click "Ouvrir un autre" / reset to ready or wait for .btn-open
      const openBtn = await waitForElement("button.btn.btn-open", {
        timeoutMs: 6500,
        predicate: (btn) => !btn.disabled
      });

      if (!openBtn) {
        // Fallback to API if the page is not interactive (e.g., background/minimized tab or modal blocking)
        return await fallbackApiOpenBooster(packId, packName, requestedCount);
      }

      // --- SÉCURITÉ GARDE-FOU 0 ◆ (INTERDICTION ABSOLUE D'OUVRIR DU PAYANT) ---
      const btnText = (openBtn.innerText || "").trim();
      const btnHtml = openBtn.innerHTML || "";
      const isExplicitlyFree = /Free|Gratuit/i.test(btnText) || /Free|Gratuit/i.test(btnHtml);
      const containsChakraPrice = /◆|Chakra/i.test(btnText) || /◆|Chakra/i.test(btnHtml);

      if (!isExplicitlyFree || containsChakraPrice) {
        await appendJournal(
          "warn",
          `SÉCURITÉ 0 ◆ : Ce booster n'est pas gratuit (« ${btnText.replace(/\n/g, " ")} »). Ouverture annulée pour protéger votre Chakra !`
        );
        notifyDesktop(
          "Garde-fou 0 ◆ actif",
          `Ouverture annulée : ce booster requiert du Chakra (« ${btnText.replace(/\n/g, " ")} »).`,
          "km-guard"
        );
        return { openedCount: 0, newCardsCount: 0, blockedForChakra: true };
      }

      // Extraire le nombre de boosters gratuits restants (ex: "Free · 10 left" ou "Gratuit · 3 restants")
      const freeLeftMatch = btnText.match(/(\d+)\s*(?:left|restant)/i);
      const detectedFreeLeft = freeLeftMatch ? parseInt(freeLeftMatch[1], 10) : null;
      if (detectedFreeLeft !== null && detectedFreeLeft <= 0) {
        await appendJournal("warn", "SÉCURITÉ 0 ◆ : Aucun booster gratuit restant détecté sur l'interface. Clic annulé !");
        return { openedCount: 0, newCardsCount: 0, blockedForChakra: true };
      }

      // S'assurer que le multiplicateur sélectionné (×1, ×5, ×10) ne dépasse JAMAIS le quota gratuit restant
      const isSummaryStage = Boolean(document.querySelector(".summary"));
      if (!isSummaryStage) {
        const safeLimit = detectedFreeLeft !== null ? Math.min(requestedCount, detectedFreeLeft) : requestedCount;
        if (safeLimit < 1) {
          await appendJournal("warn", "SÉCURITÉ 0 ◆ : Aucun booster gratuit disponible pour ce tirage.");
          return { openedCount: 0, newCardsCount: 0, blockedForChakra: true };
        }
        const targetMult = safeLimit >= 10 ? 10 : safeLimit >= 5 ? 5 : 1;
        const multButtons = Array.from(document.querySelectorAll(".multi button"));
        const matchBtn =
          multButtons.find((b) => (b.textContent || "").trim() === `×${targetMult}`) ||
          multButtons[0];
        if (matchBtn && !matchBtn.classList.contains("on")) {
          matchBtn.click();
          await sleep(160);
        }
      }

      const pullTimestampBefore = Date.now();
      openBtn.click();

      // Wait for `.reveal` or `.summary` stage to mount (Turnstile + pack tear animation)
      const stageReached = await waitForElement(".reveal, .summary", { timeoutMs: 14000 });
      if (!stageReached) {
        return { openedCount: 0, newCardsCount: 0 };
      }

      // Step through card reveals live on screen so the user watches every card flip (data-step="i:0" -> "i:1")!
      const revealStart = Date.now();
      while (Date.now() - revealStart < 55000) {
        if (document.querySelector(".summary")) {
          break;
        }

        // If an Epic/Legendary/Mythic clue screen (`.wo button.skip`) is active, let it play briefly then advance
        const skipClueBtn = document.querySelector(".wo button.skip");
        if (skipClueBtn) {
          await sleep(750);
          skipClueBtn.click();
          await sleep(400);
          continue;
        }

        // Flip or advance the current card on `.reveal .deck` via Space keydown (triggers Kyara's native Io() handler)
        const deckEl = document.querySelector(".reveal .deck");
        if (deckEl) {
          const stepAttr = deckEl.getAttribute("data-step") || "";
          const isFaceUp = stepAttr.endsWith(":1");
          deckEl.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          // Give slightly more time right after flipping face-up so the user sees the card art & rarity glow
          await sleep(isFaceUp ? 420 : 680);
        } else {
          await sleep(300);
        }
      }

      // Extract pull details from either the `kyara:pull` event or the `.summary` DOM
      const recentPull = lastPullEvents.find((e) => e.at >= pullTimestampBefore)?.detail || null;
      const pulledCards = Array.isArray(recentPull?.cards) ? recentPull.cards : [];
      const newCards = pulledCards.filter((c) => c.isNew);
      const highRarity = pulledCards.filter((c) => c.rarity === "L" || c.rarity === "M");
      const openedCount = pulledCards.length > 0 ? Math.max(1, Math.round(pulledCards.length / 5)) : 1;

      const raritySummary = Analytics.RARITIES.map((r) => {
        const n = pulledCards.filter((c) => c.rarity === r).length;
        return n > 0 ? `${r}×${n}` : null;
      })
        .filter(Boolean)
        .join(" ");

      await recordCumulativeMetric({
        boostersOpenedCount: openedCount,
        newCardsPulledCount: newCards.length,
        mythicsPulledCount: pulledCards.filter((c) => c.rarity === "M").length,
        legendariesPulledCount: pulledCards.filter((c) => c.rarity === "L").length
      });

      await appendJournal(
        "open",
        `Booster « ${packName} » ouvert en live (×${openedCount}) : ${newCards.length} nouveau(x) perso(s)${
          raritySummary ? ` (${raritySummary})` : ""
        }`
      );

      if (highRarity.length > 0) {
        const names = highRarity.map((c) => `${c.name} [${c.rarity}]`).join(", ");
        notifyDesktop("Tirage Légendaire / Mythique !", `Obtenu dans ${packName} : ${names}`, "km-pull");
      }

      return { openedCount, newCardsCount: newCards.length };
    } catch (err) {
      await appendJournal("warn", `Ouverture live « ${packName} » interrompue : ${err.message}`);
      return { openedCount: 0, newCardsCount: 0 };
    } finally {
      isLiveOpening = false;
    }
  }

  async function fallbackApiOpenBooster(packId, packName, countToOpen = 1) {
    const reqId = newRequestId();
    let results = [];
    if (countToOpen <= 1) {
      const single = await kyaraApi(`/packs/${encodeURIComponent(packId)}/open`, {
        method: "POST",
        withPass: true,
        extraHeaders: { "x-request-id": reqId },
        body: { maxChakra: 0 }
      });
      if (single) {
        results = [single];
        window.dispatchEvent(new CustomEvent("kyara:pull", { detail: single }));
      }
    } else {
      const many = await kyaraApi(`/packs/${encodeURIComponent(packId)}/open-many`, {
        method: "POST",
        withPass: true,
        extraHeaders: { "x-request-id": reqId },
        body: { count: Math.min(10, countToOpen), maxChakra: 0 }
      });
      results = Array.isArray(many?.results) ? many.results : [];
      const last = results[results.length - 1];
      if (last) {
        window.dispatchEvent(new CustomEvent("kyara:pull", { detail: last }));
      }
    }

    const pulledCards = results.flatMap((r) => r.cards || []);
    const newCards = pulledCards.filter((c) => c.isNew);
    const highRarity = pulledCards.filter((c) => c.rarity === "L" || c.rarity === "M");

    if (results.length > 0) {
      await recordCumulativeMetric({
        boostersOpenedCount: results.length,
        newCardsPulledCount: newCards.length,
        mythicsPulledCount: pulledCards.filter((c) => c.rarity === "M").length,
        legendariesPulledCount: pulledCards.filter((c) => c.rarity === "L").length
      });

      const raritySummary = Analytics.RARITIES.map((r) => {
        const n = pulledCards.filter((c) => c.rarity === r).length;
        return n > 0 ? `${r}×${n}` : null;
      })
        .filter(Boolean)
        .join(" ");

      await appendJournal(
        "open",
        `Booster « ${packName} » ×${results.length} ouvert : ${newCards.length} nouveau(x) perso(s) (${raritySummary})`
      );

      if (highRarity.length > 0) {
        const names = highRarity.map((c) => `${c.name} [${c.rarity}]`).join(", ");
        notifyDesktop("Tirage Légendaire / Mythique !", `Obtenu dans ${packName} : ${names}`, "km-pull");
      }
    }

    return { openedCount: results.length, newCardsCount: newCards.length };
  }

  async function executeAutoOpenBoosters(dashboard) {
    const boosters = dashboard?.boosters;
    if (!boosters) return { openedCount: 0, newCardsCount: 0 };

    // 1. Pack du jour gratuit automatique (100% sans Chakra garanti)
    if (currentSettings.autoOpenDailyPack !== false) {
      const dailyPack = (boosters.all || []).find((p) => p.packId === "daily");
      if (dailyPack && dailyPack.canOpenNow) {
        await appendJournal("open", `Pack du Jour gratuit disponible (${dailyPack.name || "Pack du Jour"}) ! Lancement…`);
        const dailyRes = await pilotLiveBoosterOpening("daily", dailyPack.name || "Pack du Jour", 1);
        if (dailyRes.openedCount > 0) {
          dashboard = await refreshDashboardSnapshot({ forcePrices: false });
        }
      }
    }

    let targetPack = null;
    if (currentSettings.autoOpenMode === "recommended_ev") {
      targetPack = boosters.recommendedEv;
    } else if (currentSettings.autoOpenMode === "custom" && currentSettings.autoOpenCustomPackId) {
      targetPack =
        (boosters.all || []).find((p) => p.packId === currentSettings.autoOpenCustomPackId) || boosters.recommendedNew;
    } else {
      targetPack = boosters.recommendedNew;
    }

    if (!targetPack || !targetPack.canOpenNow) {
      return { openedCount: 0, newCardsCount: 0 };
    }

    const freeAvailable = Number(targetPack.openableFreeCount || 0);
    const minBatch = Math.max(1, Math.min(10, Number(currentSettings.autoOpenMinBatch ?? 1)));
    const isGaugeFull =
      Number(dashboard?.me?.freePacks ?? 0) >= Number(dashboard?.me?.freePacksMax ?? 10) &&
      Number(dashboard?.me?.freePacksMax ?? 10) > 0;

    if (freeAvailable < minBatch && !isGaugeFull) {
      return { openedCount: 0, newCardsCount: 0, targetPack };
    }

    const countToOpen = Math.min(10, freeAvailable);
    if (countToOpen <= 0) {
      return { openedCount: 0, newCardsCount: 0, targetPack };
    }

    if (currentSettings.dryRun) {
      await appendJournal(
        "open",
        `[SIMULATION] Ouvrirait en live ${countToOpen}× « ${targetPack.name} » (${targetPack.probAtLeastOneNewPct}% chance de nouveau perso)`
      );
      return { openedCount: countToOpen, newCardsCount: 0, targetPack };
    }

    const liveRes = await pilotLiveBoosterOpening(targetPack.packId, targetPack.name, countToOpen);
    return { ...liveRes, targetPack };
  }

  /**
   * 5. AUTO-CLAIM MISSIONS
   */
  async function executeAutoClaimMissions(dashboard) {
    if (!currentSettings.autoClaimMissions || (dashboard?.claimableMissions ?? 0) <= 0) {
      return { claimed: false };
    }
    if (currentSettings.dryRun) {
      await appendJournal("claim", `[SIMULATION] Réclamerait ${dashboard.claimableMissions} récompense(s) de mission`);
      return { claimed: true };
    }
    try {
      const res = await kyaraApi("/me/progress/claim", {
        method: "POST",
        body: { kind: "all" }
      });
      const gainedChakra = res?.gained?.chakra ?? 0;
      const gainedPacks = res?.gained?.bonusPacks ?? 0;
      await appendJournal(
        "claim",
        `Missions réclamées (+${gainedChakra} ◆${gainedPacks ? `, +${gainedPacks} booster(s) bonus` : ""})`
      );
      return { claimed: true };
    } catch {
      return { claimed: false };
    }
  }

  /**
   * Run one complete automation cycle.
   */
  async function runAutomationCycle({ manual = false } = {}) {
    if (isCycleRunning) {
      return { ok: false, error: "Un cycle d'automatisation est déjà en cours." };
    }
    isCycleRunning = true;
    try {
      await loadSettings();
      if (!manual && !currentSettings.masterEnabled) {
        return { ok: true, skipped: true };
      }

      let dashboard = await refreshDashboardSnapshot({
        forcePrices: false,
        scanMarketDeals: Boolean(currentSettings.autoBuyFlipEnabled || currentSettings.autoBuyMissingEnabled || manual)
      });

      if (!dashboard.authenticated) {
        return { ok: false, error: dashboard.error };
      }

      const summary = {
        opened: 0,
        recycledCopies: 0,
        listed: 0,
        bought: 0
      };

      if (currentSettings.autoOpenEnabled) {
        const openRes = await executeAutoOpenBoosters(dashboard);
        summary.opened = openRes.openedCount;
        if (openRes.openedCount > 0) {
          dashboard = await refreshDashboardSnapshot({ forcePrices: false });
        }
      }

      if (currentSettings.autoClaimMissions) {
        await executeAutoClaimMissions(dashboard);
      }

      if (currentSettings.autoRecycleEnabled) {
        const recRes = await executeAutoRecycle(dashboard);
        summary.recycledCopies = recRes.recycledCopies;
      }

      if (currentSettings.autoSellEnabled) {
        const sellRes = await executeAutoSell(dashboard);
        summary.listed = sellRes.listedCount;
      }

      if (currentSettings.autoBuyFlipEnabled || currentSettings.autoBuyMissingEnabled) {
        const buyRes = await executeAutoBuy(dashboard);
        summary.bought = buyRes.boughtCount;
      }

      if (summary.recycledCopies > 0 || summary.listed > 0 || summary.bought > 0) {
        dashboard = await refreshDashboardSnapshot({ forcePrices: false });
      }

      return { ok: true, summary, dashboard };
    } catch (err) {
      await appendJournal("error", `Erreur cycle auto : ${err.message}`);
      return { ok: false, error: String(err?.message || err) };
    } finally {
      isCycleRunning = false;
    }
  }

  /**
   * Anti-AFK: automatically confirm presence when Kyara shows its idle prompt.
   */
  function setupAntiAfkObserver() {
    let clickingIdle = false;
    const checkIdleDialog = () => {
      if (!currentSettings.antiAfkEnabled || clickingIdle) return;
      const dialogs = document.querySelectorAll('[role="dialog"], dialog, .modal, .veil');
      for (const dialog of dialogs) {
        const text = (dialog.textContent || "").toLowerCase();
        if (text.includes("toujours là") || dialog.getAttribute("aria-labelledby") === "idle-t") {
          const buttons = dialog.querySelectorAll("button");
          for (const btn of buttons) {
            const label = (btn.textContent || "").trim().toLowerCase();
            if (
              label.includes("je suis là") ||
              label === "oui" ||
              label.includes("présent") ||
              label.includes("continuer")
            ) {
              clickingIdle = true;
              const delay = 1400 + Math.floor(Math.random() * 1800);
              setTimeout(() => {
                btn.click();
                clickingIdle = false;
                void appendJournal("info", "Anti-AFK : présence confirmée automatiquement");
              }, delay);
              return;
            }
          }
        }
      }
    };

    const observer = new MutationObserver(checkIdleDialog);
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  /**
   * Floating HUD pill injected into kyara.games bottom-left corner (avoids overlapping Kyara Helper on bottom-right)
   */
  function mountFloatingHud() {
    const old = document.getElementById("km-floating-hud");
    if (old) old.remove();

    const hud = document.createElement("aside");
    hud.id = "km-floating-hud";
    hud.className = "km-hud";
    hud.setAttribute("aria-label", "Kyara Manager Autopilot");

    let isCollapsed = false;
    try {
      isCollapsed = localStorage.getItem("km_hud_collapsed") === "1";
    } catch {}
    if (isCollapsed) hud.classList.add("is-collapsed");

    const seal = document.createElement("button");
    seal.type = "button";
    seal.className = "km-hud__seal";
    seal.id = "km-hud-dot";
    seal.textContent = "操";
    seal.title = "Kyara Manager (clique pour réduire/agrandir)";
    seal.addEventListener("click", () => {
      hud.classList.toggle("is-collapsed");
      try {
        localStorage.setItem("km_hud_collapsed", hud.classList.contains("is-collapsed") ? "1" : "0");
      } catch {}
    });

    const info = document.createElement("div");
    info.className = "km-hud__info";

    const title = document.createElement("strong");
    title.className = "km-hud__title";
    title.textContent = "KYARA MANAGER";

    const meta = document.createElement("span");
    meta.className = "km-hud__meta";
    meta.id = "km-hud-meta";
    meta.textContent = "Synchronisation…";

    info.append(title, meta);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "km-hud__btn km-hud__btn--toggle";
    toggleBtn.id = "km-hud-toggle";
    toggleBtn.textContent = "AUTO OFF";
    toggleBtn.addEventListener("click", async () => {
      await loadSettings();
      const next = !currentSettings.masterEnabled;
      currentSettings.masterEnabled = next;
      await chrome.storage.local.set({ settings: currentSettings });
      updateFloatingHud();
      if (next) {
        await appendJournal("info", "Pilote automatique activé");
        void runAutomationCycle({ manual: true });
      } else {
        await appendJournal("info", "Pilote automatique en pause");
      }
    });

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "km-hud__btn km-hud__btn--primary";
    openBtn.textContent = "Panneau";
    openBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "km:open-sidepanel" }).catch(() => {});
    });

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "km-hud__btn km-hud__btn--icon";
    collapseBtn.title = "Réduire le widget";
    collapseBtn.textContent = "−";
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hud.classList.add("is-collapsed");
      try {
        localStorage.setItem("km_hud_collapsed", "1");
      } catch {}
    });

    hud.append(seal, info, toggleBtn, openBtn, collapseBtn);
    document.body.appendChild(hud);
  }

  function setHudStatusText(text) {
    const meta = document.getElementById("km-hud-meta");
    if (meta) meta.textContent = text;
  }

  function updateFloatingHud(dashboard = null) {
    const dot = document.getElementById("km-hud-dot");
    const meta = document.getElementById("km-hud-meta");
    const toggleBtn = document.getElementById("km-hud-toggle");
    if (!dot || !meta || !toggleBtn) return;

    const on = Boolean(currentSettings.masterEnabled);
    dot.classList.toggle("is-on", on);
    toggleBtn.textContent = on ? "AUTO ON" : "AUTO OFF";
    toggleBtn.classList.toggle("is-on", on);

    if (dashboard && dashboard.authenticated && dashboard.me) {
      const listingsCount = dashboard.activeListings?.length ?? 0;
      const maxSlots = currentSettings.autoSellMaxListings ?? 10;
      const freePacks = dashboard.me.freePacks ?? 0;
      const chakra = new Intl.NumberFormat("fr-FR").format(dashboard.me.chakra ?? 0);
      meta.textContent = `${dashboard.me.pseudo} · ${chakra} ◆ · ${freePacks}/10 札 · ${listingsCount}/${maxSlots} 市`;
    } else if (dashboard && !dashboard.authenticated) {
      meta.textContent = "Non connecté";
    }
  }

  function restartLoopTimer() {
    if (loopTimer) clearInterval(loopTimer);
    const intervalMs = Math.max(20, Number(currentSettings.loopIntervalSec || 45)) * 1000;
    loopTimer = setInterval(() => {
      if (currentSettings.masterEnabled) {
        void runAutomationCycle({ manual: false });
      }
    }, intervalMs);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (!message || typeof message.type !== "string") {
          sendResponse({ ok: false });
          return;
        }

        if (message.type === "km:alarm-tick") {
          const res = await runAutomationCycle({ manual: false });
          sendResponse(res);
          return;
        }

        if (message.type === "km:cmd:refresh") {
          const dashboard = await refreshDashboardSnapshot({
            forcePrices: Boolean(message.forcePrices),
            scanMarketDeals: Boolean(message.scanMarketDeals)
          });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:run-cycle") {
          const res = await runAutomationCycle({ manual: true });
          sendResponse(res);
          return;
        }

        if (message.type === "km:cmd:sell-now") {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const sellRes = await executeAutoSell(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, sellRes, dashboard: updated });
          return;
        }

        if (message.type === "km:cmd:recycle-now") {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const recRes = await executeAutoRecycle(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, recRes, dashboard: updated });
          return;
        }

        if (message.type === "km:cmd:open-recommended") {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const openRes = await executeAutoOpenBoosters(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, openRes, dashboard: updated });
          return;
        }

        if (message.type === "km:cmd:scan-deals") {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: true });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:single-sell") {
          const { characterId, price, durationHours = 12 } = message;
          await kyaraApi("/market/listings", {
            method: "POST",
            withPass: true,
            body: {
              characterId: Number(characterId),
              type: "fixed",
              price: Number(price),
              buyoutPrice: null,
              durationHours: Number(durationHours)
            }
          });
          await appendJournal("sell", `Vente directe : Carte #${characterId} mise en vente à ${price} ◆`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:single-recycle") {
          const { characterId, qty = 1, name = `Carte #${characterId}` } = message;
          const res = await kyaraApi(`/me/collection/${Number(characterId)}/recycle`, {
            method: "POST",
            body: { qty: Number(qty) }
          });
          await appendJournal("recycle", `Recyclage direct : ${name} ×${qty} (+${res?.gained ?? "?"} ◆)`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:buy-listing") {
          const { listingId, name = "Carte", price = 0 } = message;
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/buy`, {
            method: "POST",
            withPass: true
          });
          await appendJournal("buy", `Achat direct : ${name} achetée pour ${price} ◆`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: true });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:cancel-listing") {
          const { listingId, name = "Annonce" } = message;
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/cancel`, {
            method: "POST"
          });
          previousActiveListings.delete(String(listingId));
          await appendJournal("info", `Annonce retirée : ${name}`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === "km:cmd:reset-roi") {
          const resetStats = { ...DEFAULT_CUMULATIVE_STATS, startedAt: Date.now() };
          await chrome.storage.local.set({ kmCumulativeStats: resetStats });
          sendResponse({ ok: true, stats: resetStats });
          return;
        }

        if (message.type === "km:cmd:toggle-pin") {
          const charId = Number(message.characterId);
          if (Number.isFinite(charId) && charId > 0) {
            const { kmPinnedCards = [] } = await chrome.storage.local.get("kmPinnedCards");
            const set = new Set(kmPinnedCards.map(Number));
            let isPinned = false;
            if (set.has(charId)) {
              set.delete(charId);
              isPinned = false;
              await appendJournal("info", `Protection retirée pour la carte #${charId}`);
            } else {
              set.add(charId);
              isPinned = true;
              await appendJournal("info", `Carte #${charId} protégée (épargnée de la vente et du recyclage)`);
            }
            await chrome.storage.local.set({ kmPinnedCards: Array.from(set) });
            const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
            sendResponse({ ok: true, isPinned, characterId: charId, dashboard });
            return;
          }
        }

        if (message.type === "km:cmd:open-pack") {
          const { packId, packName = packId, count = 1 } = message;
          const openRes = await pilotLiveBoosterOpening(packId, packName, Number(count) || 1);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, openRes, dashboard });
          return;
        }

        sendResponse({ ok: false, error: "Commande inconnue" });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings?.newValue) {
      currentSettings = { ...Analytics.DEFAULT_SETTINGS, ...changes.settings.newValue };
      updateFloatingHud();
      restartLoopTimer();
    }
  });

  // Boot sequence
  (async () => {
    await loadSettings();
    mountFloatingHud();
    setupAntiAfkObserver();
    restartLoopTimer();
    const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: false }).catch(() => null);
    if (currentSettings.masterEnabled && dashboard?.authenticated) {
      void runAutomationCycle({ manual: false });
    }
  })();
})();
