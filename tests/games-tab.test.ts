import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome } from './chrome';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/types/settings';

describe('dedicated background games tab', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults autoGamesDedicatedTab to true and normalizes explicit false', () => {
    expect(DEFAULT_SETTINGS.autoGamesDedicatedTab).toBe(true);
    expect(normalizeSettings({}).autoGamesDedicatedTab).toBe(true);
    expect(normalizeSettings({ autoGamesDedicatedTab: false }).autoGamesDedicatedTab).toBe(false);
  });

  it('creates an inactive pinned tab on /jouer, waits for load, injects, and reuses it', async () => {
    const { chrome } = mockChrome();
    const tabsById = new Map<number, any>();

    chrome.tabs.create.mockImplementation(async (opts: any) => {
      const tab = { id: 77, url: opts.url, status: 'loading', active: opts.active, pinned: opts.pinned };
      tabsById.set(77, tab);
      setTimeout(() => {
        tab.status = 'complete';
        chrome.tabs.onUpdated.emit(77, { status: 'complete' }, tab);
      }, 5);
      return tab;
    });
    chrome.tabs.get.mockImplementation(async (id: number) => {
      const tab = tabsById.get(id);
      if (!tab) throw new Error('No tab');
      return tab;
    });

    const { ensureGameWorkerTab, getGameWorkerTabId, handleRemovedTab } = await import('../src/background/games-tab');
    const injectFn = vi.fn(async () => true);

    const firstId = await ensureGameWorkerTab(injectFn);
    expect(firstId).toBe(77);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://kyara.games/jouer',
      active: false,
      pinned: true
    });
    expect(injectFn).toHaveBeenCalledWith(77);
    expect(await getGameWorkerTabId()).toBe(77);

    // Second call reuses the existing tab without creating a new one
    const secondId = await ensureGameWorkerTab(injectFn);
    expect(secondId).toBe(77);
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(injectFn).toHaveBeenCalledTimes(2);

    // Removing the tab clears the stored worker tab ID
    tabsById.delete(77);
    await handleRemovedTab(77);
    expect(await getGameWorkerTabId()).toBeNull();
  });

  it('excludes the game worker tab from findKyaraTabs when another Kyara tab exists, and falls back if alone', async () => {
    const { chrome } = mockChrome();
    const mainTab = { id: 10, url: 'https://kyara.games/marche', active: true, status: 'complete' };
    const workerTab = { id: 77, url: 'https://kyara.games/jouer/plus-aime', active: false, pinned: true, status: 'complete' };

    chrome.tabs.create.mockResolvedValue(workerTab);
    chrome.tabs.get.mockImplementation(async (id: number) => (id === 77 ? workerTab : mainTab));
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version };
      return { ok: true, playedGames: 2, ticketsEarned: 6 };
    });

    const sw = await import('../src/background/service-worker');
    const message = (payload: any) => new Promise<any>((resolve) => chrome.runtime.onMessage.emit(payload, {}, resolve));

    // Spawn worker tab via km:cmd:run-games-farm
    const farmRes = await message({ type: 'km:cmd:run-games-farm', gameId: 'plus-aime' });
    expect(farmRes.ok).toBe(true);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://kyara.games/jouer',
      active: false,
      pinned: true
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ type: 'km:cmd:run-games-farm', dedicatedTab: true, manual: true })
    );

    // When both mainTab and workerTab are open, findKyaraTabs excludes workerTab (77)
    chrome.tabs.query.mockResolvedValue([workerTab, mainTab]);
    const mainOnly = await sw.findKyaraTabs();
    expect(mainOnly.map((t) => t.id)).toEqual([10]);

    // When workerTab is the ONLY Kyara tab open, findKyaraTabs falls back to it
    chrome.tabs.query.mockResolvedValue([workerTab]);
    const fallback = await sw.findKyaraTabs();
    expect(fallback.map((t) => t.id)).toEqual([77]);

    // Closing the worker tab via km:cmd:close-games-tab removes it
    const closeRes = await message({ type: 'km:cmd:close-games-tab' });
    expect(closeRes).toEqual({ ok: true, closed: true });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(77);
  });

  it('dispatches alarm-tick to main tab and games farm to dedicated worker tab in parallel with 3m cooldown', async () => {
    const { chrome, data } = mockChrome({
      settings: {
        masterEnabled: true,
        autoGamesEnabled: true,
        autoGamesDedicatedTab: true,
        autoGamesTargetGame: 'memoire'
      },
      kmDashboard: {
        arcade: { enabled: true, blocked: null, today: 10, dayCap: 60, week: 40, weekCap: 300 }
      }
    });
    const mainTab = { id: 10, url: 'https://kyara.games/collection', active: true, status: 'complete' };
    const workerTab = { id: 88, url: 'https://kyara.games/jouer', active: false, pinned: true, status: 'complete' };
    chrome.tabs.query.mockResolvedValue([mainTab]);
    chrome.tabs.create.mockResolvedValue(workerTab);
    chrome.tabs.get.mockResolvedValue(workerTab);
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version };
      return { ok: true };
    });

    await import('../src/background/service-worker');

    // First alarm triggers both main tab alarm-tick and worker tab games farm
    await Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { type: 'km:alarm-tick' });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(88, {
      type: 'km:cmd:run-games-farm',
      gameId: 'memoire',
      manual: false,
      dedicatedTab: true
    });
    expect(typeof data.kmLastWorkerGamesAt).toBe('number');

    // Immediate second alarm respects 3-minute cooldown for worker tab
    chrome.tabs.sendMessage.mockClear();
    await Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { type: 'km:alarm-tick' });
    expect(
      chrome.tabs.sendMessage.mock.calls.filter(([, payload]) => payload.type === 'km:cmd:run-games-farm')
    ).toHaveLength(0);
  });

  it('closes the dedicated worker tab automatically when autoGamesEnabled turns false via storage.onChanged', async () => {
    const { chrome } = mockChrome({
      settings: {
        masterEnabled: true,
        autoGamesEnabled: true,
        autoGamesDedicatedTab: true
      }
    });
    const workerTab = { id: 91, url: 'https://kyara.games/jouer', active: false, pinned: true, status: 'complete' };
    chrome.tabs.create.mockResolvedValue(workerTab);
    chrome.tabs.get.mockResolvedValue(workerTab);
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version };
      return { ok: true };
    });

    await import('../src/background/service-worker');
    const message = (payload: any) => new Promise<any>((resolve) => chrome.runtime.onMessage.emit(payload, {}, resolve));

    // Open dedicated worker tab first
    const farmRes = await message({ type: 'km:cmd:run-games-farm', gameId: 'memoire' });
    expect(farmRes.ok).toBe(true);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();

    // Turning autoGamesEnabled off via storage.local.set triggers storage.onChanged and closes worker tab
    await chrome.storage.local.set({
      settings: {
        masterEnabled: true,
        autoGamesEnabled: false,
        autoGamesDedicatedTab: true
      }
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.tabs.remove).toHaveBeenCalledWith(91);
  });

  it('closes the dedicated worker tab in onAlarm when the 60/60 daily cap is reached', async () => {
    const { chrome } = mockChrome({
      settings: {
        masterEnabled: true,
        autoGamesEnabled: true,
        autoGamesDedicatedTab: true,
        autoGamesTargetGame: 'memoire'
      },
      kmDashboard: {
        arcade: { enabled: true, blocked: null, today: 58, dayCap: 60, week: 120, weekCap: 300 }
      }
    });
    const mainTab = { id: 10, url: 'https://kyara.games/collection', active: true, status: 'complete' };
    const workerTab = { id: 92, url: 'https://kyara.games/jouer', active: false, pinned: true, status: 'complete' };
    chrome.tabs.query.mockResolvedValue([mainTab]);
    chrome.tabs.create.mockResolvedValue(workerTab);
    chrome.tabs.get.mockResolvedValue(workerTab);
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version };
      return { ok: true, arcade: { enabled: true, blocked: null, today: 59, dayCap: 60, week: 121, weekCap: 300 } };
    });

    await import('../src/background/service-worker');

    // First alarm opens worker tab while under cap (58/60)
    await Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();

    // Update cached dashboard to 60/60 cap reached -> next alarm must close the worker tab
    await chrome.storage.local.set({
      kmDashboard: {
        arcade: { enabled: true, blocked: null, today: 60, dayCap: 60, week: 122, weekCap: 300 }
      }
    });
    await Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.tabs.remove).toHaveBeenCalledWith(92);
  });

  it('prevents overlapping dedicated worker runs while in-flight and closes worker tab after manual run when capped', async () => {
    const { chrome } = mockChrome({
      settings: {
        masterEnabled: true,
        autoGamesEnabled: true,
        autoGamesDedicatedTab: true,
        autoGamesTargetGame: 'expedition'
      },
      kmDashboard: {
        arcade: { enabled: true, blocked: null, today: 10, dayCap: 60, week: 40, weekCap: 300 }
      }
    });
    const mainTab = { id: 10, url: 'https://kyara.games/collection', active: true, status: 'complete' };
    const workerTab = { id: 93, url: 'https://kyara.games/jouer', active: false, pinned: true, status: 'complete' };
    chrome.tabs.query.mockResolvedValue([mainTab]);
    chrome.tabs.create.mockResolvedValue(workerTab);
    chrome.tabs.get.mockResolvedValue(workerTab);

    let resolveFirstRun!: (val: any) => void;
    let farmCalls = 0;
    chrome.tabs.sendMessage.mockImplementation(async (_id: number, payload: any) => {
      if (payload.type === 'km:ping') return { ok: true, version: chrome.runtime.getManifest().version };
      if (payload.type === 'km:cmd:run-games-farm') {
        farmCalls += 1;
        if (farmCalls === 1) {
          return await new Promise((resolve) => { resolveFirstRun = resolve; });
        }
        return { ok: true, arcade: { enabled: true, blocked: null, today: 60, dayCap: 60, week: 120, weekCap: 300 } };
      }
      return { ok: true };
    });

    await import('../src/background/service-worker');
    const message = (payload: any) => new Promise<any>((resolve) => chrome.runtime.onMessage.emit(payload, {}, resolve));

    // Start first alarm run (remains in-flight)
    const firstAlarm = Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(farmCalls).toBe(1);

    // Second alarm while first is still in-flight must NOT dispatch another games farm run
    await Promise.all(chrome.alarms.onAlarm.emit({ name: 'kyara-manager-tick' }));
    expect(farmCalls).toBe(1);

    // Finish first run
    resolveFirstRun({ ok: true, arcade: { enabled: true, blocked: null, today: 12, dayCap: 60, week: 42, weekCap: 300 } });
    await firstAlarm;

    // Manual run returning capped arcade closes the dedicated worker tab
    const manualRes = await message({ type: 'km:cmd:run-games-farm', gameId: 'expedition' });
    expect(manualRes.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.tabs.remove).toHaveBeenCalledWith(93);
  });
});
