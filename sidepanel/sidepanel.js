(() => {
  const Analytics = globalThis.KyaraAnalytics;
  const i18n = globalThis.KyaraI18n || {
    t: (k) => k,
    setLanguage: () => "fr",
    getLanguage: () => "fr",
    detectLanguage: () => "fr"
  };
  const fmt = new Intl.NumberFormat("fr-FR");

  let currentSettings = { ...Analytics.DEFAULT_SETTINGS };
  let currentDashboard = null;
  let currentJournal = [];
  let currentCumulativeStats = {
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
  let currentPinnedCards = new Set();
  let currentWishlist = [];
  let toastTimeout = null;

  function showToast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatChakra(n) {
    if (!Number.isFinite(Number(n))) return "—";
    return `${fmt.format(Math.round(Number(n)))} ◆`;
  }

  async function sendCmd(payload) {
    try {
      const res = await chrome.runtime.sendMessage(payload);
      return res || { ok: false, error: "Aucune réponse" };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }

  function applyTranslations() {
    if (!i18n) return;
    i18n.setLanguage(currentSettings.language || "auto");

    const setText = (selector, key, params) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = i18n.t(key, params);
    };

    // Header & Brand
    setText("#btn-refresh span", "refresh");
    setText("#btn-open-kyara", "openKyara");
    setText("#btn-fullscreen span", "btnFullscreen");
    const btnFs = document.getElementById("btn-fullscreen");
    if (btnFs) btnFs.title = i18n.t("btnFullscreen");
    setText("#connection-banner-text", "connectionBannerText");

    // Tabs
    const tabMap = {
      autopilot: "tabAutopilot",
      duplicates: "tabDuplicates",
      market: "tabMarket",
      wishlist: "tabWishlist",
      boosters: "tabBoosters",
      settings: "tabSettings"
    };
    for (const [id, k] of Object.entries(tabMap)) {
      setText(`#tab-${id} .tab-label`, k);
    }

    // KPIs
    setText(".kpi-card--chakra .kpi-card__label", "kpiChakra");
    setText(".kpi-card--packs .kpi-card__label", "kpiBoosters");
    setText(".kpi-card--listings .kpi-card__label", "kpiMarket");
    setText(".kpi-card--pity .kpi-card__label", "kpiPity");

    // Autopilot Hero
    setText(".hero-title", "heroTitle");
    setText(".hero-desc", "heroDesc");
    setText("#btn-run-cycle span", "runCycleNow");
    setText("#dry-run-indicator", "dryRunPill");
    const heroText = document.getElementById("hero-status-text");
    if (heroText) {
      heroText.textContent = currentSettings.masterEnabled ? i18n.t("statusActive") : i18n.t("statusIdle");
    }

    // Autopilot Modules
    setText(".module-card--sell .module-card__title", "modSellTitle");
    setText(".module-card--sell .module-card__desc", "modSellDesc");
    setText("#btn-sell-now", "sellNow");

    setText(".module-card--recycle .module-card__title", "modRecycleTitle");
    setText(".module-card--recycle .module-card__desc", "modRecycleDesc");
    setText("#btn-recycle-now", "recycleNow");

    setText(".module-card--boosters .module-card__title", "modBoostersTitle");
    setText(".module-card--boosters .module-card__desc", "modBoostersDesc");

    setText(".module-card--market .module-card__title", "modMarketTitle");
    setText(".module-card--market .module-card__desc", "modMarketDesc");
    setText(".module-card__sublabel", "modBuyMissing");

    setText("label[for='sw-autoclaim']", "modMissionsTitle");
    setText("label[for='sw-antiafk']", "modAntiAfkTitle");

    // ROI Dashboard
    setText(".card--roi .card__title", "roiTitle");
    setText(".card--roi .card__subtitle", "roiSubtitle");
    setText(".roi-stat-box--chakra .roi-stat-box__label", "roiTotalChakra");
    setText(".roi-stat-box:nth-child(2) .roi-stat-box__label", "roiSales");
    setText(".roi-stat-box:nth-child(3) .roi-stat-box__label", "roiRecycle");
    setText(".roi-stat-box:nth-child(4) .roi-stat-box__label", "roiBoosters");
    setText("#btn-reset-roi", "reset");

    // Journal
    setText(".journal-title-wrap .card__title", "journalTitle");
    setText("#btn-clear-journal", "clear");

    // Duplicates filters
    const dupFilter = document.getElementById("dup-filter");
    if (dupFilter && dupFilter.options.length >= 5) {
      dupFilter.options[0].text = i18n.t("filterAll");
      dupFilter.options[1].text = i18n.t("filterSell");
      dupFilter.options[2].text = i18n.t("filterRecycle");
      dupFilter.options[3].text = i18n.t("filterHold");
      dupFilter.options[4].text = i18n.t("filterProtected");
    }
    const dupSearch = document.getElementById("dup-search");
    if (dupSearch) dupSearch.placeholder = i18n.t("searchPlaceholder");

    // Duplicates table headers
    const dupThs = document.querySelectorAll(".data-table--duplicates thead th");
    if (dupThs.length >= 7) {
      dupThs[0].textContent = i18n.t("thCharacter");
      dupThs[1].textContent = i18n.t("thSpare");
      dupThs[2].textContent = i18n.t("thMedian7d");
      dupThs[3].textContent = i18n.t("thPriceNet");
      dupThs[4].textContent = i18n.t("thRecycle");
      dupThs[5].textContent = i18n.t("thDecision");
      dupThs[6].textContent = i18n.t("thProtect");
    }

    // Active listings table headers
    setText(".card--sub .card__title", "activeListingsTitle");
    const activeThs = document.querySelectorAll(".data-table--active-listings thead th");
    if (activeThs.length >= 4) {
      activeThs[0].textContent = i18n.t("thCharacter");
      activeThs[1].textContent = i18n.t("thPrice");
      activeThs[2].textContent = i18n.t("thExpires");
      activeThs[3].textContent = i18n.t("thAction");
    }

    // Market filters
    const mktFilter = document.getElementById("market-filter");
    if (mktFilter && mktFilter.options.length >= 3) {
      mktFilter.options[0].text = i18n.t("filterAllDeals");
      mktFilter.options[1].text = i18n.t("filterFlipsOnly");
      mktFilter.options[2].text = i18n.t("filterMissingOnly");
    }
    setText("#btn-scan-market span", "btnScanDeals");

    // Market table headers
    const mktThs = document.querySelectorAll(".data-table--market thead th");
    if (mktThs.length >= 6) {
      mktThs[0].textContent = i18n.t("thCard");
      mktThs[1].textContent = i18n.t("thBuy");
      mktThs[2].textContent = i18n.t("thMedian7d");
      mktThs[3].textContent = i18n.t("thResale");
      mktThs[4].textContent = i18n.t("thNetMargin");
      mktThs[5].textContent = i18n.t("thAction");
    }

    // Boosters headers & tags
    setText(".rec-tag--new", "recTagNew");
    setText(".rec-tag--ev", "recTagEv");
    setText("#panel-boosters .card--sub .card__title", "allPacksTitle");
    const boosterThs = document.querySelectorAll(".data-table--boosters thead th");
    if (boosterThs.length >= 6) {
      boosterThs[0].textContent = i18n.t("thPack");
      boosterThs[1].textContent = i18n.t("thCompletion");
      boosterThs[2].textContent = i18n.t("thProbNew");
      boosterThs[3].textContent = i18n.t("thExpectedNew");
      boosterThs[4].textContent = i18n.t("thExpectedChakra");
      boosterThs[5].textContent = i18n.t("thLive");
    }

    // Wishlist headers & tags
    setText("#panel-wishlist .card__title", "wishlistTitle");
    setText("#panel-wishlist .card__desc", "wishlistDesc");
    const wishSearch = document.getElementById("wishlist-search-input");
    if (wishSearch) wishSearch.placeholder = i18n.t("wishlistSearchPlaceholder");
    const wishBudget = document.getElementById("wishlist-budget-input");
    if (wishBudget) wishBudget.placeholder = i18n.t("wishlistBudgetLabel");
    setText("#btn-add-wish span", "wishlistBtnAdd");
    const wishThs = document.querySelectorAll(".data-table--wishlist thead th");
    if (wishThs.length >= 5) {
      wishThs[0].textContent = i18n.t("thWishCharacter");
      wishThs[1].textContent = i18n.t("thWishFloor");
      wishThs[2].textContent = i18n.t("thWishBudget");
      wishThs[3].textContent = i18n.t("thWishStatus");
      wishThs[4].textContent = i18n.t("thWishAction");
    }
    setText("#panel-wishlist .card--sub .card__title", "wishlistDailySuggestions");
    setText("#turbo-liquidite-banner .turbo-banner__title", "turboBannerTitle");

    // Settings actions
    const btnSave = document.querySelector("#settings-form button[type='submit']");
    if (btnSave) btnSave.textContent = i18n.t("btnSaveSettings");
    const btnReset = document.getElementById("btn-reset-settings");
    if (btnReset) btnReset.textContent = i18n.t("btnDefaultSettings");
  }

  function setupTabs() {
    const buttons = Array.from(document.querySelectorAll(".tab-btn"));
    const panels = Array.from(document.querySelectorAll(".tab-panel"));

    function activateTab(target, focusBtn = false) {
      for (const b of buttons) {
        const active = b.dataset.tab === target;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
        b.setAttribute("tabindex", active ? "0" : "-1");
        if (active && focusBtn) b.focus();
      }
      for (const p of panels) {
        p.classList.toggle("is-active", p.id === `panel-${target}`);
      }
    }

    const tabNav = document.querySelector(".tab-nav");
    if (tabNav) {
      tabNav.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0 && tabNav.scrollWidth > tabNav.clientWidth) {
          e.preventDefault();
          tabNav.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    buttons.forEach((btn, index) => {
      const isSelected = btn.getAttribute("aria-selected") === "true";
      btn.setAttribute("tabindex", isSelected ? "0" : "-1");

      btn.addEventListener("click", () => {
        activateTab(btn.dataset.tab);
      });

      btn.addEventListener("keydown", (e) => {
        let nextIndex = null;
        if (e.key === "ArrowRight") {
          nextIndex = (index + 1) % buttons.length;
        } else if (e.key === "ArrowLeft") {
          nextIndex = (index - 1 + buttons.length) % buttons.length;
        } else if (e.key === "Home") {
          nextIndex = 0;
        } else if (e.key === "End") {
          nextIndex = buttons.length - 1;
        }
        if (nextIndex !== null) {
          e.preventDefault();
          const nextBtn = buttons[nextIndex];
          activateTab(nextBtn.dataset.tab, true);
        }
      });
    });
  }

  function renderSettingsControls() {
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(val);
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = String(val);
    };

    setCheck("sw-master", currentSettings.masterEnabled);
    setCheck("sw-autosell", currentSettings.autoSellEnabled);
    setCheck("sw-autorecycle", currentSettings.autoRecycleEnabled);
    setCheck("sw-autobuy-flip", currentSettings.autoBuyFlipEnabled);
    setCheck("sw-autobuy-missing", currentSettings.autoBuyMissingEnabled);
    setCheck("sw-autoopen", currentSettings.autoOpenEnabled);
    setCheck("sw-autoclaim", currentSettings.autoClaimMissions);
    setCheck("sw-antiafk", currentSettings.antiAfkEnabled);

    const dryIndicator = document.getElementById("dry-run-indicator");
    if (dryIndicator) {
      dryIndicator.hidden = !currentSettings.dryRun;
    }

    const heroBeacon = document.getElementById("hero-status-beacon");
    const heroText = document.getElementById("hero-status-text");
    if (heroBeacon && heroText) {
      if (currentSettings.masterEnabled) {
        heroBeacon.className = "status-beacon is-active";
        heroText.textContent = "PILOTE ACTIF";
      } else {
        heroBeacon.className = "status-beacon is-idle";
        heroText.textContent = "PILOTE EN VEILLE";
      }
    }

    setVal("cfg-price-strategy", currentSettings.autoSellStrategy);
    setVal("cfg-max-listings", currentSettings.autoSellMaxListings);
    setVal("cfg-min-net-gain", currentSettings.autoSellMinNetOverRecycle);
    setVal("cfg-sell-duration", currentSettings.autoSellDurationHours);
    setCheck("cfg-guardrail-70", Number(currentSettings.autoSellMedianFloorPct ?? 70) >= 70);
    setCheck("cfg-crash-protection", currentSettings.autoSellCrashProtection !== false);
    setCheck("cfg-turbo-liquidity", currentSettings.autoSellTurboLiquidity !== false);
    setVal("cfg-turbo-max-net", currentSettings.autoSellTurboMaxNetProfit ?? 4);
    setCheck("cfg-wishlist-autobuy", Boolean(currentSettings.wishlistAutoBuyEnabled));
    setCheck("cfg-velocity-check", currentSettings.autoSellVelocityFirst !== false);
    setCheck("cfg-relist-expired", Number(currentSettings.autoSellExpireHours ?? 12) > 0);
    setCheck("cfg-hold-surging", currentSettings.speculateHoldSurging !== false);
    setVal("cfg-surge-pct", currentSettings.speculateSurgeThresholdPct ?? 20);

    setVal("cfg-keep-copies", 1);
    setVal("cfg-recycle-max-market", currentSettings.autoRecycleMaxMarketNet);

    const allowedRarities = new Set(currentSettings.autoRecycleRarities || ["C", "U", "R", "E"]);
    for (const chk of document.querySelectorAll(".cfg-rec-rarity")) {
      chk.checked = allowedRarities.has(chk.value);
    }

    setVal("cfg-buy-reserve", currentSettings.autoBuyMinChakraReserve);
    setVal("cfg-buy-max-price", currentSettings.autoBuyMaxUnitPrice);
    setVal("cfg-buy-min-profit", currentSettings.autoBuyMinFlipProfit);
    setVal("cfg-buy-min-discount", currentSettings.autoBuyMinDiscountPct);
    setVal("cfg-buy-min-sales7d", currentSettings.autoBuyMinSales7d);

    setVal("cfg-open-mode", currentSettings.autoOpenMode);
    setVal("cfg-open-min-batch", currentSettings.autoOpenMinBatch);
    setCheck("cfg-pity-sniper", currentSettings.autoOpenPitySniper !== false);
    setCheck("cfg-daily-pack", currentSettings.autoOpenDailyPack !== false);

    setVal("cfg-loop-interval", currentSettings.loopIntervalSec);
    setCheck("cfg-notifications", currentSettings.notificationsEnabled);
    setCheck("cfg-dry-run", currentSettings.dryRun);

    setVal("cfg-language", currentSettings.language || "auto");
  }

  async function updateSettingPatch(patch) {
    currentSettings = { ...currentSettings, ...patch };
    await chrome.storage.local.set({ settings: currentSettings });
    if (patch.language !== undefined) {
      applyTranslations();
      if (currentDashboard) {
        void renderDashboard();
      }
    }
    renderSettingsControls();
  }

  function setupQuickSwitches() {
    const map = [
      ["sw-master", "masterEnabled"],
      ["sw-autosell", "autoSellEnabled"],
      ["sw-autorecycle", "autoRecycleEnabled"],
      ["sw-autobuy-flip", "autoBuyFlipEnabled"],
      ["sw-autobuy-missing", "autoBuyMissingEnabled"],
      ["sw-autoopen", "autoOpenEnabled"],
      ["sw-autoclaim", "autoClaimMissions"],
      ["sw-antiafk", "antiAfkEnabled"]
    ];

    for (const [id, key] of map) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("change", async () => {
        await updateSettingPatch({ [key]: el.checked });
        showToast(
          `${key === "masterEnabled" ? "Pilote Automatique" : "Module"} ${el.checked ? "activé" : "désactivé"}`
        );
        if (key === "masterEnabled" && el.checked) {
          void sendCmd({ type: "km:cmd:run-cycle" });
        }
      });
    }
  }

  function setupSettingsForm() {
    const form = document.getElementById("settings-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const checkedRarities = Array.from(document.querySelectorAll(".cfg-rec-rarity"))
        .filter((c) => c.checked)
        .map((c) => c.value);

      const guardrailOn = document.getElementById("cfg-guardrail-70").checked;
      const expireOn = document.getElementById("cfg-relist-expired").checked;
      const durationHours = Number(document.getElementById("cfg-sell-duration").value) || 12;

      const next = {
        ...currentSettings,
        autoSellStrategy: document.getElementById("cfg-price-strategy").value,
        autoSellMaxListings: Math.max(1, Math.min(10, Number(document.getElementById("cfg-max-listings").value) || 10)),
        autoSellMinNetOverRecycle: Math.max(1, Number(document.getElementById("cfg-min-net-gain").value) || 2),
        autoSellDurationHours: durationHours,
        autoSellMedianFloorPct: guardrailOn ? 70 : 30,
        autoSellCrashProtection: document.getElementById("cfg-crash-protection")?.checked !== false,
        autoSellTurboLiquidity: document.getElementById("cfg-turbo-liquidity")?.checked !== false,
        autoSellTurboMaxNetProfit: Math.max(1, Number(document.getElementById("cfg-turbo-max-net")?.value) || 4),
        wishlistAutoBuyEnabled: Boolean(document.getElementById("cfg-wishlist-autobuy")?.checked),
        autoSellVelocityFirst: document.getElementById("cfg-velocity-check")?.checked !== false,
        autoSellExpireHours: expireOn ? durationHours : 0,
        speculateHoldSurging: document.getElementById("cfg-hold-surging")?.checked !== false,
        speculateSurgeThresholdPct: Math.max(5, Number(document.getElementById("cfg-surge-pct")?.value) || 20),

        autoRecycleMaxMarketNet: Math.max(2, Number(document.getElementById("cfg-recycle-max-market").value) || 6),
        autoRecycleRarities: checkedRarities,

        autoBuyMinChakraReserve: Math.max(0, Number(document.getElementById("cfg-buy-reserve").value) || 0),
        autoBuyMaxUnitPrice: Math.max(5, Number(document.getElementById("cfg-buy-max-price").value) || 400),
        autoBuyMinFlipProfit: Math.max(1, Number(document.getElementById("cfg-buy-min-profit").value) || 15),
        autoBuyMinDiscountPct: Math.max(5, Number(document.getElementById("cfg-buy-min-discount").value) || 28),
        autoBuyMinSales7d: Math.max(1, Number(document.getElementById("cfg-buy-min-sales7d").value) || 4),

        autoOpenMode: document.getElementById("cfg-open-mode").value,
        autoOpenMinBatch: Math.max(1, Math.min(10, Number(document.getElementById("cfg-open-min-batch").value) || 1)),
        autoOpenPitySniper: document.getElementById("cfg-pity-sniper")?.checked !== false,
        autoOpenDailyPack: document.getElementById("cfg-daily-pack")?.checked !== false,

        loopIntervalSec: Math.max(20, Number(document.getElementById("cfg-loop-interval").value) || 45),
        notificationsEnabled: document.getElementById("cfg-notifications").checked,
        dryRun: document.getElementById("cfg-dry-run").checked,
        language: document.getElementById("cfg-language")?.value || "auto"
      };

      await updateSettingPatch(next);
      showToast(i18n.t("toastSaved"));
      await sendCmd({ type: "km:cmd:refresh", forcePrices: false });
    });

    const resetBtn = document.getElementById("btn-reset-settings");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        currentSettings = { ...Analytics.DEFAULT_SETTINGS };
        await chrome.storage.local.set({ settings: currentSettings });
        renderSettingsControls();
        showToast("Réglages réinitialisés");
      });
    }
  }

  function renderJournal() {
    const list = document.getElementById("journal-list");
    if (!list) return;

    if (!Array.isArray(currentJournal) || currentJournal.length === 0) {
      list.innerHTML = `<li class="journal-empty">Aucune opération enregistrée.</li>`;
      return;
    }

    list.innerHTML = currentJournal
      .slice(0, 60)
      .map((item) => {
        const dt = new Date(item.ts || item.at || Date.now());
        const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const kind = escapeHtml(item.type || item.kind || "info");
        return `<li class="journal-item journal-item--${kind}">
          <span>${escapeHtml(item.message || item.text || "")}</span>
          <time class="journal-time">${escapeHtml(timeStr)}</time>
        </li>`;
      })
      .join("");
  }

  function renderRoiDashboard() {
    const totalChakra = (currentCumulativeStats.chakraFromSales || 0) + (currentCumulativeStats.chakraFromRecycle || 0);
    const elTotal = document.getElementById("roi-total-chakra");
    if (elTotal) elTotal.textContent = `+${formatChakra(totalChakra)}`;

    const elSales = document.getElementById("roi-sales-stats");
    if (elSales) {
      elSales.textContent = i18n.t("soldStat", {
        n: currentCumulativeStats.cardsSold || 0,
        amount: formatChakra(currentCumulativeStats.chakraFromSales || 0)
      });
    }

    const elRec = document.getElementById("roi-recycle-stats");
    if (elRec) {
      elRec.textContent = i18n.t("recycledStat", {
        n: currentCumulativeStats.cardsRecycled || 0,
        amount: formatChakra(currentCumulativeStats.chakraFromRecycle || 0)
      });
    }

    const elBoosters = document.getElementById("roi-boosters-stats");
    if (elBoosters) {
      const rareCount = (currentCumulativeStats.mythicsPulledCount || 0) + (currentCumulativeStats.legendariesPulledCount || 0);
      elBoosters.textContent = i18n.t("boostersStat", {
        opened: currentCumulativeStats.boostersOpenedCount || 0,
        rares: rareCount
      });
    }
  }

  async function renderDashboard() {
    const statusEl = document.getElementById("account-status");
    const bannerEl = document.getElementById("connection-banner");
    const bannerText = document.getElementById("connection-banner-text");

    if (!currentDashboard || !currentDashboard.authenticated) {
      if (statusEl) statusEl.textContent = "Synchronisation avec kyara.games…";
      if (bannerEl) bannerEl.hidden = false;
      if (bannerText && currentDashboard?.error) {
        bannerText.textContent = currentDashboard.error;
      }
      return;
    }

    if (bannerEl) bannerEl.hidden = true;
    const me = currentDashboard.me || {};
    const stats = currentDashboard.collectionStats || {};
    if (statusEl) {
      statusEl.textContent = i18n.t("accountStatusConnected", {
        pseudo: me.pseudo || "Joueur",
        owned: stats.uniqueOwned ?? 0,
        total: stats.catalogSize ?? 0,
        pct: stats.completionPct ?? 0
      });
    }

    const maxSlots = currentSettings.autoSellMaxListings ?? 10;
    const activeListings = currentDashboard.activeListings || [];
    document.getElementById("kpi-chakra").textContent = formatChakra(me.chakra);
    document.getElementById("kpi-packs").textContent = `${me.freePacks ?? 0}/${me.freePacksMax ?? 10}${
      me.bonusPacks ? ` +${me.bonusPacks}` : ""
    }`;
    document.getElementById("kpi-listings").textContent = `${activeListings.length} / ${maxSlots}`;
    document.getElementById("kpi-pity").textContent = `${me.pity ?? 0} / 250`;
    const pityVal = Number(me.pity ?? 0);
    const pityPct = Math.min(100, Math.max(0, Math.round((pityVal / 250) * 100)));
    const pityBar = document.getElementById("kpi-pity-bar");
    if (pityBar) {
      pityBar.style.width = `${pityPct}%`;
    }

    const allDuplicates = Array.isArray(currentDashboard.duplicates) ? currentDashboard.duplicates : [];
    const sellCount = stats.sellableDuplicatesCount ?? 0;
    const sellNet = stats.sellableNetTotal ?? 0;
    const recCount = stats.recyclableDuplicatesCount ?? 0;
    const recTotal = stats.recyclableChakraTotal ?? 0;

    document.getElementById("stat-autosell").textContent = `${i18n.t("copiesCount", { n: sellCount })} · +${formatChakra(sellNet)}`;
    document.getElementById("stat-autorecycle").textContent = `${i18n.t("copiesCount", { n: recCount })} · +${formatChakra(recTotal)}`;

    const recNew = currentDashboard.boosters?.recommendedNew;
    document.getElementById("stat-autoopen").textContent = recNew
      ? `${recNew.name} (${recNew.probAtLeastOneNewPct}% nouv.)`
      : "—";

    const btnOpenRec = document.getElementById("btn-open-recommended");
    if (btnOpenRec) {
      const freeAvailable = Number(recNew?.openableFreeCount ?? 0);
      btnOpenRec.disabled = freeAvailable <= 0;
      btnOpenRec.textContent = freeAvailable > 0 ? i18n.t("openLiveFree") : i18n.t("noFreeReady");
      btnOpenRec.title = freeAvailable > 0 ? `Ouvrir ${recNew.name} en live` : "Recharge en cours (0 ◆ garanti)";
    }

    document.getElementById("badge-duplicates").textContent = String(allDuplicates.length);
    const deals = Array.isArray(currentDashboard.deals) ? currentDashboard.deals : [];
    document.getElementById("badge-deals").textContent = String(deals.length);

    renderRoiDashboard();

    // Pity Sniper Banners (autopilot & boosters)
    const isPityNear = Boolean(currentDashboard.boosters?.isPityNear || Number(me.pity ?? 0) >= 240);
    const pityTarget =
      currentDashboard.boosters?.recommendedPity?.name ||
      currentDashboard.boosters?.recommendedNew?.name ||
      "Booster avec le plus de Mythiques";
    const p1 = document.getElementById("pity-sniper-alert-autopilot");
    const p2 = document.getElementById("pity-sniper-alert-boosters");
    if (p1) {
      p1.hidden = !isPityNear;
      const title1 = p1.querySelector(".pity-banner__title");
      if (title1) title1.textContent = i18n.t("pityImminent", { count: me.pity ?? 0 });
      const desc1 = p1.querySelector(".pity-banner__desc");
      if (desc1) desc1.innerHTML = i18n.t("pityDescAutopilot", { target: `<strong>${escapeHtml(pityTarget)}</strong>` });
    }
    if (p2) {
      p2.hidden = !isPityNear;
      const title2 = p2.querySelector(".pity-banner__title");
      if (title2) title2.textContent = i18n.t("pityImminent", { count: me.pity ?? 0 });
      const desc2 = p2.querySelector(".pity-banner__desc");
      if (desc2) desc2.innerHTML = i18n.t("pityDescBoosters", { target: `<strong>${escapeHtml(pityTarget)}</strong>` });
    }

    await renderDuplicatesTab(allDuplicates, stats, activeListings, maxSlots);
    await renderMarketTab(deals);
    await renderWishlistTab(wishlist, currentDashboard.wishlistSuggestions || []);
    renderBoostersTab(currentDashboard.boosters);
  }

  async function renderDuplicatesTab(allDuplicates, stats, activeListings, maxSlots) {
    document.getElementById("dup-summary-sell").textContent = `${i18n.t("copiesCount", {
      n: stats.sellableDuplicatesCount ?? 0
    })} · ${formatChakra(stats.sellableNetTotal ?? 0)} net`;
    document.getElementById("dup-summary-recycle").textContent = `${i18n.t("copiesCount", {
      n: stats.recyclableDuplicatesCount ?? 0
    })} · ${formatChakra(stats.recyclableChakraTotal ?? 0)}`;

    // Turbo Liquidity Banner check (désengorgement de la file)
    const turboCandidates = allDuplicates.filter(
      (d) => d.verdict === "RECYCLER" && !d.pinned && !currentPinnedCards.has(d.characterId)
    );
    const turboCopies = turboCandidates.reduce((acc, c) => acc + (c.spare || 1), 0);
    const turboChakra = turboCandidates.reduce((acc, c) => acc + (c.spare || 1) * (c.recycleValue || 1), 0);
    const bannerTurbo = document.getElementById("turbo-liquidite-banner");
    if (bannerTurbo) {
      const showTurbo = (currentSettings.autoSellTurboLiquidity !== false) && turboCopies > 0;
      bannerTurbo.hidden = !showTurbo;
      if (showTurbo) {
        const descEl = document.getElementById("turbo-banner-text");
        if (descEl) descEl.textContent = i18n.t("turboBannerDesc", { n: turboCopies });
        const btnBulkLabel = document.getElementById("btn-bulk-recycle-label");
        if (btnBulkLabel) {
          btnBulkLabel.textContent = i18n.t("btnBulkRecycle", { n: turboCopies, chakra: formatChakra(turboChakra) });
        }
      }
    }

    const query = (document.getElementById("dup-search")?.value || "").trim().toLowerCase();
    const filter = document.getElementById("dup-filter")?.value || "ALL";

    const filtered = allDuplicates.filter((d) => {
      if (filter === "VENDRE" && d.verdict !== "VENDRE") return false;
      if (filter === "RECYCLER" && d.verdict !== "RECYCLER") return false;
      if (filter === "CONSERVER" && d.verdict !== "CONSERVER") return false;
      if (filter === "PROTÉGÉ" && !d.pinned && !currentPinnedCards.has(d.characterId)) return false;
      if (!query) return true;
      return (
        (d.name || "").toLowerCase().includes(query) ||
        (d.series || "").toLowerCase().includes(query) ||
        (d.rarity || "").toLowerCase() === query ||
        String(d.characterId) === query
      );
    });

    const tbody = document.getElementById("duplicates-tbody");
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">${escapeHtml(i18n.t("noDuplicates"))}</td></tr>`;
    } else {
      let deadline = performance.now() + 50;
      const rows = [];
      for (const d of filtered) {
        deadline = await Analytics.yieldIfNeeded(deadline);
        const isPinned = Boolean(d.pinned || currentPinnedCards.has(d.characterId));
        const isSell = d.verdict === "VENDRE" && !isPinned;
        const isHold = d.verdict === "CONSERVER";
        const badgeClass = isPinned
          ? "verdict-badge--pinned"
          : isHold
            ? "verdict-badge--hold"
            : isSell
              ? "verdict-badge--sell"
              : "verdict-badge--recycle";
        const verdictKey = isPinned ? "PROTÉGÉ" : d.verdict;
        const verdictText = i18n.t(`verdict.${verdictKey}`) || verdictKey;
        const recPrice = d.prices?.recommended ?? 0;
        const netProc = d.fees?.netProceeds ?? 0;
        const recUnit = d.recycleValue ?? 1;
        const probText = d.saleProb?.label ? `24h: ${d.saleProb.p24h}% (${d.saleProb.label})` : "";
        const p = d.pedagogy || {};

        rows.push(`<tr>
          <td>
            <span class="rarity-pill rarity-pill--${escapeHtml(d.rarity)}">${escapeHtml(d.rarity)}</span>
            <strong>${escapeHtml(d.name)}</strong>
            <span class="sub-meta">7j: ${d.sales7d ?? 0} ventes · Min: ${d.lowestFixed ? `${d.lowestFixed} ◆` : "—"}</span>
          </td>
          <td class="num">×${d.spare}</td>
          <td class="num">${d.referenceMedian ? `${d.referenceMedian} ◆` : "—"}</td>
          <td class="num">
            <strong>${recPrice} ◆</strong>${
              d.isSurging
                ? `<span class="badge-surge" title="${escapeHtml(i18n.t("surgeTooltip", { pct: d.trendPct }))}">📈 +${d.trendPct}%</span>`
                : ""
            }
            <span class="sub-meta">Net ${netProc} ◆</span>
          </td>
          <td class="num">
            ${recUnit} ◆/u
            <span class="sub-meta">Total ${recUnit * d.spare} ◆</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span class="verdict-badge ${badgeClass}">${escapeHtml(verdictText)}</span>
              <button type="button" class="btn-pedagogy-toggle" data-action="toggle-pedagogy" data-id="${d.characterId}" title="Détails de l'analyse">ℹ️</button>
              ${
                isSell
                  ? `<button type="button" class="btn btn--primary btn--xs" data-action="sell-one" data-id="${d.characterId}" data-price="${recPrice}">${escapeHtml(i18n.t("btnSell"))}</button>`
                  : ""
              }
              ${
                !isPinned
                  ? `<button type="button" class="btn btn--ghost btn--xs" data-action="recycle-one" data-id="${d.characterId}" data-qty="${d.spare}" data-name="${escapeHtml(
                      d.name
                    )}">${escapeHtml(i18n.t("btnRecycleCount", { n: d.spare }))}</button>`
                  : ""
              }
            </div>
            <span class="sub-meta">${escapeHtml(probText || d.verdictReason)}</span>
          </td>
          <td class="num">
            <button type="button" class="btn-pin ${isPinned ? "is-pinned" : ""}" data-action="toggle-pin" data-id="${d.characterId}" title="${escapeHtml(
              isPinned ? i18n.t("pinTooltipUnprotect") : i18n.t("pinTooltipProtect")
            )}">${isPinned ? "🔒" : "🔓"}</button>
          </td>
        </tr>
        <tr class="pedagogy-row" id="pedagogy-${d.characterId}" hidden>
          <td colspan="7">
            <div class="pedagogy-card">
              <div class="pedagogy-card__title">
                <span>${escapeHtml(p.title || d.name)}</span>
                ${p.isCrash ? `<span class="badge-crash">🚨 Chute du marché (-${p.crashDiscountPct}%)</span>` : ""}
              </div>
              <p class="pedagogy-card__why">${escapeHtml(p.why || d.verdictReason || "")}</p>
              <div class="pedagogy-card__row">
                <span>⏱️ <strong>Délai estimé :</strong> ${escapeHtml(p.delayEstimate || "12h-24h")}</span> ·
                <span>💰 <strong>Gain net :</strong> ${escapeHtml(p.gainAnalysis || `${netProc} ◆ net vs ${recUnit * d.spare} ◆ recyclage`)}</span> ·
                <span>👥 <strong>Concurrence :</strong> ${escapeHtml(p.competition || "Normale")}</span>
                ${p.hourlyExpectedChakra ? ` · <span>⚡ <strong>Rendement :</strong> ~${p.hourlyExpectedChakra} ◆/h</span>` : ""}
              </div>
            </div>
          </td>
        </tr>`);
      }
      tbody.innerHTML = rows.join("");
    }

    document.getElementById("active-listings-count").textContent = `${activeListings.length} / ${maxSlots}`;
    const listTbody = document.getElementById("active-listings-tbody");
    if (!listTbody) return;

    if (activeListings.length === 0) {
      listTbody.innerHTML = `<tr><td colspan="4" class="empty-cell">${escapeHtml(i18n.t("noActiveListings"))}</td></tr>`;
    } else {
      listTbody.innerHTML = activeListings
        .map((l) => {
          const exp = l.endsAt
            ? new Date(l.endsAt).toLocaleTimeString(i18n.getLanguage() === "en" ? "en-US" : i18n.getLanguage() === "es" ? "es-ES" : "fr-FR", { hour: "2-digit", minute: "2-digit" })
            : "—";
          return `<tr>
            <td>
              <span class="rarity-pill rarity-pill--${escapeHtml(l.rarity || "C")}">${escapeHtml(
                l.rarity || "?"
              )}</span>
              <strong>${escapeHtml(l.name || `#${l.characterId}`)}</strong>
            </td>
            <td class="num">${formatChakra(l.price)}</td>
            <td class="num">${escapeHtml(exp)}</td>
            <td>
              <button type="button" class="btn btn--ghost btn--xs" data-action="cancel-listing" data-id="${escapeHtml(
                l.id
              )}" data-name="${escapeHtml(l.name || "Annonce")}">
                ${escapeHtml(i18n.t("btnCancel"))}
              </button>
            </td>
          </tr>`;
        })
        .join("");
    }
  }

  async function renderMarketTab(deals) {
    const filter = document.getElementById("market-filter")?.value || "ALL";
    const tbody = document.getElementById("market-tbody");
    if (!tbody) return;

    const filtered = (deals || []).filter((d) => {
      if (filter === "FLIP") return d.isGoodFlip;
      if (filter === "MISSING") return d.isMissing;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(i18n.t("noDeals"))}</td></tr>`;
      return;
    }

    let deadline = performance.now() + 50;
    const rows = [];
    for (const d of filtered) {
      deadline = await Analytics.yieldIfNeeded(deadline);
      const profit = d.flipProfit ?? 0;
      rows.push(`<tr>
        <td>
          <span class="rarity-pill rarity-pill--${escapeHtml(d.rarity)}">${escapeHtml(d.rarity)}</span>
          <strong>${escapeHtml(d.name)}</strong>
          ${d.isMissing ? `<span class="verdict-badge verdict-badge--new">MANQUANTE</span>` : ""}
          <span class="sub-meta">-${d.discountPct ?? 0}% · 7j: ${d.sales7d ?? 0} ventes</span>
        </td>
        <td class="num"><strong>${d.buyPrice} ◆</strong></td>
        <td class="num">${d.refMedian ? `${d.refMedian} ◆` : "—"}</td>
        <td class="num">${d.targetResalePrice ? `${d.targetResalePrice} ◆` : "—"}</td>
        <td class="num">
          <strong style="color:${profit > 0 ? "#3fbf7f" : "#8a8590"}">
            ${profit > 0 ? `+${profit}` : profit} ◆
          </strong>
          <span class="sub-meta">ROI ${d.roiPct ?? 0}%</span>
        </td>
        <td>
          <button type="button" class="btn btn--primary btn--xs" data-action="buy-deal" data-id="${escapeHtml(
            d.listingId
          )}" data-price="${d.buyPrice}" data-name="${escapeHtml(d.name)}">
            ${escapeHtml(i18n.t("btnBuy"))}
          </button>
        </td>
      </tr>`);
    }
    tbody.innerHTML = rows.join("");

    // Render Profitable Trades Card
    const tradesBadge = document.getElementById("trades-badge");
    const tradesList = document.getElementById("trades-list");
    const tradeItems = Array.isArray(currentDashboard?.trades) ? currentDashboard.trades : [];
    if (tradesBadge) tradesBadge.textContent = String(tradeItems.length);
    if (tradesList) {
      if (tradeItems.length === 0) {
        tradesList.innerHTML = `<p class="empty-cell" style="padding: 10px; font-size: 11.5px;">Aucun échange avantageux disponible sur le marché pour l'instant.</p>`;
      } else {
        tradesList.innerHTML = tradeItems.map((tr) => `
          <div class="trade-item">
            <div class="trade-exchange">
              <div>
                <span class="rarity-pill rarity-pill--${escapeHtml(tr.wanted.rarity)}">${escapeHtml(tr.wanted.rarity)}</span>
                <strong>Tu donnes :</strong> ${escapeHtml(tr.wanted.name)} <span style="color:var(--mut);">(${tr.wanted.median7d} ◆)</span>
              </div>
              <span style="color:var(--mut); font-weight:700;">➔</span>
              <div>
                <span class="rarity-pill rarity-pill--${escapeHtml(tr.offered.rarity)}">${escapeHtml(tr.offered.rarity)}</span>
                <strong>Tu reçois :</strong> ${escapeHtml(tr.offered.name)} <span style="color:var(--mut);">(${tr.offered.median7d} ◆)</span>
                ${tr.offered.isMissing ? `<span class="verdict-badge verdict-badge--new">NOUVELLE</span>` : ""}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="trade-gain">+${tr.profit} ◆</span>
              <a href="https://kyara.games/marche" target="_blank" rel="noopener noreferrer" class="btn btn--xs btn--primary" style="text-decoration:none;">
                Voir
              </a>
            </div>
          </div>
        `).join("");
      }
    }
  }

  async function renderWishlistTab(wishlist, suggestions) {
    const list = Array.isArray(wishlist) ? wishlist : [];
    const tbody = document.getElementById("wishlist-tbody");
    const badge = document.getElementById("badge-wishlist");
    if (badge) badge.textContent = String(list.length);

    if (tbody) {
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(i18n.t("wishlistEmpty"))}</td></tr>`;
      } else {
        const rows = list.map((item) => {
          const hasPrice = Number.isFinite(item.lowestMarketPrice) && item.lowestMarketPrice > 0;
          const hasBudget = Number.isFinite(item.budgetChakra) && item.budgetChakra > 0;
          let statusBadge = "";
          let canBuy = false;

          if (hasPrice) {
            if (!hasBudget || item.lowestMarketPrice <= item.budgetChakra) {
              statusBadge = `<span class="verdict-badge verdict-badge--sell">${escapeHtml(i18n.t("wishStatusAvailable") || "Disponible !")}</span>`;
              canBuy = Boolean(item.bestListingId);
            } else {
              statusBadge = `<span class="verdict-badge verdict-badge--hold">${escapeHtml(i18n.t("wishStatusTooExpensive") || "Trop cher")}</span>`;
            }
          } else {
            statusBadge = `<span class="verdict-badge">${escapeHtml(i18n.t("wishStatusNoOffers") || "Aucune offre")}</span>`;
          }

          return `<tr>
            <td>
              <span class="rarity-pill rarity-pill--${escapeHtml(item.rarity || 'C')}">${escapeHtml(item.rarity || '?')}</span>
              <strong>${escapeHtml(item.name || `#${item.characterId}`)}</strong>
              ${item.series ? `<span class="sub-meta">${escapeHtml(item.series)}</span>` : ""}
            </td>
            <td class="num">${hasPrice ? `<strong>${item.lowestMarketPrice} ◆</strong>` : `<span style="color:var(--mut);">—</span>`}</td>
            <td class="num">${hasBudget ? `${item.budgetChakra} ◆` : `<span style="color:var(--mut);">Illimité</span>`}</td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex; gap:6px; align-items:center;">
                ${canBuy ? `<button type="button" class="btn btn--primary btn--xs" data-action="buy-deal" data-id="${escapeHtml(item.bestListingId)}" data-price="${item.lowestMarketPrice}" data-name="${escapeHtml(item.name)}">${escapeHtml(i18n.t("btnBuy"))}</button>` : ""}
                <button type="button" class="btn btn--ghost btn--xs" data-action="remove-wish" data-id="${item.characterId}" title="Retirer des envies">✕</button>
              </div>
            </td>
          </tr>`;
        });
        tbody.innerHTML = rows.join("");
      }
    }

    // Render suggestions
    const suggList = Array.isArray(suggestions) ? suggestions : [];
    const countEl = document.getElementById("wishlist-suggestions-count");
    if (countEl) countEl.textContent = String(suggList.length);
    const gridEl = document.getElementById("wishlist-suggestions-list");
    if (gridEl) {
      if (suggList.length === 0) {
        gridEl.innerHTML = `<p class="empty-cell" style="padding: 10px; font-size: 11.5px;">Toutes vos séries avancées sont complètes ou en cours d'analyse !</p>`;
      } else {
        gridEl.innerHTML = suggList.map((s) => `
          <div class="wishlist-suggestion-card">
            <div class="wishlist-suggestion-card__header">
              <div>
                <span class="rarity-pill rarity-pill--${escapeHtml(s.rarity || 'C')}">${escapeHtml(s.rarity || '?')}</span>
                <strong>${escapeHtml(s.name)}</strong>
              </div>
              <span class="mono-badge">${s.completionPct}% série</span>
            </div>
            <div class="wishlist-suggestion-card__meta">
              <span>Série : ${escapeHtml(s.series || "—")}</span>
              <span>Cote : ~${s.refMedian ? `${s.refMedian} ◆` : "—"}</span>
            </div>
            <button type="button" class="btn btn--ghost btn--xs" data-action="add-suggestion" data-id="${s.characterId}" data-name="${escapeHtml(s.name)}" data-series="${escapeHtml(s.series || "")}" data-rarity="${escapeHtml(s.rarity || "")}" data-median="${s.refMedian || 50}" style="margin-top:6px; width:100%;">
              + Ajouter aux envies
            </button>
          </div>
        `).join("");
      }
    }
  }

  function setupWishlistAutocomplete() {
    const searchInput = document.getElementById("wishlist-search-input");
    const budgetInput = document.getElementById("wishlist-budget-input");
    const autoBox = document.getElementById("wishlist-autocomplete");
    const btnAdd = document.getElementById("btn-add-wish");

    if (!searchInput || !autoBox) return;

    let selectedCharacter = null;

    searchInput.addEventListener("input", () => {
      const q = (searchInput.value || "").trim().toLowerCase();
      selectedCharacter = null;
      if (q.length < 2) {
        autoBox.hidden = true;
        autoBox.innerHTML = "";
        return;
      }

      const pool = new Map();
      const addPool = (arr) => {
        if (!Array.isArray(arr)) return;
        for (const item of arr) {
          const id = Number(item.characterId || item.id);
          const name = item.name || item.characterName;
          if (id && name && !pool.has(id)) {
            pool.set(id, {
              characterId: id,
              name,
              series: item.series || "",
              rarity: item.rarity || "C",
              refMedian: item.referenceMedian || item.refMedian || item.median7d || 50
            });
          }
        }
      };

      addPool(currentDashboard?.duplicates);
      addPool(currentDashboard?.wishlistSuggestions);
      addPool(currentDashboard?.deals);

      const matches = Array.from(pool.values()).filter((c) =>
        c.name.toLowerCase().includes(q) || c.series.toLowerCase().includes(q)
      ).slice(0, 8);

      if (matches.length === 0) {
        autoBox.innerHTML = `<div class="wishlist-autocomplete__item" style="color:var(--mut);">Appuyez sur "+ Ajouter" pour ajouter "${escapeHtml(searchInput.value.trim())}"</div>`;
        autoBox.hidden = false;
        return;
      }

      autoBox.innerHTML = matches.map((m) => `
        <div class="wishlist-autocomplete__item" data-id="${m.characterId}" data-name="${escapeHtml(m.name)}" data-series="${escapeHtml(m.series)}" data-rarity="${escapeHtml(m.rarity)}" data-median="${m.refMedian}">
          <span class="rarity-pill rarity-pill--${escapeHtml(m.rarity)}">${escapeHtml(m.rarity)}</span>
          <strong>${escapeHtml(m.name)}</strong>
          <span style="color:var(--mut); font-size:11px;">(${escapeHtml(m.series || "—")}) · ~${m.refMedian} ◆</span>
        </div>
      `).join("");
      autoBox.hidden = false;
    });

    autoBox.addEventListener("click", (e) => {
      const item = e.target.closest(".wishlist-autocomplete__item");
      if (!item || !item.dataset.id) return;
      selectedCharacter = {
        characterId: Number(item.dataset.id),
        name: item.dataset.name,
        series: item.dataset.series,
        rarity: item.dataset.rarity,
        budgetChakra: Number(item.dataset.median) || 50
      };
      searchInput.value = selectedCharacter.name;
      if (budgetInput && !budgetInput.value) {
        budgetInput.value = selectedCharacter.budgetChakra;
      }
      autoBox.hidden = true;
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".wishlist-add-bar") && !e.target.closest("#wishlist-autocomplete")) {
        autoBox.hidden = true;
      }
    });

    btnAdd?.addEventListener("click", async () => {
      const name = (searchInput.value || "").trim();
      if (!name) {
        showToast("Veuillez saisir un nom de personnage");
        return;
      }
      const budgetChakra = Number(budgetInput?.value) || 0;
      const characterId = selectedCharacter?.characterId || Math.abs(hashString(name));
      const series = selectedCharacter?.series || "";
      const rarity = selectedCharacter?.rarity || "C";

      const res = await sendCmd({
        type: "km:cmd:wishlist-add",
        characterId,
        name,
        series,
        rarity,
        budgetChakra
      });

      if (res?.ok) {
        showToast(i18n.t("toastWishAdded", { name }) || `${name} ajouté aux envies !`);
        searchInput.value = "";
        if (budgetInput) budgetInput.value = "";
        selectedCharacter = null;
        if (res.wishlist) {
          currentWishlist = res.wishlist;
          if (currentDashboard) currentDashboard.wishlist = res.wishlist;
          await renderWishlistTab(currentWishlist, currentDashboard?.wishlistSuggestions || []);
        }
      } else {
        showToast(res?.error || "Erreur d'ajout");
      }
    });
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function renderBoostersTab(boosters) {
    if (!boosters) return;

    const recNew = boosters.recommendedNew;
    const recEv = boosters.recommendedEv;

    if (recNew) {
      document.getElementById("rec-new-name").textContent = `${recNew.name} · ${recNew.completionPct}% (${i18n.t("missingCountTag", { n: recNew.totalMissing })})`;
      document.getElementById("rec-new-metrics").textContent = `${i18n.t("probAtLeastOneNew", { prob: recNew.probAtLeastOneNewPct })} · ${i18n.t("expectedNewPerPack", { exp: recNew.expectedNewCards })} · ${i18n.t("freeCountTag", { n: recNew.openableFreeCount })}`;

      const raritiesEl = document.getElementById("rec-new-rarities");
      if (raritiesEl && recNew.missingByRarity && recNew.totalByRarity) {
        raritiesEl.innerHTML = Analytics.RARITIES.map((r) => {
          const total = recNew.totalByRarity[r] || 0;
          const missing = recNew.missingByRarity[r] || 0;
          if (total === 0) return "";
          return `<span class="chip-check">
            <span class="rarity-pill rarity-pill--${r}">${r}</span>
            ${missing}/${total}
          </span>`;
        }).join("");
      }

      const btn1 = document.getElementById("btn-open-rec-1");
      const btnMax = document.getElementById("btn-open-rec-max");
      const hasFree = (recNew.openableFreeCount || 0) > 0;
      if (btn1) {
        btn1.dataset.packId = recNew.packId;
        btn1.dataset.packName = recNew.name;
        btn1.disabled = !hasFree;
        btn1.textContent = hasFree ? i18n.t("openRec1Btn") : i18n.t("rechargeNotice");
        btn1.title = hasFree ? i18n.t("openRec1Btn") : "Aucun booster gratuit disponible (Garde-fou 0 ◆)";
      }
      if (btnMax) {
        const maxCount = Math.max(1, Math.min(10, recNew.openableFreeCount || 1));
        btnMax.dataset.packId = recNew.packId;
        btnMax.dataset.packName = recNew.name;
        btnMax.dataset.count = String(maxCount);
        btnMax.textContent = hasFree ? i18n.t("openRecMaxBtn", { n: maxCount }) : i18n.t("maxUnavailable");
        btnMax.disabled = !hasFree;
        btnMax.title = hasFree ? `Ouvrir ${maxCount} boosters` : "Max indisponible";
      }
    }

    if (recEv) {
      document.getElementById("rec-ev-name").textContent = `${recEv.name} · EV ~${recEv.expectedChakraValue} ◆ / booster`;
      document.getElementById("rec-ev-metrics").textContent = `Manquants : ${recEv.totalMissing} · P(≥1 nouv.) : ${recEv.probAtLeastOneNewPct}%`;
    }

    const tbody = document.getElementById("boosters-tbody");
    if (!tbody) return;
    const allPacks = boosters.all || [];
    if (allPacks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucun booster disponible.</td></tr>`;
      return;
    }

    tbody.innerHTML = allPacks
      .map((p, idx) => {
        const isTop = idx === 0 && p.totalMissing > 0;
        return `<tr>
          <td>
            <strong>${isTop ? "★ " : ""}${escapeHtml(p.name)}</strong>
            <span class="sub-meta">Complété ${p.completionPct}% · Prêts: ${p.openableFreeCount}</span>
          </td>
          <td class="num"><strong>${p.totalMissing}</strong> / ${p.totalPool}</td>
          <td class="num"><strong>${p.probAtLeastOneNewPct}%</strong></td>
          <td class="num">${p.expectedNewCards}</td>
          <td class="num">${p.expectedChakraValue} ◆</td>
          <td>
            <button type="button" class="btn btn--primary btn--xs" data-action="open-pack" data-id="${escapeHtml(
              p.packId
            )}" data-name="${escapeHtml(p.name)}" data-count="1" ${p.canOpenNow ? "" : "disabled"}>
              Ouvrir
            </button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function setupActionsAndDelegation() {
    document.getElementById("btn-open-kyara")?.addEventListener("click", () => {
      void sendCmd({ type: "km:open-kyara-tab" });
    });

    document.getElementById("btn-fullscreen")?.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/sidepanel.html?mode=full") });
    });

    document.getElementById("btn-bulk-recycle")?.addEventListener("click", async () => {
      showToast("Recyclage Turbo Liquidité en cours…");
      const res = await sendCmd({ type: "km:cmd:bulk-recycle" });
      if (res?.ok) {
        showToast(
          i18n.t("toastBulkRecycleDone", { count: res.recycledCount, chakra: res.chakraGained }) ||
          `${res.recycledCount} cartes recyclées (+${res.chakraGained} ◆)`
        );
        if (res.dashboard) {
          currentDashboard = res.dashboard;
          await renderDashboard();
        }
      } else {
        showToast(res?.error || "Erreur de recyclage");
      }
    });

    document.getElementById("btn-refresh")?.addEventListener("click", async () => {
      showToast("Synchronisation…");
      const res = await sendCmd({ type: "km:cmd:refresh", forcePrices: true });
      if (res?.dashboard) {
        currentDashboard = res.dashboard;
        await renderDashboard();
        showToast("Synchronisé avec kyara.games");
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-run-cycle")?.addEventListener("click", async () => {
      showToast("Cycle Autopilot en cours…");
      const res = await sendCmd({ type: "km:cmd:run-cycle" });
      if (res?.ok && res.summary) {
        const s = res.summary;
        if (res.dashboard) {
          currentDashboard = res.dashboard;
          await renderDashboard();
        }
        showToast(
          `Cycle terminé : ${s.opened} booster(s), ${s.recycledCopies} recyclée(s), ${s.listed} en vente, ${s.bought} achetée(s)`
        );
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-sell-now")?.addEventListener("click", async () => {
      showToast("Mise en vente des doublons…");
      const res = await sendCmd({ type: "km:cmd:sell-now" });
      if (res?.ok) {
        if (res.dashboard) {
          currentDashboard = res.dashboard;
          await renderDashboard();
        }
        showToast(`${res.sellRes?.listedCount ?? 0} annonce(s) créée(s)`);
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-recycle-now")?.addEventListener("click", async () => {
      showToast("Recyclage des doublons…");
      const res = await sendCmd({ type: "km:cmd:recycle-now" });
      if (res?.ok) {
        if (res.dashboard) {
          currentDashboard = res.dashboard;
          await renderDashboard();
        }
        showToast(`${res.recRes?.recycledCopies ?? 0} copie(s) recyclée(s) (+${res.recRes?.chakraGained ?? 0} ◆)`);
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-open-recommended")?.addEventListener("click", async () => {
      showToast("Pilotage de l'ouverture live sur kyara.games…");
      const res = await sendCmd({ type: "km:cmd:open-recommended" });
      if (res?.ok) {
        if (res.dashboard) {
          currentDashboard = res.dashboard;
          await renderDashboard();
        }
        showToast(`${res.openRes?.openedCount ?? 0} booster(s) ouvert(s) (${res.openRes?.newCardsCount ?? 0} nouv.)`);
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-scan-market")?.addEventListener("click", async () => {
      showToast("Scan des annonces du marché…");
      const res = await sendCmd({ type: "km:cmd:scan-deals" });
      if (res?.dashboard) {
        currentDashboard = res.dashboard;
        await renderDashboard();
        showToast(`${(res.dashboard.deals || []).length} opportunité(s) trouvée(s)`);
      } else if (res?.error) {
        showToast(res.error);
      }
    });

    document.getElementById("btn-clear-journal")?.addEventListener("click", async () => {
      currentJournal = [];
      await chrome.storage.local.set({ kmJournal: [] });
      renderJournal();
    });

    document.getElementById("btn-reset-roi")?.addEventListener("click", async () => {
      await sendCmd({ type: "km:cmd:reset-roi" });
      currentCumulativeStats = {
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
      renderRoiDashboard();
      showToast("Compteurs de gains réinitialisés");
    });

    document.getElementById("dup-search")?.addEventListener("input", () => {
      if (currentDashboard) {
        void renderDuplicatesTab(
          currentDashboard.duplicates || [],
          currentDashboard.collectionStats || {},
          currentDashboard.activeListings || [],
          currentSettings.autoSellMaxListings ?? 10
        );
      }
    });

    document.getElementById("dup-filter")?.addEventListener("change", () => {
      if (currentDashboard) {
        void renderDuplicatesTab(
          currentDashboard.duplicates || [],
          currentDashboard.collectionStats || {},
          currentDashboard.activeListings || [],
          currentSettings.autoSellMaxListings ?? 10
        );
      }
    });

    document.getElementById("market-filter")?.addEventListener("change", () => {
      if (currentDashboard) {
        void renderMarketTab(currentDashboard.deals || []);
      }
    });

    document.getElementById("btn-open-rec-1")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const packId = btn.dataset.packId;
      const packName = btn.dataset.packName;
      if (!packId) return;
      showToast(`Ouverture live de ${packName} ×1…`);
      await sendCmd({ type: "km:cmd:open-pack", packId, packName, count: 1 });
    });

    document.getElementById("btn-open-rec-max")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const packId = btn.dataset.packId;
      const packName = btn.dataset.packName;
      const count = Number(btn.dataset.count || 1);
      if (!packId) return;
      showToast(`Ouverture live de ${packName} ×${count}…`);
      await sendCmd({ type: "km:cmd:open-pack", packId, packName, count });
    });

    document.body.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "sell-one") {
        const characterId = Number(btn.dataset.id);
        const price = Number(btn.dataset.price);
        btn.disabled = true;
        const res = await sendCmd({
          type: "km:cmd:single-sell",
          characterId,
          price,
          durationHours: currentSettings.autoSellDurationHours || 12
        });
        btn.disabled = false;
        showToast(res?.ok ? `Carte #${characterId} en vente à ${price} ◆` : res?.error || "Erreur");
      } else if (action === "recycle-one") {
        const characterId = Number(btn.dataset.id);
        const qty = Number(btn.dataset.qty || 1);
        const name = btn.dataset.name || `Carte #${characterId}`;
        btn.disabled = true;
        const res = await sendCmd({
          type: "km:cmd:single-recycle",
          characterId,
          qty,
          name
        });
        btn.disabled = false;
        showToast(res?.ok ? `${name} ×${qty} recyclée(s)` : res?.error || "Erreur");
      } else if (action === "cancel-listing") {
        const listingId = btn.dataset.id;
        const name = btn.dataset.name || "Annonce";
        btn.disabled = true;
        const res = await sendCmd({
          type: "km:cmd:cancel-listing",
          listingId,
          name
        });
        btn.disabled = false;
        showToast(res?.ok ? `Annonce retirée : ${name}` : res?.error || "Erreur");
      } else if (action === "buy-deal") {
        const listingId = btn.dataset.id;
        const price = Number(btn.dataset.price || 0);
        const name = btn.dataset.name || "Carte";
        btn.disabled = true;
        const res = await sendCmd({
          type: "km:cmd:buy-listing",
          listingId,
          price,
          name
        });
        btn.disabled = false;
        showToast(res?.ok ? `Acheté : ${name} (${price} ◆)` : res?.error || "Erreur");
      } else if (action === "open-pack") {
        const packId = btn.dataset.id;
        const packName = btn.dataset.name || packId;
        const count = Number(btn.dataset.count || 1);
        btn.disabled = true;
        showToast(`Ouverture live de ${packName}…`);
        const res = await sendCmd({
          type: "km:cmd:open-pack",
          packId,
          packName,
          count
        });
        btn.disabled = false;
        showToast(res?.ok ? `Booster ${packName} ouvert en live !` : res?.error || "Erreur");
      } else if (action === "toggle-pin") {
        const characterId = Number(btn.dataset.id);
        btn.disabled = true;
        const res = await sendCmd({ type: "km:cmd:toggle-pin", characterId });
        btn.disabled = false;
        if (res?.ok) {
          if (res.isPinned) {
            currentPinnedCards.add(characterId);
            showToast(`Carte #${characterId} protégée`);
          } else {
            currentPinnedCards.delete(characterId);
            showToast(`Protection retirée pour la carte #${characterId}`);
          }
          if (res.dashboard) {
            currentDashboard = res.dashboard;
            await renderDashboard();
          }
        }
      } else if (action === "toggle-pedagogy") {
        const charId = btn.dataset.id;
        const row = document.getElementById(`pedagogy-${charId}`);
        if (row) {
          row.hidden = !row.hidden;
          btn.classList.toggle("is-active", !row.hidden);
        }
      } else if (action === "remove-wish") {
        const characterId = Number(btn.dataset.id);
        btn.disabled = true;
        const res = await sendCmd({ type: "km:cmd:wishlist-remove", characterId });
        btn.disabled = false;
        if (res?.ok) {
          showToast(i18n.t("toastWishRemoved") || "Retiré des envies");
          if (res.wishlist) {
            currentWishlist = res.wishlist;
            if (currentDashboard) currentDashboard.wishlist = res.wishlist;
            await renderWishlistTab(currentWishlist, currentDashboard?.wishlistSuggestions || []);
          }
        } else {
          showToast(res?.error || "Erreur");
        }
      } else if (action === "add-suggestion") {
        const characterId = Number(btn.dataset.id);
        const name = btn.dataset.name || `Carte #${characterId}`;
        const series = btn.dataset.series || "";
        const rarity = btn.dataset.rarity || "C";
        const budgetChakra = Number(btn.dataset.median) || 0;
        btn.disabled = true;
        const res = await sendCmd({
          type: "km:cmd:wishlist-add",
          characterId,
          name,
          series,
          rarity,
          budgetChakra
        });
        btn.disabled = false;
        if (res?.ok) {
          showToast(i18n.t("toastWishAdded", { name }) || `${name} ajouté aux envies !`);
          if (res.wishlist) {
            currentWishlist = res.wishlist;
            if (currentDashboard) currentDashboard.wishlist = res.wishlist;
            await renderWishlistTab(currentWishlist, currentDashboard?.wishlistSuggestions || []);
          }
        } else {
          showToast(res?.error || "Erreur d'ajout");
        }
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.settings?.newValue) {
      const prevLang = currentSettings.language;
      currentSettings = { ...Analytics.DEFAULT_SETTINGS, ...changes.settings.newValue };
      if (currentSettings.language !== prevLang) {
        applyTranslations();
      }
      renderSettingsControls();
    }
    if (changes.kmDashboard?.newValue) {
      currentDashboard = changes.kmDashboard.newValue;
      void renderDashboard();
    }
    if (changes.kmWishlist?.newValue) {
      currentWishlist = Array.isArray(changes.kmWishlist.newValue) ? changes.kmWishlist.newValue : [];
      if (currentDashboard) {
        currentDashboard.wishlist = currentWishlist;
      }
      void renderWishlistTab(currentWishlist, currentDashboard?.wishlistSuggestions || []);
    }
    if (changes.kmJournal?.newValue) {
      currentJournal = changes.kmJournal.newValue;
      renderJournal();
    }
    if (changes.kmCumulativeStats?.newValue) {
      currentCumulativeStats = changes.kmCumulativeStats.newValue;
      renderRoiDashboard();
    }
    if (changes.kmPinnedCards?.newValue) {
      currentPinnedCards = new Set((changes.kmPinnedCards.newValue || []).map(Number));
      if (currentDashboard?.duplicates) {
        void renderDuplicatesTab(
          currentDashboard.duplicates,
          currentDashboard.collectionStats,
          currentDashboard.activeListings,
          currentSettings.autoSellMaxListings ?? 10
        );
      }
    }
  });

  (async () => {
    if (window.location.search.includes("mode=full")) {
      document.documentElement.classList.add("km-mode-full");
    }

    setupTabs();
    setupQuickSwitches();
    setupSettingsForm();
    setupWishlistAutocomplete();
    setupActionsAndDelegation();

    const stored = await chrome.storage.local.get([
      "settings",
      "kmDashboard",
      "kmJournal",
      "kmCumulativeStats",
      "kmPinnedCards",
      "kmWishlist"
    ]);
    currentSettings = { ...Analytics.DEFAULT_SETTINGS, ...(stored.settings || {}) };
    currentDashboard = stored.kmDashboard || null;
    currentJournal = Array.isArray(stored.kmJournal) ? stored.kmJournal : [];
    currentWishlist = Array.isArray(stored.kmWishlist) ? stored.kmWishlist : [];
    if (stored.kmCumulativeStats) {
      currentCumulativeStats = { ...currentCumulativeStats, ...stored.kmCumulativeStats };
    }
    if (Array.isArray(stored.kmPinnedCards)) {
      currentPinnedCards = new Set(stored.kmPinnedCards.map(Number));
    }

    applyTranslations();
    renderSettingsControls();
    renderJournal();
    renderRoiDashboard();
    if (currentDashboard?.authenticated) {
      await renderDashboard();
    }

    // Trigger live refresh from active kyara.games tab (auto-injects content script if needed!)
    const res = await sendCmd({ type: "km:cmd:refresh", forcePrices: false });
    if (res?.dashboard) {
      currentDashboard = res.dashboard;
      await renderDashboard();
    } else if (res?.error && !currentDashboard?.authenticated) {
      const bannerEl = document.getElementById("connection-banner");
      const bannerText = document.getElementById("connection-banner-text");
      if (bannerEl) bannerEl.hidden = false;
      if (bannerText) bannerText.textContent = res.error;
    }
  })();
})();
