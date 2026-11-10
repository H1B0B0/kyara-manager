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
});
