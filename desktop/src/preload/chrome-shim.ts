import type { IpcRenderer } from 'electron';

export interface ChromeShimContext {
  accountId: string;
  version: string;
  role: 'kyara' | 'games' | 'cockpit';
}

type StorageChangeListener = (changes: Record<string, { oldValue?: any; newValue?: any }>, areaName: string) => void;
type RuntimeMessageListener = (message: any, sender: any, sendResponse: (res?: any) => void) => boolean | void;

export function createChromeShim(ipcRenderer: IpcRenderer, ctx: ChromeShimContext) {
  const storageListeners = new Set<StorageChangeListener>();
  const messageListeners = new Set<RuntimeMessageListener>();
  let lastErrorValue: { message: string } | undefined;

  ipcRenderer.on('km:chrome:storage-changed', (_ev, payload: { accountId: string; area: string; changes: Record<string, any> }) => {
    if (!payload || payload.accountId !== ctx.accountId) return;
    for (const listener of Array.from(storageListeners)) {
      try { listener(payload.changes, payload.area); } catch {}
    }
  });

  ipcRenderer.on('km:chrome:deliver-message', (_ev, payload: { reqId: string; message: any; accountId: string }) => {
    if (!payload || payload.accountId !== ctx.accountId) return;
    let replied = false;
    const reply = (res?: any) => {
      if (replied) return;
      replied = true;
      ipcRenderer.send('km:chrome:runtime-reply', { reqId: payload.reqId, response: res });
    };
    const dispatchToListeners = (attempt = 0) => {
      if (replied) return;
      if (messageListeners.size === 0) {
        if (attempt < 30) {
          setTimeout(() => dispatchToListeners(attempt + 1), 100);
        } else {
          reply(undefined);
        }
        return;
      }
      let wantsAsync = false;
      const sender = { id: 'kyara-manager-desktop' };
      for (const listener of Array.from(messageListeners)) {
        try {
          const ret = listener(payload.message, sender, reply);
          if (ret === true) wantsAsync = true;
        } catch (err: any) {
          if (!replied) {
            replied = true;
            ipcRenderer.send('km:chrome:runtime-reply', { reqId: payload.reqId, error: err?.message || 'listener_error' });
          }
        }
      }
      if (!wantsAsync && !replied) {
        setTimeout(() => {
          if (!replied) reply(undefined);
        }, 25);
      }
    };
    dispatchToListeners(0);
  });

  const makeArea = (area: 'local' | 'session') => ({
    get(keys?: any, cb?: (items: Record<string, any>) => void) {
      const p = ipcRenderer.invoke('km:chrome:storage-get', { accountId: ctx.accountId, area, keys: keys ?? null });
      if (typeof cb === 'function') {
        p.then((res) => cb(res)).catch(() => cb({}));
        return undefined;
      }
      return p;
    },
    set(items: Record<string, any>, cb?: () => void) {
      const p = ipcRenderer.invoke('km:chrome:storage-set', { accountId: ctx.accountId, area, items });
      if (typeof cb === 'function') {
        p.then(() => cb()).catch(() => cb());
        return undefined;
      }
      return p;
    },
    remove(keys: string | string[], cb?: () => void) {
      const p = ipcRenderer.invoke('km:chrome:storage-remove', { accountId: ctx.accountId, area, keys });
      if (typeof cb === 'function') {
        p.then(() => cb()).catch(() => cb());
        return undefined;
      }
      return p;
    }
  });

  const manifest = {
    name: 'Kyara Manager',
    version: ctx.version,
    side_panel: { default_path: 'sidepanel/index.html' }
  };

  const runtime = {
    id: 'kyara-manager-desktop',
    get lastError() {
      return lastErrorValue;
    },
    getManifest: () => manifest,
    getURL: (rel = '') => `km-ext://bundle/${String(rel || '').replace(/^\/+/, '')}`,
    sendMessage(message: any, cb?: (response?: any) => void) {
      const p = ipcRenderer
        .invoke('km:chrome:runtime-send-message', {
          accountId: ctx.accountId,
          role: ctx.role,
          message
        })
        .then((res) => {
          lastErrorValue = undefined;
          return res;
        })
        .catch((err: any) => {
          lastErrorValue = { message: err?.message || 'sendMessage_failed' };
          throw err;
        });

      if (typeof cb === 'function') {
        p.then((res) => cb(res)).catch(() => cb(undefined));
        return undefined;
      }
      return p;
    },
    onMessage: {
      addListener(fn: RuntimeMessageListener) { messageListeners.add(fn); },
      removeListener(fn: RuntimeMessageListener) { messageListeners.delete(fn); },
      hasListener(fn: RuntimeMessageListener) { return messageListeners.has(fn); }
    }
  };

  return {
    runtime,
    storage: {
      local: makeArea('local'),
      session: makeArea('session'),
      onChanged: {
        addListener(fn: StorageChangeListener) { storageListeners.add(fn); },
        removeListener(fn: StorageChangeListener) { storageListeners.delete(fn); },
        hasListener(fn: StorageChangeListener) { return storageListeners.has(fn); }
      }
    },
    tabs: {
      create(opts: { url?: string }) {
        return ipcRenderer.invoke('km:chrome:tabs-create', { accountId: ctx.accountId, url: opts?.url });
      }
    },
    notifications: {
      create(_id: any, opts?: { title?: string; message?: string }) {
        return ipcRenderer.invoke('km:chrome:runtime-send-message', {
          accountId: ctx.accountId,
          role: ctx.role,
          message: { type: 'km:notify', title: opts?.title || 'Kyara Manager', message: opts?.message || '' }
        });
      }
    }
  };
}
