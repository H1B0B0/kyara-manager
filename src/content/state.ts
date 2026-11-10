import { KyaraSettings, DEFAULT_SETTINGS, normalizeSettings } from '../types/settings';
import { ActiveListingInfo, PullEventDetail } from './types';
import { setLanguage } from '../lib/i18n';

export const state = {
  currentSettings: { ...DEFAULT_SETTINGS } as KyaraSettings,
  isCycleRunning: false,
  isOperationRunning: false,
  updatePending: false,
  disposed: false,
  isLiveOpening: false,
  /** Set by scheduled cycles only: lets long loops stop as soon as the user turns the autopilot off. */
  abortWhenMasterOff: false,
  loopTimer: null as any,
  previousActiveListings: new Map<string, ActiveListingInfo>(),
  lastPullEvents: [] as PullEventDetail[]
};

export async function loadSettings(): Promise<KyaraSettings> {
  try {
    const { settings } = (await chrome.storage.local.get('settings')) as { settings?: Partial<KyaraSettings> };
    state.currentSettings = normalizeSettings(settings);
    setLanguage(state.currentSettings.language || 'auto');
    if (!settings) {
      await chrome.storage.local.set({ settings: state.currentSettings });
    }
  } catch {
    state.currentSettings = { ...DEFAULT_SETTINGS, masterEnabled: false, dryRun: true };
  }
  return state.currentSettings;
}

export function restartLoopTimer(onTick: () => void): void {
  if (state.loopTimer) clearInterval(state.loopTimer);
  const intervalMs = Math.max(20, Number(state.currentSettings.loopIntervalSec || 45)) * 1000;
  state.loopTimer = setInterval(() => {
    if (!chrome.runtime?.id) {
      clearInterval(state.loopTimer);
      return;
    }
    if (state.currentSettings.masterEnabled && !state.updatePending) {
      onTick();
    }
  }, intervalMs);
}
