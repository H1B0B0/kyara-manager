import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
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
