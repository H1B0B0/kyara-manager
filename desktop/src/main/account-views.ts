import fs from 'node:fs';
import path from 'node:path';
import { WebContentsView, type BrowserWindow, type WebContents } from 'electron';
import type { AccountMode, ViewportBounds } from '../shared/types';

export interface ViewContextInfo {
  accountId: string;
  role: 'kyara' | 'games' | 'cockpit';
}

interface AccountViewBundle {
  accountId: string;
  mainView: WebContentsView;
  gamesView: WebContentsView | null;
  url: string;
  loading: boolean;
  lastError: string | null;
}

const KYARA_HOME = 'https://kyara.games/';
const KYARA_GAMES = 'https://kyara.games/jouer';
const COCKPIT_WIDTH = 390;

export class AccountViewsManager {
  private bundles = new Map<string, AccountViewBundle>();
  private contextByWcId = new Map<number, ViewContextInfo>();
  private cockpitView: WebContentsView | null = null;
  private cockpitAccountId: string | null = null;
  private win: BrowserWindow | null = null;
  private cachedAssets: { pageHook: string; contentCss: string; inPageCss: string } | null = null;

  constructor(
    private readonly extensionDir: string,
    private readonly kyaraPreloadPath: string,
    private readonly cockpitPreloadPath: string,
    private readonly onOpenExternal: (url: string) => void,
    private readonly onViewUpdated: () => void
  ) {}

  attachWindow(win: BrowserWindow): void {
    this.win = win;
    for (const bundle of this.bundles.values()) {
      this.ensureAttachedHidden(bundle.mainView);
      if (bundle.gamesView) this.ensureAttachedHidden(bundle.gamesView);
    }
    if (this.cockpitView) this.ensureAttachedHidden(this.cockpitView);
  }

  private ensureAttachedHidden(view: WebContentsView): void {
    if (!this.win || this.win.isDestroyed()) return;
    const children = this.win.contentView.children;
    if (!children.includes(view)) {
      this.win.contentView.addChildView(view);
      view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
      view.setVisible(false);
    }
  }

  private readAssets() {
    if (this.cachedAssets) return this.cachedAssets;
    const readOrEmpty = (rel: string) => {
      const p = path.join(this.extensionDir, rel);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    };
    this.cachedAssets = {
      pageHook: readOrEmpty('content/page-hook.js'),
      contentCss: readOrEmpty('content/content.css'),
      inPageCss: readOrEmpty('content/in-page.css')
    };
    return this.cachedAssets;
  }

  getContextByWebContentsId(wcId: number): ViewContextInfo | undefined {
    return this.contextByWcId.get(wcId);
  }

  ensureAccountView(accountId: string): AccountViewBundle {
    const existing = this.bundles.get(accountId);
    if (existing && !existing.mainView.webContents.isDestroyed()) return existing;

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:kyara-acc-${accountId}`,
        preload: this.kyaraPreloadPath,
        contextIsolation: true,
        sandbox: false,
        nodeIntegrationInSubFrames: true,
        backgroundThrottling: false
      }
    });

    const bundle: AccountViewBundle = {
      accountId,
      mainView: view,
      gamesView: null,
      url: KYARA_HOME,
      loading: true,
      lastError: null
    };
    this.bundles.set(accountId, bundle);
    this.registerKyaraWebContents(accountId, 'kyara', view.webContents, (patch) => {
      Object.assign(bundle, patch);
      this.onViewUpdated();
    });
    this.ensureAttachedHidden(view);
    void view.webContents.loadURL(KYARA_HOME).catch(() => {});
    return bundle;
  }

  private registerKyaraWebContents(
    accountId: string,
    role: 'kyara' | 'games',
    wc: WebContents,
    onPatch: (patch: Partial<AccountViewBundle>) => void
  ): void {
    const wcId = wc.id;
    this.contextByWcId.set(wcId, { accountId, role });
    wc.setAudioMuted(role === 'games');
    wc.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://kyara.games/')) {
        void wc.loadURL(url).catch(() => {});
      } else if (/^https?:/i.test(url)) {
        this.onOpenExternal(url);
      }
      return { action: 'deny' };
    });

    wc.on('did-start-loading', () => onPatch({ loading: true, lastError: null }));
    wc.on('did-stop-loading', () => onPatch({ loading: false, url: wc.getURL() || KYARA_HOME }));
    wc.on('did-navigate', (_e, url) => onPatch({ url }));
    wc.on('did-navigate-in-page', (_e, url) => onPatch({ url }));
    wc.on('did-fail-load', (_e, errorCode, errorDesc, validatedUrl) => {
      if (errorCode === -3) return;
      onPatch({ loading: false, lastError: `${validatedUrl || 'Kyara'}: ${errorDesc || errorCode}` });
    });
    wc.on('dom-ready', () => {
      const url = wc.getURL() || '';
      if (!url.startsWith('https://kyara.games/')) return;
      const assets = this.readAssets();
      if (assets.contentCss) void wc.insertCSS(assets.contentCss).catch(() => {});
      if (assets.inPageCss) void wc.insertCSS(assets.inPageCss).catch(() => {});
      if (assets.pageHook) void wc.executeJavaScript(assets.pageHook).catch(() => {});
    });
    wc.on('destroyed', () => {
      this.contextByWcId.delete(wcId);
    });
  }

  async ensureGamesWebContents(accountId: string): Promise<WebContents> {
    const bundle = this.ensureAccountView(accountId);
    if (bundle.gamesView && !bundle.gamesView.webContents.isDestroyed()) {
      return bundle.gamesView.webContents;
    }
    const gv = new WebContentsView({
      webPreferences: {
        partition: `persist:kyara-acc-${accountId}`,
        preload: this.kyaraPreloadPath,
        contextIsolation: true,
        sandbox: false,
        nodeIntegrationInSubFrames: true,
        backgroundThrottling: false
      }
    });
    bundle.gamesView = gv;
    this.registerKyaraWebContents(accountId, 'games', gv.webContents, () => this.onViewUpdated());
    this.ensureAttachedHidden(gv);
    await gv.webContents.loadURL(KYARA_GAMES);
    this.onViewUpdated();
    return gv.webContents;
  }

  closeGamesView(accountId: string): void {
    const bundle = this.bundles.get(accountId);
    if (!bundle?.gamesView) return;
    const gv = bundle.gamesView;
    bundle.gamesView = null;
    if (this.win && !this.win.isDestroyed()) {
      try { this.win.contentView.removeChildView(gv); } catch {}
    }
    try { gv.webContents.close(); } catch {}
    this.onViewUpdated();
  }

  hasGamesView(accountId: string): boolean {
    const bundle = this.bundles.get(accountId);
    return Boolean(bundle?.gamesView && !bundle.gamesView.webContents.isDestroyed());
  }

  private ensureCockpitView(accountId: string): WebContentsView {
    if (this.cockpitView && !this.cockpitView.webContents.isDestroyed()) {
      if (this.cockpitAccountId !== accountId) {
        this.cockpitAccountId = accountId;
        this.contextByWcId.set(this.cockpitView.webContents.id, { accountId, role: 'cockpit' });
        void this.cockpitView.webContents.loadURL(`km-ext://bundle/sidepanel/index.html?acc=${encodeURIComponent(accountId)}`).catch(() => {});
      }
      return this.cockpitView;
    }
    const cv = new WebContentsView({
      webPreferences: {
        preload: this.cockpitPreloadPath,
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: false
      }
    });
    const wcId = cv.webContents.id;
    this.cockpitView = cv;
    this.cockpitAccountId = accountId;
    this.contextByWcId.set(wcId, { accountId, role: 'cockpit' });
    cv.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.onOpenExternal(url);
      return { action: 'deny' };
    });
    cv.webContents.on('destroyed', () => this.contextByWcId.delete(wcId));
    this.ensureAttachedHidden(cv);
    void cv.webContents.loadURL(`km-ext://bundle/sidepanel/index.html?acc=${encodeURIComponent(accountId)}`).catch(() => {});
    return cv;
  }

  layoutViewport(selectedAccountId: string | null, mode: AccountMode, bounds: ViewportBounds | null): void {
    const showLive = Boolean(bounds && bounds.width > 120 && bounds.height > 120 && selectedAccountId && mode !== 'silent');
    for (const [accId, bundle] of this.bundles.entries()) {
      const isSelected = showLive && accId === selectedAccountId;
      if (!isSelected) {
        bundle.mainView.setVisible(false);
        continue;
      }
      const cockpitW = mode === 'hybrid' && bounds!.width >= 820 ? COCKPIT_WIDTH : 0;
      const kyaraW = Math.max(300, Math.round(bounds!.width - cockpitW));
      bundle.mainView.setBounds({
        x: Math.round(bounds!.x),
        y: Math.round(bounds!.y),
        width: kyaraW,
        height: Math.round(bounds!.height)
      });
      bundle.mainView.setVisible(true);
    }

    if (showLive && mode === 'hybrid' && selectedAccountId && bounds!.width >= 820) {
      const cv = this.ensureCockpitView(selectedAccountId);
      const kyaraW = Math.max(300, Math.round(bounds!.width - COCKPIT_WIDTH));
      cv.setBounds({
        x: Math.round(bounds!.x + kyaraW),
        y: Math.round(bounds!.y),
        width: Math.round(bounds!.width - kyaraW),
        height: Math.round(bounds!.height)
      });
      cv.setVisible(true);
    } else if (this.cockpitView && !this.cockpitView.webContents.isDestroyed()) {
      this.cockpitView.setVisible(false);
    }
  }

  getTargetWebContents(accountId: string, role: 'kyara' | 'games'): WebContents | undefined {
    const bundle = this.ensureAccountView(accountId);
    if (role === 'games') return bundle.gamesView?.webContents;
    return bundle.mainView.webContents;
  }

  getAllAccountWebContents(accountId: string): WebContents[] {
    const list: WebContents[] = [];
    const bundle = this.bundles.get(accountId);
    if (bundle?.mainView && !bundle.mainView.webContents.isDestroyed()) list.push(bundle.mainView.webContents);
    if (bundle?.gamesView && !bundle.gamesView.webContents.isDestroyed()) list.push(bundle.gamesView.webContents);
    if (this.cockpitView && !this.cockpitView.webContents.isDestroyed() && this.cockpitAccountId === accountId) {
      list.push(this.cockpitView.webContents);
    }
    return list;
  }

  getViewMeta(accountId: string): { url: string; loading: boolean; gamesTabOpen: boolean; lastError: string | null } {
    const b = this.bundles.get(accountId);
    return {
      url: b?.url || KYARA_HOME,
      loading: b?.loading ?? true,
      gamesTabOpen: Boolean(b?.gamesView && !b.gamesView.webContents.isDestroyed()),
      lastError: b?.lastError ?? null
    };
  }

  navigateAccount(accountId: string, url: string): void {
    const bundle = this.ensureAccountView(accountId);
    const target = url.startsWith('https://kyara.games/') ? url : KYARA_HOME;
    void bundle.mainView.webContents.loadURL(target).catch(() => {});
  }

  reloadAccount(accountId: string): void {
    const bundle = this.ensureAccountView(accountId);
    bundle.mainView.webContents.reload();
  }

  removeAccountViews(accountId: string): void {
    this.closeGamesView(accountId);
    const bundle = this.bundles.get(accountId);
    if (!bundle) return;
    this.bundles.delete(accountId);
    if (this.win && !this.win.isDestroyed()) {
      try { this.win.contentView.removeChildView(bundle.mainView); } catch {}
    }
    try { bundle.mainView.webContents.close(); } catch {}
  }

  disposeAll(): void {
    for (const accId of Array.from(this.bundles.keys())) {
      this.removeAccountViews(accId);
    }
    if (this.cockpitView) {
      try { this.cockpitView.webContents.close(); } catch {}
      this.cockpitView = null;
    }
  }
}
