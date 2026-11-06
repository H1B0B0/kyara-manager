import { state, loadSettings } from '../state';
import { appendJournal } from '../journal';
import { refreshDashboardSnapshot } from '../snapshot';
import { executeAutoOpenBoosters } from './live-opening';
import { executeAutoClaimMissions } from './missions';
import { executeAutoRecycle } from './auto-recycle';
import { executeAutoSell } from './auto-sell';
import { executeAutoBuy } from './auto-buy';

export async function runAutomationCycle({ manual = false } = {}): Promise<any> {
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
      scanMarketDeals: Boolean(state.currentSettings.autoBuyFlipEnabled || state.currentSettings.autoBuyMissingEnabled || manual)
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

    if (state.currentSettings.autoOpenEnabled) {
      const openRes = await executeAutoOpenBoosters(dashboard);
      summary.opened = openRes.openedCount;
      if (openRes.openedCount > 0) {
        dashboard = await refreshDashboardSnapshot({ forcePrices: false });
      }
    }

    if (state.currentSettings.autoClaimMissions) {
      await executeAutoClaimMissions(dashboard);
    }

    if (state.currentSettings.autoRecycleEnabled) {
      const recRes = await executeAutoRecycle(dashboard);
      summary.recycledCopies = recRes.recycledCopies;
    }

    if (state.currentSettings.autoSellEnabled) {
      const sellRes = await executeAutoSell(dashboard);
      summary.listed = sellRes.listedCount;
    }

    if (state.currentSettings.autoBuyFlipEnabled || state.currentSettings.autoBuyMissingEnabled) {
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
