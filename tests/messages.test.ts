import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
const mocks = vi.hoisted(() => ({ api: vi.fn(), snapshot: vi.fn(), availability: vi.fn(), ledger: vi.fn(), journal: vi.fn(), metric: vi.fn() }));
vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/snapshot', () => ({ refreshDashboardSnapshot: mocks.snapshot }));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal, recordCumulativeMetric: mocks.metric, DEFAULT_CUMULATIVE_STATS: {} }));
vi.mock('../src/content/safety', async (original) => ({ ...await original<any>(), getCardAvailability: mocks.availability, loadCardLedger: mocks.ledger }));
vi.mock('../src/content/automation/cycle', () => ({ runAutomationCycle: vi.fn() }));
vi.mock('../src/content/automation/auto-sell', () => ({ executeAutoSell: vi.fn() }));
vi.mock('../src/content/automation/live-opening', () => ({ executeAutoOpenBoosters: vi.fn(), pilotLiveBoosterOpening: vi.fn() }));
vi.mock('../src/content/utils', () => ({ sleep: vi.fn() }));

const fakeLedger = (spare: number) => ({
  listings: [], get: () => ({ spare }), reserve: (_id: number, qty: number) => qty <= spare, release: vi.fn(),
  listingCreated: vi.fn(), listingCancelled: vi.fn()
});

describe('content command safeguards', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockLocks(); });
  async function start(dryRun = false) {
    const { chrome, data } = mockChrome({ settings: { dryRun } });
    const { state } = await import('../src/content/state');
    const { setupMessageListener } = await import('../src/content/messages');
    setupMessageListener();
    const message = (payload: any) => new Promise<any>((resolve) => chrome.runtime.onMessage.emit(payload, {}, resolve));
    return { state, message, data };
  }
  it('rejects negative quantities and protected cards before sending a recycle request', async () => {
    const { message } = await start();
    expect((await message({ type: 'km:cmd:single-recycle', characterId: 1, qty: -1 })).ok).toBe(false);
    mocks.availability.mockResolvedValue({ spare: 0 });
    expect((await message({ type: 'km:cmd:single-recycle', characterId: 1, qty: 1 })).ok).toBe(false);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it('caps bulk recycle to fresh availability and reports actual counts', async () => {
    const { message } = await start();
    mocks.snapshot.mockResolvedValue({ duplicates: [{ characterId: 1, name: 'A', rarity: 'C', spare: 7, recycleValue: 2, verdict: 'RECYCLER' }] });
    mocks.ledger.mockResolvedValue(fakeLedger(1));
    mocks.api.mockResolvedValue({ gained: 2 });
    const response = await message({ type: 'km:cmd:bulk-recycle' });
    expect(response).toMatchObject({ ok: true, recycledCount: 1, chakraGained: 2 });
    expect(mocks.api).toHaveBeenCalledWith('/me/collection/1/recycle', { method: 'POST', body: { qty: 1 } });
  });
  it('never writes or fabricates gains for bulk simulation', async () => {
    const { message } = await start(true);
    mocks.snapshot.mockResolvedValue({ duplicates: [{ characterId: 1, rarity: 'C', spare: 7, verdict: 'RECYCLER' }] });
    mocks.ledger.mockResolvedValue(fakeLedger(3));
    const response = await message({ type: 'km:cmd:bulk-recycle' });
    expect(response.recycledCount).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.metric).not.toHaveBeenCalled();
  });
  it('rejects a purchase when the displayed price is stale', async () => {
    const { message } = await start();
    mocks.api.mockResolvedValue({ status: 'active', type: 'fixed', price: 99 });
    const response = await message({ type: 'km:cmd:buy-listing', listingId: 'a', price: 10 });
    expect(response.ok).toBe(false);
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it('advertises busy state and suspends new operations before an update', async () => {
    const { state, message } = await start();
    state.isOperationRunning = true;
    expect(await message({ type: 'km:prepare-update' })).toMatchObject({ ok: true, busy: true });
    expect(state.updatePending).toBe(true);
  });
  it('rejects invalid wishlist ids and budgets instead of silently inventing a budget', async () => {
    const { message, data } = await start();
    expect((await message({ type: 'km:cmd:wishlist-add', characterId: 0, budgetChakra: 20 })).ok).toBe(false);
    expect((await message({ type: 'km:cmd:wishlist-add', characterId: 1, budgetChakra: -5 })).ok).toBe(false);
    expect(data.kmWishlist).toBeUndefined();
  });
  it('persists explicit per-card auto-buy consent and the exact budget', async () => {
    const { message, data } = await start();
    mocks.snapshot.mockResolvedValue({ authenticated: true });
    expect((await message({ type: 'km:cmd:wishlist-add', characterId: 1, name: 'A', budgetChakra: 17, autoBuy: true })).ok).toBe(true);
    expect(data.kmWishlist[0]).toMatchObject({ characterId: 1, budgetChakra: 17, autoBuy: true });
  });
});
