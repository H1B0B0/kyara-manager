import { vi } from 'vitest';

export function eventMock() {
  const listeners = new Set<(...args: any[]) => any>();
  return {
    addListener: vi.fn((listener: (...args: any[]) => any) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: any[]) => any) => listeners.delete(listener)),
    emit: (...args: any[]) => [...listeners].map((listener) => listener(...args)),
    listeners
  };
}

export function mockChrome(initial: Record<string, any> = {}) {
  const data = structuredClone(initial);
  const sessionData: Record<string, any> = {};
  const onChanged = eventMock();
  const chromeMock = {
    runtime: {
      id: 'test-extension',
      getManifest: vi.fn(() => ({ version: '2.3.2', content_scripts: [], side_panel: { default_path: 'sidepanel/index.html' } })),
      getURL: vi.fn((path = '') => `chrome-extension://test-extension/${path}`),
      reload: vi.fn(),
      requestUpdateCheck: vi.fn(async () => ({ status: 'no_update' })),
      onMessage: eventMock(), onInstalled: eventMock(), onStartup: eventMock(), onUpdateAvailable: eventMock(),
      sendMessage: vi.fn(async () => ({ ok: true }))
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, data[key]]))),
        set: vi.fn(async (items: Record<string, any>) => {
          const changes = Object.fromEntries(Object.entries(items).map(([key, newValue]) => [key, { oldValue: data[key], newValue }]));
          Object.assign(data, structuredClone(items));
          onChanged.emit(changes, 'local');
        })
      },
      session: {
        get: vi.fn(async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, sessionData[key]]))),
        set: vi.fn(async (items: Record<string, any>) => { Object.assign(sessionData, structuredClone(items)); }),
        remove: vi.fn(async (keys: string | string[]) => { (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete sessionData[key]; }); })
      },
      onChanged
    },
    tabs: {
      query: vi.fn(async () => [] as any[]),
      get: vi.fn(async (id: number) => ({ id, url: 'https://kyara.games/jouer', status: 'complete' })),
      sendMessage: vi.fn(async (_id: number, _payload: any): Promise<any> => ({ ok: true, busy: false })),
      update: vi.fn(async (id: number, props: any) => ({ id, ...props })),
      reload: vi.fn(),
      create: vi.fn(async (opts: any) => ({ id: 99, url: opts?.url, status: 'complete', active: Boolean(opts?.active), pinned: Boolean(opts?.pinned) })),
      remove: vi.fn(async () => {}),
      onUpdated: eventMock(),
      onRemoved: eventMock()
    },
    sidePanel: { setPanelBehavior: vi.fn(async () => {}), open: vi.fn(async () => {}) },
    alarms: { get: vi.fn(async () => null), create: vi.fn(async () => {}), onAlarm: eventMock() },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    scripting: { executeScript: vi.fn(async () => [{ result: false }]), insertCSS: vi.fn(async () => {}) },
    notifications: { create: vi.fn(async () => {}) }
  };
  vi.stubGlobal('chrome', chromeMock);
  return { chrome: chromeMock, data };
}

export function mockLocks() {
  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();
  const request = vi.fn(async (name: string, options: any, callback?: any) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (held.has(name) && options.ifAvailable) return callback(null);
    while (held.has(name)) await new Promise<void>((resolve) => {
      waiters.set(name, [...(waiters.get(name) || []), resolve]);
    });
    held.add(name);
    try { return await callback({ name }); } finally {
      held.delete(name);
      const pending = waiters.get(name) || [];
      waiters.delete(name);
      pending.forEach((resolve) => resolve());
    }
  });
  vi.stubGlobal('navigator', { locks: { request }, language: 'fr' });
  return { request, held };
}
