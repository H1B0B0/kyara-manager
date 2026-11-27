import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { AccountStore } from './accounts';
import { AccountViewsManager } from './account-views';
import { ChromeBridge } from './chrome-bridge';
import { PowerAndTrayManager } from './power-and-tray';
import { DesktopUpdater } from './updater';
import type { AccountMode, AccountSnapshot, DesktopStatePayload, ViewportBounds } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'km-ext',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: false }
  }
]);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function resolvePaths() {
  const desktopRoot = path.resolve(import.meta.dirname, '..', '..');
  const extensionDir = app.isPackaged
    ? path.join(process.resourcesPath, 'extension')
    : path.join(desktopRoot, 'resources', 'extension');
  const preloadDir = path.join(desktopRoot, 'dist', 'preload');
  const rendererHtml = path.join(desktopRoot, 'dist', 'renderer', 'index.html');
  return { desktopRoot, extensionDir, preloadDir, rendererHtml };
}

function registerExtensionProtocol(extensionDir: string): void {
  protocol.handle('km-ext', async (req) => {
    const parsed = new URL(req.url);
    const rel = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    const target = path.resolve(extensionDir, rel);
    if (!target.startsWith(extensionDir) || !fs.existsSync(target)) {
      return new Response('Not found', { status: 404 });
    }
    const resp = await net.fetch(pathToFileURL(target).href);
    const ext = path.extname(target).toLowerCase();
    const headers = new Headers(resp.headers);
    if (MIME_TYPES[ext]) headers.set('content-type', MIME_TYPES[ext]);
    return new Response(resp.body, { status: resp.status, headers });
  });
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let currentBounds: ViewportBounds | null = null;

async function boot(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const { desktopRoot, extensionDir, preloadDir, rendererHtml } = resolvePaths();
  registerExtensionProtocol(extensionDir);

  const store = new AccountStore(app.getPath('userData'));
  const bridge = new ChromeBridge(store);
  const powerTray = new PowerAndTrayManager();

  let stateTimer: NodeJS.Timeout | null = null;
  const views = new AccountViewsManager(
    extensionDir,
    path.join(preloadDir, 'kyara-preload.cjs'),
    path.join(preloadDir, 'cockpit-preload.cjs'),
    (url) => void shell.openExternal(url),
    () => schedulePushState()
  );

  const buildSnapshot = (accountId: string): AccountSnapshot | null => {
    const acc = store.getAccount(accountId);
    if (!acc) return null;
    const raw = store.storageGet(accountId, 'local', [
      'settings',
      'kmDashboard',
      'kmBestPulls',
      'kmJournal',
      'kmCumulativeStats',
      'kmPinnedCards',
      'kmWishlist'
    ]);
    const meta = views.getViewMeta(accountId);
    const dashboard = raw.kmDashboard || null;
    const needsLogin = Boolean(
      (dashboard && dashboard.authenticated === false) ||
      /\/(login|connexion|auth)\b/i.test(meta.url)
    );
    return {
      account: acc,
      settings: raw.settings || {},
      dashboard,
      bestPulls: Array.isArray(raw.kmBestPulls) ? raw.kmBestPulls : [],
      journal: Array.isArray(raw.kmJournal) ? raw.kmJournal : [],
      cumulativeStats: raw.kmCumulativeStats || null,
      pinnedCards: Array.isArray(raw.kmPinnedCards) ? raw.kmPinnedCards : [],
      wishlist: Array.isArray(raw.kmWishlist) ? raw.kmWishlist : [],
      url: meta.url,
      loading: meta.loading,
      busy: bridge.isGamesRunActive(accountId),
      gamesTabOpen: meta.gamesTabOpen,
      needsLogin,
      lastError: meta.lastError
    };
  };

  const updater = new DesktopUpdater({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    areAccountsBusy: () => bridge.areAccountsBusy(),
    shouldAutoInstall: () => store.getConfig().autoInstallUpdates,
    onStatus: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('km:desktop:updater', status);
      }
    }
  });

  const buildPayload = (): DesktopStatePayload => ({
    appVersion: app.getVersion(),
    accounts: store.getAccounts().map((a) => buildSnapshot(a.id)).filter((s): s is AccountSnapshot => Boolean(s)),
    config: store.getConfig(),
    updater: updater.getStatus()
  });

  const syncLayout = () => {
    const cfg = store.getConfig();
    const sel = cfg.selectedAccountId ? store.getAccount(cfg.selectedAccountId) : store.getAccounts()[0];
    views.layoutViewport(sel?.id || null, sel?.mode || 'silent', currentBounds);
  };

  const pushStateNow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('km:desktop:state', buildPayload());
    }
    syncLayout();
  };

  const schedulePushState = () => {
    if (stateTimer) return;
    stateTimer = setTimeout(() => {
      stateTimer = null;
      pushStateNow();
    }, 120);
  };

  bridge.attachHooks({
    getTargetWebContents: (accId, role) => views.getTargetWebContents(accId, role),
    ensureGamesWebContents: (accId) => views.ensureGamesWebContents(accId),
    closeGamesView: (accId) => views.closeGamesView(accId),
    getAllAccountWebContents: (accId) => views.getAllAccountWebContents(accId),
    openKyaraUrlForAccount: (accId, url) => {
      const acc = store.getAccount(accId);
      if (acc && acc.mode === 'silent') store.updateAccount(accId, { mode: 'hybrid' });
      store.updateConfig({ selectedAccountId: accId });
      if (url) views.navigateAccount(accId, url);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      pushStateNow();
    },
    openExternalUrl: (url) => { if (/^https?:/i.test(url)) void shell.openExternal(url); },
    notify: (title, msg) => powerTray.showNotification(title, msg),
    onStateDirty: () => schedulePushState()
  });

  // Preload & Chrome shim IPC
  ipcMain.on('km:preload:get-context', (ev) => {
    const ctx = views.getContextByWebContentsId(ev.sender.id);
    ev.returnValue = ctx ? { ...ctx, extensionDir, version: app.getVersion() } : null;
  });
  ipcMain.handle('km:chrome:storage-get', (_e, p) => bridge.handleStorageGet(p.accountId, p.area, p.keys));
  ipcMain.handle('km:chrome:storage-set', (_e, p) => bridge.handleStorageSet(p.accountId, p.area, p.items));
  ipcMain.handle('km:chrome:storage-remove', (_e, p) => bridge.handleStorageRemove(p.accountId, p.area, p.keys));
  ipcMain.handle('km:chrome:runtime-send-message', (_e, p) => bridge.handleRuntimeMessage(p.accountId, p.role, p.message));
  ipcMain.on('km:chrome:runtime-reply', (_e, p) => bridge.resolveReply(p.reqId, p.response, p.error));
  ipcMain.handle('km:chrome:tabs-create', (_e, p) => bridge.handleTabsCreate(p.accountId, p.url));

  const patchSettings = (accId: string, patch: Record<string, any>) => {
    const cur = store.storageGet(accId, 'local', 'settings').settings || {};
    store.storageSet(accId, 'local', { settings: { ...cur, ...patch } });
  };

  // Desktop shell IPC
  ipcMain.handle('km:desktop:get-state', () => buildPayload());
  ipcMain.handle('km:desktop:create-account', (_e, p) => {
    const acc = store.createAccount(String(p?.name || ''));
    views.ensureAccountView(acc.id);
    pushStateNow();
    return acc;
  });
  ipcMain.handle('km:desktop:update-account', (_e, p: { id: string; patch: { name?: string; mode?: AccountMode } }) => {
    const prev = store.getAccount(p.id);
    const updated = store.updateAccount(p.id, p.patch || {});
    if (updated && prev && p.patch?.mode && p.patch.mode !== prev.mode) {
      if (p.patch.mode === 'manual') {
        const curMaster = Boolean(store.storageGet(p.id, 'local', 'settings').settings?.masterEnabled);
        store.storageSet(p.id, 'session', { kmPrevMasterEnabled: curMaster });
        patchSettings(p.id, { masterEnabled: false });
      } else if (prev.mode === 'manual') {
        const prevMaster = store.storageGet(p.id, 'session', 'kmPrevMasterEnabled').kmPrevMasterEnabled;
        if (typeof prevMaster === 'boolean') patchSettings(p.id, { masterEnabled: prevMaster });
      }
    }
    pushStateNow();
    return updated;
  });
  ipcMain.handle('km:desktop:delete-account', (_e, p) => {
    const ok = store.deleteAccount(String(p?.id || ''));
    if (ok) views.removeAccountViews(String(p.id));
    pushStateNow();
    return ok;
  });
  ipcMain.handle('km:desktop:select-account', (_e, p) => {
    store.updateConfig({ selectedAccountId: p.id });
    pushStateNow();
  });
  ipcMain.handle('km:desktop:update-config', (_e, p) => {
    const cfg = store.updateConfig(p?.patch || {});
    powerTray.setPreventSleep(cfg.preventSleep);
    pushStateNow();
    return cfg;
  });
  ipcMain.handle('km:desktop:patch-settings', (_e, p) => {
    patchSettings(p.accountId, p.patch || {});
    pushStateNow();
  });
  ipcMain.handle('km:desktop:account-command', (_e, p) => bridge.handleRuntimeMessage(p.accountId, 'shell', p.command));
  ipcMain.handle('km:desktop:navigate-account', (_e, p) => views.navigateAccount(p.accountId, p.url));
  ipcMain.handle('km:desktop:reload-account', (_e, p) => views.reloadAccount(p.accountId));
  ipcMain.handle('km:desktop:pause-all', () => {
    for (const a of store.getAccounts()) patchSettings(a.id, { masterEnabled: false });
    pushStateNow();
  });
  ipcMain.handle('km:desktop:resume-all', () => {
    for (const a of store.getAccounts()) {
      if (a.mode !== 'manual') patchSettings(a.id, { masterEnabled: true });
    }
    pushStateNow();
  });
  ipcMain.handle('km:desktop:set-viewport-bounds', (_e, bounds: ViewportBounds | null) => {
    currentBounds = bounds;
    syncLayout();
  });
  ipcMain.handle('km:desktop:check-updates', () => updater.checkNow());
  ipcMain.handle('km:desktop:install-update', () => updater.tryInstallWhenIdle());

  const iconFile = fs.existsSync(path.join(desktopRoot, 'resources', 'icon.png'))
    ? path.join(desktopRoot, 'resources', 'icon.png')
    : path.join(extensionDir, 'icons', 'icon-128.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1020,
    minHeight: 680,
    title: 'Kyara Manager Desktop',
    backgroundColor: '#0e0d12',
    icon: iconFile,
    webPreferences: {
      preload: path.join(preloadDir, 'shell-preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  views.attachWindow(mainWindow);
  for (const acc of store.getAccounts()) {
    views.ensureAccountView(acc.id);
  }
  powerTray.setPreventSleep(store.getConfig().preventSleep);
  powerTray.setupTray({
    iconPath: iconFile,
    getWindow: () => mainWindow,
    onPauseAll: () => { for (const a of store.getAccounts()) patchSettings(a.id, { masterEnabled: false }); pushStateNow(); },
    onResumeAll: () => { for (const a of store.getAccounts()) { if (a.mode !== 'manual') patchSettings(a.id, { masterEnabled: true }); } pushStateNow(); },
    onQuit: () => { isQuitting = true; app.quit(); }
  });

  mainWindow.on('close', (ev) => {
    if (!isQuitting && store.getConfig().minimizeToTray) {
      ev.preventDefault();
      mainWindow?.hide();
    }
  });

  await mainWindow.loadFile(rendererHtml);
  bridge.startScheduler();
  updater.start();
  pushStateNow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('before-quit', () => {
    isQuitting = true;
    updater.dispose();
    bridge.dispose();
    powerTray.dispose();
    views.disposeAll();
  });
}

void app.whenReady().then(boot);
app.on('window-all-closed', () => {
  if (isQuitting || process.platform !== 'darwin') app.quit();
});
