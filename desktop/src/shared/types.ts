export type AccountMode = 'silent' | 'hybrid' | 'manual';

export interface KyaraAccount {
  id: string;
  name: string;
  mode: AccountMode;
  createdAt: number;
}

export interface AccountSnapshot {
  account: KyaraAccount;
  settings: Record<string, any>;
  dashboard: Record<string, any> | null;
  bestPulls: any[];
  journal: any[];
  cumulativeStats: Record<string, any> | null;
  pinnedCards: number[];
  wishlist: any[];
  url: string;
  loading: boolean;
  busy: boolean;
  gamesTabOpen: boolean;
  needsLogin: boolean;
  lastError?: string | null;
}

export interface DesktopConfig {
  preventSleep: boolean;
  minimizeToTray: boolean;
  autoInstallUpdates: boolean;
  selectedAccountId: string | null;
}

export interface UpdaterStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'waiting' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion?: string;
  progressPct?: number;
  message?: string;
  lastCheckedAt?: number;
}

export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopStatePayload {
  appVersion: string;
  accounts: AccountSnapshot[];
  config: DesktopConfig;
  updater: UpdaterStatus;
}
