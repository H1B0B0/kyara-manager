import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { resolveSellProfile } from '../src/lib/analytics/sell-profile';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  journal: vi.fn(),
  metric: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/snapshot', () => ({
  refreshDashboardSnapshot: vi.fn(),
  extractActiveListings: (market: any) => market.listings.filter((l: any) => l.status === 'active')
}));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal, recordCumulativeMetric: mocks.metric }));

const card = (id: number, over: any = {}) => ({
  characterId: id,
  name: `Card ${id}`,
  series: 'S',
  rarity: 'R',
  owned: 3,
  spare: 2,
  canAutoSell: true,
  referenceMedian: 22,
  sales7d: 20,
  recycleValue: 3,
  fees: { netProceeds: 20 },
  saleProb: { p12h: 60 },
  ...over
});

describe('market HTTP efficiency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChrome();
  });

  it('auto-sell makes 0 /market/ requests when slots === 0', async () => {
    mocks.api.mockResolvedValue({ items: [] });
    const { state } = await import('../src/content/state');
    state.currentSettings = { ...DEFAULT_SETTINGS, autoSellMaxListings: 2 };
    const { buildCardLedger } = await import('../src/content/safety');
    const { executeAutoSell } = await import('../src/content/automation/auto-sell');

    const recent = new Date(Date.now() - 2 * 60_000).toISOString();
    const activeListings = [
      { id: 'L1', status: 'active', characterId: 101, character: { id: 101, rarity: 'R' }, price: 20, createdAt: recent },
      { id: 'L2', status: 'active', characterId: 102, character: { id: 102, rarity: 'R' }, price: 20, createdAt: recent }
    ];
    const entries = [1, 2, 3, 4, 101, 102].map((id) => ({ characterId: id, qty: 3, locked: 0 }));
    const book = buildCardLedger(entries, activeListings, []);

    const res = await executeAutoSell(
      { duplicates: [card(1), card(2), card(3), card(4)] },
      book
    );

    expect(res.slotsAvailable).toBe(0);
    expect(res.listedCount).toBe(0);
    const marketCalls = mocks.api.mock.calls.filter(([path]) => String(path).startsWith('/market/'));
    expect(marketCalls).toHaveLength(0);
  });

  it('reprice makes 0 requests for recent (< 15 min) or pinned listings, and at most 1 GET (/market/listings) per eligible listing', async () => {
    mockChrome({ kmPinnedCards: [202] });
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (opts.method === 'POST' && path.endsWith('/cancel')) return {};
      if (path.startsWith('/market/listings?characterId=203')) {
        return { items: [{ price: 15, status: 'active' }] };
      }
      return { items: [] };
    });

    const { state } = await import('../src/content/state');
    state.currentSettings = { ...DEFAULT_SETTINGS, autoSellMode: 'fast', autoSellIncludeM: false };
    const { buildCardLedger } = await import('../src/content/safety');
    const { retireStaleListings, loadRepriceHints } = await import('../src/content/automation/reprice');

    const now = Date.now();
    const listings = [
      // Recent (< 15 min) -> must NOT trigger any HTTP call
      { id: 'L-recent', status: 'active', characterId: 201, character: { id: 201, rarity: 'R' }, price: 25, createdAt: new Date(now - 5 * 60_000).toISOString() },
      // Pinned (> 15 min) -> must NOT trigger any HTTP call
      { id: 'L-pinned', status: 'active', characterId: 202, character: { id: 202, rarity: 'R' }, price: 25, createdAt: new Date(now - 60 * 60_000).toISOString() },
      // Excluded rarity M (> 15 min) -> must NOT trigger any HTTP call
      { id: 'L-mythic', status: 'active', characterId: 204, character: { id: 204, rarity: 'M' }, price: 250, createdAt: new Date(now - 60 * 60_000).toISOString() },
      // Eligible (> 15 min, undercut at 15 vs 20) -> exactly 1 GET /market/listings?...
      { id: 'L-elig', status: 'active', characterId: 203, character: { id: 203, rarity: 'R' }, price: 20, createdAt: new Date(now - 16 * 60_000).toISOString() }
    ];
    const book = buildCardLedger(
      [201, 202, 203, 204].map((id) => ({ characterId: id, qty: 2, locked: 0 })),
      listings,
      [202]
    );
    const dup203 = card(203, {
      sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 20),
      prices: { minSafe: 10 }
    });

    const hints = new Map();
    const res = await retireStaleListings({
      book,
      duplicates: [dup203],
      hints,
      settings: state.currentSettings
    });

    expect(res.cancelled).toBe(1);
    const getCalls = mocks.api.mock.calls.filter(([, opts]) => !opts?.method || opts.method === 'GET');
    expect(getCalls).toHaveLength(1);
    expect(getCalls[0][0]).toBe('/market/listings?characterId=203&type=fixed&sort=price_asc&pageSize=20');
    // No /market/buy-orders or /market/prices calls
    expect(mocks.api.mock.calls.some(([p]) => String(p).includes('/market/buy-orders') || String(p).includes('/market/prices'))).toBe(false);
    // Undercut ceiling: min(nextRepriceCeiling(20, 8) = 18, liveLowest - 1 = 14) = 14
    expect((await loadRepriceHints()).get(203)?.ceiling).toBe(14);
  });

  it('batch-buy caps scan concurrency to 5 in RENAISSANCE mode', async () => {
    const { state } = await import('../src/content/state');
    state.currentSettings = { ...DEFAULT_SETTINGS, renaissanceTargetRarities: ['C', 'U', 'R', 'E'] };
    const { previewBatchMissingBuy } = await import('../src/content/automation/batch-buy');

    let inFlight = 0;
    let maxInFlight = 0;
    let marketGets = 0;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/collection?lean=1') return [];
      if (path.startsWith('/market/listings?')) {
        marketGets += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 4));
        inFlight -= 1;
        return { items: [] };
      }
      return {};
    });

    await previewBatchMissingBuy({ rarity: 'RENAISSANCE', maxUnitPrice: 20, qty: 10 });
    expect(marketGets).toBe(28); // 4 rarities * (5 price pages + 2 newest pages)
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it.each(['insufficient_chakra', 'http_429', 'http_401', 'http_403'])(
    'batch-buy breaks immediately on fatal buy error %s without spamming subsequent buys',
    async (errorCode) => {
      const { state } = await import('../src/content/state');
      state.currentSettings = { ...DEFAULT_SETTINGS, autoBuyMinChakraReserve: 0 };
      const { executeBatchMissingBuy } = await import('../src/content/automation/batch-buy');

      const buyCalls: string[] = [];
      mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
        if (path === '/me/bootstrap') return { me: { chakra: 1000 } };
        if (path === '/me/collection?lean=1') return [];
        if (path.startsWith('/market/listings?')) {
          return {
            items: [
              { id: 'l-1', status: 'active', price: 2, character: { id: 11, name: 'C11', rarity: 'C' } },
              { id: 'l-2', status: 'active', price: 2, character: { id: 12, name: 'C12', rarity: 'C' } },
              { id: 'l-3', status: 'active', price: 2, character: { id: 13, name: 'C13', rarity: 'C' } }
            ]
          };
        }
        if (path.startsWith('/me/collection/prices?ids=')) return [];
        if (/^\/market\/listings\/l-\d+$/.test(path)) {
          return { id: path.split('/').pop(), status: 'active', type: 'fixed', price: 2 };
        }
        if (opts.method === 'POST' && path.endsWith('/buy')) {
          buyCalls.push(path);
          throw Object.assign(new Error(`fatal:${errorCode}`), { code: errorCode });
        }
        return {};
      });

      const res = await executeBatchMissingBuy({ rarity: 'C', maxUnitPrice: 10, qty: 5 });
      expect(buyCalls).toEqual(['/market/listings/l-1/buy']);
      expect(res.boughtCount).toBe(0);
      expect(res.failedCount).toBe(1);
      expect(res.stoppedReason).toBe(`fatal:${errorCode}`);
    }
  );

  it('batch-buy hydrates from inline item.prices without calling /me/collection/prices, /fair-play/prices, or /market/prices/:id', async () => {
    const { previewBatchMissingBuy } = await import('../src/content/automation/batch-buy');
    const { runtimeCache } = await import('../src/content/cache');
    runtimeCache.collectionPrices.clear();

    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/collection?lean=1') return [];
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            {
              id: 'l-inline-m7',
              status: 'active',
              price: 4,
              prices: { median7d: 14, median30d: 12, lastPrice: 13, sales7d: 5 },
              character: { id: 301, name: 'Inline M7', rarity: 'R' }
            },
            {
              id: 'l-inline-m30',
              status: 'active',
              price: 5,
              prices: { median7d: null, median30d: 18, lastPrice: 15, sales7d: 0 },
              character: { id: 302, name: 'Inline M30', rarity: 'R' }
            },
            {
              id: 'l-inline-null',
              status: 'active',
              price: 6,
              prices: { median7d: null, median30d: null, sales7d: 0 },
              character: { id: 303, name: 'Inline Null', rarity: 'R' }
            },
            {
              id: 'l-no-prices',
              status: 'active',
              price: 7,
              character: { id: 304, name: 'No Inline', rarity: 'R' }
            }
          ]
        };
      }
      if (path === '/me/collection/prices?ids=304') {
        return [{ characterId: 304, median7d: 16, sales7d: 2 }];
      }
      return { items: [] };
    });

    const preview = await previewBatchMissingBuy({ rarity: 'R', maxUnitPrice: 10, qty: 10 });
    expect(preview.items.map((i) => i.characterId)).toEqual([301, 302, 303, 304]);
    expect(preview.items[0].median7d).toBe(14);
    expect(preview.items[1].median7d).toBeNull();
    expect(preview.items[3].median7d).toBe(16);

    const calledPaths = mocks.api.mock.calls.map(([p]) => String(p));
    expect(calledPaths.filter((p) => p.includes('/me/collection/prices'))).toEqual(['/me/collection/prices?ids=304']);
    expect(calledPaths.some((p) => p.includes('/fair-play/prices'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('/market/prices/'))).toBe(false);
    expect(runtimeCache.collectionPrices.get(302)).toMatchObject({
      median7d: null,
      median30d: 18,
      lastPrice: 15,
      source: 'listing'
    });
    expect(runtimeCache.collectionPrices.get(303)).toMatchObject({
      median7d: null,
      median30d: null,
      source: 'listing'
    });
  });
});
