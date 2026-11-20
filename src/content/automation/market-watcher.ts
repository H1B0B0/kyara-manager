import { state } from '../state';
import { runExclusive } from '../operations';
import { executeAutoBuy } from './auto-buy';

export const MARKET_WATCH_INTERVAL_MS = 20_000;

function isAnyMarketBuyEnabled(): boolean {
  const s = state.currentSettings;
  return Boolean(
    s.autoBuyFlipEnabled ||
    s.autoBuyMissingEnabled ||
    s.wishlistAutoBuyEnabled ||
    (s.renaissanceFocusEnabled && s.autoMarketEnabled)
  );
}

/** Runs one market watcher scan & auto-buy tick inside the origin-wide exclusive lock. */
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
      state.isCycleRunning ||
      state.isOperationRunning ||
      state.updatePending ||
      state.disposed
    )
  ) {
    return { ok: true, boughtCount: 0, dealsFound: 0, skipped: true };
  }

  try {
    return await runExclusive(async () => {
      if (
        !manual &&
        (!state.currentSettings.masterEnabled || !isAnyMarketBuyEnabled() || state.isCycleRunning)
      ) {
        return { ok: true, boughtCount: 0, dealsFound: 0, skipped: true };
      }
      const { kmDashboard } = (await chrome.storage.local.get('kmDashboard')) as { kmDashboard?: any };
      const res = await executeAutoBuy(kmDashboard || null, { manual });
      return { ok: true, boughtCount: res.boughtCount, dealsFound: res.dealsFound ?? 0 };
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
