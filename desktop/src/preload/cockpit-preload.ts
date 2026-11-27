import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { createChromeShim } from './chrome-shim';

interface PreloadInfo {
  accountId: string;
  role: 'kyara' | 'games' | 'cockpit';
  extensionDir: string;
  version: string;
}

const info = ipcRenderer.sendSync('km:preload:get-context') as PreloadInfo | null;

if (info && info.accountId) {
  const shim = createChromeShim(ipcRenderer, {
    accountId: info.accountId,
    role: 'cockpit',
    version: info.version
  });
  contextBridge.exposeInMainWorld('__kmDesktopChrome', shim);
  void webFrame.executeJavaScript(
    'globalThis.chrome = Object.assign(globalThis.chrome || {}, globalThis.__kmDesktopChrome);'
  );
}
