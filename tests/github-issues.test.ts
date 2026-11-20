import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';
import { evaluateBoosterPack, rankBoostersForCollection } from '../src/lib/analytics/boosters';
import { computeLiveMarketDepth } from '../src/lib/analytics/market-depth';
import { evaluateDuplicate } from '../src/lib/analytics/duplicates';
import { DEFAULT_RECYCLE_VALUES } from '../src/lib/analytics/constants';

const mocks = vi.hoisted(() => ({ api: vi.fn(), metric: vi.fn(), pulls: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({ appendJournal: vi.fn(), recordCumulativeMetric: mocks.metric, recordBestPulls: mocks.pulls }));
vi.mock('../src/content/hud', () => ({ setHudStatusText: vi.fn() }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: vi.fn() }));
vi.mock('../src/content/utils', () => ({ sleep: vi.fn(), newRequestId: () => 'test', notifyDesktop: vi.fn() }));
vi.mock('../src/content/automation/spa-navigator', () => ({ navigateSpaTo: vi.fn().mockResolvedValue(true), waitForElement: vi.fn().mockResolvedValue(null) }));

describe('GitHub Issue #1 — protect bonus & ticket packs from auto-open by default', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChrome();
  });

  it('defaults autoOpenUseBonusPacks to false and normalizes properly', () => {
    expect(DEFAULT_SETTINGS.autoOpenUseBonusPacks).toBe(false);
    expect(normalizeSettings({}).autoOpenUseBonusPacks).toBe(false);
    expect(normalizeSettings({ autoOpenUseBonusPacks: true }).autoOpenUseBonusPacks).toBe(true);
  });

  it('evaluateBoosterPack separates autoOpenableFreeCount from bonus/grant packs unless enabled', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'C1', rarity: 'C' }],
      [2, { id: 2, name: 'C2', rarity: 'C' }]
    ]);
    const regularPack = { id: 'std', name: 'Standard', usesFreePacks: true, rates: { slots: [{ pct: { C: 100 } }] } };
    const ticketPack = { id: 'awakening', name: 'Éveil', grantOnly: true, usesFreePacks: false, rates: { slots: [{ pct: { C: 100 } }] } };
    const me = { freePacks: 2, bonusPacks: 5, grants: { awakening: 3 } };

    const stdDefault = evaluateBoosterPack(regularPack, [1, 2], catalog, new Set([1]), {}, {}, me, null, DEFAULT_SETTINGS);
    const tktDefault = evaluateBoosterPack(ticketPack, [1, 2], catalog, new Set(), {}, {}, me, null, DEFAULT_SETTINGS);
    expect(stdDefault.openableFreeCount).toBe(7);
    expect(stdDefault.autoOpenableFreeCount).toBe(2);
    expect(tktDefault.canOpenNow).toBe(true);
    expect(tktDefault.openableFreeCount).toBe(3);
    expect(tktDefault.autoOpenableFreeCount).toBe(0);
    expect(tktDefault.grantOnly).toBe(true);

    const recDefault = rankBoostersForCollection([ticketPack, regularPack], { std: [1, 2], awakening: [1, 2] }, catalog, new Set([1]), {}, {}, me, null, DEFAULT_SETTINGS);
    expect(recDefault.recommendedNew?.packId).toBe('std');

    const withBonus = { ...DEFAULT_SETTINGS, autoOpenUseBonusPacks: true };
    const stdEnabled = evaluateBoosterPack(regularPack, [1, 2], catalog, new Set([1]), {}, {}, me, null, withBonus);
    const tktEnabled = evaluateBoosterPack(ticketPack, [1, 2], catalog, new Set(), {}, {}, me, null, withBonus);
    expect(stdEnabled.autoOpenableFreeCount).toBe(7);
    expect(tktEnabled.autoOpenableFreeCount).toBe(3);
  });

  it('executeAutoOpenBoosters never opens bonusPacks or grants when autoOpenUseBonusPacks is false, and opens them when true', async () => {
    mocks.api.mockResolvedValue({ results: [{ cards: [{ id: 1, rarity: 'C', isNew: true }] }] });
    const { state } = await import('../src/content/state');
    const { executeAutoOpenBoosters } = await import('../src/content/automation/live-opening');

    state.currentSettings = { ...DEFAULT_SETTINGS, autoOpenUseBonusPacks: false, autoOpenDailyPack: false };
    const onlyBonus = await executeAutoOpenBoosters({
      me: { freePacks: 0, bonusPacks: 5, freePacksMax: 10 },
      boosters: { all: [], recommendedNew: { packId: 'std', name: 'Standard', canOpenNow: true, openableFreeCount: 5, autoOpenableFreeCount: 0, usesFreePacks: true } }
    });
    expect(onlyBonus.openedCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();

    const grantOnlyRes = await executeAutoOpenBoosters({
      me: { freePacks: 4, bonusPacks: 0, grants: { awakening: 2 }, freePacksMax: 10 },
      boosters: { all: [], recommendedNew: { packId: 'awakening', name: 'Éveil', canOpenNow: true, openableFreeCount: 2, autoOpenableFreeCount: 0, usesFreePacks: false, grantOnly: true } }
    });
    expect(grantOnlyRes.openedCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();

    vi.stubGlobal('KeyboardEvent', class {});
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('document', { querySelector: (sel: string) => (sel.includes('.summary') ? {} : null) });
    state.currentSettings = { ...DEFAULT_SETTINGS, autoOpenUseBonusPacks: true, autoOpenDailyPack: false };
    const bonusAllowed = await executeAutoOpenBoosters({
      me: { freePacks: 0, bonusPacks: 3, freePacksMax: 10 },
      boosters: { all: [], recommendedNew: { packId: 'std', name: 'Standard', canOpenNow: true, openableFreeCount: 3, autoOpenableFreeCount: 3, usesFreePacks: true } }
    });
    vi.unstubAllGlobals();
    expect(bonusAllowed.openedCount).toBe(1);
    expect(mocks.api).toHaveBeenCalledWith('/packs/std/open-many', expect.objectContaining({ body: { count: 3, maxChakra: 0 } }));
  });
});

describe('GitHub Issue #2 — Shizuku Hoshikawa live price estimation & top5Median', () => {
  it('detects crash and anchors on top5Median when listings are [6, 6, 7, 8, 9, 25, 40, 50] vs median7d 27', () => {
    const depth = computeLiveMarketDepth([6, 6, 7, 8, 9, 25, 40, 50], 27);
    expect(depth.top5Median).toBe(7);
    expect(depth.isCrashDetected).toBe(true);

    const res = evaluateDuplicate(
      { id: 777, name: 'Shizuku Hoshikawa', rarity: 'R' },
      { characterId: 777, qty: 2, locked: 0 },
      { median7d: 27, sales7d: 10, liveDepth: depth, lowestFixed: depth.lowestFixed },
      DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, autoSellStrategy: 'recent20_median' }
    );
    expect(res.prices?.recommended).toBeLessThanOrEqual(6);
    expect(res.prices?.recommended).toBeGreaterThanOrEqual(4);
  });

  it('also recommends <= 6 ◆ when only a single live listing [6] exists below median7d 27', () => {
    const singleDepth = computeLiveMarketDepth([6], 27);
    expect(singleDepth.top5Median).toBe(6);
    expect(singleDepth.isCrashDetected).toBe(true);

    const res = evaluateDuplicate(
      { id: 777, name: 'Shizuku Hoshikawa', rarity: 'R' },
      { characterId: 777, qty: 2, locked: 0 },
      { median7d: 27, sales7d: 10, liveDepth: singleDepth, lowestFixed: singleDepth.lowestFixed },
      DEFAULT_RECYCLE_VALUES,
      { ...DEFAULT_SETTINGS, autoSellStrategy: 'balanced' }
    );
    expect(res.prices?.recommended).toBeLessThanOrEqual(6);
  });
});
