import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';
import { computeRenaissanceSummary } from '../src/lib/analytics/renaissance';
import { state } from '../src/content/state';
import { runtimeCache } from '../src/content/cache';
import { scanMarketDealsInternal } from '../src/content/scanner';
import { executeAutoBuy } from '../src/content/automation/auto-buy';
import { runMarketWatchTick } from '../src/content/automation/market-watcher';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  journal: vi.fn(),
  notify: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal }));
vi.mock('../src/content/utils', () => ({ notifyDesktop: mocks.notify }));

describe('v2.3.1 Renaissance Rebirth 1 targets & active market watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome();
    mockLocks();
    state.currentSettings = { ...DEFAULT_SETTINGS };
    state.isCycleRunning = false;
    state.isOperationRunning = false;
    state.updatePending = false;
    state.disposed = false;
    runtimeCache.collectionPrices.clear();
  });

  it('Test 1: computeRenaissanceSummary caps Rebirth 1 targets (E=505, M=10) on large catalog and normalizeSettings cleans legacy overrides', () => {
    const catalog = new Map<number, any>();
    let id = 1;
    for (let i = 0; i < 1010; i++) catalog.set(id, { id: id++, rarity: 'E' });
    for (let i = 0; i < 203; i++) catalog.set(id, { id: id++, rarity: 'M' });
    for (let i = 0; i < 1500; i++) catalog.set(id, { id: id++, rarity: 'C' });

    const cleaned = normalizeSettings({ renaissanceTargets: { E: 1010, L: 250, M: 203, C: 1400 } });
    expect(cleaned.renaissanceTargets).toEqual({ C: 1400 });

    const summary = computeRenaissanceSummary(
      catalog,
      new Set<number>(),
      cleaned,
      {},
      { requirements: { E: 1010, M: 203 } }
    );
    expect(summary.byRarity.E.target).toBe(505);
    expect(summary.byRarity.M.target).toBe(10);
    expect(summary.byRarity.C.target).toBe(1400);
  });

  it('Test 2: scanMarketDealsInternal hydrates unowned card prices via /market/prices/:id when /me/collection/prices is empty', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-7001', status: 'active', type: 'fixed', price: 30, character: { id: 7001, name: 'Unowned Flip', rarity: 'E' } }
          ]
        };
      }
      if (path.startsWith('/me/collection/prices')) return [];
      if (path === '/market/prices/7001') return { median7d: 60, sales7d: 12 };
      return {};
    });

    const deals = await scanMarketDealsInternal(new Set([1, 2]), new Map(), 1000);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      listingId: 'l-7001',
      isMissing: true,
      refMedian: 60,
      discountPct: 50,
      isGoodFlip: true
    });
  });

  it('Test 3: executeAutoBuy snipes cheap missing Renaissance card, respects chakra reserve, and persists marketWatch', async () => {
    const { data } = mockChrome({ kmDashboard: { authenticated: true, me: { chakra: 205 } } });
    state.currentSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C', 'R'],
      autoBuyMissingEnabled: true,
      autoBuyMinChakraReserve: 200
    });

    const bought: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [{ characterId: 1, qty: 1 }];
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-cheap', status: 'active', type: 'fixed', price: 3, character: { id: 8001, name: 'Ren C', rarity: 'C' } },
            { id: 'l-over', status: 'active', type: 'fixed', price: 10, character: { id: 8002, name: 'Over Reserve', rarity: 'R' } }
          ]
        };
      }
      if (path === '/market/listings/l-cheap') return { id: 'l-cheap', status: 'active', type: 'fixed', price: 3 };
      if (path === '/me/bootstrap') return { me: { chakra: 205 } };
      if (path === '/market/listings/l-cheap/buy' && opts.method === 'POST') {
        bought.push('l-cheap');
        return { user: { chakra: 202 } };
      }
      return {};
    });

    const res = await executeAutoBuy({ me: { chakra: 205 } });
    expect(res.boughtCount).toBe(1);
    expect(res.dealsFound).toBe(2);
    expect(bought).toEqual(['l-cheap']);
    expect(data.kmDashboard.marketWatch).toMatchObject({
      active: true,
      dealsFound: 2,
      boughtLastTick: 1
    });
    expect(data.kmDashboard.me.chakra).toBe(202);
  });

  it('Test 4: runMarketWatchTick executes active market observation and returns { ok: true, boughtCount, dealsFound }', async () => {
    const activeSettings = normalizeSettings({
      masterEnabled: true,
      autoMarketEnabled: true,
      autoBuyMissingEnabled: true,
      renaissanceFocusEnabled: true,
      autoBuyMinChakraReserve: 100
    });
    mockChrome({
      settings: activeSettings,
      kmDashboard: { authenticated: true, me: { chakra: 500 } }
    });
    state.currentSettings = activeSettings;

    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-tick', status: 'active', type: 'fixed', price: 2, character: { id: 9001, name: 'Tick Card', rarity: 'C' } }
          ]
        };
      }
      if (path === '/market/listings/l-tick') return { id: 'l-tick', status: 'active', type: 'fixed', price: 2 };
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path === '/market/listings/l-tick/buy' && opts.method === 'POST') return { user: { chakra: 498 } };
      return {};
    });

    const res = await runMarketWatchTick({ manual: false });
    expect(res).toEqual({ ok: true, boughtCount: 1, dealsFound: 1 });
  });
});
