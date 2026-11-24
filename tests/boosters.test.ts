import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { evaluateBoosterPack } from '../src/lib/analytics/boosters';
const mocks = vi.hoisted(() => ({ api: vi.fn(), metric: vi.fn(), pulls: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({ appendJournal: vi.fn(), recordCumulativeMetric: mocks.metric, recordBestPulls: mocks.pulls }));
vi.mock('../src/content/hud', () => ({ setHudStatusText: vi.fn() }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: vi.fn() }));
vi.mock('../src/content/utils', () => ({ sleep: vi.fn(), newRequestId: () => 'test', notifyDesktop: vi.fn() }));

describe('free booster safeguards', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockChrome(); });
  it('does not navigate or open even the daily pack in simulation', async () => {
    const { state } = await import('../src/content/state'); state.currentSettings.dryRun = true;
    const { executeAutoOpenBoosters, fallbackApiOpenBooster } = await import('../src/content/automation/live-opening');
    await executeAutoOpenBoosters({ boosters: { all: [{ packId: 'daily', canOpenNow: true }], recommendedNew: null } });
    await fallbackApiOpenBooster('daily', 'Daily', 1);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.metric).not.toHaveBeenCalled();
  });
  it('preserves the configured free-pack reserve', async () => {
    const { state } = await import('../src/content/state'); state.currentSettings.autoBoosterReserveFree = 3;
    const { executeAutoOpenBoosters } = await import('../src/content/automation/live-opening');
    const result = await executeAutoOpenBoosters({ me: { freePacks: 3 }, boosters: { all: [], recommendedNew: { packId: 'a', canOpenNow: true, openableFreeCount: 3, usesFreePacks: true } } });
    expect(result.openedCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it('records each batch result once and always sets maxChakra to zero', async () => {
    mocks.api.mockResolvedValue({ results: [{ cards: [{ id: 1, rarity: 'L', isNew: true }] }, { cards: [{ id: 2, rarity: 'C' }] }] });
    const { fallbackApiOpenBooster } = await import('../src/content/automation/live-opening');
    expect(await fallbackApiOpenBooster('a', 'A', 2)).toMatchObject({ openedCount: 2, newCardsCount: 1 });
    expect(mocks.api).toHaveBeenCalledWith('/packs/a/open-many', expect.objectContaining({ body: { count: 2, maxChakra: 0 } }));
    expect(mocks.pulls).toHaveBeenCalledTimes(1);
    expect(mocks.metric).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateBoosterPack rateUp probability', () => {
  it('returns pNewGivenRarity = 1 (not featuredShare) when 100% of a rarity is featured and unowned', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'M1', rarity: 'M' }],
      [2, { id: 2, name: 'M2', rarity: 'M' }]
    ]);
    const pack = {
      id: 'rateup-all',
      name: 'All Featured M',
      rates: { slots: [{ pct: { M: 100 } }] },
      rateUp: { characterIds: [1, 2], rarities: ['M'], share: 0.5 }
    };

    const res = evaluateBoosterPack(pack, [1, 2], catalog, new Set<number>());
    expect(res.expectedNewCards).toBe(1);
    expect(res.probAtLeastOneNewPct).toBe(100);
  });

  it('ignores featuredIds outside poolIds when computing featured probabilities', () => {
    const catalog = new Map<number, any>([
      [1, { id: 1, name: 'L1', rarity: 'L' }],
      [2, { id: 2, name: 'L2', rarity: 'L' }],
      [99, { id: 99, name: 'OutOfPool', rarity: 'L' }]
    ]);
    const pack = {
      id: 'rateup-out-of-pool',
      name: 'Out of Pool Featured',
      rates: { slots: [{ pct: { L: 100 } }] },
      rateUp: { characterIds: [1, 99], rarities: ['L'], share: 0.5 }
    };

    // Card 1 (in-pool featured) is owned, card 2 (in-pool non-featured) is missing,
    // card 99 is NOT in poolIds so it must be ignored (pFeatNew = 0, pNonFeatNew = 1 -> pNew = 0.5).
    const res = evaluateBoosterPack(pack, [1, 2], catalog, new Set<number>([1]));
    expect(res.expectedNewCards).toBe(0.5);
    expect(res.probAtLeastOneNewPct).toBe(50);
  });
});
