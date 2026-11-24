import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS } from '../src/types/settings';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  journal: vi.fn(),
  interrupted: false
}));

vi.mock('../src/content/api', () => ({ kyaraApi: mocks.api }));
vi.mock('../src/content/journal', () => ({ appendJournal: mocks.journal }));
vi.mock('../src/content/safety', async () => {
  const actual = await vi.importActual<typeof import('../src/content/safety')>('../src/content/safety');
  return { ...actual, isInterrupted: () => mocks.interrupted };
});

describe('placeBatchBuyOrders', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.interrupted = false;
    mockChrome();
  });

  async function setup(settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
    const { state } = await import('../src/content/state');
    state.currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    const { placeBatchBuyOrders } = await import('../src/content/automation/buy-orders');
    return { state, placeBatchBuyOrders };
  }

  it('tracks placedIds and stops with stoppedByReserve when reserve would be breached', async () => {
    mocks.api.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/me/bootstrap') return { me: { chakra: 250 } };
      if (path === '/market/buy-orders' && opts?.method === 'POST') {
        return { user: { chakra: 250 - opts.body.price } };
      }
      return {};
    });

    const { placeBatchBuyOrders } = await setup({ autoBuyMinChakraReserve: 200, dryRun: false });
    const res = await placeBatchBuyOrders([
      { characterId: 10, price: 30, name: 'Card 10' },
      { characterId: 20, price: 30, name: 'Card 20' },
      { characterId: 30, price: 10, name: 'Card 30' }
    ]);

    expect(res).toEqual({
      placedCount: 1,
      totalLocked: 30,
      failedCount: 0,
      placedIds: [10],
      stoppedByReserve: true,
      interrupted: false
    });
  });

  it('tracks placedIds in dryRun mode without posting to the API', async () => {
    mocks.api.mockResolvedValue({ me: { chakra: 500 } });

    const { placeBatchBuyOrders } = await setup({ autoBuyMinChakraReserve: 200, dryRun: true });
    const res = await placeBatchBuyOrders([
      { characterId: 11, price: 40 },
      { characterId: 12, price: 50 }
    ]);

    expect(res).toEqual({
      placedCount: 2,
      totalLocked: 90,
      failedCount: 0,
      placedIds: [11, 12],
      stoppedByReserve: false,
      interrupted: false
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith('/me/bootstrap');
  });

  it('sets interrupted=true and stops when interruption triggers mid-batch', async () => {
    mocks.api.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path === '/market/buy-orders' && opts?.method === 'POST') {
        mocks.interrupted = true;
        return { user: { chakra: 480 } };
      }
      return {};
    });

    const { placeBatchBuyOrders } = await setup({ autoBuyMinChakraReserve: 100, dryRun: false });
    const res = await placeBatchBuyOrders([
      { characterId: 101, price: 20 },
      { characterId: 102, price: 20 }
    ]);

    expect(res).toEqual({
      placedCount: 1,
      totalLocked: 20,
      failedCount: 0,
      placedIds: [101],
      stoppedByReserve: false,
      interrupted: true
    });
  });

  it('increments failedCount and excludes failed cards from placedIds', async () => {
    mocks.api.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/me/bootstrap') return { me: { chakra: 500 } };
      if (path === '/market/buy-orders' && opts?.method === 'POST') {
        if (opts.body.characterId === 202) throw new Error('API failure');
        return { user: { chakra: 470 } };
      }
      return {};
    });

    const { placeBatchBuyOrders } = await setup({ autoBuyMinChakraReserve: 100, dryRun: false });
    const res = await placeBatchBuyOrders([
      { characterId: 201, price: 30 },
      { characterId: 202, price: 30 },
      { characterId: -5, price: 10 },
      { characterId: 203, price: 20 }
    ]);

    expect(res).toEqual({
      placedCount: 2,
      totalLocked: 50,
      failedCount: 2,
      placedIds: [201, 203],
      stoppedByReserve: false,
      interrupted: false
    });
  });
});
