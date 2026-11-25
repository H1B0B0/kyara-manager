import { state } from '../state';
import { executeAutoBuy } from './auto-buy';

export const MARKET_WATCH_INTERVAL_MS = 6_000;

function isAnyMarketBuyEnabled(): boolean {
  const s = state.currentSettings;
  return Boolean(
    s.autoBuyFlipEnabled ||
    s.autoMarketEnabled ||
    s.autoBuyMissingEnabled ||
    s.wishlistAutoBuyEnabled ||
    s.renaissanceFocusEnabled
  );
}

/** Runs one market watcher scan & auto-buy tick in its own non-blocking lane (never blocks UI clicks). */
export async function runMarketWatchTick({ manual = false } = {}): Promise<{
  ok: boolean;
  boughtCount: number;
  dealsFound: number;
  skipped?: boolean;
  error?: string;
}> {
  if (
    !manual &&
    (
      !state.currentSettings.masterEnabled ||
      !isAnyMarketBuyEnabled() ||
      state.isMarketWatchRunning ||
      state.updatePending ||
      state.disposed
    )
  ) {
    return { ok: true, boughtCount: 0, dealsFound: 0, skipped: true };
  }

  try {
    return await navigator.locks.request('kyara-manager-domain-market-buy', { ifAvailable: !manual }, async (lock) => {
      if (!lock) {
        return { ok: true, boughtCount: 0, dealsFound: 0, skipped: true };
      }
      if (
        !manual &&
        (!state.currentSettings.masterEnabled || !isAnyMarketBuyEnabled() || state.isMarketWatchRunning)
      ) {
        return { ok: true, boughtCount: 0, dealsFound: 0, skipped: true };
      }
      state.isMarketWatchRunning = true;
      try {
        const { kmDashboard } = (await chrome.storage.local.get('kmDashboard')) as { kmDashboard?: any };
        const res = await executeAutoBuy(kmDashboard || null, { manual });
        return { ok: true, boughtCount: res.boughtCount, dealsFound: res.dealsFound ?? 0 };
      } finally {
        state.isMarketWatchRunning = false;
      }
    });
  } catch (err: any) {
    return { ok: false, boughtCount: 0, dealsFound: 0, error: String(err?.message || err) };
  }
}

/** Starts the 20s lightweight active market watcher loop and returns a cleanup callback. */
export function startMarketWatcher(): () => void {
  const timer = setInterval(() => {
    if (typeof chrome !== 'undefined' && !chrome.runtime?.id) {
      clearInterval(timer);
      return;
    }
    if (state.disposed || state.updatePending) return;
    if (!state.currentSettings.masterEnabled || !isAnyMarketBuyEnabled()) return;
    void runMarketWatchTick({ manual: false });
  }, MARKET_WATCH_INTERVAL_MS);

  return () => clearInterval(timer);
}
