import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';
import { computeRenaissanceSummary } from '../src/lib/analytics/renaissance';
import { computeRecyclableCopies, computeSpareCopies } from '../src/lib/analytics/fees';
import { state } from '../src/content/state';
import { runtimeCache } from '../src/content/cache';
import { scanMarketDealsInternal, scanProfitableTrades } from '../src/content/scanner';
import { executeAutoBuy } from '../src/content/automation/auto-buy';
import { runMarketWatchTick } from '../src/content/automation/market-watcher';
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
});
