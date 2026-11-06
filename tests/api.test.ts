import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
vi.mock('../src/content/utils', () => ({ readSiteAuth: () => ({ token: 'test' }), sleep: vi.fn(async () => {}), randomJitter: () => 0 }));

describe('API write safety', () => {
  beforeEach(() => { vi.resetModules(); mockChrome(); });
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
});
