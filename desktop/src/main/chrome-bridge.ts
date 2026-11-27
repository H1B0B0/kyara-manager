import crypto from 'node:crypto';
import type { WebContents } from 'electron';
import type { AccountStore, StorageArea } from './accounts';

const GAMES_COOLDOWN_MS = 3 * 60 * 1000;

export function isArcadeDoneOrBlocked(arcade: any): boolean {
  if (!arcade) return false;
  if (arcade.discordBlocked || arcade.limitReached || arcade.dailyLimitReached) return true;
  const dayCap = Number(arcade.dayCap || 60);
  const weekCap = Number(arcade.weekCap || 300);
  const today = Number(arcade.today || 0);
  const week = Number(arcade.week || 0);
  return (dayCap > 0 && today >= dayCap) || (weekCap > 0 && week >= weekCap);
}

/** Pure stagger offset helper so N active accounts space out API cycles rather than bursting simultaneously. */
export function computeStaggerOffsetMs(accountIndex: number, totalActive: number, intervalMs: number): number {
  if (totalActive <= 1 || accountIndex <= 0) return 0;
  return Math.round((accountIndex % totalActive) * (intervalMs / totalActive));
}

export interface BridgeHooks {
  getTargetWebContents: (accountId: string, role: 'kyara' | 'games') => WebContents | undefined;
  ensureGamesWebContents: (accountId: string) => Promise<WebContents>;
  closeGamesView: (accountId: string) => void;
  getAllAccountWebContents: (accountId: string) => WebContents[];
  openKyaraUrlForAccount: (accountId: string, url?: string) => void;
  openExternalUrl: (url: string) => void;
  notify: (title: string, message: string) => void;
  onStateDirty: () => void;
}

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class ChromeBridge {
  private pending = new Map<string, PendingRpc>();
  private lastCycleSentAt = new Map<string, number>();
  private lastGamesSentAt = new Map<string, number>();
  private activeGamesRuns = new Map<string, Promise<any>>();
  private gamesActiveCounts = new Map<string, number>();
  private schedulerTimer: NodeJS.Timeout | null = null;
  private hooks!: BridgeHooks;

  constructor(private readonly store: AccountStore) {}

  attachHooks(hooks: BridgeHooks): void {
    this.hooks = hooks;
    this.store.onStorageChanged((accountId, area, changes) => {
      for (const wc of this.hooks.getAllAccountWebContents(accountId)) {
        if (!wc.isDestroyed()) {
          wc.send('km:chrome:storage-changed', { accountId, area, changes });
        }
      }
      if ('settings' in changes) {
        const nextSettings = changes.settings?.newValue;
        if (nextSettings && (!nextSettings.masterEnabled || nextSettings.autoGamesEnabled === false || nextSettings.autoGamesDedicatedTab === false)) {
          if (!this.isGamesRunActive(accountId)) {
            this.hooks.closeGamesView(accountId);
          }
        }
      }
      this.hooks.onStateDirty();
    });
  }

  isGamesRunActive(accountId: string): boolean {
    return (this.gamesActiveCounts.get(accountId) || 0) > 0 || this.activeGamesRuns.has(accountId);
  }

  handleStorageGet(accountId: string, area: StorageArea, keys: any): Record<string, any> {
    return this.store.storageGet(accountId, area, keys);
  }

  handleStorageSet(accountId: string, area: StorageArea, items: Record<string, any>): void {
    this.store.storageSet(accountId, area, items);
  }

  handleStorageRemove(accountId: string, area: StorageArea, keys: string | string[]): void {
    this.store.storageRemove(accountId, area, keys);
  }

  resolveReply(reqId: string, response?: any, error?: string): void {
    const entry = this.pending.get(reqId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(reqId);
    if (error) entry.reject(new Error(error));
    else entry.resolve(response);
  }

  sendToAccountRole(accountId: string, role: 'kyara' | 'games', message: any, timeoutMs = 120_000): Promise<any> {
    const wc = this.hooks.getTargetWebContents(accountId, role);
    if (!wc || wc.isDestroyed()) {
      return Promise.reject(new Error(`Vue ${role} indisponible pour ce compte.`));
    }
    return this.sendToWebContents(accountId, wc, message, timeoutMs);
  }

  private sendToWebContents(accountId: string, wc: WebContents, message: any, timeoutMs = 120_000): Promise<any> {
    if (wc.isDestroyed()) return Promise.reject(new Error('WebContents détruit.'));
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Délai dépassé sur la commande Kyara.'));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      wc.send('km:chrome:deliver-message', { reqId, accountId, message });
    });
  }

  async runDedicatedGamesFarm(accountId: string, message: Record<string, any>): Promise<any> {
    const prev = this.activeGamesRuns.get(accountId) || Promise.resolve();
    const nextCount = (this.gamesActiveCounts.get(accountId) || 0) + 1;
    this.gamesActiveCounts.set(accountId, nextCount);

    const exec = async () => {
      const wc = await this.hooks.ensureGamesWebContents(accountId);
      const res = await this.sendToWebContents(accountId, wc, message, 240_000);
      this.lastGamesSentAt.set(accountId, Date.now());
      if (isArcadeDoneOrBlocked(res?.arcade) || res?.blocked) {
        if ((this.gamesActiveCounts.get(accountId) || 0) <= 1) {
          this.hooks.closeGamesView(accountId);
        }
      }
      return res;
    };

    const runPromise = prev.catch(() => undefined).then(exec);
    this.activeGamesRuns.set(accountId, runPromise);
    try {
      return await runPromise;
    } finally {
      const remaining = Math.max(0, (this.gamesActiveCounts.get(accountId) || 1) - 1);
      this.gamesActiveCounts.set(accountId, remaining);
      if (remaining === 0 && this.activeGamesRuns.get(accountId) === runPromise) {
        this.activeGamesRuns.delete(accountId);
      }
      this.hooks.onStateDirty();
    }
  }

  async handleRuntimeMessage(accountId: string, _senderRole: string, message: any): Promise<any> {
    if (!message || typeof message !== 'object') return { ok: false };
    if (message.type === 'km:notify') {
      this.hooks.notify(String(message.title || 'Kyara Manager'), String(message.message || ''));
      return { ok: true };
    }
    if (message.type === 'km:open-kyara-tab') {
      this.hooks.openKyaraUrlForAccount(accountId);
      return { ok: true };
    }
    if (message.type === 'km:cmd:run-games-farm') {
      const stored = this.store.storageGet(accountId, 'local', 'settings');
      const useDedicated = stored.settings?.autoGamesDedicatedTab !== false;
      if (!useDedicated) {
        return this.sendToAccountRole(accountId, 'kyara', message, 240_000);
      }
      return this.runDedicatedGamesFarm(accountId, message);
    }
    if (message.type === 'km:cmd:close-games-tab') {
      this.hooks.closeGamesView(accountId);
      return { ok: true };
    }
    if (message.type === 'km:update-check' || message.type === 'km:update-dismiss' || message.type === 'km:update-open-store') {
      return { ok: true };
    }
    return this.sendToAccountRole(accountId, 'kyara', message);
  }

  handleTabsCreate(accountId: string, url?: string): { ok: boolean } {
    if (!url) return { ok: false };
    if (url.startsWith('https://kyara.games/')) {
      this.hooks.openKyaraUrlForAccount(accountId, url);
    } else {
      this.hooks.openExternalUrl(url);
    }
    return { ok: true };
  }

  async areAccountsBusy(): Promise<boolean> {
    for (const acc of this.store.getAccounts()) {
      if (this.isGamesRunActive(acc.id)) return true;
      const wc = this.hooks.getTargetWebContents(acc.id, 'kyara');
      if (wc && !wc.isDestroyed()) {
        try {
          const res = await this.sendToWebContents(acc.id, wc, { type: 'km:prepare-update' }, 2500);
          if (res?.busy) return true;
        } catch {}
      }
    }
    return false;
  }

  startScheduler(): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => void this.tickScheduler(), 15_000);
  }

  private async tickScheduler(): Promise<void> {
    const accounts = this.store.getAccounts();
    const active = accounts.filter((a) => {
      if (a.mode === 'manual') return false;
      const { settings } = this.store.storageGet(a.id, 'local', 'settings');
      return Boolean(settings?.masterEnabled);
    });
    const now = Date.now();
    for (let i = 0; i < active.length; i += 1) {
      const acc = active[i];
      const { settings, kmDashboard } = this.store.storageGet(acc.id, 'local', ['settings', 'kmDashboard']);
      const cycleInterval = Math.max(20, Number(settings?.loopIntervalSec || 45)) * 1000;
      const stagger = computeStaggerOffsetMs(i, active.length, Math.min(cycleInterval, 15_000));
      const lastCycle = this.lastCycleSentAt.get(acc.id) || 0;
      if (now - lastCycle >= cycleInterval + stagger) {
        this.lastCycleSentAt.set(acc.id, now);
        void this.sendToAccountRole(acc.id, 'kyara', { type: 'km:alarm-tick' }).catch(() => {});
      }

      const gamesEnabled = settings?.autoGamesEnabled !== false && settings?.autoGamesDedicatedTab !== false;
      const arcade = kmDashboard?.arcade;
      if (!gamesEnabled || isArcadeDoneOrBlocked(arcade)) {
        if (!this.isGamesRunActive(acc.id)) this.hooks.closeGamesView(acc.id);
        continue;
      }
      const lastGames = this.lastGamesSentAt.get(acc.id) || 0;
      const gamesStagger = computeStaggerOffsetMs(i, active.length, 30_000);
      if (!this.isGamesRunActive(acc.id) && now - lastGames >= GAMES_COOLDOWN_MS + gamesStagger) {
        this.lastGamesSentAt.set(acc.id, now);
        void this.runDedicatedGamesFarm(acc.id, { type: 'km:cmd:run-games-farm', manual: false }).catch(() => {});
      }
    }
  }

  dispose(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Application fermée.'));
    }
    this.pending.clear();
  }
}
