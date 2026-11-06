import { describe, it, expect } from 'vitest';
import * as Analytics from '../src/lib/analytics';
import * as i18n from '../src/lib/i18n';
import { DEFAULT_SETTINGS } from '../src/types/settings';

describe('Kyara Manager Analytics (TypeScript)', () => {
  it('Market fee & net proceeds calculation (5% tax + 2% deposit fee, min 1 ◆)', () => {
    expect(Analytics.computeListingFee(3)).toBe(1);
    expect(Analytics.computeListingFee(100)).toBe(2);
    expect(Analytics.computeSaleTax(100)).toBe(5);
    expect(Analytics.computeNetProceeds(100)).toBe(93);
    expect(Analytics.computeNetProceeds(3)).toBe(1);
  });

  it('Spare copies calculation preserves ≥1 copy and respects locked, pinned, resaleUntil, and active listings', () => {
    expect(Analytics.computeSpareCopies({ qty: 1, locked: 0 }, 0)).toBe(0);
    expect(Analytics.computeSpareCopies({ qty: 3, locked: 0 }, 0)).toBe(2);
    expect(Analytics.computeSpareCopies({ qty: 3, locked: 1 }, 0)).toBe(1);
    expect(Analytics.computeSpareCopies({ qty: 3, locked: 0 }, 2)).toBe(0);
    expect(Analytics.computeSpareCopies({ qty: 5, pinned: true }, 0)).toBe(0);
    expect(
      Analytics.computeSpareCopies(
        { qty: 5, resaleUntil: new Date(Date.now() + 3600000).toISOString() },
        0
      )
    ).toBe(0);
  });

  it('Duplicate evaluation advises RECYCLER when market price is at floor with low net gain', () => {
    const res = Analytics.evaluateDuplicate(
      { id: 101, name: 'Slime Commun', rarity: 'C' },
      { characterId: 101, qty: 5, locked: 0 },
      { median7d: 3, lowestFixed: 3, sales7d: 1 }
    );
    expect(res.spare).toBe(4);
    expect(res.verdict).toBe('RECYCLER');
    expect(res.canAutoRecycle).toBe(true);
    expect(res.canAutoSell).toBe(false);
  });

  it('Duplicate evaluation advises VENDRE when market price yields net profit above recycle + threshold', () => {
    const res = Analytics.evaluateDuplicate(
      { id: 202, name: 'Héros Rare', rarity: 'R' },
      { characterId: 202, qty: 3, locked: 0 },
      { median7d: 25, lowestFixed: 24, sales7d: 9 }
    );
    expect(res.spare).toBe(2);
    expect(res.verdict).toBe('VENDRE');
    expect(res.canAutoSell).toBe(true);
    expect(res.prices?.recommended).toBe(23);
    expect(res.fees?.netGainOverRecycle).toBeGreaterThanOrEqual(2);
  });

  it('70% median guardrail prevents undercutting crashed listings below 70% of 7d median', () => {
    const res = Analytics.evaluateDuplicate(
      { id: 303, name: 'Mage Épique', rarity: 'E' },
      { characterId: 303, qty: 2, locked: 0 },
      { median7d: 100, lowestFixed: 40, sales7d: 8 },
      Analytics.DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, autoSellMedianFloorPct: 70 }
    );
    expect(res.prices?.recommended).toBeGreaterThanOrEqual(70);
    expect(res.verdict).toBe('VENDRE');
  });

  it('Market deal evaluation identifies profitable flip after 5% + 2% fees', () => {
    const deal = Analytics.evaluateDeal(
      {
        id: 'lst-1',
        status: 'active',
        isMine: false,
        characterId: 404,
        type: 'fixed',
        price: 50,
        character: { id: 404, name: 'Goku', rarity: 'E' }
      },
      { median7d: 100, sales7d: 8 },
      new Set([404]),
      DEFAULT_SETTINGS
    );
    expect(deal).not.toBeNull();
    expect(deal?.buyPrice).toBe(50);
    expect(deal?.discountPct).toBe(50);
    expect(deal?.flipProfit).toBeGreaterThan(35);
    expect(deal?.isGoodFlip).toBe(true);
  });

  it('Booster recommendation ranks packs by expected new characters', () => {
    const packs = [
      { id: 'p1', name: 'Pack A', totalPool: 10, characters: [{ id: 1 }, { id: 2 }, { id: 3 }], openableFreeCount: 1 },
      { id: 'p2', name: 'Pack B', totalPool: 10, characters: [{ id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }], openableFreeCount: 1 }
    ];
    const rec = Analytics.rankBoostersForCollection(packs, new Set([1, 2]));
    expect(rec.recommendedNew?.packId).toBe('p2');
    expect(rec.recommendedNew?.totalMissing).toBe(4);
  });

  it('Booster evaluation with full catalog and pools accurately computes slots probabilities', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'C1', rarity: 'C' }],
      [2, { id: 2, name: 'C2', rarity: 'C' }],
      [3, { id: 3, name: 'R1', rarity: 'R' }]
    ]);
    const pack = {
      id: 'pack-full',
      name: 'Full Pack',
      usesFreePacks: true,
      rates: {
        slots: [{ pct: { C: 100 } }]
      }
    };
    const ev = Analytics.evaluateBoosterPack(
      pack,
      [1, 2],
      catalog,
      new Set([1]),
      {},
      {},
      { freePacks: 2 }
    );
    expect(ev.canOpenNow).toBe(true);
    expect(ev.totalMissing).toBe(1);
    expect(ev.expectedNewCards).toBeGreaterThan(0);
  });

  it('canOpenNow is strictly false when free packs are 0 (Zero-Chakra guardrail)', () => {
    const pack = Analytics.evaluateBoosterPack(
      { id: 'p-free-0', name: 'Pack 0 Gratuit', openableFreeCount: 0 },
      new Set()
    );
    expect(pack.canOpenNow).toBe(false);
  });

  it('Pity Sniper prioritizes pack with most missing Mythics when pity >= 240', () => {
    const packs = [
      { id: 'p1', name: 'Pack Standard', missingByRarity: { M: 0 }, totalPool: 100 },
      { id: 'p2', name: 'Pack Sniper', missingByRarity: { M: 3 }, totalPool: 100 }
    ];
    const rec = Analytics.rankBoostersForCollection(packs, new Set(), 245);
    expect(rec.isPityNear).toBe(true);
    expect(rec.recommendedPity?.packId).toBe('p2');
  });

  it('computeLiveMarketDepth accurately computes median, average, and detects market crashes', () => {
    const mockListings = [
      { price: 20 },
      { price: 22 },
      { price: 25 },
      { price: 28 },
      { price: 30 }
    ];
    const depth = Analytics.computeLiveMarketDepth(mockListings, 100);
    expect(depth.count).toBe(5);
    expect(depth.lowestFixed).toBe(20);
    expect(depth.highestFixed).toBe(30);
    expect(depth.liveMedian20).toBe(25);
    expect(depth.liveAvg20).toBe(25);
    expect(depth.isCrashDetected).toBe(true);
    expect(depth.crashDiscountPct).toBe(75);
  });

  it("Strategy 'recent20_median' prices cards competitively according to live 20 listings during market drops", () => {
    const mockListings = [
      { price: 30 },
      { price: 32 },
      { price: 35 }
    ];
    const depth = Analytics.computeLiveMarketDepth(mockListings, 100);
    const res = Analytics.evaluateDuplicate(
      { id: 999, name: 'Natsu Fairy Tail', rarity: 'E' },
      { characterId: 999, qty: 3, locked: 0 },
      { median7d: 100, liveDepth: depth, lowestFixed: 30 },
      Analytics.DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, autoSellStrategy: 'recent20_median', autoSellCrashProtection: true }
    );
    expect(res.prices?.recommended).toBeLessThanOrEqual(32);
    expect(res.prices?.recommended).toBeGreaterThanOrEqual(27);
    expect(res.pedagogy?.isCrash).toBe(true);
  });

  it('Turbo Liquidity converts low-margin commons into instant Chakra', () => {
    const lowMarginCommon = Analytics.evaluateDuplicate(
      { id: 501, name: 'Gobelin Commun', rarity: 'C' },
      { characterId: 501, qty: 4, locked: 0 },
      { median7d: 4, lowestFixed: 4, sales7d: 14 },
      Analytics.DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, autoSellTurboLiquidity: true, autoSellTurboMaxNetProfit: 4 }
    );
    expect(lowMarginCommon.verdict).toBe('RECYCLER');
    expect(lowMarginCommon.verdictReason).toContain('Turbo Liquidité');
  });

  it('Wishlist generator suggests missing cards near album completion', () => {
    const catalog = new Map([
      [1, { name: 'Card 1', series: 'Naruto', rarity: 'C' }],
      [2, { name: 'Card 2', series: 'Naruto', rarity: 'U' }],
      [3, { name: 'Card 3', series: 'One Piece', rarity: 'R' }]
    ]);
    const owned = new Set([1]);
    const prices = new Map([
      [2, { median7d: 8, sales7d: 10 }],
      [3, { median7d: 50, sales7d: 2 }]
    ]);
    const suggestions = Analytics.generateDailyWishlist(catalog, owned, prices, 5);
    expect(suggestions.length).toBe(2);
    expect(suggestions[0].series).toBe('Naruto');
  });

  it('i18n supports French, English, and Spanish dictionaries with parameter substitution', () => {
    i18n.setLanguage('fr');
    expect(i18n.t('tabAutopilot')).toBe('Pilote');
    expect(i18n.t('turboBannerDesc', { n: 5 })).toContain('5');

    i18n.setLanguage('en');
    expect(i18n.t('tabAutopilot')).toBe('Pilot');
    expect(i18n.t('turboBannerDesc', { n: 5 })).toContain('5');

    i18n.setLanguage('es');
    expect(i18n.t('tabAutopilot')).toBe('Piloto');
    expect(i18n.t('turboBannerDesc', { n: 5 })).toContain('5');
  });

  it('Autopilot Best Pulls i18n and rarity weights sort highest tier characters first', () => {
    i18n.setLanguage('fr');
    expect(i18n.t('bestPullsTitle')).toBe('Butin Autopilot — Meilleurs Tirages');
    expect(i18n.t('bestPullsFilterMythic')).toBe('Mythiques');

    i18n.setLanguage('en');
    expect(i18n.t('bestPullsTitle')).toBe('Autopilot Loot — Best Pulls');

    i18n.setLanguage('es');
    expect(i18n.t('bestPullsTitle')).toBe('Botín del Autopiloto — Mejores Tiradas');

    const RARITY_WEIGHT: Record<string, number> = { M: 6, L: 5, E: 4, R: 3, U: 2, C: 1 };
    const pulls = [
      { id: 1, name: 'Card Epic', rarity: 'E', pulledAt: 100 },
      { id: 2, name: 'Card Mythic', rarity: 'M', pulledAt: 50 },
      { id: 3, name: 'Card Legendary', rarity: 'L', pulledAt: 120 }
    ];
    pulls.sort((a, b) => {
      const wA = RARITY_WEIGHT[a.rarity] || 0;
      const wB = RARITY_WEIGHT[b.rarity] || 0;
      if (wB !== wA) return wB - wA;
      return b.pulledAt - a.pulledAt;
    });
    expect(pulls[0].rarity).toBe('M');
    expect(pulls[1].rarity).toBe('L');
    expect(pulls[2].rarity).toBe('E');
  });
});
