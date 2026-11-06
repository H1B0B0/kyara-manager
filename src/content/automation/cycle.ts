import { state, loadSettings } from '../state';
import { appendJournal } from '../journal';
import { refreshDashboardSnapshot } from '../snapshot';
import { executeAutoOpenBoosters } from './live-opening';
import { executeAutoClaimMissions } from './missions';
import { executeAutoRecycle } from './auto-recycle';
import { executeAutoSell } from './auto-sell';
import { executeAutoBuy } from './auto-buy';
import { runExclusive } from '../operations';

export async function runAutomationCycle({ manual = false } = {}): Promise<any> {
  try {
    return await runExclusive(async () => {
      const { kmLastAutoCycleAt } = await chrome.storage.local.get('kmLastAutoCycleAt');
      const interval = Math.max(20, Number(state.currentSettings.loopIntervalSec) || 45) * 1000;
      if (!manual && Date.now() - (Number(kmLastAutoCycleAt) || 0) < interval) return { ok: true, skipped: true };
      if (!manual && !state.currentSettings.masterEnabled) return { ok: true, skipped: true };
      await chrome.storage.local.set({ kmLastAutoCycleAt: Date.now() });
      return executeCycle(manual);
    });
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function executeCycle(manual: boolean): Promise<any> {
  if (state.isCycleRunning) {
    return { ok: false, error: "Un cycle d'automatisation est déjà en cours." };
  }
  state.isCycleRunning = true;
  try {
    await loadSettings();
    if (!manual && !state.currentSettings.masterEnabled) {
      return { ok: true, skipped: true };
    }

    let dashboard = await refreshDashboardSnapshot({
      forcePrices: false,
      scanMarketDeals: false
    });

    if (!dashboard.authenticated) {
      return { ok: false, error: dashboard.error };
    }

    const summary = {
      opened: 0,
      recycledCopies: 0,
      listed: 0,
      bought: 0
    };

    const canContinue = () => manual || state.currentSettings.masterEnabled;
    if (canContinue() && state.currentSettings.autoBoosterEnabled) {
      const openRes = await executeAutoOpenBoosters(dashboard);
      summary.opened = openRes.openedCount;
      if (openRes.openedCount > 0) {
        dashboard = await refreshDashboardSnapshot({ forcePrices: false });
      }
    }

    if (canContinue() && state.currentSettings.autoClaimMissionsEnabled) {
      await executeAutoClaimMissions(dashboard);
      dashboard = await refreshDashboardSnapshot({ forcePrices: false });
    }

    if (canContinue() && state.currentSettings.autoRecycleEnabled) {
      const recRes = await executeAutoRecycle(dashboard);
      summary.recycledCopies = recRes.recycledCopies;
      if (recRes.recycledCopies > 0) dashboard = await refreshDashboardSnapshot({ forcePrices: false });
    }

    if (canContinue() && state.currentSettings.autoSellEnabled) {
      const sellRes = await executeAutoSell(dashboard);
      summary.listed = sellRes.listedCount;
    }

    if (canContinue() && (state.currentSettings.autoBuyFlipEnabled || state.currentSettings.autoBuyMissingEnabled || state.currentSettings.wishlistAutoBuyEnabled)) {
      dashboard = await refreshDashboardSnapshot({ forcePrices: false });
      const buyRes = await executeAutoBuy(dashboard);
      summary.bought = buyRes.boughtCount;
    }

    if (summary.recycledCopies > 0 || summary.listed > 0 || summary.bought > 0) {
      dashboard = await refreshDashboardSnapshot({ forcePrices: false });
    }

    return { ok: true, summary, dashboard };
  } catch (err: any) {
    await appendJournal('error', `Erreur cycle auto : ${err.message}`);
    return { ok: false, error: String(err?.message || err) };
  } finally {
    state.isCycleRunning = false;
  }
}
