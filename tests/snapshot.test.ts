import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
const mocks = vi.hoisted(() => ({ api: vi.fn(), sale: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/hud', () => ({ updateFloatingHud: vi.fn() }));
vi.mock('../src/content/scanner', () => ({ scanMarketDealsInternal: vi.fn(async () => []), scanProfitableTrades: vi.fn(async () => []) }));
vi.mock('../src/content/journal', () => ({ recordConfirmedSale: mocks.sale }));
vi.mock('../src/content/cache', () => ({
  ensureCatalog: async () => new Map(), ensurePackPools: async () => ({}), ensureCollectionPrices: async () => new Map(),
  runtimeCache: { collectionPrices: new Map(), rarityAvgPrices: {} }
}));
vi.mock('../src/content/utils', () => ({ notifyDesktop: vi.fn() }));

describe('snapshot integrity', () => {
  let market: any;
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    market = { listings: [] };
    mocks.api.mockImplementation(async (path) => {
      if (path === '/me/bootstrap') return { me: { id: 1, chakra: 100 } };
      if (path === '/me/market') return market;
      if (path === '/config') return {};
      return [];
    });
  });
  it('coalesces simultaneous refreshes instead of racing snapshots', async () => {
    mockChrome();
    const { refreshDashboardSnapshot } = await import('../src/content/snapshot');
    const first = refreshDashboardSnapshot(); const second = refreshDashboardSnapshot();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(mocks.api.mock.calls.filter(([path]) => path === '/me/bootstrap')).toHaveLength(1);
  });
  it.each(['/me/collection?lean=1', '/me/market'])('does not replace missing %s data with an empty collection', async (failedPath) => {
    const { data } = mockChrome({ kmDashboard: { marker: 'last-good-snapshot' } });
    const implementation = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path) => {
      if (path === failedPath) throw new Error('network failure');
      return implementation(path);
    });
    const { refreshDashboardSnapshot } = await import('../src/content/snapshot');
    await expect(refreshDashboardSnapshot()).rejects.toThrow('network failure');
    expect(data.kmDashboard).toEqual({ marker: 'last-good-snapshot' });
    expect(mocks.sale).not.toHaveBeenCalled();
  });
  it('only records a disappeared listing when the server confirms sold', async () => {
    mockChrome();
    market = { listings: [{ id: 'a', characterId: 1, status: 'active', price: 100, endsAt: new Date(Date.now() + 3600000).toISOString() }] };
    const { refreshDashboardSnapshot } = await import('../src/content/snapshot');
    await refreshDashboardSnapshot();
    market = { listings: [] };
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (path) => path === '/market/listings/a' ? { status: 'cancelled' } : original(path));
    await refreshDashboardSnapshot();
    expect(mocks.sale).not.toHaveBeenCalled();
    market = { listings: [{ id: 'b', characterId: 1, status: 'active', price: 100 }] };
    await refreshDashboardSnapshot();
    market = { listings: [] };
    mocks.api.mockImplementation(async (path) => path === '/market/listings/b' ? { status: 'sold' } : original(path));
    await refreshDashboardSnapshot();
    expect(mocks.sale).toHaveBeenCalledWith('b', expect.objectContaining({ price: 100 }));
  });
});
