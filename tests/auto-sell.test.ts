import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
const mocks = vi.hoisted(() => ({ api: vi.fn(), available: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/safety', () => ({ getCardAvailability: mocks.available }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: vi.fn() }));
vi.mock('../src/content/journal', () => ({ appendJournal: vi.fn(), recordCumulativeMetric: vi.fn() }));

describe('auto-sell revalidation', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockChrome(); });
  const dashboard = (rarity = 'L') => ({ activeListings: [], duplicates: [{ characterId: 1, name: 'A', rarity, owned: 3, spare: 2, canAutoSell: true, referenceMedian: 100, sales7d: 30, recycleValue: 10 }] });
  it('uses the fresh collection quantity rather than a nonexistent dashboard qty field', async () => {
    mocks.available.mockResolvedValue({ entry: { characterId: 1, qty: 3 }, spare: 2, listed: 0, pinned: new Set() });
    mocks.api.mockImplementation(async (path, options) => {
      if (path === '/market/listings' && options?.method === 'POST') return { id: 'new' };
      if (path.startsWith('/market/prices')) return { median7d: 100, median30d: 100, sales7d: 30 };
      if (path.startsWith('/market/listings?')) return { items: [] };
      return [];
    });
    const { executeAutoSell } = await import('../src/content/automation/auto-sell');
    expect((await executeAutoSell(dashboard())).listedCount).toBe(1);
    expect(mocks.api).toHaveBeenCalledWith('/market/listings', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ characterId: 1 }) }));
  });
  it('never recycles via turbo liquidity during simulation', async () => {
    const { state } = await import('../src/content/state'); state.currentSettings.dryRun = true;
    mocks.available.mockResolvedValue({ entry: { qty: 3 }, spare: 2, listed: 0, pinned: new Set() });
    mocks.api.mockImplementation(async (path) => path.startsWith('/market/prices') ? { median7d: 3, sales7d: 1 } : { items: [] });
    const { executeAutoSell } = await import('../src/content/automation/auto-sell');
    await executeAutoSell(dashboard('C'));
    expect(mocks.api.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('does not use a stale sell recommendation after a card is protected', async () => {
    mocks.available.mockResolvedValue({ spare: 0 });
    const { executeAutoSell } = await import('../src/content/automation/auto-sell');
    expect((await executeAutoSell(dashboard())).listedCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
