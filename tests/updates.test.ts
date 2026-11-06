import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';

describe('update lifecycle', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.useRealTimers());
  it('waits for active actions and applies automatically when tabs become idle', async () => {
    vi.useFakeTimers();
    const { chrome, data } = mockChrome();
    chrome.tabs.query.mockResolvedValue([{ id: 1 }]);
    chrome.tabs.sendMessage.mockResolvedValue({ ok: true, busy: true });
    const { updateAvailable, applyPendingUpdate } = await import('../src/background/updates');
    await updateAvailable('1.4.3');
    expect(data.kmUpdate.status).toBe('waiting');
    expect(chrome.runtime.reload).not.toHaveBeenCalled();
    chrome.tabs.sendMessage.mockResolvedValue({ ok: true, busy: false });
    const applying = applyPendingUpdate();
    await vi.advanceTimersByTimeAsync(1500); await applying;
    expect(data.kmUpdate.status).toBe('installing');
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
  });
  it('checks on demand and reports Chrome throttling honestly', async () => {
    const { chrome, data } = mockChrome();
    const { checkForUpdate } = await import('../src/background/updates');
    await checkForUpdate();
    expect(data.kmUpdate.status).toBe('no_update');
    await checkForUpdate();
    expect(data.kmUpdate.status).toBe('throttled');
    expect(chrome.runtime.requestUpdateCheck).toHaveBeenCalledTimes(1);
  });
  it('deduplicates a simultaneous event and manual update check', async () => {
    vi.useFakeTimers();
    const { chrome } = mockChrome();
    chrome.runtime.requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '1.4.3' } as any);
    const { checkForUpdate, updateAvailable } = await import('../src/background/updates');
    const a = checkForUpdate(); const b = updateAvailable('1.4.3');
    await vi.advanceTimersByTimeAsync(1500); await Promise.all([a, b]);
    expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
  });
});
