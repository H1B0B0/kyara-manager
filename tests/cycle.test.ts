import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
const actions = vi.hoisted(() => ({ open: vi.fn(), claim: vi.fn(), recycle: vi.fn(), sell: vi.fn(), buy: vi.fn(), snapshot: vi.fn(), ledger: vi.fn() }));
vi.mock('../src/content/safety', () => ({ loadCardLedger: actions.ledger }));
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
    actions.ledger.mockResolvedValue({ shared: true });
    actions.claim.mockResolvedValue({ claimed: false });
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
  it('recycles and sells in parallel on one shared ledger, then refreshes once before buying', async () => {
    mockChrome({ settings: { wishlistAutoBuyEnabled: true } });
    const order: string[] = [];
    let releaseRecycle!: () => void;
    actions.recycle.mockImplementation(async (_dashboard, ledger) => {
      order.push('recycle:start');
      expect(ledger).toEqual({ shared: true });
      await new Promise<void>((resolve) => { releaseRecycle = resolve; });
      order.push('recycle:end');
      return { recycledCopies: 2 };
    });
    actions.sell.mockImplementation(async (_dashboard, ledger) => {
      order.push('sell:start');
      expect(ledger).toEqual({ shared: true });
      releaseRecycle();
      return { listedCount: 1, repriced: 1, recycledCopies: 0 };
    });
    actions.buy.mockImplementation(async () => { order.push('buy'); return { boughtCount: 0 }; });
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    const res = await runAutomationCycle({ manual: true });
    expect(order.slice(0, 2)).toEqual(['recycle:start', 'sell:start']);
    expect(order.indexOf('buy')).toBeGreaterThan(order.indexOf('recycle:end'));
    expect(res.summary).toMatchObject({ recycledCopies: 2, listed: 1, repriced: 1 });
    expect(actions.ledger).toHaveBeenCalledTimes(1);
    expect(actions.snapshot).toHaveBeenCalledTimes(2);
  });
  it('keeps running independent tasks when one of them fails', async () => {
    mockChrome({ settings: { wishlistAutoBuyEnabled: true } });
    actions.open.mockRejectedValue(new Error('boom'));
    actions.sell.mockResolvedValue({ listedCount: 3, repriced: 0, recycledCopies: 0 });
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    const res = await runAutomationCycle({ manual: true });
    expect(res.ok).toBe(true);
    expect(res.summary.listed).toBe(3);
    expect(actions.buy).toHaveBeenCalledTimes(1);
  });
  it('throttles duplicate automatic ticks', async () => {
    mockChrome();
    const { runAutomationCycle } = await import('../src/content/automation/cycle');
    await runAutomationCycle();
    expect(await runAutomationCycle()).toMatchObject({ skipped: true });
    expect(actions.sell).toHaveBeenCalledTimes(1);
  });
});
