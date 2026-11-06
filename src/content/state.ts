import { KyaraSettings, DEFAULT_SETTINGS } from '../types/settings';
import { ActiveListingInfo, PullEventDetail } from './types';
import { setLanguage } from '../lib/i18n';

export const state = {
  currentSettings: { ...DEFAULT_SETTINGS } as KyaraSettings,
  isCycleRunning: false,
  isLiveOpening: false,
  loopTimer: null as any,
  previousActiveListings: new Map<string, ActiveListingInfo>(),
  lastPullEvents: [] as PullEventDetail[]
};

export async function loadSettings(): Promise<KyaraSettings> {
  try {
    const { settings } = (await chrome.storage.local.get('settings')) as { settings?: Partial<KyaraSettings> };
    state.currentSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    setLanguage(state.currentSettings.language || 'auto');
    if (!settings) {
      await chrome.storage.local.set({ settings: state.currentSettings });
    }
  } catch {
    state.currentSettings = { ...DEFAULT_SETTINGS };
  }
  return state.currentSettings;
}

export function restartLoopTimer(onTick: () => void): void {
  if (state.loopTimer) clearInterval(state.loopTimer);
  const intervalMs = Math.max(20, Number(state.currentSettings.loopIntervalSec || 45)) * 1000;
  state.loopTimer = setInterval(() => {
    if (state.currentSettings.masterEnabled) {
      onTick();
    }
  }, intervalMs);
}
