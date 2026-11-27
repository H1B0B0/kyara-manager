import { contextBridge, ipcRenderer } from 'electron';
import type { AccountMode, DesktopConfig, DesktopStatePayload, UpdaterStatus, ViewportBounds } from '../shared/types';

export const kyaraDesktopApi = {
  getState: (): Promise<DesktopStatePayload> => ipcRenderer.invoke('km:desktop:get-state'),
  createAccount: (name: string) => ipcRenderer.invoke('km:desktop:create-account', { name }),
  updateAccount: (id: string, patch: { name?: string; mode?: AccountMode }) =>
    ipcRenderer.invoke('km:desktop:update-account', { id, patch }),
  deleteAccount: (id: string) => ipcRenderer.invoke('km:desktop:delete-account', { id }),
  selectAccount: (id: string) => ipcRenderer.invoke('km:desktop:select-account', { id }),
  updateConfig: (patch: Partial<DesktopConfig>) => ipcRenderer.invoke('km:desktop:update-config', { patch }),
  patchAccountSettings: (accountId: string, patch: Record<string, any>) =>
    ipcRenderer.invoke('km:desktop:patch-settings', { accountId, patch }),
  sendAccountCommand: (accountId: string, command: Record<string, any>) =>
    ipcRenderer.invoke('km:desktop:account-command', { accountId, command }),
  navigateAccount: (accountId: string, url: string) =>
    ipcRenderer.invoke('km:desktop:navigate-account', { accountId, url }),
  reloadAccount: (accountId: string) =>
    ipcRenderer.invoke('km:desktop:reload-account', { accountId }),
  pauseAllAccounts: () => ipcRenderer.invoke('km:desktop:pause-all'),
  resumeAllAccounts: () => ipcRenderer.invoke('km:desktop:resume-all'),
  setViewportBounds: (bounds: ViewportBounds | null) =>
    ipcRenderer.invoke('km:desktop:set-viewport-bounds', bounds),
  checkUpdates: (): Promise<UpdaterStatus> => ipcRenderer.invoke('km:desktop:check-updates'),
  installUpdateNow: () => ipcRenderer.invoke('km:desktop:install-update'),
  onStateChanged: (cb: (payload: DesktopStatePayload) => void) => {
    const fn = (_ev: any, payload: DesktopStatePayload) => cb(payload);
    ipcRenderer.on('km:desktop:state', fn);
    return () => ipcRenderer.removeListener('km:desktop:state', fn);
  },
  onUpdaterChanged: (cb: (status: UpdaterStatus) => void) => {
    const fn = (_ev: any, status: UpdaterStatus) => cb(status);
    ipcRenderer.on('km:desktop:updater', fn);
    return () => ipcRenderer.removeListener('km:desktop:updater', fn);
  }
};

contextBridge.exposeInMainWorld('kyaraDesktop', kyaraDesktopApi);
