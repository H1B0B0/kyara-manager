import { Notification, powerSaveBlocker, Tray, Menu, nativeImage, type BrowserWindow } from 'electron';

export class PowerAndTrayManager {
  private blockerId: number | null = null;
  private tray: Tray | null = null;
  private preventSleep = true;

  setPreventSleep(enabled: boolean): boolean {
    this.preventSleep = Boolean(enabled);
    if (this.preventSleep) {
      if (this.blockerId === null || !powerSaveBlocker.isStarted(this.blockerId)) {
        this.blockerId = powerSaveBlocker.start('prevent-app-suspension');
      }
    } else if (this.blockerId !== null) {
      if (powerSaveBlocker.isStarted(this.blockerId)) {
        powerSaveBlocker.stop(this.blockerId);
      }
      this.blockerId = null;
    }
    return this.isPreventSleepActive();
  }

  isPreventSleepActive(): boolean {
    return this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId);
  }

  setupTray(opts: {
    iconPath: string;
    getWindow: () => BrowserWindow | null;
    onPauseAll: () => void;
    onResumeAll: () => void;
    onQuit: () => void;
  }): void {
    if (this.tray) return;
    let icon = nativeImage.createFromPath(opts.iconPath);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 18, height: 18 });
    }
    this.tray = new Tray(icon);
    this.tray.setToolTip('Kyara Manager Desktop');
    const menu = Menu.buildFromTemplate([
      {
        label: 'Afficher Kyara Manager Desktop',
        click: () => {
          const win = opts.getWindow();
          if (win) {
            win.show();
            win.focus();
          }
        }
      },
      { type: 'separator' },
      { label: 'Reprendre tous les comptes', click: () => opts.onResumeAll() },
      { label: 'Mettre tous les comptes en pause', click: () => opts.onPauseAll() },
      { type: 'separator' },
      { label: 'Quitter complètement', click: () => opts.onQuit() }
    ]);
    this.tray.setContextMenu(menu);
    this.tray.on('double-click', () => {
      const win = opts.getWindow();
      if (win) {
        win.show();
        win.focus();
      }
    });
  }

  showNotification(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body, silent: true }).show();
      }
    } catch {}
  }

  dispose(): void {
    this.setPreventSleep(false);
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
