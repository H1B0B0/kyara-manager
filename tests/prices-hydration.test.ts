import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  sale: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/hud', () => ({ updateFloatingHud: vi.fn() }));
vi.mock('../src/content/scanner', () => ({
  scanMarketDealsInternal: vi.fn(async () => []),
  scanProfitableTrades: vi.fn(async () => [])
}));
vi.mock('../src/content/journal', () => ({ recordConfirmedSale: mocks.sale }));
vi.mock('../src/content/utils', () => ({ notifyDesktop: vi.fn() }));

describe('real price hydration & retroactive bestPulls rehydration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('ensureCollectionPrices unwraps { prices } and falls back to ensureFairPlayPrices only for unresolved ids', async () => {
    mockChrome();
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/collection/prices?ids=10,20') {
        return {
          prices: {
            '10': { median7d: 250, sales7d: 4 },
            '20': { median7d: null, sales7d: 0 }
          }
        };
      }
      if (path === '/fair-play/prices?ids=20') {
        return {
          prices: {
            '20': { median7d: 75, sales7d: 2 }
          }
        };
      }
      return null;
    });

    const { ensureCollectionPrices, runtimeCache } = await import('../src/content/cache');
    const prices = await ensureCollectionPrices([10, 20]);

    expect(prices.get(10)).toMatchObject({ median7d: 250, sales7d: 4, source: 'collection' });
    expect(prices.get(20)).toMatchObject({ median7d: 75, sales7d: 2, source: 'fair-play' });
    expect(runtimeCache.collectionPrices.get(20)?.median7d).toBe(75);
    expect(mocks.api).toHaveBeenCalledWith('/me/collection/prices?ids=10,20');
    expect(mocks.api).toHaveBeenCalledWith('/fair-play/prices?ids=20', { auth: true });
    expect(mocks.api).not.toHaveBeenCalledWith('/fair-play/prices?ids=10,20', { auth: true });
  });

  it('hydrateCharacterPrices queries /market/prices/<id> or /characters/<id> for cards missing bulk quotes', async () => {
    const { data } = mockChrome();
    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/me/collection/prices')) return { prices: {} };
      if (path.startsWith('/fair-play/prices')) {
        return {
          prices: {
            // Card 89 has a stale mythic floor from fair-play; card 55 has no bulk price at all
            '89': { median7d: 815, sales7d: 0 }
          }
        };
      }
      if (path === '/market/prices/55') return { median7d: 420, sales7d: 6 };
      if (path === '/market/prices/89') return null;
      if (path === '/characters/89') return { id: 89, prices: { median7d: 1225, sales7d: 3 } };
      return null;
    });

    const { hydrateCharacterPrices } = await import('../src/content/cache');
    const prices = await hydrateCharacterPrices([55, 89], { fallbackDetailIds: [55, 89], detailLimit: 10 });

    expect(prices.get(55)).toMatchObject({ median7d: 420, sales7d: 6, source: 'detail' });
    expect(prices.get(89)).toMatchObject({ median7d: 1225, sales7d: 3, source: 'detail' });
    expect(mocks.api).toHaveBeenCalledWith('/market/prices/55', { auth: false });
    expect(mocks.api).not.toHaveBeenCalledWith('/characters/55', { auth: false });
    expect(mocks.api).toHaveBeenCalledWith('/market/prices/89', { auth: false });
    expect(mocks.api).toHaveBeenCalledWith('/characters/89', { auth: false });
    expect(data.kmPriceCache?.entries?.['55']?.m7).toBe(420);
    expect(data.kmPriceCache?.entries?.['89']?.m7).toBe(1225);
  });

  it('refreshDashboardSnapshot retroactively rehydrates kmBestPulls floor fallback (#89 Shinji Ikari 815 -> 1225) and persists to chrome.storage.local', async () => {
    const pulledAt = 1700000000000;
    const { chrome, data } = mockChrome({
      kmBestPulls: [
        {
          characterId: 89,
          name: 'Shinji Ikari',
          rarity: 'M',
          series: 'Neon Genesis Evangelion',
          packName: 'Pack Mecha',
          pulledAt,
          isNew: true,
          medianPrice: 815,
          isFloorFallback: true
        }
      ]
    });

    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/bootstrap') return { me: { id: 1, pseudo: 'TestUser', chakra: 500 } };
      if (path === '/me/renaissance' || path === '/me/rebirth') return null;
      if (path === '/config') return { recycle: { C: 1, U: 1, R: 3, E: 10, L: 40, M: 150 } };
      if (path === '/me/collection?lean=1') return [{ characterId: 89, qty: 1 }];
      if (path === '/me/market') return { listings: [] };
      if (path === '/packs') return [];
      if (path === '/characters') {
        return [{ id: 89, name: 'Shinji Ikari', series: 'Neon Genesis Evangelion', rarity: 'M', rank: 5 }];
      }
      if (path === '/play/arcade' || path === '/play/arcade/boss') return null;
      if (path.startsWith('/me/collection/prices')) return { prices: {} };
      if (path.startsWith('/fair-play/prices')) return { prices: {} };
      if (path === '/market/prices/89') return null;
      if (path === '/characters/89') return { id: 89, prices: { median7d: 1225, sales7d: 4 } };
      return [];
    });

    const { refreshDashboardSnapshot } = await import('../src/content/snapshot');
    const dashboard = await refreshDashboardSnapshot();

    expect(dashboard.bestPulls).toHaveLength(1);
    expect(dashboard.bestPulls[0]).toMatchObject({
      characterId: 89,
      name: 'Shinji Ikari',
      medianPrice: 1225
    });
    expect(dashboard.bestPulls[0]).not.toHaveProperty('isFloorFallback');

    expect(data.kmBestPulls[0]).toMatchObject({
      characterId: 89,
      name: 'Shinji Ikari',
      medianPrice: 1225
    });
    expect(data.kmBestPulls[0]).not.toHaveProperty('isFloorFallback');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        kmBestPulls: [expect.objectContaining({ characterId: 89, medianPrice: 1225 })]
      })
    );
  });

  it('negative-caches unresolved cards for 5 min in ensureCollectionPrices & ensureFairPlayPrices and caps chunk concurrency at 3', async () => {
    mockChrome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));

    try {
      let collectionCalls = 0;
      let fairPlayCalls = 0;
      mocks.api.mockImplementation(async (path: string) => {
        if (path.startsWith('/me/collection/prices')) {
          collectionCalls += 1;
          return { prices: { '10': { median7d: null, sales7d: 0 } } };
        }
        if (path.startsWith('/fair-play/prices')) {
          fairPlayCalls += 1;
          return { prices: {} };
        }
        return null;
      });

      const { ensureCollectionPrices, ensureFairPlayPrices } = await import('../src/content/cache');

      // Initial call queries both /me/collection/prices and /fair-play/prices once
      await ensureCollectionPrices([10, 11]);
      expect(collectionCalls).toBe(1);
      expect(fairPlayCalls).toBe(1);

      // Re-calling within 5 min (e.g. +2 min) must hit negative cache and make 0 HTTP calls
      vi.advanceTimersByTime(2 * 60 * 1000);
      await ensureCollectionPrices([10, 11]);
      await ensureFairPlayPrices([10, 11]);
      expect(collectionCalls).toBe(1);
      expect(fairPlayCalls).toBe(1);

      // After > 5 min (total +6 min), both endpoints are queried again
      vi.advanceTimersByTime(4 * 60 * 1000 + 1000);
      await ensureCollectionPrices([10, 11]);
      expect(collectionCalls).toBe(2);
      expect(fairPlayCalls).toBe(2);

      // Concurrency bound test: 1000 IDs => 5 chunks of 200; max in-flight per endpoint must be <= 3
      const manyIds = Array.from({ length: 1000 }, (_, i) => 1000 + i);
      let inFlightCol = 0;
      let maxInFlightCol = 0;
      let inFlightFp = 0;
      let maxInFlightFp = 0;

      mocks.api.mockImplementation(async (path: string) => {
        if (path.startsWith('/me/collection/prices')) {
          inFlightCol += 1;
          maxInFlightCol = Math.max(maxInFlightCol, inFlightCol);
          await new Promise((r) => setTimeout(r, 20));
          inFlightCol -= 1;
          return { prices: {} };
        }
        if (path.startsWith('/fair-play/prices')) {
          inFlightFp += 1;
          maxInFlightFp = Math.max(maxInFlightFp, inFlightFp);
          await new Promise((r) => setTimeout(r, 20));
          inFlightFp -= 1;
          return { prices: {} };
        }
        return null;
      });

      const hydrationPromise = ensureCollectionPrices(manyIds);
      await vi.advanceTimersByTimeAsync(200);
      await hydrationPromise;

      expect(maxInFlightCol).toBe(3);
      expect(maxInFlightFp).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
