import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  metric: vi.fn(),
  pulls: vi.fn()
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({
  appendJournal: vi.fn(),
  recordCumulativeMetric: mocks.metric,
  recordBestPulls: mocks.pulls
}));
vi.mock('../src/content/hud', () => ({ setHudStatusText: vi.fn() }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: vi.fn() }));
vi.mock('../src/content/utils', () => ({
  sleep: vi.fn(),
  newRequestId: () => 'test-req',
  notifyDesktop: vi.fn()
}));

describe('live-opening Golden & Pity sniper batch sizing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChrome();
  });

  it('opens exactly 1 booster on recommendedGolden in "new" strategy when all[0] differs even though recommendedNew was overwritten', async () => {
    mocks.api.mockResolvedValue({ cards: [{ id: 1, rarity: 'L', isNew: true }] });
    const { state } = await import('../src/content/state');
    state.currentSettings.dryRun = false;
    state.currentSettings.autoOpenDailyPack = false;
    state.currentSettings.autoBoosterStrategy = 'new';
    state.currentSettings.autoOpenMode = 'recommended_new';
    state.currentSettings.renaissanceFocusEnabled = false;
    state.currentSettings.autoOpenGoldenSniper = true;

    const { executeAutoOpenBoosters } = await import('../src/content/automation/live-opening');

    const packNew = {
      packId: 'pack-new',
      name: 'Pack Nouvelles Cartes',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };
    const packGolden = {
      packId: 'pack-golden',
      name: 'Pack Golden EV',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };

    const res = await executeAutoOpenBoosters(
      {
        me: { freePacks: 10, freePacksMax: 10, goldenIn: 1, pity: 50 },
        boosters: {
          all: [packNew, packGolden],
          // rankBoostersForCollection overwrites recommendedNew with recommendedGolden when isGoldenNext
          recommendedNew: packGolden,
          recommendedEv: packGolden,
          recommendedGolden: packGolden,
          recommendedPity: null,
          isGoldenNext: true,
          isPityNear: false
        }
      },
      { backgroundOnly: true }
    );

    expect(res.openedCount).toBe(1);
    expect(res.targetPack?.packId).toBe('pack-golden');
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith(
      '/packs/pack-golden/open',
      expect.objectContaining({ method: 'POST', body: { maxChakra: 0 } })
    );
  });

  it('caps batch size to (250 - pity) on recommendedPity when isPityNear is true and all[0] differs', async () => {
    mocks.api.mockResolvedValue({
      results: [
        { cards: [{ id: 1, rarity: 'C', isNew: false }] },
        { cards: [{ id: 2, rarity: 'R', isNew: false }] },
        { cards: [{ id: 3, rarity: 'M', isNew: true }] }
      ]
    });
    const { state } = await import('../src/content/state');
    state.currentSettings.dryRun = false;
    state.currentSettings.autoOpenDailyPack = false;
    state.currentSettings.autoBoosterStrategy = 'new';
    state.currentSettings.autoOpenMode = 'recommended_new';
    state.currentSettings.renaissanceFocusEnabled = false;
    state.currentSettings.autoOpenPitySniper = true;

    const { executeAutoOpenBoosters } = await import('../src/content/automation/live-opening');

    const packNew = {
      packId: 'pack-new',
      name: 'Pack Nouvelles Cartes',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };
    const packPity = {
      packId: 'pack-pity',
      name: 'Pack Mythique Pitié',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };

    const res = await executeAutoOpenBoosters(
      {
        me: { freePacks: 10, freePacksMax: 10, goldenIn: null, pity: 247 },
        boosters: {
          all: [packNew, packPity],
          // rankBoostersForCollection overwrites recommendedNew with recommendedPity when isPityNear
          recommendedNew: packPity,
          recommendedEv: packPity,
          recommendedGolden: packPity,
          recommendedPity: packPity,
          isGoldenNext: false,
          isPityNear: true
        }
      },
      { backgroundOnly: true }
    );

    expect(res.openedCount).toBe(3);
    expect(res.targetPack?.packId).toBe('pack-pity');
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith(
      '/packs/pack-pity/open-many',
      expect.objectContaining({ method: 'POST', body: { count: 3, maxChakra: 0 } })
    );
  });

  it('opens exactly 1 booster at pity=249 on recommendedPity when all[0] differs', async () => {
    mocks.api.mockResolvedValue({ cards: [{ id: 9, rarity: 'M', isNew: true }] });
    const { state } = await import('../src/content/state');
    state.currentSettings.dryRun = false;
    state.currentSettings.autoOpenDailyPack = false;
    state.currentSettings.autoBoosterStrategy = 'new';
    state.currentSettings.autoOpenMode = 'recommended_new';
    state.currentSettings.autoOpenPitySniper = true;

    const { executeAutoOpenBoosters } = await import('../src/content/automation/live-opening');

    const packNew = {
      packId: 'pack-new',
      name: 'Pack New',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };
    const packPity = {
      packId: 'pack-pity',
      name: 'Pack Pity',
      canOpenNow: true,
      usesFreePacks: true,
      openableFreeCount: 10,
      autoOpenableFreeCount: 10
    };

    const res = await executeAutoOpenBoosters(
      {
        me: { freePacks: 10, freePacksMax: 10, goldenIn: null, pity: 249 },
        boosters: {
          all: [packNew, packPity],
          recommendedNew: packPity,
          recommendedPity: packPity,
          isGoldenNext: false,
          isPityNear: true
        }
      },
      { backgroundOnly: true }
    );

    expect(res.openedCount).toBe(1);
    expect(mocks.api).toHaveBeenCalledWith(
      '/packs/pack-pity/open',
      expect.objectContaining({ method: 'POST', body: { maxChakra: 0 } })
    );
  });
});
