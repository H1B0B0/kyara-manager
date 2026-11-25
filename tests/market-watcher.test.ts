import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';
import { computeRenaissanceSummary } from '../src/lib/analytics/renaissance';
import { computeRecyclableCopies, computeSpareCopies } from '../src/lib/analytics/fees';
import { state } from '../src/content/state';
import { PRICES_TTL_MS, runtimeCache } from '../src/content/cache';
import { scanMarketDealsInternal, scanProfitableTrades } from '../src/content/scanner';
import { executeAutoBuy } from '../src/content/automation/auto-buy';
import { MARKET_WATCH_INTERVAL_MS, runMarketWatchTick, startMarketWatcher } from '../src/content/automation/market-watcher';
import { PLAYSTYLE_PRESETS } from '../src/lib/presets';
import { computeLiveMarketDepth } from '../src/lib/analytics/market-depth';

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
    state.isMarketWatchRunning = false;
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

  it('Test 5: runMarketWatchTick runs with only renaissanceFocusEnabled=true and skips rarities whose Rebirth target is already reached', async () => {
    const renOnlySettings = normalizeSettings({
      masterEnabled: true,
      autoMarketEnabled: false,
      autoBuyFlipEnabled: false,
      autoBuyMissingEnabled: false,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C', 'E', 'M'],
      autoBuyMinChakraReserve: 100
    });
    mockChrome({
      settings: renOnlySettings,
      kmDashboard: {
        authenticated: true,
        me: { chakra: 600 },
        renaissance: {
          byRarity: {
            C: { remainingForTarget: 5 },
            E: { remainingForTarget: 10 },
            M: { remainingForTarget: 0 }
          }
        }
      }
    });
    state.currentSettings = renOnlySettings;

    const bought: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-mythic-done', status: 'active', type: 'fixed', price: 100, character: { id: 9101, name: 'Done Mythic', rarity: 'M' } },
            { id: 'l-epic-needed', status: 'active', type: 'fixed', price: 12, character: { id: 9102, name: 'Needed Epic', rarity: 'E' } }
          ]
        };
      }
      if (path === '/market/listings/l-epic-needed') return { id: 'l-epic-needed', status: 'active', type: 'fixed', price: 12 };
      if (path === '/market/listings/l-mythic-done') return { id: 'l-mythic-done', status: 'active', type: 'fixed', price: 100 };
      if (path === '/me/bootstrap') return { me: { chakra: 600 } };
      if (path.endsWith('/buy') && opts.method === 'POST') {
        bought.push(path);
        return { user: { chakra: 588 } };
      }
      return {};
    });

    const res = await runMarketWatchTick({ manual: false });
    expect(res).toEqual({ ok: true, boughtCount: 1, dealsFound: 1 });
    expect(bought).toEqual(['/market/listings/l-epic-needed/buy']);
  });

  it('Test 6: computeLiveMarketDepth excludes own listings (isMine: true) to prevent self-undercutting', () => {
    const depth = computeLiveMarketDepth(
      [
        { status: 'active', price: 10, isMine: true },
        { status: 'active', price: 15, isMine: false },
        { status: 'active', price: 18 }
      ],
      16
    );
    expect(depth.count).toBe(2);
    expect(depth.lowestFixed).toBe(15);
    expect(depth.highestFixed).toBe(18);
  });

  it('Test 7: computeSpareCopies does not double-subtract activeListedQty when server entry.listable already reflects listed copies', () => {
    // 4 owned total, 1 on sale on the market (listable=2 because 1 is in cooldown and 1 is listed), 1 to keep => 2 spare
    const entry4With1Listed = { characterId: 501, qty: 4, locked: 0, listable: 2, resaleLocked: 0 };
    expect(computeSpareCopies(entry4With1Listed, 1, 1)).toBe(2);
    expect(computeRecyclableCopies(entry4With1Listed, 1, 1)).toBe(2);

    // 2 owned total, 1 on sale on the market (listable=1), 1 to keep => 0 spare & 0 recyclable
    const entry2With1Listed = { characterId: 502, qty: 2, locked: 0, listable: 1, resaleLocked: 0 };
    expect(computeSpareCopies(entry2With1Listed, 1, 1)).toBe(0);
    expect(computeRecyclableCopies(entry2With1Listed, 1, 1)).toBe(0);
  });

  it('Test 8: computeRenaissanceSummary parses real GET /api/me/renaissance requirements array (legendaries, mythics, boosters) and scanProfitableTrades parses GET /api/trades/offers wantIds[]', async () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'Card C', rarity: 'C' }],
      [2, { id: 2, name: 'Card L', rarity: 'L' }],
      [3, { id: 3, name: 'Card M', rarity: 'M' }]
    ]);
    const realRenaissancePayload = {
      level: 1,
      next: 2,
      renown: 4250,
      eligible: false,
      requirements: [
        { key: 'C', have: 100, need: 1500, ok: false },
        { key: 'legendaries', have: 70, need: 80, ok: false },
        { key: 'mythics', have: 12, need: 12, ok: true },
        { key: 'boosters', have: 920, need: 1600, ok: false }
      ]
    };
    const summary = computeRenaissanceSummary(catalog, new Set([1, 2, 3]), DEFAULT_SETTINGS, {}, realRenaissancePayload, {
      boostersOpened: 5400
    });
    expect(summary.byRarity.L.target).toBe(1); // capped by catalog size (1) in this mini-catalog
    expect(summary.boostersOpened).toBe(920);
    expect(summary.boostersTarget).toBe(1600);
    expect(summary.estimatedRenown).toBe(4250);

    runtimeCache.catalogById = new Map<number, any>([
      [701, { id: 701, name: 'Offered Epic', rarity: 'E', series: 'S1' }],
      [702, { id: 702, name: 'My Spare Rare', rarity: 'R', series: 'S1' }]
    ]);
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/trades/offers') {
        return [
          {
            id: 'offer-1',
            user: { id: 'u-2', pseudo: 'TraderJoe' },
            characterId: 701,
            wantIds: [999, 702],
            status: 'active',
            createdAt: new Date().toISOString()
          }
        ];
      }
      if (path.startsWith('/fair-play/prices?ids=')) {
        return { '701': 25, '702': 8 };
      }
      return {};
    });

    const trades = await scanProfitableTrades(
      new Set([702]),
      [{ characterId: 702, name: 'My Spare Rare', rarity: 'R', spare: 2, pinned: false }],
      new Map()
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      listingId: 'offer-1',
      seller: 'TraderJoe',
      profit: 17,
      offered: { characterId: 701, name: 'Offered Epic', median7d: 25, isMissing: true },
      wanted: { characterId: 702, name: 'My Spare Rare', median7d: 8 }
    });
  });

  it('Test 9: executeAutoBuy auto-expands legacy C/U/R focus to E when E still needs cards (487/505) and deep-scans page 3 when pages 1-2 are already owned', async () => {
    const legacyCurSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C', 'U', 'R'],
      autoBuyMinChakraReserve: 100
    });
    mockChrome({
      settings: legacyCurSettings,
      kmDashboard: {
        authenticated: true,
        me: { chakra: 500 },
        renaissance: {
          byRarity: {
            C: { remainingForTarget: 0 },
            U: { remainingForTarget: 0 },
            R: { remainingForTarget: 0 },
            E: { remainingForTarget: 18 },
            L: { remainingForTarget: 0 },
            M: { remainingForTarget: 0 }
          }
        }
      }
    });
    state.currentSettings = legacyCurSettings;

    const bought: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') {
        return [{ characterId: 1001, qty: 1 }];
      }
      if (path.includes('rarity=E') && path.includes('page=3')) {
        return {
          items: [
            { id: 'l-deep-epic', status: 'active', type: 'fixed', price: 24, character: { id: 2002, name: 'Unowned Epic Page 3', rarity: 'E' } }
          ]
        };
      }
      if (path.startsWith('/market/listings?')) {
        // Pages 1 and 2 only contain already-owned card #1001
        return {
          items: [
            { id: 'l-owned-epic', status: 'active', type: 'fixed', price: 15, character: { id: 1001, name: 'Owned Epic', rarity: 'E' } }
          ]
        };
      }
      if (path === '/market/listings/l-deep-epic') {
        return { id: 'l-deep-epic', status: 'active', type: 'fixed', price: 24 };
      }
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path === '/market/listings/l-deep-epic/buy' && opts.method === 'POST') {
        bought.push(path);
        return { user: { chakra: 476 } };
      }
      return {};
    });

    const res = await runMarketWatchTick({ manual: false });
    expect(res.ok).toBe(true);
    expect(res.boughtCount).toBe(1);
    expect(bought).toEqual(['/market/listings/l-deep-epic/buy']);
  });

  it('Test 10: ensureFairPlayPrices sets sales7d >= 1 when /me/collection/prices returned sales7d: 0 for an unowned Mythic flip', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-mythic-flip', status: 'active', type: 'fixed', price: 250, character: { id: 9901, name: 'Cheap Mythic', rarity: 'M' } }
          ]
        };
      }
      if (path.startsWith('/me/collection/prices')) {
        return [{ characterId: 9901, median7d: null, sales7d: 0 }];
      }
      if (path.startsWith('/fair-play/prices')) {
        return { '9901': 900 };
      }
      return {};
    });

    const deals = await scanMarketDealsInternal(new Set(), new Map(), 2000);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      listingId: 'l-mythic-flip',
      rarity: 'M',
      refMedian: 900,
      isGoodFlip: true
    });
  });

  it('Test 11: scanMarketDealsInternal negative-caches /market/prices/:id for null/median30d-only cards and probes newly added cards', async () => {
    let scanPass = 1;
    const priceCalls: Record<number, number> = {};

    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/market/listings?')) {
        const items: any[] = [
          { id: 'l-illiquid', status: 'active', type: 'fixed', price: 10, character: { id: 7101, name: 'Illiquid Card', rarity: 'R' } },
          { id: 'l-m30-only', status: 'active', type: 'fixed', price: 10, character: { id: 7102, name: 'Median30d Card', rarity: 'R' } }
        ];
        if (scanPass >= 2) {
          items.push({ id: 'l-new-card', status: 'active', type: 'fixed', price: 12, character: { id: 7103, name: 'New Card', rarity: 'E' } });
        }
        return { items };
      }
      if (path.startsWith('/me/collection/prices')) return [];
      if (path.startsWith('/fair-play/prices')) return {};
      const m = path.match(/^\/market\/prices\/(\d+)$/);
      if (m) {
        const cid = Number(m[1]);
        priceCalls[cid] = (priceCalls[cid] || 0) + 1;
        if (cid === 7101) return { median7d: null, median30d: null, sales7d: 0, sales30d: 0 };
        if (cid === 7102) return { median7d: null, median30d: 18, sales7d: 0, sales30d: 3 };
        if (cid === 7103) return { median7d: 40, median30d: 38, sales7d: 5, sales30d: 12 };
      }
      return {};
    });

    await scanMarketDealsInternal(new Set(), new Map(), 1000);
    expect(priceCalls).toEqual({ 7101: 1, 7102: 1 });
    expect(runtimeCache.collectionPrices.get(7101)?._marketPriceAt).toBeTypeOf('number');
    expect(runtimeCache.collectionPrices.get(7102)?.median30d).toBe(18);

    scanPass = 2;
    const deals2 = await scanMarketDealsInternal(new Set(), new Map(), 1000);
    expect(priceCalls).toEqual({ 7101: 1, 7102: 1, 7103: 1 });
    expect(deals2.some((d) => d.listingId === 'l-new-card' && d.refMedian === 40)).toBe(true);
  });

  it('Test 12: executeAutoBuy refreshes stale dashboard chakra from /me/bootstrap so buys proceed when balance recovered above reserve', async () => {
    const { data } = mockChrome({ kmDashboard: { authenticated: true, me: { chakra: 190 } } });
    state.currentSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C'],
      autoBuyMissingEnabled: true,
      autoBuyMinChakraReserve: 200
    });

    const bought: string[] = [];
    const price = 4;
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-fresh-bal', status: 'active', type: 'fixed', price, character: { id: 8201, name: 'Fresh Balance Card', rarity: 'C' } }
          ]
        };
      }
      if (path === '/market/listings/l-fresh-bal') return { id: 'l-fresh-bal', status: 'active', type: 'fixed', price };
      if (path === '/market/listings/l-fresh-bal/buy' && opts.method === 'POST') {
        bought.push('l-fresh-bal');
        return {};
      }
      return {};
    });

    const res = await executeAutoBuy({ me: { chakra: 190 } });
    expect(res.boughtCount).toBe(1);
    expect(bought).toEqual(['l-fresh-bal']);
    expect(data.kmDashboard.me.chakra).toBe(500 - price);
  });

  it('Test 13: executeAutoBuy breaks immediately on fatal pass_required error without attempting remaining deals', async () => {
    mockChrome({ kmDashboard: { authenticated: true, me: { chakra: 1000 } } });
    state.currentSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C'],
      autoBuyMissingEnabled: true,
      autoBuyMinChakraReserve: 100
    });

    const buyCalls: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path === '/me/bootstrap') return { me: { chakra: 1000 } };
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-fatal-1', status: 'active', type: 'fixed', price: 2, character: { id: 8301, name: 'Fatal 1', rarity: 'C' } },
            { id: 'l-fatal-2', status: 'active', type: 'fixed', price: 3, character: { id: 8302, name: 'Fatal 2', rarity: 'C' } },
            { id: 'l-fatal-3', status: 'active', type: 'fixed', price: 4, character: { id: 8303, name: 'Fatal 3', rarity: 'C' } }
          ]
        };
      }
      if (path === '/market/listings/l-fatal-1') return { id: 'l-fatal-1', status: 'active', type: 'fixed', price: 2 };
      if (path === '/market/listings/l-fatal-2') return { id: 'l-fatal-2', status: 'active', type: 'fixed', price: 3 };
      if (path === '/market/listings/l-fatal-3') return { id: 'l-fatal-3', status: 'active', type: 'fixed', price: 4 };
      if (path.endsWith('/buy') && opts.method === 'POST') {
        buyCalls.push(path);
        const err: any = new Error('Pass requis');
        err.code = 'pass_required';
        err.status = 403;
        throw err;
      }
      return {};
    });

    const res = await executeAutoBuy({ me: { chakra: 1000 } });
    expect(res.dealsFound).toBe(3);
    expect(res.boughtCount).toBe(0);
    expect(buyCalls).toHaveLength(1);
    expect(buyCalls[0]).toBe('/market/listings/l-fatal-1/buy');
  });

  it('Test 14: executeAutoBuy stops immediately in its loop when isInterrupted() becomes true in auto mode', async () => {
    mockChrome({ kmDashboard: { authenticated: true, me: { chakra: 1000 } } });
    state.currentSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C'],
      autoBuyMissingEnabled: true,
      autoBuyMinChakraReserve: 100
    });
    state.abortWhenMasterOff = true;

    const buyCalls: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path === '/me/bootstrap') return { me: { chakra: 1000 } };
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-int-1', status: 'active', type: 'fixed', price: 2, character: { id: 8401, name: 'Int 1', rarity: 'C' } },
            { id: 'l-int-2', status: 'active', type: 'fixed', price: 3, character: { id: 8402, name: 'Int 2', rarity: 'C' } }
          ]
        };
      }
      if (path === '/market/listings/l-int-1') return { id: 'l-int-1', status: 'active', type: 'fixed', price: 2 };
      if (path === '/market/listings/l-int-2') return { id: 'l-int-2', status: 'active', type: 'fixed', price: 3 };
      if (path.endsWith('/buy') && opts.method === 'POST') {
        buyCalls.push(path);
        // Simulate autopilot turned off mid-loop
        state.currentSettings.masterEnabled = false;
        return { user: { chakra: 998 } };
      }
      return {};
    });

    try {
      const res = await executeAutoBuy({ me: { chakra: 1000 } }, { manual: false });
      expect(res.dealsFound).toBe(2);
      expect(res.boughtCount).toBe(1);
      expect(buyCalls).toEqual(['/market/listings/l-int-1/buy']);
    } finally {
      state.abortWhenMasterOff = false;
    }
  });

  it('Test 15: runMarketWatchTick acquires shared kyara-manager-domain-market-buy lock with { ifAvailable: true } and skips when busy', async () => {
    const activeSettings = normalizeSettings({
      masterEnabled: true,
      autoMarketEnabled: true,
      autoBuyMinChakraReserve: 100
    });
    mockChrome({
      settings: activeSettings,
      kmDashboard: { authenticated: true, me: { chakra: 500 } }
    });
    const locks = mockLocks();
    state.currentSettings = activeSettings;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/me/collection?lean=1') return [];
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path.startsWith('/market/listings?')) return { items: [] };
      return {};
    });

    const res = await runMarketWatchTick({ manual: false });
    expect(res).toEqual({ ok: true, boughtCount: 0, dealsFound: 0 });
    expect(locks.request).toHaveBeenCalledWith(
      'kyara-manager-domain-market-buy',
      { ifAvailable: true },
      expect.any(Function)
    );

    locks.held.add('kyara-manager-domain-market-buy');
    const skippedRes = await runMarketWatchTick({ manual: false });
    expect(skippedRes).toEqual({ ok: true, boughtCount: 0, dealsFound: 0, skipped: true });
    locks.held.delete('kyara-manager-domain-market-buy');
  });

  it('Test 16: executeAutoBuy blocks overpriced Renaissance E listings (35/30/16 ◆ when refMedian=12) while buying fair 12 ◆ and high-median 45 ◆ (refMedian=48)', async () => {
    mockChrome({ kmDashboard: { authenticated: true, me: { chakra: 1000 } } });
    state.currentSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['E'],
      autoBuyMissingEnabled: false,
      autoBuyMinChakraReserve: 100
    });

    const bought: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [];
      if (path === '/me/bootstrap') return { me: { chakra: 1000 } };
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-over-35', status: 'active', type: 'fixed', price: 35, character: { id: 8501, name: 'Overpriced 35', rarity: 'E' } },
            { id: 'l-over-30', status: 'active', type: 'fixed', price: 30, character: { id: 8502, name: 'Overpriced 30', rarity: 'E' } },
            { id: 'l-over-16', status: 'active', type: 'fixed', price: 16, character: { id: 8505, name: 'Overpriced 16', rarity: 'E' } },
            { id: 'l-fair-12', status: 'active', type: 'fixed', price: 12, character: { id: 8503, name: 'Fair 12', rarity: 'E' } },
            { id: 'l-high-45', status: 'active', type: 'fixed', price: 45, character: { id: 8504, name: 'High Median 45', rarity: 'E' } }
          ]
        };
      }
      if (path.startsWith('/me/collection/prices')) {
        return [
          { characterId: 8501, median7d: 12, sales7d: 5 },
          { characterId: 8502, median7d: 12, sales7d: 5 },
          { characterId: 8503, median7d: 12, sales7d: 5 },
          { characterId: 8504, median7d: 48, sales7d: 5 },
          { characterId: 8505, median7d: 12, sales7d: 5 }
        ];
      }
      if (path === '/market/listings/l-fair-12') return { id: 'l-fair-12', status: 'active', type: 'fixed', price: 12 };
      if (path === '/market/listings/l-high-45') return { id: 'l-high-45', status: 'active', type: 'fixed', price: 45 };
      if (path.endsWith('/buy') && opts.method === 'POST') {
        bought.push(path);
        return { user: { chakra: 950 } };
      }
      return {};
    });

    const res = await executeAutoBuy({ me: { chakra: 1000 } });
    expect(res.boughtCount).toBe(2);
    expect(bought).toEqual(['/market/listings/l-fair-12/buy', '/market/listings/l-high-45/buy']);
  });

  it('Test 17: scanMarketDealsInternal queries per-character wishlist listings (capped at 20 unowned), handles nullish API mocks, and surfaces cards outside global top-50', async () => {
    state.currentSettings = normalizeSettings({
      wishlistAutoBuyEnabled: true,
      autoBuyMinChakraReserve: 100
    });

    const globalItems = Array.from({ length: 50 }, (_, idx) => ({
      id: `g-${idx + 1}`,
      status: 'active',
      type: 'fixed',
      price: 20 + idx,
      character: { id: 2000 + idx, name: `Global ${idx + 1}`, rarity: 'E' }
    }));

    const wishlistMap = new Map<number, any>();
    // Already-owned card must be skipped from targeted wishlist queries
    wishlistMap.set(1, { characterId: 1, name: 'Owned Wish', rarity: 'E', budgetChakra: 50, autoBuy: true });
    wishlistMap.set(9501, { characterId: 9501, name: 'Off-Top50 Wish', rarity: 'E', budgetChakra: 45, autoBuy: true });
    for (let i = 0; i < 24; i += 1) {
      const cid = 9600 + i;
      wishlistMap.set(cid, { characterId: cid, name: `Extra Wish ${i}`, rarity: 'E', budgetChakra: 50 });
    }

    let wishInFlight = 0;
    let wishMaxInFlight = 0;
    mocks.api.mockImplementation((path: string) => {
      if (path === '/market/listings?characterId=9501&type=fixed&sort=price_asc&pageSize=3') {
        return (async () => {
          wishInFlight += 1;
          wishMaxInFlight = Math.max(wishMaxInFlight, wishInFlight);
          await new Promise((r) => setTimeout(r, 2));
          wishInFlight -= 1;
          return {
            items: [
              { id: 'w-9501', status: 'active', type: 'fixed', price: 40, character: { id: 9501, name: 'Off-Top50 Wish', rarity: 'E' } }
            ]
          };
        })();
      }
      if (path.startsWith('/market/listings?characterId=')) {
        if (path.includes('characterId=9600')) {
          return (async () => {
            wishInFlight += 1;
            wishMaxInFlight = Math.max(wishMaxInFlight, wishInFlight);
            await new Promise((r) => setTimeout(r, 2));
            wishInFlight -= 1;
            return null as any;
          })();
        }
        if (path.includes('characterId=9601') || path.includes('characterId=9602') || path.includes('characterId=9603') || path.includes('characterId=9604')) {
          return (async () => {
            wishInFlight += 1;
            wishMaxInFlight = Math.max(wishMaxInFlight, wishInFlight);
            await new Promise((r) => setTimeout(r, 2));
            wishInFlight -= 1;
            return { items: [] };
          })();
        }
        // Deliberately return raw undefined (non-Promise) to verify nullish mock resilience
        return undefined as any;
      }
      if (path.startsWith('/market/listings?')) {
        return Promise.resolve({ items: globalItems });
      }
      if (path.startsWith('/me/collection/prices')) return Promise.resolve([]);
      return Promise.resolve({});
    });

    const deals = await scanMarketDealsInternal(new Set([1]), wishlistMap, 1000);
    const wishQueries = mocks.api.mock.calls
      .map(([p]) => String(p))
      .filter((p) => p.includes('/market/listings?characterId='));

    expect(wishQueries).toHaveLength(20);
    expect(wishMaxInFlight).toBeLessThanOrEqual(4);
    expect(wishQueries).toContain('/market/listings?characterId=9501&type=fixed&sort=price_asc&pageSize=3');
    expect(wishQueries).not.toContain('/market/listings?characterId=1&type=fixed&sort=price_asc&pageSize=3');
    expect(deals[0]).toMatchObject({
      listingId: 'w-9501',
      characterId: 9501,
      buyPrice: 40,
      isWishlistMatch: true,
      autoBuyWish: true
    });
  });

  it('Test 18: scanMarketDealsInternal hydrates runtimeCache.collectionPrices from item.prices (including null median7d/median30d and median7d=0 mask) without calling price endpoints', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            {
              id: 'l-masked-zero',
              status: 'active',
              type: 'fixed',
              price: 20,
              median7d: 0,
              prices: { median7d: 50, median30d: 45, lastPrice: 48, sales7d: 4 },
              character: { id: 7201, name: 'Masked Zero', rarity: 'E' }
            },
            {
              id: 'l-m30-inline',
              status: 'active',
              type: 'fixed',
              price: 8,
              prices: { median7d: null, median30d: 18, lastPrice: 15, sales7d: 0 },
              character: { id: 7202, name: 'Inline M30', rarity: 'R' }
            },
            {
              id: 'l-null-inline',
              status: 'active',
              type: 'fixed',
              price: 10,
              prices: { median7d: null, median30d: null, sales7d: 0 },
              character: { id: 7203, name: 'Inline Null', rarity: 'R' }
            }
          ]
        };
      }
      throw new Error(`Unexpected API call: ${path}`);
    });

    const deals = await scanMarketDealsInternal(new Set(), new Map(), 1000);
    const calledPaths = mocks.api.mock.calls.map(([p]) => String(p));
    expect(calledPaths.some((p) => p.includes('/me/collection/prices'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('/fair-play/prices'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('/market/prices/'))).toBe(false);

    expect(runtimeCache.collectionPrices.get(7201)).toMatchObject({
      median7d: 50,
      median30d: 45,
      lastPrice: 48,
      sales7d: 4,
      source: 'listing'
    });
    expect(runtimeCache.collectionPrices.get(7202)).toMatchObject({
      median7d: null,
      median30d: 18,
      lastPrice: 15,
      sales7d: 0,
      source: 'listing'
    });
    expect(runtimeCache.collectionPrices.get(7203)).toMatchObject({
      median7d: null,
      median30d: null,
      source: 'listing'
    });
    expect(runtimeCache.collectionPrices.get(7203)?._marketPriceAt).toBeTypeOf('number');

    expect(deals.find((d) => d.characterId === 7201)).toMatchObject({ refMedian: 50, discountPct: 60 });
    expect(deals.find((d) => d.characterId === 7202)).toMatchObject({ refMedian: 18, discountPct: 56 });
  });

  it('Test 19: scanMarketDealsInternal refreshes expired (> PRICES_TTL_MS) cache from item.prices while preserving _fpAt and lowestFixed without calling /market/prices/:id', async () => {
    const expiredAt = Date.now() - PRICES_TTL_MS - 60_000;
    runtimeCache.collectionPrices.set(7301, {
      median7d: 30,
      median30d: 28,
      sales7d: 2,
      sales30d: 5,
      lowestFixed: 25,
      _fpAt: 123456,
      at: expiredAt
    });

    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            {
              id: 'l-refresh-7301',
              status: 'active',
              type: 'fixed',
              price: 20,
              prices: { median7d: 60, median30d: 55, lastPrice: 58, sales7d: 8, sales30d: 20 },
              character: { id: 7301, name: 'Refreshed Card', rarity: 'E' }
            }
          ]
        };
      }
      throw new Error(`Unexpected API call: ${path}`);
    });

    const deals = await scanMarketDealsInternal(new Set(), new Map(), 1000);
    const calledPaths = mocks.api.mock.calls.map(([p]) => String(p));
    expect(calledPaths.some((p) => p.includes('/me/collection/prices'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('/fair-play/prices'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('/market/prices/'))).toBe(false);

    const entry = runtimeCache.collectionPrices.get(7301);
    expect(entry).toMatchObject({
      median7d: 60,
      median30d: 55,
      lastPrice: 58,
      sales7d: 8,
      sales30d: 20,
      lowestFixed: 25,
      _fpAt: 123456,
      source: 'listing'
    });
    expect(Number(entry?.at)).toBeGreaterThan(expiredAt);
    expect(deals[0]).toMatchObject({ characterId: 7301, refMedian: 60, discountPct: 67 });
  });

  it('Test 20: rush_renaissance decrements kmDashboard.renaissance.byRarity[r].remainingForTarget and stops exactly at target across consecutive startMarketWatcher ticks without overshoot or isGoodMissingBuy bypass', async () => {
    vi.useFakeTimers();
    const prevCatalog = runtimeCache.catalogById;
    runtimeCache.catalogById = null;

    const rushPatch = PLAYSTYLE_PRESETS.find((p) => p.id === 'rush_renaissance')!.patch;
    const renSettings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...rushPatch,
      masterEnabled: true,
      renaissanceTargetRarities: ['C'],
      autoBuyMinChakraReserve: 100
    });
    expect(renSettings.autoBuyMissingEnabled).toBe(false);

    const { data } = mockChrome({
      settings: renSettings,
      kmDashboard: {
        authenticated: true,
        me: { chakra: 1000 },
        renaissance: {
          byRarity: {
            C: { owned: 1430, total: 1600, target: 1432, remainingForTarget: 2 },
            U: { owned: 1432, total: 1600, target: 1432, remainingForTarget: 0 },
            R: { owned: 1432, total: 1600, target: 1432, remainingForTarget: 0 },
            E: { owned: 505, total: 900, target: 505, remainingForTarget: 0 },
            L: { owned: 70, total: 200, target: 70, remainingForTarget: 0 },
            M: { owned: 10, total: 100, target: 10, remainingForTarget: 0 }
          }
        }
      }
    });
    state.currentSettings = renSettings;

    let tickPass = 1;
    let chakra = 1000;
    const owned: Array<{ characterId: number; qty: number }> = [];
    const bought: string[] = [];

    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      if (path === '/me/collection?lean=1') return [...owned];
      if (path === '/me/bootstrap') return { me: { chakra } };
      if (path.startsWith('/market/listings?')) {
        const items: any[] = [];
        if (tickPass === 1) {
          items.push({ id: 'l-c1', status: 'active', type: 'fixed', price: 3, character: { id: 9701, name: 'Ren C1', rarity: 'C' } });
        } else {
          items.push(
            { id: 'l-c2', status: 'active', type: 'fixed', price: 3, character: { id: 9702, name: 'Ren C2', rarity: 'C' } },
            { id: 'l-c3', status: 'active', type: 'fixed', price: 3, character: { id: 9703, name: 'Ren C3 Overshoot', rarity: 'C' } },
            { id: 'l-m1', status: 'active', type: 'fixed', price: 10, character: { id: 9704, name: 'Cheap Mythic Bypass', rarity: 'M' } }
          );
        }
        return { items };
      }
      if (path === '/market/listings/l-c1') return { id: 'l-c1', status: 'active', type: 'fixed', price: 3 };
      if (path === '/market/listings/l-c2') return { id: 'l-c2', status: 'active', type: 'fixed', price: 3 };
      if (path === '/market/listings/l-c3') return { id: 'l-c3', status: 'active', type: 'fixed', price: 3 };
      if (path === '/market/listings/l-m1') return { id: 'l-m1', status: 'active', type: 'fixed', price: 10 };
      if (path.endsWith('/buy') && opts.method === 'POST') {
        bought.push(path);
        const charMap: Record<string, { cid: number; price: number }> = {
          '/market/listings/l-c1/buy': { cid: 9701, price: 3 },
          '/market/listings/l-c2/buy': { cid: 9702, price: 3 },
          '/market/listings/l-c3/buy': { cid: 9703, price: 3 },
          '/market/listings/l-m1/buy': { cid: 9704, price: 10 }
        };
        const info = charMap[path];
        if (info) {
          owned.push({ characterId: info.cid, qty: 1 });
          chakra -= info.price;
        }
        return { user: { chakra } };
      }
      return {};
    });

    const flushMicrotasks = async () => {
      for (let i = 0; i < 30; i += 1) {
        await Promise.resolve();
      }
    };

    const stopWatcher = startMarketWatcher();
    try {
      await vi.advanceTimersByTimeAsync(MARKET_WATCH_INTERVAL_MS);
      await flushMicrotasks();
      expect(bought).toEqual(['/market/listings/l-c1/buy']);
      expect(data.kmDashboard.renaissance.byRarity.C).toMatchObject({ owned: 1431, remainingForTarget: 1 });
      expect(state.isMarketWatchRunning).toBe(false);

      tickPass = 2;
      await vi.advanceTimersByTimeAsync(MARKET_WATCH_INTERVAL_MS);
      await flushMicrotasks();
      expect(bought).toEqual(['/market/listings/l-c1/buy', '/market/listings/l-c2/buy']);
      expect(data.kmDashboard.renaissance.byRarity.C).toMatchObject({ owned: 1432, remainingForTarget: 0 });
      expect(state.isMarketWatchRunning).toBe(false);

      tickPass = 3;
      await vi.advanceTimersByTimeAsync(MARKET_WATCH_INTERVAL_MS);
      await flushMicrotasks();
      expect(bought).toEqual(['/market/listings/l-c1/buy', '/market/listings/l-c2/buy']);
      expect(data.kmDashboard.renaissance.byRarity.C).toMatchObject({ owned: 1432, remainingForTarget: 0 });
    } finally {
      stopWatcher();
      runtimeCache.catalogById = prevCatalog;
      vi.useRealTimers();
    }
  });

  it('Test 21: executeAutoBuy recomputes live remainingForTarget from runtimeCache.catalogById and ownedSet when kmDashboard.renaissance is stale', async () => {
    const prevCatalog = runtimeCache.catalogById;
    runtimeCache.catalogById = new Map<number, any>([
      [1, { id: 1, name: 'C1', rarity: 'C' }],
      [2, { id: 2, name: 'C2', rarity: 'C' }],
      [3, { id: 3, name: 'C3', rarity: 'C' }],
      [4, { id: 4, name: 'C4', rarity: 'C' }],
      [5, { id: 5, name: 'C5', rarity: 'C' }]
    ]);

    const renSettings = normalizeSettings({
      masterEnabled: true,
      renaissanceFocusEnabled: true,
      renaissanceTargetRarities: ['C'],
      renaissanceTargets: { C: 3 },
      autoBuyMissingEnabled: false,
      autoBuyMinChakraReserve: 100
    });
    const { data } = mockChrome({
      settings: renSettings,
      kmDashboard: {
        authenticated: true,
        me: { chakra: 800 },
        renaissance: {
          byRarity: {
            C: { owned: 1, total: 5, target: 3, remainingForTarget: 2 }
          }
        }
      }
    });
    state.currentSettings = renSettings;

    const bought: string[] = [];
    mocks.api.mockImplementation(async (path: string, opts: any = {}) => {
      // Player already owns 3/5 C cards (e.g. pulled from boosters since last snapshot)
      if (path === '/me/collection?lean=1') {
        return [
          { characterId: 1, qty: 1 },
          { characterId: 2, qty: 1 },
          { characterId: 3, qty: 1 }
        ];
      }
      if (path === '/me/bootstrap') return { me: { chakra: 800 } };
      if (path.startsWith('/market/listings?')) {
        return {
          items: [
            { id: 'l-stale-c4', status: 'active', type: 'fixed', price: 3, character: { id: 4, name: 'C4', rarity: 'C' } }
          ]
        };
      }
      if (path.endsWith('/buy') && opts.method === 'POST') {
        bought.push(path);
        return { user: { chakra: 797 } };
      }
      return {};
    });

    try {
      const res = await executeAutoBuy(data.kmDashboard);
      expect(res.boughtCount).toBe(0);
      expect(bought).toHaveLength(0);
      expect(data.kmDashboard.renaissance.byRarity.C).toMatchObject({ owned: 3, remainingForTarget: 0 });
    } finally {
      runtimeCache.catalogById = prevCatalog;
    }
  });
});
