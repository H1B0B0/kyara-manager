import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  return {
    listeners,
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({})),
      quitAndInstall: vi.fn(),
      on: vi.fn((ev: string, fn: (...args: any[]) => void) => {
        const list = listeners.get(ev) || [];
        list.push(fn);
        listeners.set(ev, list);
      })
    }
  };
});

vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.autoUpdater } }));

describe('DesktopUpdater', () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
  });

  it('defers quitAndInstall while an account is busy and installs once idle', async () => {
    const { DesktopUpdater } = await import('../src/main/updater');
    let busy = true;
    const statuses: string[] = [];

    const updater = new DesktopUpdater({
      currentVersion: '1.0.0',
      isPackaged: true,
      areAccountsBusy: async () => busy,
      shouldAutoInstall: () => true,
      onStatus: (s) => statuses.push(s.status)
    });

    updater.start();
    const handlers = mocks.listeners.get('update-downloaded') || [];
    expect(handlers.length).toBeGreaterThan(0);

    handlers[0]({ version: '1.1.0' });
    await new Promise((r) => setTimeout(r, 15));

    expect(updater.getStatus().status).toBe('waiting');
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    busy = false;
    const installed = await updater.tryInstallWhenIdle();
    expect(installed).toBe(true);
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(statuses).toContain('waiting');
    updater.dispose();
  });
});
