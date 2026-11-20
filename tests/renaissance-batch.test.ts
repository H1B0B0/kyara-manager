import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { computeRenaissanceSummary } from '../src/lib/analytics/renaissance';
import { rankBoostersForCollection } from '../src/lib/analytics/boosters';
import { state } from '../src/content/state';
import { runtimeCache } from '../src/content/cache';
import { previewBatchMissingBuy, executeBatchMissingBuy } from '../src/content/automation/batch-buy';
import { scanMarketDealsInternal } from '../src/content/scanner';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  journal: vi.fn(),
  notify: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal }));
vi.mock('../src/content/safety', () => ({ isInterrupted: () => false }));
vi.mock('../src/content/utils', () => ({ notifyDesktop: mocks.notify }));

describe('v2.1.0 Renaissance & Batch Missing Buy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome();
    state.currentSettings = { ...DEFAULT_SETTINGS };
    runtimeCache.collectionPrices.clear();
  });

  describe('computeRenaissanceSummary', () => {
    it('computes counts across C..M, respects targets, ranks priorityRarities, and calculates cost & overallPct', () => {
      const catalog = new Map<number, any>([
        [1, { id: 1, rarity: 'C' }], [2, { id: 2, rarity: 'C' }], [3, { id: 3, rarity: 'C' }], [4, { id: 4, rarity: 'C' }],
        [5, { id: 5, rarity: 'U' }], [6, { id: 6, rarity: 'U' }], [7, { id: 7, rarity: 'U' }], [8, { id: 8, rarity: 'U' }],
        [9, { id: 9, rarity: 'R' }], [10, { id: 10, rarity: 'R' }], [11, { id: 11, rarity: 'R' }],
        [12, { id: 12, rarity: 'E' }], [13, { id: 13, rarity: 'E' }],
        [14, { id: 14, rarity: 'L' }], [15, { id: 15, rarity: 'M' }]
      ]);
      const owned = new Set([1, 2, 5, 12, 14]);
      const summary = computeRenaissanceSummary(
        catalog,
        owned,
        {
          renaissanceFocusEnabled: true,
          renaissanceTargetRarities: ['C', 'U', 'R'],
          renaissanceTargets: { C: 3, U: 4, R: 2 }
        },
        { C: 4, U: 10, R: 20 }
      );

      expect(summary.enabled).toBe(true);
      expect(summary.byRarity.C).toMatchObject({ owned: 2, total: 4, missing: 2, target: 3, remainingForTarget: 1, estimatedCostChakra: 3 });
      expect(summary.byRarity.U).toMatchObject({ owned: 1, total: 4, missing: 3, target: 4, remainingForTarget: 3, estimatedCostChakra: 27 });
      expect(summary.byRarity.R).toMatchObject({ owned: 0, total: 3, missing: 3, target: 2, remainingForTarget: 2, estimatedCostChakra: 34 });
      expect(summary.byRarity.E).toMatchObject({ owned: 1, total: 2, missing: 1 });
      expect(summary.byRarity.L).toMatchObject({ owned: 1, total: 1, missing: 0 });
      expect(summary.byRarity.M).toMatchObject({ owned: 0, total: 1, missing: 1 });
      expect(summary.priorityRarities).toEqual(['U', 'R', 'C']);
      expect(summary.estimatedRemainingCost).toBe(64);
      expect(summary.overallPct).toBe(33.3);
      expect(summary.ready).toBe(false);
    });
  });

  describe('rankBoostersForCollection (Renaissance Focus)', () => {
    const catalog = new Map<number, any>([
      [101, { id: 101, rarity: 'E' }], [102, { id: 102, rarity: 'E' }],
      [103, { id: 103, rarity: 'L' }], [104, { id: 104, rarity: 'L' }],
      [201, { id: 201, rarity: 'C' }], [202, { id: 202, rarity: 'C' }],
      [203, { id: 203, rarity: 'R' }], [204, { id: 204, rarity: 'R' }],
      [301, { id: 301, rarity: 'M' }]
    ]);
    const packs = [
      {
        id: 'ev-pack', name: 'High EV', usesFreePacks: true,
        rates: { slots: [{ pct: { E: 50, L: 50 } }, { pct: { E: 50, L: 50 } }] }
      },
      {
        id: 'ren-pack', name: 'Renaissance Pack', usesFreePacks: true,
        rates: { slots: [{ pct: { C: 50, R: 50 } }] }
      },
      {
        id: 'pity-pack', name: 'Mythic Pack', usesFreePacks: true,
        rates: { slots: [{ pct: { M: 100 } }] }
      }
    ];
    const pools = { 'ev-pack': [101, 102, 103, 104], 'ren-pack': [201, 202, 203, 204], 'pity-pack': [301] };

    it('prioritizes highest expectedRenaissanceCards for C/R over higher EV packs', () => {
      const rec = rankBoostersForCollection(
        packs.slice(0, 2), pools, catalog, new Set(), { C: 3, R: 6, E: 25, L: 150 }, {},
        { freePacks: 2, pity: 10 }, null,
        { renaissanceFocusEnabled: true, renaissanceTargetRarities: ['C', 'R'] }
      );
      expect(rec.recommendedEv?.packId).toBe('ev-pack');
      expect(rec.recommendedRenaissance?.packId).toBe('ren-pack');
      expect(rec.recommendedNew?.packId).toBe('ren-pack');
    });

    it('keeps Pity Sniper priority when isPityNear is true', () => {
      const rec = rankBoostersForCollection(
        packs, pools, catalog, new Set(), { C: 3, R: 6, E: 25, L: 150, M: 950 }, {},
        { freePacks: 2, pity: 245 }, null,
        { renaissanceFocusEnabled: true, renaissanceTargetRarities: ['C', 'R'], autoOpenPitySniper: true }
      );
      expect(rec.isPityNear).toBe(true);
      expect(rec.recommendedPity?.packId).toBe('pity-pack');
      expect(rec.recommendedRenaissance?.packId).toBe('ren-pack');
      expect(rec.recommendedNew?.packId).toBe('pity-pack');
    });
  });

  describe('previewBatchMissingBuy & executeBatchMissingBuy', () => {
    it('excludes owned cards, deduplicates by cheapest listing, filters > maxUnitPrice, and respects maxTotalBudget', async () => {
      mocks.api.mockImplementation(async (path: string) => {
        if (path === '/me/collection?lean=1') return [{ characterId: 10, qty: 1 }, { characterId: 11, qty: 2 }];
        if (path.startsWith('/market/listings?')) {
          return {
            items: [
              { id: 'l-owned', status: 'active', price: 2, character: { id: 10, name: 'Owned', rarity: 'U' } },
              { id: 'l-20-hi', status: 'active', price: 3, character: { id: 20, name: 'Alpha', rarity: 'U' } },
              { id: 'l-20-lo', status: 'active', price: 2, character: { id: 20, name: 'Alpha', rarity: 'U' } },
              { id: 'l-21', status: 'active', price: 3, character: { id: 21, name: 'Beta', rarity: 'U' } },
              { id: 'l-22', status: 'active', price: 4, character: { id: 22, name: 'Gamma', rarity: 'U' } },
              { id: 'l-23', status: 'active', price: 5, character: { id: 23, name: 'TooExpensive', rarity: 'U' } }
            ]
          };
        }
        if (path.startsWith('/me/collection/prices?ids=')) {
          return [{ characterId: 20, median7d: 6 }, { characterId: 21, median7d: 7 }];
        }
        return {};
      });

      const preview = await previewBatchMissingBuy({ rarity: 'U', maxUnitPrice: 4, qty: 50, maxTotalBudget: 6 });
      expect(preview.totalFound).toBe(3);
      expect(preview.items.map((i) => i.listingId)).toEqual(['l-20-lo', 'l-21']);
      expect(preview.items[0].median7d).toBe(6);
      expect(preview.totalCost).toBe(5);
    });

    it('buys missing cards, skips listing_closed, respects reserve, and never buys same characterId twice', async () => {
      state.currentSettings.autoBuyMinChakraReserve = 200;
      const boughtIds: string[] = [];

      mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
        if (path === '/me/bootstrap') return { me: { chakra: 207 } };
        if (path === '/me/collection?lean=1') return [];
        if (path.startsWith('/market/listings?')) {
          return {
            items: [
              { id: 'l-1', status: 'active', price: 2, character: { id: 31, name: 'Card 31', rarity: 'U' } },
              { id: 'l-1b', status: 'active', price: 3, character: { id: 31, name: 'Card 31', rarity: 'U' } },
              { id: 'l-closed', status: 'active', price: 2, character: { id: 32, name: 'Closed 32', rarity: 'U' } },
              { id: 'l-3', status: 'active', price: 3, character: { id: 33, name: 'Card 33', rarity: 'U' } },
              { id: 'l-4', status: 'active', price: 4, character: { id: 34, name: 'Card 34', rarity: 'U' } }
            ]
          };
        }
        if (path.startsWith('/me/collection/prices?ids=')) return [];
        if (path === '/market/listings/l-1') return { id: 'l-1', status: 'active', type: 'fixed', price: 2 };
        if (path === '/market/listings/l-closed') return { id: 'l-closed', status: 'active', type: 'fixed', price: 2 };
        if (path === '/market/listings/l-3') return { id: 'l-3', status: 'active', type: 'fixed', price: 3 };
        if (path === '/market/listings/l-4') return { id: 'l-4', status: 'active', type: 'fixed', price: 4 };
        if (opts.method === 'POST' && path.endsWith('/buy')) {
          if (path.includes('l-closed')) throw new Error('listing_closed');
          boughtIds.push(path);
          const remaining = path.includes('l-1') ? 205 : 202;
          return { ok: true, user: { chakra: remaining } };
        }
        return {};
      });

      const res = await executeBatchMissingBuy({ rarity: 'U', maxUnitPrice: 4, qty: 10 });
      expect(boughtIds).toEqual(['/market/listings/l-1/buy', '/market/listings/l-3/buy']);
      expect(res.boughtCount).toBe(2);
      expect(res.failedCount).toBe(1);
      expect(res.totalSpent).toBe(5);
      expect(res.remainingChakra).toBe(202);
      expect(res.boughtNames).toEqual(['Card 31', 'Card 33']);
      expect(res.stoppedReason).toContain('Réserve Chakra (200');
    });

    it('includes rarity E in RENAISSANCE batch buy, scans deep pages in parallel, and ignores reserve on manual click', async () => {
      state.currentSettings.autoBuyMinChakraReserve = 200;
      state.currentSettings.renaissanceTargetRarities = ['C', 'U', 'R'];

      mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
        if (path === '/me/bootstrap') return { me: { chakra: 50 } };
        if (path === '/me/collection?lean=1') return [];
        if (path.includes('rarity=E') && path.includes('page=4')) {
          return {
            items: [{ id: 'l-epic-deep', status: 'active', price: 15, character: { id: 99, name: 'Deep Epic', rarity: 'E' } }]
          };
        }
        if (path.startsWith('/market/listings?')) {
          return {
            items: [{ id: 'l-expensive', status: 'active', price: 999, character: { id: 88, name: 'Expensive', rarity: 'C' } }]
          };
        }
        if (path.startsWith('/me/collection/prices?ids=')) return [];
        if (path === '/market/listings/l-epic-deep') return { id: 'l-epic-deep', status: 'active', type: 'fixed', price: 15 };
        if (opts.method === 'POST' && path === '/market/listings/l-epic-deep/buy') {
          return { ok: true, user: { chakra: 35 } };
        }
        return {};
      });

      const res = await executeBatchMissingBuy({ rarity: 'RENAISSANCE', maxUnitPrice: 20, qty: 5, ignoreReserve: true });
      expect(res.boughtCount).toBe(1);
      expect(res.boughtNames).toEqual(['Deep Epic']);
      expect(res.totalSpent).toBe(15);
    });
  });

  describe('scanMarketDealsInternal', () => {
    it('hydrates missing card prices via /me/collection/prices and flags isRenaissanceNeed for focus rarities', async () => {
      state.currentSettings.renaissanceFocusEnabled = true;
      state.currentSettings.renaissanceTargetRarities = ['C', 'R'];

      mocks.api.mockImplementation(async (path: string) => {
        if (path === '/market/listings?sort=newest&pageSize=50&page=1') {
          return {
            items: [
              { id: 'd-ren', status: 'active', type: 'fixed', price: 4, character: { id: 501, name: 'Focus R', rarity: 'R' } },
              { id: 'd-epic', status: 'active', type: 'fixed', price: 8, character: { id: 502, name: 'NonFocus E', rarity: 'E' } },
              { id: 'd-owned', status: 'active', type: 'fixed', price: 4, character: { id: 503, name: 'Owned C', rarity: 'C' } }
            ]
          };
        }
        if (path.startsWith('/market/listings?')) return { items: [] };
        if (path.startsWith('/me/collection/prices?ids=')) {
          return [
            { characterId: 501, median7d: 10, sales7d: 5 },
            { characterId: 502, median7d: 20, sales7d: 5 },
            { characterId: 503, median7d: 4, sales7d: 2 }
          ];
        }
        return {};
      });

      const deals = await scanMarketDealsInternal(new Set([503]), new Map(), 1000);
      expect(mocks.api).toHaveBeenCalledWith(expect.stringMatching(/^\/me\/collection\/prices\?ids=501,502,503$/));
      expect(runtimeCache.collectionPrices.get(501)?.median7d).toBe(10);

      const renDeal = deals.find((d) => d.characterId === 501);
      const epicDeal = deals.find((d) => d.characterId === 502);
      expect(renDeal).toMatchObject({ isMissing: true, isRenaissanceNeed: true, refMedian: 10 });
      expect(epicDeal).toMatchObject({ isMissing: true, isRenaissanceNeed: false, refMedian: 20 });
      expect(deals.find((d) => d.characterId === 503)).toBeUndefined();
    });
  });
});
