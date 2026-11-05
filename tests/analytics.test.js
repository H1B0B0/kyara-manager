const assert = require("node:assert/strict");
const Analytics = require("../lib/analytics.js");

const tests = [
  {
    name: "Market fee & net proceeds calculation (5% tax + 2% deposit fee, min 1 ◆)",
    fn: () => {
      assert.equal(Analytics.computeListingFee(3), 1);
      assert.equal(Analytics.computeListingFee(100), 2);
      assert.equal(Analytics.computeSaleTax(100), 5);
      assert.equal(Analytics.computeNetProceeds(100), 93);
      assert.equal(Analytics.computeNetProceeds(3), 1);
    }
  },
  {
    name: "Spare copies calculation preserves ≥1 copy and respects locked, pinned, resaleUntil, and active listings",
    fn: () => {
      assert.equal(Analytics.computeSpareCopies({ qty: 1, locked: 0 }, 0), 0);
      assert.equal(Analytics.computeSpareCopies({ qty: 3, locked: 0 }, 0), 2);
      assert.equal(Analytics.computeSpareCopies({ qty: 3, locked: 1 }, 0), 1);
      assert.equal(Analytics.computeSpareCopies({ qty: 3, locked: 0 }, 2), 0);
      assert.equal(Analytics.computeSpareCopies({ qty: 5, pinned: true }, 0), 0);
      assert.equal(
        Analytics.computeSpareCopies(
          { qty: 5, resaleUntil: new Date(Date.now() + 3600000).toISOString() },
          0
        ),
        0,
        "Future resaleUntil must block spare copies from being listed"
      );
    }
  },
  {
    name: "Duplicate evaluation advises RECYCLER when market price is at floor with low net gain",
    fn: () => {
      const res = Analytics.evaluateDuplicate(
        { id: 101, name: "Slime Commun", rarity: "C" },
        { characterId: 101, qty: 5, locked: 0 },
        { median7d: 3, lowestFixed: 3, sales7d: 1 }
      );
      assert.equal(res.spare, 4);
      assert.equal(res.verdict, "RECYCLER");
      assert.equal(res.canAutoRecycle, true);
      assert.equal(res.canAutoSell, false);
    }
  },
  {
    name: "Duplicate evaluation advises VENDRE when market price yields net profit above recycle + threshold",
    fn: () => {
      const res = Analytics.evaluateDuplicate(
        { id: 202, name: "Héros Rare", rarity: "R" },
        { characterId: 202, qty: 3, locked: 0 },
        { median7d: 25, lowestFixed: 24, sales7d: 9 }
      );
      assert.equal(res.spare, 2);
      assert.equal(res.verdict, "VENDRE");
      assert.equal(res.prices.recommended, 23);
      assert.equal(res.canAutoSell, true);
      assert.ok(res.fees.netGainOverRecycle >= 2);
    }
  },
  {
    name: "70% median guardrail prevents undercutting crashed listings below 70% of 7d median",
    fn: () => {
      const res = Analytics.evaluateDuplicate(
        { id: 303, name: "Mage Épique", rarity: "E" },
        { characterId: 303, qty: 2, locked: 0 },
        { median7d: 100, lowestFixed: 40, sales7d: 8 },
        Analytics.DEFAULT_RECYCLE_VALUES,
        { ...Analytics.DEFAULT_SETTINGS, autoSellMedianFloorPct: 70 }
      );
      assert.ok(res.prices.recommended >= 70, `Expected price >= 70, got ${res.prices.recommended}`);
      assert.equal(res.verdict, "VENDRE");
    }
  },
  {
    name: "Market deal evaluation identifies profitable flip after 5% + 2% fees",
    fn: () => {
      const ownedSet = new Set([404]);
      const deal = Analytics.evaluateDeal(
        {
          id: "lst-1",
          status: "active",
          isMine: false,
          characterId: 404,
          type: "fixed",
          price: 50,
          character: { id: 404, name: "Goku", rarity: "E" },
          prices: { median7d: 100, sales7d: 8 }
        },
        ownedSet
      );
      assert.ok(deal);
      assert.equal(deal.buyPrice, 50);
      assert.equal(deal.discountPct, 50);
      assert.ok(deal.flipProfit > 35);
      assert.equal(deal.isGoodFlip, true);
    }
  },
  {
    name: "Booster recommendation ranks packs by expected new characters (unlocked pool completion)",
    fn: () => {
      const catalogById = new Map();
      const packAPool = [];
      const packBPool = [];
      for (let i = 1; i <= 10; i++) {
        catalogById.set(i, { id: i, name: `Perso A${i}`, rarity: "C" });
        packAPool.push(i);
      }
      for (let i = 101; i <= 110; i++) {
        catalogById.set(i, { id: i, name: `Perso B${i}`, rarity: "C" });
        packBPool.push(i);
      }

      const ownedSet = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 101]);
      const slotRates = { slots: Array.from({ length: 5 }, () => ({ pct: { C: 100 } })) };

      const ranked = Analytics.rankBoostersForCollection(
        [
          { id: "pack-a", name: "Booster A (presque complet)", usesFreePacks: true, rates: slotRates },
          { id: "pack-b", name: "Booster B (plein de nouveaux)", usesFreePacks: true, rates: slotRates }
        ],
        { "pack-a": packAPool, "pack-b": packBPool },
        catalogById,
        ownedSet,
        {},
        {},
        { freePacks: 3, bonusPacks: 0 }
      );

      assert.ok(ranked.recommendedNew);
      assert.equal(ranked.recommendedNew.packId, "pack-b");
      assert.equal(ranked.recommendedNew.totalMissing, 9);
      assert.ok(
        ranked.recommendedNew.expectedNewCards > ranked.all[1].expectedNewCards,
        "Pack B must have higher expectedNewCards than Pack A"
      );
    }
  },
  {
    name: "evaluateBoosterPack fallback computes positive expectedNewCards from cardsByRarity when poolIds is empty",
    fn: () => {
      const catalogById = new Map([
        [1, { id: 1, rarity: "C" }],
        [2, { id: 2, rarity: "C" }]
      ]);
      const ownedSet = new Set([1]); // 50% owned
      const pack = {
        id: "all",
        name: "Shōnen Mix",
        usesFreePacks: true,
        rates: {
          cardsByRarity: { C: 100, U: 0, R: 0, E: 0, L: 0, M: 0 },
          slots: [{ pct: { C: 100 } }, { pct: { C: 100 } }]
        }
      };
      const ev = Analytics.evaluateBoosterPack(pack, [], catalogById, ownedSet, {}, {}, { freePacks: 2 });
      assert.equal(ev.totalPool, 100);
      assert.equal(ev.totalMissing, 50);
      assert.ok(ev.expectedNewCards > 0.9, `Expected ~1.0 new card, got ${ev.expectedNewCards}`);
      assert.ok(ev.probAtLeastOneNewPct > 70);
    }
  },
  {
    name: "canOpenNow is strictly false when free packs are 0 (Zero-Chakra booster guardrail)",
    fn: () => {
      const pack = {
        id: "waifus",
        name: "Waifus",
        usesFreePacks: true,
        rates: {
          cardsByRarity: { C: 10, U: 5, R: 3, E: 2, L: 1, M: 0 },
          slots: [{ pct: { C: 100 } }]
        }
      };
      // When player has 0 free packs and 0 bonus packs
      const evZero = Analytics.evaluateBoosterPack(pack, [], new Map(), new Set(), {}, {}, { freePacks: 0, bonusPacks: 0 });
      assert.equal(evZero.openableFreeCount, 0);
      assert.equal(evZero.canOpenNow, false, "canOpenNow must be false when free packs is 0");

      // When player has 1 free pack
      const evOne = Analytics.evaluateBoosterPack(pack, [], new Map(), new Set(), {}, {}, { freePacks: 1, bonusPacks: 0 });
      assert.equal(evOne.openableFreeCount, 1);
      assert.equal(evOne.canOpenNow, true, "canOpenNow must be true when 1 free pack is available");
    }
  },
  {
    name: "Pity Sniper prioritizes pack with most missing Mythics when pity >= 240",
    fn: () => {
      const catalog = new Map([
        [1, { id: 1, name: "Common A", rarity: "C" }],
        [2, { id: 2, name: "Common B", rarity: "C" }],
        [901, { id: 901, name: "Mythic Goku", rarity: "M" }],
        [902, { id: 902, name: "Mythic Naruto", rarity: "M" }]
      ]);
      const packGeneral = {
        id: "gen",
        name: "Pack Général (plein de communs)",
        usesFreePacks: true,
        rates: { slots: [{ pct: { C: 100 } }] }
      };
      const packMythic = {
        id: "myth",
        name: "Pack Mythique Dédié",
        usesFreePacks: true,
        rates: { slots: [{ pct: { M: 100 } }] }
      };

      const pools = {
        gen: [1, 2],
        myth: [901, 902]
      };

      // Near pity (245 / 250): must select packMythic because it contains missing Mythics
      const res = Analytics.rankBoostersForCollection(
        [packGeneral, packMythic],
        pools,
        catalog,
        new Set(),
        {},
        {},
        { freePacks: 2, pity: 245 }
      );
      assert.equal(res.isPityNear, true);
      assert.ok(res.recommendedPity);
      assert.equal(res.recommendedPity.packId, "myth");
      assert.equal(res.recommendedNew.packId, "myth");
    }
  },
  {
    name: "Surging price momentum (+20% over 30d) triggers CONSERVER (HODL) verdict",
    fn: () => {
      // median7d = 30, median30d = 20 (+50% surge)
      const res = Analytics.evaluateDuplicate(
        { id: 777, name: "Trending Card", rarity: "R" },
        { characterId: 777, qty: 3, locked: 0 },
        { median7d: 30, median30d: 20, lowestFixed: 29, sales7d: 5 }
      );
      assert.equal(res.isSurging, true);
      assert.equal(res.trendPct, 50);
      assert.equal(res.priceTrend, "up");
      assert.equal(res.verdict, "CONSERVER");
      assert.equal(res.canAutoSell, false);
      assert.equal(res.canAutoRecycle, false);
    }
  },
  {
    name: "Pinned favorite cards are protected from auto-sell and auto-recycle",
    fn: () => {
      const pinnedSet = new Set([888]);
      const res = Analytics.evaluateDuplicate(
        { id: 888, name: "Waifu Protégée", rarity: "C" },
        { characterId: 888, qty: 5, locked: 0 },
        { median7d: 3, lowestFixed: 3, sales7d: 1 },
        Analytics.DEFAULT_RECYCLE_VALUES,
        Analytics.DEFAULT_SETTINGS,
        0,
        pinnedSet
      );
      assert.equal(res.pinned, true);
      assert.equal(res.verdict, "PROTÉGÉ");
      assert.equal(res.canAutoSell, false);
      assert.equal(res.canAutoRecycle, false);
    }
  },
  {
    name: "KyaraI18n supports French, English, and Spanish dictionaries with parameter substitution",
    fn: () => {
      const i18n = require("../lib/i18n.js");
      i18n.setLanguage("fr");
      assert.equal(i18n.t("tabAutopilot"), "Pilote");
      assert.equal(i18n.t("verdict.VENDRE"), "VENDRE");
      assert.equal(i18n.t("copiesCount", { n: 4 }), "4 copie(s)");

      i18n.setLanguage("en");
      assert.equal(i18n.t("tabAutopilot"), "Pilot");
      assert.equal(i18n.t("verdict.VENDRE"), "SELL");
      assert.equal(i18n.t("copiesCount", { n: 4 }), "4 copy(ies)");

      i18n.setLanguage("es");
      assert.equal(i18n.t("tabAutopilot"), "Piloto");
      assert.equal(i18n.t("verdict.VENDRE"), "VENDER");
      assert.equal(i18n.t("copiesCount", { n: 4 }), "4 copia(s)");
    }
  },
  {
    name: "Fast sales velocity (48h/12h) guardrail prevents clogging 10 slots with slow-moving cards",
    fn: () => {
      // 1. Low-margin card with slow 48h pace (< 3 sales/7d): advises RECYCLER to immediately free up Chakra and avoid tying up a 12h slot
      const slowLowMargin = Analytics.evaluateDuplicate(
        { id: 201, name: "Tortue Lente", rarity: "C" },
        { characterId: 201, qty: 3, locked: 0 },
        { median7d: 8, lowestFixed: 8, sales7d: 1 }, // 1 sale in 7d => ~0.3 sale/48h, very low 12h prob
        Analytics.DEFAULT_RECYCLE_VALUES,
        Analytics.DEFAULT_SETTINGS,
        0
      );
      assert.equal(slowLowMargin.isSlowMover, true);
      assert.equal(slowLowMargin.verdict, "RECYCLER");
      assert.equal(slowLowMargin.canAutoSell, false);
      assert.ok(slowLowMargin.verdictReason.includes("48h"));

      // 2. Légendaires en surplus : toujours autorisées à la vente (valeur 100+ ◆) même si le rythme de vente est plus lent
      const slowLegendary = Analytics.evaluateDuplicate(
        { id: 202, name: "Légende Rare", rarity: "L" },
        { characterId: 202, qty: 2, locked: 0 },
        { median7d: 250, lowestFixed: 250, sales7d: 1 },
        Analytics.DEFAULT_RECYCLE_VALUES,
        Analytics.DEFAULT_SETTINGS,
        0
      );
      assert.equal(slowLegendary.verdict, "VENDRE");
      assert.equal(slowLegendary.canAutoSell, true);

      // 3. Épique avec vente lente : conseille ATTENDRE pour ne pas bloquer les créneaux
      const slowEpic = Analytics.evaluateDuplicate(
        { id: 204, name: "Épique Lente", rarity: "E" },
        { characterId: 204, qty: 2, locked: 0 },
        { median7d: 40, lowestFixed: 40, sales7d: 1 },
        Analytics.DEFAULT_RECYCLE_VALUES,
        Analytics.DEFAULT_SETTINGS,
        0
      );
      assert.equal(slowEpic.isSlowMover, true);
      assert.equal(slowEpic.verdict, "ATTENDRE");
      assert.equal(slowEpic.canAutoSell, false);

      // 3. Fast-moving card (sales7d >= 10, high 12h probability): advises VENDRE and canAutoSell = true
      const fastCard = Analytics.evaluateDuplicate(
        { id: 203, name: "Star Rapide", rarity: "R" },
        { characterId: 203, qty: 3, locked: 0 },
        { median7d: 25, lowestFixed: 24, sales7d: 28 }, // 4 sales/day, high 12h sales probability
        Analytics.DEFAULT_RECYCLE_VALUES,
        Analytics.DEFAULT_SETTINGS,
        0
      );
      assert.equal(fastCard.isSlowMover, false);
      assert.equal(fastCard.verdict, "VENDRE");
      assert.equal(fastCard.canAutoSell, true);
    }
  }
];

let passed = 0;
for (const t of tests) {
  t.fn();
  passed += 1;
  console.log(`  ✓ ${t.name}`);
}
console.log(`\nAll ${passed}/${tests.length} tests passed!`);
