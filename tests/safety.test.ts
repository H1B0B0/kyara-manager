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
  it('lets parallel tasks reserve copies without ever spending the same one twice', async () => {
    mockChrome();
    const { buildCardLedger } = await import('../src/content/safety');
    const book = buildCardLedger([{ characterId: 1, qty: 4 }], [], []);
    expect(book.get(1).spare).toBe(3);
    expect(book.reserve(1, 2, 'recycle')).toBe(true);
    expect(book.reserve(1, 2, 'list')).toBe(false);
    expect(book.reserve(1, 1, 'list')).toBe(true);
    expect(book.get(1).spare).toBe(0);
    book.release(1, 1, 'list');
    expect(book.get(1).spare).toBe(1);
  });
  it('turns a reserved copy into a listing and frees it again when the listing is cancelled', async () => {
    mockChrome();
    const { buildCardLedger } = await import('../src/content/safety');
    const book = buildCardLedger([{ characterId: 1, qty: 3 }], [], []);
    book.reserve(1, 1, 'list');
    book.listingCreated({ id: 'a', characterId: 1, price: 5 });
    expect(book.listings).toHaveLength(1);
    expect(book.get(1)).toMatchObject({ listed: 1, spare: 1 });
    book.listingCancelled('a');
    expect(book.get(1)).toMatchObject({ listed: 0, spare: 2 });
  });
  it('loads the whole ledger with two requests, not two per card', async () => {
    mockChrome();
    api.mockImplementation(async (path) => path.startsWith('/me/collection') ? [{ characterId: 1, qty: 5 }, { characterId: 2, qty: 5 }] : { listings: [] });
    const { loadCardLedger } = await import('../src/content/safety');
    const book = await loadCardLedger();
    book.get(1); book.get(2);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
