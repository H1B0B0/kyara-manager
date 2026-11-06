import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
const actions = vi.hoisted(() => ({ open: vi.fn(), claim: vi.fn(), recycle: vi.fn(), sell: vi.fn(), buy: vi.fn(), snapshot: vi.fn() }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: actions.snapshot }));
vi.mock('../src/content/journal', () => ({ appendJournal: vi.fn() }));
vi.mock('../src/content/automation/live-opening', () => ({ executeAutoOpenBoosters: actions.open }));
vi.mock('../src/content/automation/missions', () => ({ executeAutoClaimMissions: actions.claim }));
vi.mock('../src/content/automation/auto-recycle', () => ({ executeAutoRecycle: actions.recycle }));
vi.mock('../src/content/automation/auto-sell', () => ({ executeAutoSell: actions.sell }));
vi.mock('../src/content/automation/auto-buy', () => ({ executeAutoBuy: actions.buy }));

describe('automation dispatch', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); mockLocks();
    actions.snapshot.mockResolvedValue({ authenticated: true });
    actions.open.mockResolvedValue({ openedCount: 0 });
    actions.recycle.mockResolvedValue({ recycledCopies: 0 });
    actions.sell.mockResolvedValue({ listedCount: 0 });
    actions.buy.mockResolvedValue({ boughtCount: 0 });
  });
  it('respects off switches despite legacy flags defaulting to true', async () => {
    mockChrome({ settings: { autoBoosterEnabled: false, autoClaimMissionsEnabled: false, autoRecycleEnabled: false, autoSellEnabled: false } });
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    expect((await runAutomationCycle({ manual: true })).ok).toBe(true);
    expect(actions.open).not.toHaveBeenCalled();
    expect(actions.claim).not.toHaveBeenCalled();
  });
  it('dispatches wishlist-only buying and the visible market switch', async () => {
    const { chrome } = mockChrome({ settings: { wishlistAutoBuyEnabled: true } });
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    await runAutomationCycle({ manual: true });
    expect(actions.buy).toHaveBeenCalledTimes(1);
    await chrome.storage.local.set({ settings: { autoMarketEnabled: true, wishlistAutoBuyEnabled: false } });
    await runAutomationCycle({ manual: true });
    expect(actions.buy).toHaveBeenCalledTimes(2);
  });
  it('refreshes after recycling before selling and throttles duplicate automatic ticks', async () => {
    mockChrome();
    actions.recycle.mockResolvedValue({ recycledCopies: 1 });
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    await runAutomationCycle();
    const recycleOrder = actions.recycle.mock.invocationCallOrder[0];
    const sellOrder = actions.sell.mock.invocationCallOrder[0];
    expect(actions.snapshot.mock.invocationCallOrder.some((order) => order > recycleOrder && order < sellOrder)).toBe(true);
    expect(await runAutomationCycle()).toMatchObject({ skipped: true });
    expect(actions.sell).toHaveBeenCalledTimes(1);
  });
});
