import { kyaraApi } from './api';
import { state } from './state';
import { appendJournal, DEFAULT_CUMULATIVE_STATS, recordCumulativeMetric } from './journal';
import { refreshDashboardSnapshot } from './snapshot';
import { runAutomationCycle } from './automation/cycle';
import { runMarketWatchTick } from './automation/market-watcher';
import { executeAutoSell } from './automation/auto-sell';
import { executeAutoRecycle, recycleCopies } from './automation/auto-recycle';
import { executeAutoOpenBoosters, pilotLiveBoosterOpening } from './automation/live-opening';
import { executeBatchMissingBuy, previewBatchMissingBuy } from './automation/batch-buy';
import { placeBatchBuyOrders, placeBuyOrder, scanBuyOrderOpportunities } from './automation/buy-orders';
import { executeAutoGames } from './automation/games';
import { isMiniGameRoute, runDomainTask, runSpaPilotTask, type TaskDomain } from './operations';
import { getCardAvailability, isInterrupted, loadCardLedger, positiveInteger } from './safety';
import { fulfilled, mapLimit } from '../lib/concurrency';
import { mergeSettings } from '../types/settings';

function getLiveBoosterGameBlockError(): string | null {
  if (state.isGamesRunning) {
    return "Farm Salle de Jeux en cours : attends la fin ou coupe le farm avant d'ouvrir en live.";
  }
  if (isMiniGameRoute()) {
    return "Mini-jeu en cours sur cet onglet : quitte la partie avant d'ouvrir un booster en live.";
  }
  return null;
}

async function refreshAfterAction(options = {}): Promise<any> {
  try { return await refreshDashboardSnapshot(options); }
  catch (err: any) {
    await appendJournal('warn', `Action confirmée, mais actualisation impossible : ${err.message}`);
    return undefined;
  }
}

export function setupMessageListener(): () => void {
  const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, _sender, sendResponse) => {
    if (message?.type === 'km:ping') {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return false;
    }
    if (message?.type === 'km:prepare-update') {
      state.updatePending = true;
      sendResponse({ ok: true, busy: state.isOperationRunning || state.isLiveOpening || state.isGamesRunning });
      return false;
    }
    const handle = async () => {
      try {
        if (!message || typeof message.type !== 'string') {
          sendResponse({ ok: false });
          return;
        }

        if (message.type === 'km:alarm-tick') {
          const res = await runAutomationCycle({ manual: false });
          sendResponse(res);
          return;
        }

        if (message.type === 'km:cmd:refresh') {
          const dashboard = await refreshDashboardSnapshot({
            forcePrices: Boolean(message.forcePrices),
            scanMarketDeals: Boolean(message.scanMarketDeals)
          });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:run-cycle') {
          const res = await runAutomationCycle({ manual: true });
          sendResponse(res);
          return;
        }

        if (message.type === 'km:cmd:run-market-watch') {
          const res = await runMarketWatchTick({ manual: true });
          const { kmDashboard: dashboard } = (await chrome.storage.local.get('kmDashboard')) as { kmDashboard?: any };
          sendResponse({ ...res, dashboard });
          return;
        }

        if (message.type === 'km:cmd:sell-now') {
          const mode = ['fast', 'normal', 'patient', 'adaptive'].includes(message.mode) ? message.mode : undefined;
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const sellRes = await executeAutoSell(dashboard, undefined, { mode });
          const updated = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, sellRes, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:recycle-now') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const recRes = await executeAutoRecycle(dashboard);
          const updated = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, recRes, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:open-recommended') {
          const gameBlockError = getLiveBoosterGameBlockError();
          if (gameBlockError) {
            sendResponse({ ok: false, error: gameBlockError });
            return;
          }
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const openRes = await executeAutoOpenBoosters(dashboard);
          const updated = await refreshAfterAction({ forcePrices: false });
          sendResponse({
            ok: openRes.openedCount > 0,
            error: openRes.openedCount > 0
              ? undefined
              : openRes.deferredForGame
                ? (getLiveBoosterGameBlockError() || "Farm Salle de Jeux en cours : attends la fin ou coupe le farm avant d'ouvrir en live.")
                : 'Aucune ouverture confirmée par Kyara.',
            openRes,
            dashboard: updated
          });
          return;
        }

        if (message.type === 'km:cmd:scan-deals') {
          const dashboard = await refreshDashboardSnapshot({
            forcePrices: false,
            scanMarketDeals: true,
            rarity: typeof message.rarity === 'string' ? message.rarity : undefined,
            focusRarities: Array.isArray(message.focusRarities) ? message.focusRarities : undefined
          });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:preview-batch-buy') {
          const preview = await previewBatchMissingBuy({
            rarity: message.rarity,
            maxUnitPrice: Number(message.maxUnitPrice),
            qty: Number(message.qty),
            maxTotalBudget: message.maxTotalBudget !== undefined ? Number(message.maxTotalBudget) : undefined,
            characterIds: Array.isArray(message.characterIds) ? message.characterIds.map(Number) : undefined
          });
          sendResponse({ ok: true, preview });
          return;
        }

        if (message.type === 'km:cmd:execute-batch-buy') {
          const result = await executeBatchMissingBuy({
            rarity: message.rarity,
            maxUnitPrice: Number(message.maxUnitPrice),
            qty: Number(message.qty),
            maxTotalBudget: message.maxTotalBudget !== undefined ? Number(message.maxTotalBudget) : undefined,
            listingIds: Array.isArray(message.listingIds) ? message.listingIds.map(String) : undefined,
            characterIds: Array.isArray(message.characterIds) ? message.characterIds.map(Number) : undefined,
            ignoreReserve: Boolean(message.ignoreReserve)
          });
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, result, dashboard });
          return;
        }

        if (message.type === 'km:cmd:scan-buy-orders') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const opportunities = await scanBuyOrderOpportunities(dashboard, { limit: message.limit, discountPct: message.discountPct });
          sendResponse({ ok: true, opportunities });
          return;
        }

        if (message.type === 'km:cmd:place-buy-order') {
          const res = await placeBuyOrder(message.characterId, message.price, message.name);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: res.ok, error: res.error, dashboard });
          return;
        }

        if (message.type === 'km:cmd:place-batch-buy-orders') {
          const result = await placeBatchBuyOrders(message.orders || []);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, result, dashboard });
          return;
        }

        if (message.type === 'km:cmd:cancel-rebirth-blocking-listings') {
          const market = await kyaraApi('/me/market');
          const now = Date.now();
          const blocking = (Array.isArray(market?.listings) ? market.listings : []).filter((l: any) =>
            l && (l.status === 'active' || l.status === 'pending') &&
            (!l.endsAt || Date.parse(l.endsAt) > now) &&
            ['C', 'U', 'R', 'E'].includes(l.character?.rarity || l.rarity || 'C')
          );
          const res = await mapLimit(blocking, 3, async (l: any) => {
            if (isInterrupted()) return false;
            await kyaraApi(`/market/listings/${encodeURIComponent(l.id)}/cancel`, { method: 'POST' });
            state.previousActiveListings.delete(String(l.id));
            return true;
          });
          const cancelledCount = fulfilled(res).filter(Boolean).length;
          await appendJournal('info', `Renaissance : ${cancelledCount} annonce(s) bloquante(s) (C/U/R/E) retirée(s)`);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, cancelledCount, dashboard });
          return;
        }

        if (message.type === 'km:cmd:single-sell') {
          const { characterId, price, durationHours = 12 } = message;
          positiveInteger(characterId, 'Carte');
          positiveInteger(price, 'Prix');
          if (![12, 24, 48].includes(Number(durationHours))) throw new Error('Durée invalide');
          const available = await getCardAvailability(Number(characterId));
          if (available.spare < 1) throw new Error('Aucun exemplaire disponible ou carte protégée.');
          await kyaraApi('/market/listings', {
            method: 'POST', withPass: true,
            body: { characterId: Number(characterId), type: 'fixed', price: Number(price), buyoutPrice: null, durationHours: Number(durationHours) }
          });
          await appendJournal('sell', `Vente directe : Carte #${characterId} mise en vente à ${price} ◆`);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:single-recycle') {
          const { characterId, qty = 1, name = `Carte #${characterId}` } = message;
          positiveInteger(characterId, 'Carte');
          positiveInteger(qty, 'Quantité');
          const available = await getCardAvailability(Number(characterId));
          const recyclable = available.recyclable ?? available.spare ?? 0;
          if (Number(qty) > recyclable) throw new Error('Quantité indisponible ou carte protégée. Actualise les doublons.');
          const res = await kyaraApi(`/me/collection/${Number(characterId)}/recycle`, { method: 'POST', body: { qty: Number(qty) } });
          await appendJournal('recycle', `Recyclage direct : ${name} ×${qty} (+${res?.gained ?? '?'} ◆)`);
          await recordCumulativeMetric({ cardsRecycled: Number(qty), chakraFromRecycle: Number(res?.gained) || 0 });
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:buy-listing') {
          const { listingId, name = 'Carte', price = 0 } = message;
          positiveInteger(price, 'Prix');
          const listing = await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}`);
          const actualPrice = Number(listing?.type === 'fixed' ? listing.price : listing?.buyoutPrice);
          if (listing?.status !== 'active' || listing?.isMine || !Number.isFinite(actualPrice) || actualPrice <= 0 || actualPrice > Number(price)) {
            throw new Error('Annonce indisponible ou prix modifié. Actualise le marché.');
          }
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/buy`, { method: 'POST', withPass: true });
          await appendJournal('buy', `Achat direct : ${name} achetée pour ${price} ◆`);
          const dashboard = await refreshAfterAction({ forcePrices: false, scanMarketDeals: true });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:cancel-listing') {
          const { listingId, name = 'Annonce' } = message;
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/cancel`, { method: 'POST' });
          state.previousActiveListings.delete(String(listingId));
          await appendJournal('info', `Annonce retirée : ${name}`);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:reset-roi') {
          const resetStats = { ...DEFAULT_CUMULATIVE_STATS, startedAt: Date.now() };
          await chrome.storage.local.set({ kmCumulativeStats: resetStats });
          sendResponse({ ok: true, stats: resetStats });
          return;
        }

        if (message.type === 'km:cmd:toggle-pin') {
          const charId = Number(message.characterId);
          if (Number.isFinite(charId) && charId > 0) {
            const { kmPinnedCards } = (await chrome.storage.local.get('kmPinnedCards')) as { kmPinnedCards?: number[] };
            const set = new Set((kmPinnedCards || []).map(Number));
            let isPinned = false;
            if (set.has(charId)) {
              set.delete(charId);
              isPinned = false;
              await appendJournal('info', `Protection retirée pour la carte #${charId}`);
            } else {
              set.add(charId);
              isPinned = true;
              await appendJournal('info', `Carte #${charId} protégée (épargnée de la vente et du recyclage)`);
            }
            await chrome.storage.local.set({ kmPinnedCards: Array.from(set) });
            const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
            sendResponse({ ok: true, isPinned, characterId: charId, dashboard });
            return;
          }
        }

        if (message.type === 'km:cmd:open-pack') {
          const { packId, packName = packId, count = 1 } = message;
          positiveInteger(count, 'Nombre de boosters');
          if (Number(count) > 10 || typeof packId !== 'string' || !packId) throw new Error('Booster invalide');
          const gameBlockError = getLiveBoosterGameBlockError();
          if (gameBlockError) {
            sendResponse({ ok: false, error: gameBlockError });
            return;
          }
          const openRes = await pilotLiveBoosterOpening(packId, packName, Number(count) || 1);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({
            ok: openRes.openedCount > 0,
            error: openRes.openedCount > 0
              ? undefined
              : openRes.deferredForGame
                ? (getLiveBoosterGameBlockError() || "Farm Salle de Jeux en cours : attends la fin ou coupe le farm avant d'ouvrir en live.")
                : 'Aucune ouverture confirmée. Vérifie le booster dans Kyara.',
            openRes,
            dashboard
          });
          return;
        }

        if (message.type === 'km:cmd:run-games-farm') {
          const isManual = message.manual !== false;
          const dedicatedTab = Boolean(message.dedicatedTab);
          const res = await runSpaPilotTask('games', async () => {
            state.isGamesRunning = true;
            try {
              const baseDashboard = await refreshDashboardSnapshot({ forcePrices: false });
              return await executeAutoGames(baseDashboard, {
                manual: isManual,
                gameId: message.gameId,
                dedicatedTab
              });
            } finally {
              state.isGamesRunning = false;
            }
          });
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({
            ok: !res.blocked,
            error: res.blocked === 'guest' ? 'Lie ton compte Discord sur kyara.games pour accéder aux mini-jeux.' : undefined,
            ...res,
            dashboard
          });
          return;
        }

        if (message.type === 'km:cmd:solve-current-game') {
          const res = await executeAutoGames({}, { manual: true, solveOnce: true });
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({
            ok: res.playedGames > 0,
            error: res.playedGames > 0 ? undefined : 'Aucune manche active détectée sur ce mini-jeu.',
            ...res,
            dashboard
          });
          return;
        }

        if (message.type === 'km:cmd:bulk-recycle') {
          const { maxNetGain = 4, excludeRarities = ['L', 'M'] } = message;
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const candidates = (dashboard.duplicates || []).filter((d: any) => {
            const recQty = d.recyclableSpare ?? d.spare;
            const allowedRarity = d.canAutoRecycle || state.currentSettings.autoRecycleRarities.includes(d.rarity);
            if (d.pinned || recQty <= 0 || !allowedRarity) return false;
            if (excludeRarities.includes(d.rarity)) return false;
            return d.verdict === 'RECYCLER' || (d.fees?.netGainOverRecycle <= maxNetGain && (d.rarity === 'C' || d.rarity === 'U'));
          });
          const book = await loadCardLedger();
          const results = await mapLimit(candidates, 4, async (item: any) => {
            if (isInterrupted()) return null;
            const avail = book.get(item.characterId);
            const availQty = (avail as any).recyclable ?? avail.spare;
            const candQty = item.recyclableSpare ?? item.spare;
            const qty = Math.min(candQty, availQty);
            return qty > 0 && book.reserve(item.characterId, qty, 'recycle') ? recycleCopies(book, item, qty) : null;
          });
          // Simulation reports nothing as recycled: no copy actually left the collection.
          const done = state.currentSettings.dryRun ? [] : (fulfilled(results).filter(Boolean) as Array<{ qty: number; gained: number }>);
          const totalRecycled = done.reduce((sum, r) => sum + r.qty, 0);
          const totalChakra = done.reduce((sum, r) => sum + r.gained, 0);
          await appendJournal('recycle', `Recyclage Turbo groupé terminé : ${totalRecycled} carte(s) recyclée(s) (+${totalChakra} ◆ générés)`);
          const updated = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, recycledCount: totalRecycled, chakraGained: totalChakra, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:wishlist-add') {
          const { characterId, name, series, rarity, autoBuy } = message;
          positiveInteger(characterId, 'Carte');
          const budgetValue = Number(message.maxBudget ?? message.budgetChakra ?? 30);
          const finalBudget = positiveInteger(budgetValue, 'Budget');
          const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
          const list = Array.isArray(kmWishlist) ? [...kmWishlist] : [];
          const idx = list.findIndex((w: any) => Number(w.characterId) === Number(characterId));
          const item = {
            characterId: Number(characterId),
            name: name || `Carte #${characterId}`,
            series: series || '',
            rarity: rarity || 'C',
            maxBudget: finalBudget,
            budgetChakra: finalBudget,
            autoBuy: Boolean(autoBuy),
            addedAt: Date.now()
          };
          if (idx >= 0) {
            list[idx] = item;
          } else {
            list.push(item);
          }
          await chrome.storage.local.set({ kmWishlist: list });
          await appendJournal('info', `Envie ajoutée : ${item.name} (Budget max : ${item.maxBudget} ◆)`);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, wishlist: list, dashboard });
          return;
        }

        if (message.type === 'km:cmd:wishlist-remove') {
          const charId = Number(message.characterId);
          const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
          const list = (Array.isArray(kmWishlist) ? kmWishlist : []).filter((w: any) => Number(w.characterId) !== charId);
          await chrome.storage.local.set({ kmWishlist: list });
          await appendJournal('info', `Envie retirée : Carte #${charId}`);
          const dashboard = await refreshAfterAction({ forcePrices: false });
          sendResponse({ ok: true, wishlist: list, dashboard });
          return;
        }

        if (message.type === 'km:save-settings') {
          const { settings: newSettings } = message;
          if (newSettings && typeof newSettings === 'object') {
            state.currentSettings = mergeSettings(state.currentSettings, newSettings);
            await chrome.storage.local.set({ settings: state.currentSettings });
          }
          sendResponse({ ok: true });
          return;
        }

        sendResponse({ ok: false, error: 'Commande inconnue' });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    };
    const readOnly = [
      'km:cmd:refresh', 'km:cmd:scan-deals', 'km:cmd:preview-batch-buy',
      'km:cmd:scan-buy-orders', 'km:alarm-tick', 'km:cmd:run-cycle', 'km:cmd:run-market-watch', 'km:save-settings',
      'km:cmd:reset-roi', 'km:cmd:toggle-pin', 'km:cmd:wishlist-add', 'km:cmd:wishlist-remove'
    ].includes(message?.type);
    const resolveDomain = (type?: string): TaskDomain => {
      if (type === 'km:cmd:buy-listing' || type === 'km:cmd:execute-batch-buy' || type === 'km:cmd:place-buy-order' || type === 'km:cmd:place-batch-buy-orders') {
        return 'market-buy';
      }
      if (type === 'km:cmd:open-pack' || type === 'km:cmd:open-recommended') {
        return 'boosters';
      }
      if (type === 'km:cmd:run-games-farm' || type === 'km:cmd:solve-current-game') {
        return 'games';
      }
      return 'inventory';
    };
    void (readOnly ? handle() : runDomainTask(resolveDomain(message?.type), handle)).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
