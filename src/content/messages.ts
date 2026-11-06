import { kyaraApi } from './api';
import { state } from './state';
import { appendJournal, DEFAULT_CUMULATIVE_STATS, recordCumulativeMetric } from './journal';
import { refreshDashboardSnapshot } from './snapshot';
import { sleep } from './utils';
import { runAutomationCycle } from './automation/cycle';
import { executeAutoSell } from './automation/auto-sell';
import { executeAutoRecycle } from './automation/auto-recycle';
import { executeAutoOpenBoosters, pilotLiveBoosterOpening } from './automation/live-opening';

export function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
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

        if (message.type === 'km:cmd:sell-now') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const sellRes = await executeAutoSell(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, sellRes, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:recycle-now') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const recRes = await executeAutoRecycle(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, recRes, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:open-recommended') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const openRes = await executeAutoOpenBoosters(dashboard);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, openRes, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:scan-deals') {
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: true });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:single-sell') {
          const { characterId, price, durationHours = 12 } = message;
          await kyaraApi('/market/listings', {
            method: 'POST',
            withPass: true,
            body: {
              characterId: Number(characterId),
              type: 'fixed',
              price: Number(price),
              buyoutPrice: null,
              durationHours: Number(durationHours)
            }
          });
          await appendJournal('sell', `Vente directe : Carte #${characterId} mise en vente à ${price} ◆`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:single-recycle') {
          const { characterId, qty = 1, name = `Carte #${characterId}` } = message;
          const res = await kyaraApi(`/me/collection/${Number(characterId)}/recycle`, {
            method: 'POST',
            body: { qty: Number(qty) }
          });
          await appendJournal('recycle', `Recyclage direct : ${name} ×${qty} (+${res?.gained ?? '?'} ◆)`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:buy-listing') {
          const { listingId, name = 'Carte', price = 0 } = message;
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/buy`, {
            method: 'POST',
            withPass: true
          });
          await appendJournal('buy', `Achat direct : ${name} achetée pour ${price} ◆`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false, scanMarketDeals: true });
          sendResponse({ ok: true, dashboard });
          return;
        }

        if (message.type === 'km:cmd:cancel-listing') {
          const { listingId, name = 'Annonce' } = message;
          await kyaraApi(`/market/listings/${encodeURIComponent(listingId)}/cancel`, {
            method: 'POST'
          });
          state.previousActiveListings.delete(String(listingId));
          await appendJournal('info', `Annonce retirée : ${name}`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
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
          const openRes = await pilotLiveBoosterOpening(packId, packName, Number(count) || 1);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, openRes, dashboard });
          return;
        }

        if (message.type === 'km:cmd:bulk-recycle') {
          const { maxNetGain = 4, excludeRarities = ['L', 'M'] } = message;
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          const candidates = (dashboard.duplicates || []).filter((d: any) => {
            if (d.pinned || d.spare <= 0) return false;
            if (excludeRarities.includes(d.rarity)) return false;
            return d.verdict === 'RECYCLER' || (d.fees?.netGainOverRecycle <= maxNetGain && (d.rarity === 'C' || d.rarity === 'U'));
          });

          let totalRecycled = 0;
          let totalChakra = 0;
          for (const item of candidates) {
            try {
              const res = await kyaraApi(`/me/collection/${item.characterId}/recycle`, {
                method: 'POST',
                body: { qty: item.spare }
              });
              const gained = Number(res?.gained ?? item.spare * item.recycleValue);
              totalRecycled += item.spare;
              totalChakra += gained;
              await recordCumulativeMetric({ chakraFromRecycle: gained, cardsRecycled: item.spare });
              await sleep(250);
            } catch (err) {
              console.warn(`[KyaraManager] Erreur recyclage groupé sur ${item.name}:`, err);
            }
          }

          await appendJournal('recycle', `Recyclage Turbo groupé terminé : ${totalRecycled} carte(s) recyclée(s) (+${totalChakra} ◆ générés)`);
          const updated = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, totalRecycled, totalChakra, dashboard: updated });
          return;
        }

        if (message.type === 'km:cmd:wishlist-add') {
          const { characterId, name, series, rarity, autoBuy } = message;
          const budgetValue = Number(message.maxBudget ?? message.budgetChakra ?? 30);
          const finalBudget = budgetValue > 0 ? budgetValue : 30;
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
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, wishlist: list, dashboard });
          return;
        }

        if (message.type === 'km:cmd:wishlist-remove') {
          const charId = Number(message.characterId);
          const { kmWishlist } = (await chrome.storage.local.get('kmWishlist')) as { kmWishlist?: any[] };
          const list = (Array.isArray(kmWishlist) ? kmWishlist : []).filter((w: any) => Number(w.characterId) !== charId);
          await chrome.storage.local.set({ kmWishlist: list });
          await appendJournal('info', `Envie retirée : Carte #${charId}`);
          const dashboard = await refreshDashboardSnapshot({ forcePrices: false });
          sendResponse({ ok: true, wishlist: list, dashboard });
          return;
        }

        if (message.type === 'km:save-settings') {
          const { settings: newSettings } = message;
          if (newSettings && typeof newSettings === 'object') {
            state.currentSettings = { ...state.currentSettings, ...newSettings };
            await chrome.storage.local.set({ settings: state.currentSettings });
          }
          sendResponse({ ok: true });
          return;
        }

        sendResponse({ ok: false, error: 'Commande inconnue' });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  });
}
