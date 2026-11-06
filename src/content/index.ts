import { state, loadSettings, restartLoopTimer } from './state';
import { mountFloatingHud, updateFloatingHud } from './hud';
import { setupAntiAfkObserver } from './automation/anti-afk';
import { runAutomationCycle } from './automation/cycle';
import { refreshDashboardSnapshot } from './snapshot';
import { setupMessageListener } from './messages';
import { recordBestPulls } from './journal';
import { normalizeSettings } from '../types/settings';
import { setLanguage } from '../lib/i18n';

function initKyaraManager(): void {
  const version = chrome.runtime.getManifest().version;
  const host = globalThis as typeof globalThis & { __kyaraManagerRuntime?: { version: string; dispose: () => void } };
  host.__kyaraManagerRuntime?.dispose();
  let disposed = false;
  const cleanups: Array<() => void> = [];
  host.__kyaraManagerRuntime = {
    version,
    dispose: () => {
      disposed = true;
      state.disposed = true;
      state.updatePending = true;
      clearInterval(state.loopTimer);
      cleanups.forEach((cleanup) => cleanup());
      document.getElementById('km-floating-hud')?.remove();
    }
  };

  // Listen to native Kyara pull events
  const onPull = (event: any) => {
    if (event?.detail) {
      state.lastPullEvents.push({ at: Date.now(), detail: event.detail });
      if (state.lastPullEvents.length > 20) state.lastPullEvents.shift();
      const cards = event.detail.cards || event.detail.results?.flatMap((r: any) => r.cards || []) || [];
      if (cards.length > 0 && !state.isLiveOpening) {
        recordBestPulls(cards, 'Booster Live').catch(() => {});
      }
    }
  };
  window.addEventListener('kyara:pull', onPull);
  cleanups.push(() => window.removeEventListener('kyara:pull', onPull));

  // Setup message listener for sidepanel commands
  cleanups.push(setupMessageListener());

  // Storage listener for settings synchronization
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && changes.settings?.newValue) {
      state.currentSettings = normalizeSettings(changes.settings.newValue);
      setLanguage(state.currentSettings.language);
      updateFloatingHud();
      restartLoopTimer(() => runAutomationCycle({ manual: false }));
    }
  };
  chrome.storage.onChanged.addListener(onStorage);
  cleanups.push(() => chrome.storage.onChanged.removeListener(onStorage));

  // Boot sequence
  (async () => {
    await loadSettings();
    if (disposed) return;
    mountFloatingHud();
    cleanups.push(setupAntiAfkObserver());
    restartLoopTimer(() => runAutomationCycle({ manual: false }));
    const dashboard = await refreshDashboardSnapshot({
      forcePrices: false,
      scanMarketDeals: Boolean(state.currentSettings.autoBuyFlipEnabled || state.currentSettings.autoBuyMissingEnabled || state.currentSettings.wishlistAutoBuyEnabled)
    }).catch(() => null);
    if (!disposed && state.currentSettings.masterEnabled && dashboard?.authenticated) {
      void runAutomationCycle({ manual: false });
    }
  })().catch((err) => console.warn('[Kyara Manager] Initialisation impossible :', err));
}

initKyaraManager();
