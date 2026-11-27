import fs from 'node:fs';
import path from 'node:path';
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
    role: info.role,
    version: info.version
  });

  const proto = typeof location !== 'undefined' ? location.protocol : '';
  const host = typeof location !== 'undefined' ? location.hostname : '';

  // For embedded overlay iframes served on km-ext://bundle/*, expose the shim to MAIN world React.
  if (proto === 'km-ext:') {
    contextBridge.exposeInMainWorld('__kmDesktopChrome', shim);
    void webFrame.executeJavaScript(
      'globalThis.chrome = Object.assign(globalThis.chrome || {}, globalThis.__kmDesktopChrome);'
    );
  } else if (host === 'kyara.games' || host.endsWith('.kyara.games')) {
    // Run content.js strictly inside the isolated preload world so kyara.games page JS cannot inspect chrome shim.
    (globalThis as any).chrome = shim;
    const injectContentScript = () => {
      try {
        const contentPath = path.join(info.extensionDir, 'content', 'content.js');
        if (!fs.existsSync(contentPath)) return;
        const code = fs.readFileSync(contentPath, 'utf8');
        (0, eval)(code);
      } catch (err) {
        console.warn('[Kyara Desktop] Content injection error:', err);
      }
    };

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectContentScript, { once: true });
      } else {
        injectContentScript();
      }
      window.addEventListener('beforeunload', () => {
        try {
          (globalThis as any).__kyaraManagerRuntime?.dispose?.();
        } catch {}
      });
    }
  }
}
