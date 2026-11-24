import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
const sleepMock = vi.fn(async (_ms: number) => {});
vi.mock('../src/content/utils', () => ({ readSiteAuth: () => ({ token: 'test' }), sleep: sleepMock, randomJitter: () => 0 }));

describe('API write safety', () => {
  beforeEach(() => { vi.resetModules(); sleepMock.mockReset(); sleepMock.mockImplementation(async () => {}); mockChrome(); });
  afterEach(() => vi.unstubAllGlobals());
  it('blocks every write while simulation is enabled, before calling fetch', async () => {
    const { state } = await import('../src/content/state');
    state.currentSettings.dryRun = true;
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { kyaraApi } = await import('../src/content/api');
    await expect(kyaraApi('/anything', { method: 'POST' })).rejects.toThrow('simulation');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not replay an ambiguous POST after a 503', async () => {
    const fetcher = vi.fn(async () => new Response('{"message":"busy"}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const { kyaraApi } = await import('../src/content/api');
    await expect(kyaraApi('/buy', { method: 'POST' })).rejects.toThrow('busy');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('still retries safe reads and sends an abort signal', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    const { kyaraApi } = await import('../src/content/api');
    expect(await kyaraApi('/me')).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('stops an orphaned content script after an extension reload', async () => {
    vi.stubGlobal('chrome', { runtime: { id: '' } });
    const { kyaraApi } = await import('../src/content/api');
    await expect(kyaraApi('/me')).rejects.toThrow('rechargée');
  });
  it('lets high-priority writes jump ahead of queued bulk writes', async () => {
    const { waitForWriteSlot } = await import('../src/content/api');
    const order: string[] = [];
    await Promise.all([
      ...[1, 2, 3, 4].map((n) => waitForWriteSlot().then(() => order.push(`bulk-${n}`))),
      waitForWriteSlot('high').then(() => order.push('listing'))
    ]);
    // Whatever was already dequeued goes first; the listing must not wait behind the rest of the bulk queue.
    expect(order.indexOf('listing')).toBeLessThan(order.indexOf('bulk-4'));
    expect(order.indexOf('listing')).toBeLessThanOrEqual(2);
    expect(order).toHaveLength(5);
  });

  it('parses Retry-After headers in seconds, RFC 9110 HTTP-date, and rejects invalid values', async () => {
    const { parseRetryAfterMs } = await import('../src/content/api');
    const now = Date.parse('Tue, 24 Nov 2026 14:59:15 GMT');
    expect(parseRetryAfterMs('5', now)).toBe(5000);
    expect(parseRetryAfterMs('0', now)).toBe(0);
    expect(parseRetryAfterMs(' 2.5 ', now)).toBe(2500);
    expect(parseRetryAfterMs('Tue, 24 Nov 2026 15:00:00 GMT', now)).toBe(45000);
    expect(parseRetryAfterMs('Tue, 24 Nov 2026 14:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs('', now)).toBeNull();
    expect(parseRetryAfterMs('   ', now)).toBeNull();
    expect(parseRetryAfterMs('not-a-date', now)).toBeNull();
    expect(parseRetryAfterMs('-5', now)).toBeNull();
  });

  it('caps Retry-After cooldown at MAX_COOLDOWN_MS so huge headers cannot freeze the client', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '3600' } }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    const { kyaraApi, MAX_COOLDOWN_MS } = await import('../src/content/api');

    expect(await kyaraApi('/me')).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock.mock.calls[0][0]).toBeLessThanOrEqual(MAX_COOLDOWN_MS);
    expect(sleepMock.mock.calls[0][0]).toBeGreaterThan(MAX_COOLDOWN_MS - 1000);
  });

  it('drains queued writes immediately without sleeping when state.disposed is true', async () => {
    const { state } = await import('../src/content/state');
    const { waitForWriteSlot } = await import('../src/content/api');
    state.disposed = true;

    await Promise.all([
      waitForWriteSlot('normal'),
      waitForWriteSlot('high'),
      waitForWriteSlot('normal')
    ]);

    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('drains remaining write queues immediately when disposed mid-pump', async () => {
    const { state } = await import('../src/content/state');
    const { waitForWriteSlot } = await import('../src/content/api');
    let releaseFirstSleep!: () => void;
    sleepMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstSleep = resolve;
        })
    );

    const first = waitForWriteSlot('normal');
    const second = waitForWriteSlot('high');
    const third = waitForWriteSlot('normal');

    await first;
    // Wait until the pump hits sleep for the second item, then dispose.
    await vi.waitFor(() => expect(sleepMock).toHaveBeenCalledTimes(1));
    state.disposed = true;
    releaseFirstSleep();

    await Promise.all([second, third]);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });
});
