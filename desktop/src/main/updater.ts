import updaterPkg from 'electron-updater';
import type { UpdaterStatus } from '../shared/types';

const { autoUpdater } = updaterPkg;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const BUSY_RETRY_MS = 10 * 1000;

export interface UpdaterDeps {
  currentVersion: string;
  isPackaged: boolean;
  areAccountsBusy: () => Promise<boolean>;
  shouldAutoInstall: () => boolean;
  onStatus: (status: UpdaterStatus) => void;
}

/** GitHub Releases auto-updater that waits until every account finishes its active transaction. */
export class DesktopUpdater {
  private status: UpdaterStatus;
  private timer: NodeJS.Timeout | null = null;
  private installRetryTimer: NodeJS.Timeout | null = null;
  private listenersReady = false;

  constructor(private readonly deps: UpdaterDeps) {
    this.status = { status: 'idle', currentVersion: deps.currentVersion };
  }

  getStatus(): UpdaterStatus {
    return { ...this.status };
  }

  private setStatus(next: Partial<UpdaterStatus>): void {
    this.status = { ...this.status, ...next, currentVersion: this.deps.currentVersion };
    this.deps.onStatus(this.getStatus());
  }

  start(): void {
    if (!this.listenersReady) {
      this.listenersReady = true;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('checking-for-update', () => {
        this.setStatus({ status: 'checking', message: 'Vérification des mises à jour GitHub…', lastCheckedAt: Date.now() });
      });
      autoUpdater.on('update-available', (info) => {
        this.setStatus({
          status: 'available',
          availableVersion: info?.version,
          message: `Nouvelle version v${info?.version || ''} détectée — téléchargement…`
        });
      });
      autoUpdater.on('download-progress', (p) => {
        this.setStatus({
          status: 'downloading',
          progressPct: Math.round(Number(p?.percent || 0)),
          message: `Téléchargement : ${Math.round(Number(p?.percent || 0))}%`
        });
      });
      autoUpdater.on('update-not-available', () => {
        this.setStatus({
          status: 'idle',
          availableVersion: undefined,
          progressPct: undefined,
          message: 'Application à jour.',
          lastCheckedAt: Date.now()
        });
      });
      autoUpdater.on('update-downloaded', (info) => {
        this.setStatus({
          status: 'downloaded',
          availableVersion: info?.version || this.status.availableVersion,
          progressPct: 100,
          message: `Mise à jour v${info?.version || ''} prête — installation dès la fin des cycles en cours…`
        });
        if (this.deps.shouldAutoInstall()) {
          void this.tryInstallWhenIdle();
        }
      });
      autoUpdater.on('error', (err) => {
        this.setStatus({
          status: 'error',
          message: err?.message ? String(err.message) : 'Erreur lors de la vérification de mise à jour'
        });
      });
    }

    if (this.deps.isPackaged) {
      void this.checkNow();
      if (!this.timer) {
        this.timer = setInterval(() => void this.checkNow(), CHECK_INTERVAL_MS);
      }
    }
  }

  async checkNow(): Promise<UpdaterStatus> {
    if (!this.deps.isPackaged) {
      this.setStatus({
        status: 'idle',
        message: 'Mode développement local (auto-update actif sur build packagé GitHub Releases).',
        lastCheckedAt: Date.now()
      });
      return this.getStatus();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      this.setStatus({ status: 'error', message: err?.message || 'Impossible de contacter GitHub Releases.' });
    }
    return this.getStatus();
  }

  async tryInstallWhenIdle(): Promise<boolean> {
    if (this.installRetryTimer) {
      clearTimeout(this.installRetryTimer);
      this.installRetryTimer = null;
    }
    if (this.status.status !== 'downloaded' && this.status.status !== 'waiting') return false;
    const busy = await this.deps.areAccountsBusy().catch(() => true);
    if (busy) {
      this.setStatus({
        status: 'waiting',
        message: `Mise à jour v${this.status.availableVersion || ''} prête — attente fin d'opération…`
      });
      this.installRetryTimer = setTimeout(() => void this.tryInstallWhenIdle(), BUSY_RETRY_MS);
      return false;
    }
    if (this.deps.isPackaged) {
      autoUpdater.quitAndInstall(true, true);
    }
    return true;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.installRetryTimer) clearTimeout(this.installRetryTimer);
    this.timer = null;
    this.installRetryTimer = null;
  }
}
