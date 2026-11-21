import { state, loadSettings } from '../state';
import { appendJournal } from '../journal';
import { refreshDashboardSnapshot } from '../snapshot';
import { executeAutoOpenBoosters } from './live-opening';
import { executeAutoClaimMissions } from './missions';
import { executeAutoRecycle } from './auto-recycle';
import { executeAutoSell } from './auto-sell';
import { executeAutoBuy } from './auto-buy';
import { executeAutoGames } from './games';
import { loadCardLedger } from '../safety';
import { runDomainTask } from '../operations';

export async function runAutomationCycle({ manual = false } = {}): Promise<any> {
  try {
    if (state.updatePending) return { ok: false, error: 'Mise à jour en cours. Les nouvelles actions sont suspendues.' };
    return await navigator.locks.request('kyara-manager-cycle', { ifAvailable: true }, async (lock) => {
      if (!lock || state.isCycleRunning) {
        return manual
          ? { ok: false, error: "Un cycle d'automatisation est déjà en cours." }
          : { ok: true, skipped: true };
      }
      await loadSettings();
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

interface CycleSummary {
  opened: number;
  recycledCopies: number;
  listed: number;
  bought: number;
  repriced: number;
  playedGames?: number;
}

/** Recycling and selling work on disjoint cards; one shared ledger keeps them from spending the same copy twice. */
async function runMarketStage(dashboard: any, summary: CycleSummary): Promise<boolean> {
  const { autoRecycleEnabled, autoSellEnabled } = state.currentSettings;
  const book = await loadCardLedger();
  const [recycled, sold] = await Promise.allSettled([
    autoRecycleEnabled ? executeAutoRecycle(dashboard, book) : Promise.resolve(null),
    autoSellEnabled ? executeAutoSell(dashboard, book) : Promise.resolve(null)
  ]);
  if (recycled.status === 'rejected') await appendJournal('error', `Recyclage auto interrompu : ${recycled.reason?.message || recycled.reason}`);
  if (sold.status === 'rejected') await appendJournal('error', `Vente auto interrompue : ${sold.reason?.message || sold.reason}`);
  if (recycled.status === 'fulfilled' && recycled.value) summary.recycledCopies += recycled.value.recycledCopies;
  if (sold.status === 'fulfilled' && sold.value) {
    summary.listed += sold.value.listedCount;
    summary.repriced += sold.value.repriced;
    summary.recycledCopies += sold.value.recycledCopies;
  }
  return summary.recycledCopies > 0 || summary.listed > 0 || summary.repriced > 0;
}

async function executeCycle(manual: boolean): Promise<any> {
  if (state.isCycleRunning) {
    return { ok: false, error: "Un cycle d'automatisation est déjà en cours." };
  }
  state.isCycleRunning = true;
  state.abortWhenMasterOff = !manual;
  try {
    await loadSettings();
    if (!manual && !state.currentSettings.masterEnabled) {
      return { ok: true, skipped: true };
    }

    let dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: false });
    if (!dashboard.authenticated) {
      return { ok: false, error: dashboard.error };
    }

    const summary: CycleSummary = { opened: 0, recycledCopies: 0, listed: 0, bought: 0, repriced: 0 };
    const canContinue = () => manual || state.currentSettings.masterEnabled;
    const settings = state.currentSettings;

    // Stage 1: Boosters & Missions run in parallel FIRST
    let dirty = false;
    const openingTasks: Array<{ label: string; run: Promise<void> }> = [];
    if (canContinue() && settings.autoBoosterEnabled) {
      openingTasks.push({
        label: 'Ouverture des boosters',
        run: executeAutoOpenBoosters(dashboard).then((res) => {
          summary.opened = res.openedCount;
          dirty ||= res.openedCount > 0;
        })
      });
    }
    if (canContinue() && settings.autoClaimMissionsEnabled) {
      openingTasks.push({
        label: 'Récompenses de missions',
        run: executeAutoClaimMissions(dashboard).then((res) => {
          dirty ||= res.claimed;
        })
      });
    }
    if (openingTasks.length > 0) {
      const outcomes = await Promise.allSettled(openingTasks.map((task) => task.run));
      for (const [index, outcome] of outcomes.entries()) {
        if (outcome.status === 'rejected') {
          await appendJournal('error', `${openingTasks[index].label} : ${outcome.reason?.message || outcome.reason}`);
        }
      }
    }

    // If boosters were opened, refresh dashboard snapshot so newly pulled duplicates
    // are immediately available for recycling or selling in the same cycle!
    if (summary.opened > 0) {
      dashboard = await refreshDashboardSnapshot({ forcePrices: false });
      dirty = false;
    }

    // Stage 2: Market stage (Recycle & Sell)
    if (canContinue() && (settings.autoRecycleEnabled || settings.autoSellEnabled)) {
      try {
        const changed = await runMarketStage(dashboard, summary);
        dirty ||= changed;
      } catch (err: any) {
        await appendJournal('error', `Recyclage et vente : ${err?.message || err}`);
      }
    }

    // Stage 3: Buying stage
    const buyEnabled = Boolean(
      settings.autoBuyFlipEnabled ||
      settings.autoMarketEnabled ||
      settings.autoBuyMissingEnabled ||
      settings.wishlistAutoBuyEnabled ||
      settings.renaissanceFocusEnabled
    );
    if (canContinue() && buyEnabled) {
      // Buying spends Chakra, so it starts from the balance left by the previous tasks.
      if (dirty) {
        dashboard = await refreshDashboardSnapshot({ forcePrices: false });
        dirty = false;
      }
      try {
        summary.bought = (await executeAutoBuy(dashboard)).boughtCount;
        dirty = summary.bought > 0;
      } catch (err: any) {
        await appendJournal('error', `Achats auto : ${err.message}`);
      }
    }

    // Stage 4: Game Room Farming (Main du Jour + solo ticket grind)
    if (
      canContinue() &&
      settings.autoGamesEnabled &&
      dashboard?.arcade?.enabled &&
      !dashboard.arcade.blocked &&
      ((dashboard.arcade.today ?? 0) < (dashboard.arcade.dayCap ?? 60)) &&
      ((dashboard.arcade.week ?? 0) < (dashboard.arcade.weekCap ?? 300))
    ) {
      try {
        const gameRes = await runDomainTask('games', () => executeAutoGames(dashboard, { manual: false }));
        if ((gameRes?.playedGames ?? 0) > 0) {
          summary.playedGames = gameRes.playedGames;
          dirty = true;
        }
      } catch (err: any) {
        await appendJournal('error', `Salle de Jeux auto : ${err.message}`);
      }
    }

    if (dirty) dashboard = await refreshDashboardSnapshot({ forcePrices: false });
    return { ok: true, summary, dashboard };
  } catch (err: any) {
    await appendJournal('error', `Erreur cycle auto : ${err.message}`);
    return { ok: false, error: String(err?.message || err) };
  } finally {
    state.abortWhenMasterOff = false;
    state.isCycleRunning = false;
  }
}
