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
  const onChanged = eventMock();
  const chromeMock = {
    runtime: {
      id: 'test-extension',
      getManifest: vi.fn(() => ({ version: '1.5.0', content_scripts: [] })),
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
      }, onChanged
    },
    tabs: { query: vi.fn(async () => [] as any[]), sendMessage: vi.fn(async (_id: number, _payload: any): Promise<any> => ({ ok: true, busy: false })), update: vi.fn(), reload: vi.fn(), create: vi.fn() },
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
