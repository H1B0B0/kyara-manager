import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

describe('background routing', () => {
  beforeEach(() => vi.resetModules());
  async function start(initial = {}) {
    const result = mockChrome(initial);
    await import('../src/background/service-worker');
    const message = (payload: any) => new Promise<any>((resolve) => result.chrome.runtime.onMessage.emit(payload, {}, resolve));
    return { ...result, message };
  }
  it('saves concurrent settings patches without requiring a Kyara tab', async () => {
    const { message, data, chrome } = await start({ settings: { masterEnabled: true } });
    const results = await Promise.all([
      message({ type: 'km:save-settings', settings: { autoBoosterEnabled: false } }),
      message({ type: 'km:save-settings', settings: { autoMarketEnabled: true } })
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(data.settings.autoBoosterEnabled).toBe(false);
    expect(data.settings.autoOpenEnabled).toBe(false);
    expect(data.settings.autoBuyFlipEnabled).toBe(true);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('never retries a mutation in another tab after a response is lost', async () => {
    const { message, chrome } = await start();
    chrome.tabs.query.mockResolvedValue([{ id: 1, active: true }, { id: 2 }]);
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version } as any;
      throw new Error('port closed');
    });
    const response = await message({ type: 'km:cmd:single-recycle', characterId: 1, qty: 1 });
    expect(response.ok).toBe(false);
    expect(response.error).toContain('Vérifie le résultat');
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, payload]) => payload.type === 'km:cmd:single-recycle')).toHaveLength(1);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('reloads legacy pages instead of stacking another script over old timers', async () => {
    const { message, chrome } = await start();
    chrome.tabs.query.mockResolvedValue([{ id: 1 }]);
    chrome.tabs.sendMessage.mockRejectedValue(new Error('no receiver'));
    chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
    const response = await message({ type: 'km:cmd:refresh' });
    expect(chrome.tabs.reload).toHaveBeenCalledWith(1);
    expect(response.ok).toBe(false);
  });
});
