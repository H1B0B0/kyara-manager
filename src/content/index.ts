import { state, loadSettings, restartLoopTimer } from './state';
import { mountFloatingHud, updateFloatingHud } from './hud';
import { setupAntiAfkObserver } from './automation/anti-afk';
import { runAutomationCycle } from './automation/cycle';
import { refreshDashboardSnapshot } from './snapshot';
import { setupMessageListener } from './messages';
import { recordBestPulls } from './journal';
import { DEFAULT_SETTINGS } from '../types/settings';

function initKyaraManager(): void {
  // Clean up any stale HUD if re-injected after extension reload
  const existingHud = document.getElementById('km-floating-hud');
  if (existingHud && (globalThis as any).__kyaraManagerInjected) {
    return;
  }
  (globalThis as any).__kyaraManagerInjected = true;

  // Inject fetch interceptor into main page to capture native Kyara booster open responses
  try {
    const hookScript = document.createElement('script');
    hookScript.textContent = `(${function () {
      if ((window as any).__kmFetchHooked) return;
      (window as any).__kmFetchHooked = true;
      const origFetch = window.fetch;
      window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] as any)?.url || '';
          if (url.includes('/api/packs/') && (url.includes('/open') || url.includes('/open-many'))) {
            const clone = res.clone();
            clone
              .json()
              .then((data) => {
                window.dispatchEvent(new CustomEvent('kyara:pull', { detail: data }));
              })
              .catch(() => {});
          }
        } catch {}
        return res;
      };
    }})();`;
    (document.head || document.documentElement).appendChild(hookScript);
    hookScript.remove();
  } catch {}

  // Listen to native Kyara pull events
  window.addEventListener('kyara:pull', (event: any) => {
    if (event?.detail) {
      state.lastPullEvents.push({ at: Date.now(), detail: event.detail });
      if (state.lastPullEvents.length > 20) state.lastPullEvents.shift();
      const cards = event.detail.cards || event.detail.results?.flatMap((r: any) => r.cards || []) || [];
      if (cards.length > 0) {
        recordBestPulls(cards, 'Booster Live').catch(() => {});
      }
    }
  });

  // Setup message listener for sidepanel commands
  setupMessageListener();

  // Storage listener for settings synchronization
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.settings?.newValue) {
      state.currentSettings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as any) };
      updateFloatingHud();
      restartLoopTimer(() => runAutomationCycle({ manual: false }));
    }
  });

  // Boot sequence
  (async () => {
    await loadSettings();
    mountFloatingHud();
    setupAntiAfkObserver();
    restartLoopTimer(() => runAutomationCycle({ manual: false }));
    const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: false }).catch(() => null);
    if (state.currentSettings.masterEnabled && dashboard?.authenticated) {
      void runAutomationCycle({ manual: false });
    }
  })();
}

initKyaraManager();
