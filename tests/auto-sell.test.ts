import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import { resolveSellProfile } from '../src/lib/analytics/sell-profile';

const mocks = vi.hoisted(() => ({ api: vi.fn(), journal: vi.fn(), metric: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/snapshot', () => ({
  refreshDashboardSnapshot: vi.fn(),
  extractActiveListings: (market: any) => market.listings.filter((l: any) => l.status === 'active')
}));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal, recordCumulativeMetric: mocks.metric }));

const card = (id: number, over: any = {}) => ({
  characterId: id, name: `Card ${id}`, series: 'S', rarity: 'R', owned: 3, spare: 2, canAutoSell: true,
  referenceMedian: 22, sales7d: 20, recycleValue: 3, fees: { netProceeds: 20 }, saleProb: { p12h: 60 }, ...over
});
const entries = (...ids: number[]) => ids.map((id) => ({ characterId: id, qty: 3, locked: 0 }));
const posts = (path?: string) => mocks.api.mock.calls.filter(([p, o]) => o?.method === 'POST' && (!path || p === path));

function marketApi(lowest = 25, extra: Record<string, any> = {}) {
  let inFlight = 0;
  const stats = { maxInFlight: 0 };
  mocks.api.mockImplementation(async (path: string, options: any = {}) => {
    inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 3));
    inFlight -= 1;
    if (extra[path] !== undefined) return extra[path];
    if (options.method === 'POST' && path === '/market/listings') return { id: `new-${Math.random()}` };
    if (options.method === 'POST') return { gained: 3 };
    if (path.startsWith('/market/prices')) return { median7d: 22, median30d: 22, sales7d: 20 };
    if (path.startsWith('/market/listings?')) return { items: [{ price: lowest }, { price: lowest + 2 }] };
    return [];
  });
  return stats;
}

describe('auto-sell', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockChrome(); });

  async function setup(settings: any = {}) {
    const { state } = await import('../src/content/state');
    state.currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    const { buildCardLedger } = await import('../src/content/safety');
    const { executeAutoSell } = await import('../src/content/automation/auto-sell');
    return { state, buildCardLedger, executeAutoSell };
  }

  it('lists from the fresh ledger with a high-priority write and the profile duration', async () => {
    marketApi();
    const { buildCardLedger, executeAutoSell } = await setup();
    const res = await executeAutoSell({ duplicates: [card(1)] }, buildCardLedger(entries(1), [], []));
    expect(res.listedCount).toBe(1);
    expect(mocks.api).toHaveBeenCalledWith('/market/listings', expect.objectContaining({
      method: 'POST', priority: 'high', body: expect.objectContaining({ characterId: 1, durationHours: 12 })
    }));
  });

  it('never writes in simulation, including turbo recycling', async () => {
    marketApi(3, { '/market/prices/1': { median7d: 3, sales7d: 1 } });
    const { buildCardLedger, executeAutoSell } = await setup({ dryRun: true });
    await executeAutoSell({ duplicates: [card(1, { rarity: 'C', referenceMedian: 3 })] }, buildCardLedger(entries(1), [], []));
    expect(posts()).toHaveLength(0);
  });

  it('skips a card that became protected or has no spare copy', async () => {
    marketApi();
    const { buildCardLedger, executeAutoSell } = await setup();
    const res = await executeAutoSell({ duplicates: [card(1)] }, buildCardLedger(entries(1), [], [1]));
    expect(res.listedCount).toBe(0);
    expect(posts()).toHaveLength(0);
  });

  it('reads the market for several cards at once and fills every free slot', async () => {
    const stats = marketApi();
    const { buildCardLedger, executeAutoSell } = await setup({ autoSellMaxListings: 4 });
    const ids = [1, 2, 3, 4, 5, 6];
    const res = await executeAutoSell({ duplicates: ids.map((id) => card(id)) }, buildCardLedger(entries(...ids), [], []));
    expect(res.listedCount).toBe(4);
    expect(posts('/market/listings')).toHaveLength(4);
    expect(stats.maxInFlight).toBeGreaterThan(2);
  });

  it('never lists two copies of one card nor exceeds the slot cap', async () => {
    marketApi();
    const { buildCardLedger, executeAutoSell } = await setup({ autoSellMaxListings: 2 });
    const live = [{ id: 'a', status: 'active', characterId: 9, price: 5, createdAt: new Date().toISOString() }];
    const res = await executeAutoSell({ duplicates: [card(1), card(9)] }, buildCardLedger([...entries(1), { characterId: 9, qty: 3 }], live, []));
    expect(res.listedCount).toBe(1);
  });

  it('retires a stalled fast listing and relists it below its previous price', async () => {
    marketApi(25, { '/market/listings/L1/cancel': {} });
    const { buildCardLedger, executeAutoSell } = await setup({ autoSellMode: 'fast' });
    const stalled = { id: 'L1', status: 'active', characterId: 1, character: { id: 1, rarity: 'R' }, price: 20, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() };
    const dup = card(1, { spare: 0, canAutoSell: false, sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 22), prices: { minSafe: 13 } });
    const res = await executeAutoSell({ duplicates: [dup] }, buildCardLedger([{ characterId: 1, qty: 3 }], [stalled], []));
    expect(res.repriced).toBe(1);
    expect(posts('/market/listings/L1/cancel')[0][1]).toMatchObject({ priority: 'high' });
    expect(posts('/market/listings')[0][1].body.price).toBe(18);
    const { loadRepriceHints } = await import('../src/content/automation/reprice');
    expect((await loadRepriceHints()).get(1)?.steps).toBe(1);
  });

  it('keeps a stalled listing that already sits at the safety floor', async () => {
    marketApi();
    const { buildCardLedger, executeAutoSell } = await setup({ autoSellMode: 'fast', autoRecycleEnabled: false });
    const stalled = { id: 'L1', status: 'active', characterId: 1, character: { id: 1, rarity: 'R' }, price: 13, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() };
    const dup = card(1, { spare: 0, canAutoSell: false, sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 22), prices: { minSafe: 13 } });
    const res = await executeAutoSell({ duplicates: [dup] }, buildCardLedger([{ characterId: 1, qty: 3 }], [stalled], []));
    expect(res.repriced).toBe(0);
    expect(posts()).toHaveLength(0);
  });

  it('releases the reservation and stops when the market refuses a listing', async () => {
    marketApi();
    mocks.api.mockImplementationOnce(async () => null).mockImplementation(async (path: string, options: any = {}) => {
      if (options.method === 'POST') throw Object.assign(new Error('full'), { code: 'too_many_listings' });
      return path.startsWith('/market/listings?') ? { items: [] } : [];
    });
    const { buildCardLedger, executeAutoSell } = await setup();
    const book = buildCardLedger(entries(1, 2), [], []);
    const res = await executeAutoSell({ duplicates: [card(1), card(2)] }, book);
    expect(res.listedCount).toBe(0);
    expect(posts('/market/listings')).toHaveLength(1);
    expect(book.get(1).listed).toBe(0);
  });

  it('does not re-list an evicted floor-locked card during its 2h cooldown even when slots remain free', async () => {
    marketApi(13, { '/market/listings/L-evict/cancel': {} });
    const { buildCardLedger, executeAutoSell } = await setup({
      autoSellMode: 'fast',
      autoRecycleEnabled: false,
      autoSellMaxListings: 5
    });
    const stalledFloor = {
      id: 'L-evict',
      status: 'active',
      characterId: 1,
      character: { id: 1, rarity: 'R' },
      price: 13,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    };
    const dupEvicted = card(1, {
      spare: 0,
      canAutoSell: false,
      sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'fast' }, 13),
      prices: { minSafe: 13 }
    });
    const dupWaiting = card(2, { spare: 2, canAutoSell: true });

    const book = buildCardLedger(
      [
        { characterId: 1, qty: 2, locked: 0 },
        { characterId: 2, qty: 3, locked: 0 }
      ],
      [stalledFloor],
      []
    );

    const res = await executeAutoSell({ duplicates: [dupEvicted, dupWaiting] }, book);
    expect(res.repriced).toBe(1);
    expect(res.listedCount).toBe(1);
    const listedIds = posts('/market/listings').map(([, o]) => o.body.characterId);
    expect(listedIds).toEqual([2]);

    // Second pass with free slots and card 1 now having spare > 0 & canAutoSell: still blocked by evictedUntil cooldown
    const res2 = await executeAutoSell(
      { duplicates: [card(1, { spare: 1, canAutoSell: true })] },
      buildCardLedger([{ characterId: 1, qty: 2, locked: 0 }], [], [])
    );
    expect(res2.listedCount).toBe(0);
    expect(posts('/market/listings')).toHaveLength(1);
  });

  it('Issue #3: never lists or reprices Legendary [L] or Mythic [M] duplicates unless explicitly opted in', async () => {
    marketApi(180);
    const { buildCardLedger, executeAutoSell } = await setup({ autoSellIncludeL: false, autoSellIncludeM: false });
    const leg = card(701, {
      name: 'Akame',
      rarity: 'L',
      verdict: 'VENDRE',
      canAutoSell: false,
      referenceMedian: 180,
      prices: { recommended: 179, minSafe: 126 }
    });
    const myth = card(702, {
      name: 'Mythic',
      rarity: 'M',
      verdict: 'VENDRE',
      canAutoSell: false,
      referenceMedian: 750,
      prices: { recommended: 749, minSafe: 525 }
    });
    const staleLeg = {
      id: 'L-manual-akame',
      status: 'active',
      characterId: 701,
      character: { id: 701, rarity: 'L' },
      price: 200,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    };
    const res = await executeAutoSell(
      { duplicates: [leg, myth] },
      buildCardLedger(entries(701, 702), [staleLeg], []),
      { mode: 'fast' }
    );
    expect(res.repriced).toBe(0);
    expect(res.listedCount).toBe(0);
    expect(posts()).toHaveLength(0);
  });

  it('triggers 0 fetchLiveStats GETs for non-sellable L, M, CONSERVER, and ineligible RECYCLER duplicates in fast mode', async () => {
    marketApi(30);
    const { buildCardLedger, executeAutoSell } = await setup({
      autoSellMode: 'adaptive',
      autoSellIncludeL: false,
      autoSellIncludeM: false,
      autoRecycleEnabled: false,
      speculateHoldSurging: true
    });
    const { runtimeCache } = await import('../src/content/cache');
    const now = Date.now();
    runtimeCache.collectionPrices.set(701, { median7d: 200, median30d: 200, sales7d: 10, sales30d: null, at: now });
    runtimeCache.collectionPrices.set(702, { median7d: 900, median30d: 900, sales7d: 10, sales30d: null, at: now });
    runtimeCache.collectionPrices.set(703, { median7d: null, median30d: null, sales7d: 0, sales30d: null, at: now });
    runtimeCache.collectionPrices.set(704, { median7d: 100, median30d: 70, sales7d: 5, sales30d: null, at: now });
    runtimeCache.collectionPrices.set(705, { median7d: null, median30d: null, sales7d: 0, sales30d: null, at: now });
    runtimeCache.collectionPrices.set(706, { median7d: 30, median30d: 30, sales7d: 1, sales30d: null, at: now });

    // Only 701..705 (all non-sellable under fast mode): 0 HTTP requests at all
    const nonSellables = [
      card(701, { rarity: 'L', verdict: 'VENDRE', canAutoSell: false, referenceMedian: 200 }),
      card(702, { rarity: 'M', verdict: 'VENDRE', canAutoSell: false, referenceMedian: 900 }),
      card(703, { rarity: 'E', verdict: 'CONSERVER', canAutoSell: false, referenceMedian: null, sales7d: 0 }),
      card(704, { rarity: 'E', verdict: 'CONSERVER', canAutoSell: false, referenceMedian: 100, isSurging: true }),
      card(705, { rarity: 'R', verdict: 'RECYCLER', canAutoSell: false, canAutoRecycle: true, referenceMedian: null, sales7d: 0 })
    ];
    const emptyRes = await executeAutoSell(
      { duplicates: nonSellables },
      buildCardLedger(entries(701, 702, 703, 704, 705), [], []),
      { mode: 'fast' }
    );
    expect(emptyRes.listedCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();

    // Adding card 706 (slow mover E at 30 ◆: CONSERVER in normal/adaptive, VENDRE in fast) fetches only 706
    const slowEpic = card(706, {
      rarity: 'E',
      verdict: 'CONSERVER',
      canAutoSell: false,
      referenceMedian: 30,
      sales7d: 1
    });
    const resWithSlow = await executeAutoSell(
      { duplicates: [...nonSellables, slowEpic] },
      buildCardLedger(entries(701, 702, 703, 704, 705, 706), [], []),
      { mode: 'fast' }
    );
    expect(resWithSlow.listedCount).toBe(1);
    const marketGetPaths = mocks.api.mock.calls
      .filter(([, opts]) => !opts?.method || opts.method === 'GET')
      .map(([path]) => String(path));
    expect(marketGetPaths).toHaveLength(3);
    expect(marketGetPaths.every((p) => p.includes('706'))).toBe(true);
    for (const skippedId of [701, 702, 703, 704, 705]) {
      expect(marketGetPaths.some((p) => p.includes(String(skippedId)))).toBe(false);
    }
  });

  it('retireStaleListings applies fast profile (staleMinutes: 20 and fast floor/discount) when dup was precomputed as patient', async () => {
    marketApi(90, { '/market/listings/L-patient-fast/cancel': {} });
    await setup({ autoSellMode: 'fast', autoRecycleEnabled: false });
    const { buildCardLedger } = await import('../src/content/safety');
    const { retireStaleListings, loadRepriceHints } = await import('../src/content/automation/reprice');
    const { nextRepriceCeiling } = await import('../src/lib/analytics/sell-profile');

    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const listing = {
      id: 'L-patient-fast',
      status: 'active',
      characterId: 801,
      character: { id: 801, rarity: 'E' },
      price: 65,
      createdAt: twentyFiveMinAgo
    };
    // Precomputed in patient mode: staleMinutes=90, minSafe=68 (would block cancellation at 25m and price 65)
    const dup = card(801, {
      rarity: 'E',
      spare: 0,
      canAutoSell: false,
      referenceMedian: 80,
      recycleValue: 10,
      sellProfile: resolveSellProfile({ ...DEFAULT_SETTINGS, autoSellMode: 'patient' }, 80),
      prices: { minSafe: 68 }
    });

    const book = buildCardLedger([{ characterId: 801, qty: 2 }], [listing], []);
    const res = await retireStaleListings({
      book,
      duplicates: [dup],
      hints: new Map(),
      settings: { ...DEFAULT_SETTINGS, autoSellMode: 'fast', autoRecycleEnabled: false }
    });

    expect(res.cancelled).toBe(1);
    expect(res.chars.has(801)).toBe(true);
    expect(posts('/market/listings/L-patient-fast/cancel')).toHaveLength(1);
    const savedHint = (await loadRepriceHints()).get(801);
    expect(savedHint?.ceiling).toBe(nextRepriceCeiling(65, 8));
  });
});
