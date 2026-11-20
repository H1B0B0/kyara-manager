import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { computeSeriesProgress } from '../src/lib/analytics/series';
import {
  computeRenaissanceSummary,
  OFFICIAL_REBIRTH_1_TARGETS,
  OFFICIAL_REBIRTH_BOOSTERS_TARGET
} from '../src/lib/analytics/renaissance';
import { rankBoostersForCollection } from '../src/lib/analytics/boosters';
import { state } from '../src/content/state';
import { runtimeCache } from '../src/content/cache';
import { scanBuyOrderOpportunities, placeBuyOrder } from '../src/content/automation/buy-orders';
import { previewBatchMissingBuy } from '../src/content/automation/batch-buy';
import { recordConfirmedSale, recordCumulativeMetric } from '../src/content/journal';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/utils', () => ({ notifyDesktop: vi.fn(), sleep: vi.fn(), newRequestId: () => 't' }));

describe('v2.2.0 features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome();
    mockLocks();
    state.currentSettings = { ...DEFAULT_SETTINGS };
    runtimeCache.collectionPrices.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computeSeriesProgress groups, filters <3 or complete, sorts missingCards by price asc, and prioritizes >=75%', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'T1', series: 'Tiny', rarity: 'C' }],
      [2, { id: 2, name: 'T2', series: 'Tiny', rarity: 'C' }],
      [3, { id: 3, name: 'C1', series: 'Complete', rarity: 'C' }],
      [4, { id: 4, name: 'C2', series: 'Complete', rarity: 'C' }],
      [5, { id: 5, name: 'C3', series: 'Complete', rarity: 'C' }],
      [10, { id: 10, name: 'A1', series: 'Almost', rarity: 'R' }],
      [11, { id: 11, name: 'A2', series: 'Almost', rarity: 'R' }],
      [12, { id: 12, name: 'A3', series: 'Almost', rarity: 'R' }],
      [13, { id: 13, name: 'A4', series: 'Almost', rarity: 'E' }],
      [20, { id: 20, name: 'H1', series: 'Half', rarity: 'C' }],
      [21, { id: 21, name: 'H2', series: 'Half', rarity: 'C' }],
      [22, { id: 22, name: 'H3', series: 'Half', rarity: 'E' }],
      [23, { id: 23, name: 'H4', series: 'Half', rarity: 'R' }],
      [30, { id: 30, name: 'S1', series: 'TwoThirds', rarity: 'C' }],
      [31, { id: 31, name: 'S2', series: 'TwoThirds', rarity: 'C' }],
      [32, { id: 32, name: 'S3', series: 'TwoThirds', rarity: 'R' }]
    ]);
    const owned = new Set([1, 3, 4, 5, 10, 11, 12, 20, 21, 30, 31]);
    const prices = new Map<number, any>([
      [13, { median7d: 25 }],
      [22, { median7d: 40 }],
      [23, { median7d: 10 }],
      [32, { median7d: 8 }]
    ]);

    const res = computeSeriesProgress(catalog, owned, prices);
    expect(res.map((s) => s.series)).toEqual(['Almost', 'TwoThirds', 'Half']);
    expect(res[0]).toMatchObject({ series: 'Almost', completionPct: 75, estimatedCostToComplete: 25, missingCount: 1 });
    expect(res[2]).toMatchObject({ series: 'Half', completionPct: 50, estimatedCostToComplete: 50 });
    expect(res[2].missingCards.map((c) => c.characterId)).toEqual([23, 22]);
  });

  it('computeRenaissanceSummary enforces Official Rebirth 1 rules, C/U/R/E blocking listings, payout, renown & 8 conditions', () => {
    expect(OFFICIAL_REBIRTH_1_TARGETS).toEqual({ C: 1432, U: 1432, R: 1432, E: 505, L: 70, M: 10 });
    expect(OFFICIAL_REBIRTH_BOOSTERS_TARGET).toBe(1500);

    const emptySummary = computeRenaissanceSummary(new Map(), new Set(), DEFAULT_SETTINGS);
    expect(emptySummary.boostersTarget).toBe(1500);
    for (const r of ['C', 'U', 'R', 'E', 'L', 'M'] as const) {
      expect(emptySummary.byRarity[r].target).toBe(OFFICIAL_REBIRTH_1_TARGETS[r]);
    }

    const catalog = new Map<number, any>([
      [1, { id: 1, rarity: 'C' }],
      [2, { id: 2, rarity: 'U' }],
      [3, { id: 3, rarity: 'R' }],
      [4, { id: 4, rarity: 'E' }],
      [5, { id: 5, rarity: 'L' }],
      [6, { id: 6, rarity: 'M' }]
    ]);
    const owned = new Set([1, 2, 3, 4, 5, 6]);

    const clean = computeRenaissanceSummary(catalog, owned, DEFAULT_SETTINGS, {}, null, {
      boostersOpened: 1500,
      activeListings: [{ rarity: 'L' }, { character: { rarity: 'M' } }]
    });
    expect(clean.blockingListingsCount).toBe(0);
    expect(clean.rebirthPayoutChakra).toBe(1 + 1 + 3 + 10);
    expect(clean.estimatedRenown).toBe(1 + 2 + 5 + 15 + 50 + 200);
    expect(clean.conditionsMet).toBe(8);
    expect(clean.conditionsTotal).toBe(8);

    const blocked = computeRenaissanceSummary(catalog, owned, DEFAULT_SETTINGS, {}, null, {
      boostersOpened: 1499,
      activeListings: [{ rarity: 'C' }, { rarity: 'E' }, { rarity: 'L' }, { rarity: 'M' }]
    });
    expect(blocked.blockingListingsCount).toBe(2);
    expect(blocked.conditionsMet).toBe(6);
  });

  it('rankBoostersForCollection activates Golden Pack Sniper when goldenIn === 1', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, rarity: 'M' }],
      [2, { id: 2, rarity: 'E' }],
      [3, { id: 3, rarity: 'C' }]
    ]);
    const packs = [
      { id: 'non-gold', name: 'Non Gold', usesFreePacks: true, goldenEligible: false, rates: { slots: [{ pct: { M: 100 } }] } },
      { id: 'best-gold', name: 'Best Gold', usesFreePacks: true, goldenEligible: true, rates: { slots: [{ pct: { E: 100 } }] } },
      { id: 'low-gold', name: 'Low Gold', usesFreePacks: true, goldenEligible: true, rates: { slots: [{ pct: { C: 100 } }] } }
    ];
    const pools = { 'non-gold': [1], 'best-gold': [2], 'low-gold': [3] };
    const prices = { C: 3, E: 180, M: 950 };

    const rec = rankBoostersForCollection(packs, pools, catalog, new Set(), prices, {}, { freePacks: 3, goldenIn: 1, pity: 10 }, null, {
      autoOpenGoldenSniper: true, renaissanceFocusEnabled: true, renaissanceTargetRarities: ['C']
    });
    expect(rec.isGoldenNext).toBe(true);
    expect(rec.recommendedGolden?.packId).toBe('best-gold');
    expect(rec.recommendedNew?.packId).toBe('best-gold');

    const disabled = rankBoostersForCollection(packs, pools, catalog, new Set(), prices, {}, { freePacks: 3, goldenIn: 1, pity: 10 }, null, {
      autoOpenGoldenSniper: false, renaissanceFocusEnabled: true, renaissanceTargetRarities: ['C']
    });
    expect(disabled.recommendedNew?.packId).toBe('low-gold');
  });

  it('scanBuyOrderOpportunities probes market endpoints and placeBuyOrder enforces reserve & posts', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/market/buy-orders?characterId=101') return [{ price: 24 }];
      if (path === '/market/prices/101') return { median7d: 40 };
      if (path.startsWith('/market/listings?characterId=101')) return { items: [{ status: 'active', price: 32 }] };
      if (path === '/market/buy-orders?characterId=202') return [];
      if (path === '/market/prices/202') return { median7d: 30 };
      if (path.startsWith('/market/listings?characterId=202')) return { items: [{ status: 'active', price: 20 }] };
      if (path === '/me/bootstrap') return { me: { chakra: 220 } };
      return {};
    });

    const ops = await scanBuyOrderOpportunities({
      wishlist: [{ characterId: 101, name: 'Wish', series: 'S1', rarity: 'E', budgetChakra: 28 }],
      seriesProgress: [{ series: 'S2', missingCards: [{ characterId: 202, name: 'Ser', rarity: 'R', estimatedPrice: 20 }] }]
    }, { discountPct: 25 });

    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ characterId: 101, lowestFixed: 32, bestExistingBid: 24, suggestedBid: 28, source: 'wishlist' });
    expect(ops[1]).toMatchObject({ characterId: 202, lowestFixed: 20, bestExistingBid: null, suggestedBid: 19, source: 'series' });

    state.currentSettings.autoBuyMinChakraReserve = 200;
    const blocked = await placeBuyOrder(101, 25, 'Wish');
    expect(blocked.ok).toBe(false);
    expect(mocks.api).not.toHaveBeenCalledWith('/market/buy-orders', expect.anything());

    const placed = await placeBuyOrder(101, 20, 'Wish');
    expect(placed.ok).toBe(true);
    expect(mocks.api).toHaveBeenCalledWith('/market/buy-orders', expect.objectContaining({
      method: 'POST', body: { characterId: 101, price: 20, qty: 1 }
    }));
  });

  it('previewBatchMissingBuy({ characterIds }) queries missing targets in parallel and picks cheapest <= maxUnitPrice', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/collection?lean=1') return [{ characterId: 10, qty: 1 }];
      if (path.startsWith('/market/listings?characterId=11')) {
        return {
          items: [
            { id: 'l-hi', status: 'active', price: 12, character: { id: 11, name: 'C11', rarity: 'R' } },
            { id: 'l-lo', status: 'active', price: 8, character: { id: 11, name: 'C11', rarity: 'R' } }
          ]
        };
      }
      if (path.startsWith('/market/listings?characterId=12')) {
        return { items: [{ id: 'l-12', status: 'active', price: 16, character: { id: 12, name: 'C12', rarity: 'E' } }] };
      }
      if (path.startsWith('/me/collection/prices?ids=')) return [{ characterId: 11, median7d: 14 }];
      return { items: [] };
    });

    const preview = await previewBatchMissingBuy({ rarity: 'RENAISSANCE', maxUnitPrice: 15, qty: 10, characterIds: [10, 11, 12] });
    expect(mocks.api).not.toHaveBeenCalledWith(expect.stringContaining('characterId=10'), expect.anything());
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({ listingId: 'l-lo', characterId: 11, price: 8, median7d: 14 });
  });

  it('recordConfirmedSale & recordCumulativeMetric maintain 24h UTC hourlyHistory buckets', async () => {
    vi.useFakeTimers();
    const t0 = Date.UTC(2026, 10, 20, 10, 15, 0);
    vi.setSystemTime(t0);
    const { data } = mockChrome();

    await recordConfirmedSale('s-1', { name: 'Gojo', price: 100 });
    await recordCumulativeMetric({ chakraFromRecycle: 15, cardsRecycled: 3 });

    const hour0 = Math.floor(t0 / 3600000) * 3600000;
    expect(data.kmCumulativeStats.hourlyHistory).toEqual([
      { hourTs: hour0, salesChakra: 93, recycleChakra: 15, totalChakra: 108 }
    ]);

    for (let h = 1; h <= 25; h += 1) {
      vi.setSystemTime(t0 + h * 3600000);
      await recordCumulativeMetric({ chakraFromRecycle: 2 });
    }
    expect(data.kmCumulativeStats.hourlyHistory).toHaveLength(24);
    expect(data.kmCumulativeStats.hourlyHistory[0].hourTs).toBe(hour0 + 2 * 3600000);
    expect(data.kmCumulativeStats.hourlyHistory[23].hourTs).toBe(hour0 + 25 * 3600000);
  });
});
