import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
const api = vi.hoisted(() => vi.fn());
vi.mock('../src/content/api', () => ({ kyaraApi: api }));
vi.mock('../src/content/snapshot', () => ({ extractActiveListings: (market: any) => market.listings.filter((item: any) => item.status === 'active') }));

describe('fresh card availability', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it('preserves configured copies, locked copies and all listing quantities', async () => {
    mockChrome();
    const { state } = await import('../src/content/state');
    state.currentSettings.autoRecycleKeepCopies = 2;
    api.mockImplementation(async (path) => path.startsWith('/me/collection')
      ? [{ characterId: 1, qty: 8, locked: 1 }]
      : { listings: [{ character: { id: 1 }, qty: 2, status: 'active' }] });
    const { getCardAvailability } = await import('../src/content/safety');
    expect((await getCardAvailability(1)).spare).toBe(3);
  });
  it('respects protection added after the dashboard was generated', async () => {
    mockChrome({ kmPinnedCards: [1] });
    api.mockImplementation(async (path) => path.startsWith('/me/collection') ? [{ characterId: 1, qty: 9 }] : { listings: [] });
    const { getCardAvailability } = await import('../src/content/safety');
    expect((await getCardAvailability(1)).spare).toBe(0);
  });
  it('fails closed when fresh collection data is unavailable', async () => {
    mockChrome(); api.mockResolvedValue({ listings: [] });
    const { getCardAvailability } = await import('../src/content/safety');
    await expect(getCardAvailability(1)).rejects.toThrow('indisponibles');
  });
});
