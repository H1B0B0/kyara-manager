import { kyaraApi } from '../api';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal } from '../journal';
import { computeLiveMarketDepth } from '../../lib/analytics/market-depth';
import { evaluateDuplicate } from '../../lib/analytics/duplicates';
import { getCardAvailability } from '../safety';
import { refreshDashboardSnapshot } from '../snapshot';

export async function executeAutoSell(dashboard: any): Promise<{ listedCount: number; slotsAvailable: number }> {
  const now = Date.now();
  const expireHours = Number(state.currentSettings.autoSellExpireHours ?? 2);
  let activeListings = [...(dashboard?.activeListings || [])];

  let cancelled = false;
  const { kmPinnedCards = [] } = await chrome.storage.local.get('kmPinnedCards');
  const pinned = new Set<number>((Array.isArray(kmPinnedCards) ? kmPinnedCards : []).map(Number));
  if (expireHours > 0) {
    for (const listing of activeListings) {
      const createdMs = Date.parse(listing.createdAt || '');
      const charId = Number(listing.character?.id ?? listing.characterId);
      const rarity = listing.character?.rarity || listing.rarity;
      if (!Number.isFinite(createdMs) || now - createdMs < expireHours * 3600000) continue;
      if (pinned.has(charId) || (rarity === 'M' && !state.currentSettings.autoSellIncludeM) ||
          (rarity === 'L' && state.currentSettings.autoSellIncludeL === false)) continue;
      if (state.currentSettings.dryRun) {
        await appendJournal('sell', `[SIMULATION] Réévaluerait l'annonce stagnante : ${listing.name || charId}`);
        continue;
      }
      try {
        await kyaraApi(`/market/listings/${encodeURIComponent(listing.id)}/cancel`, { method: 'POST' });
        state.previousActiveListings.delete(String(listing.id));
        cancelled = true;
        await appendJournal('info', `Annonce stagnante retirée : ${listing.name || charId}. Nouvelle évaluation avant toute action.`);
      } catch (err: any) {
        await appendJournal('warn', `Retrait impossible : ${err.message}`);
      }
    }
  }
  if (cancelled) {
    dashboard = await refreshDashboardSnapshot({ forcePrices: false });
    activeListings = [...dashboard.activeListings];
  }

  const maxSlots = Math.max(1, Math.min(10, Number(state.currentSettings.autoSellMaxListings ?? 10)));
  let slotsAvailable = Math.max(0, maxSlots - activeListings.length);
  if (slotsAvailable <= 0) {
    return { listedCount: 0, slotsAvailable: 0 };
  }

  const alreadyListedCharIds = new Set(activeListings.map((l) => l.characterId));
  const candidates = (dashboard?.duplicates || [])
    .filter((d: any) => d.canAutoSell && d.spare > 0 && !alreadyListedCharIds.has(d.characterId))
    .sort((a: any, b: any) => {
      const pA = a.saleProb?.p12h ?? 10;
      const pB = b.saleProb?.p12h ?? 10;
      const evA = pA * (a.fees?.netProceeds ?? 0);
      const evB = pB * (b.fees?.netProceeds ?? 0);
      return evB - evA;
    });

  let listedCount = 0;
  for (const cand of candidates) {
    if (slotsAvailable <= 0) break;

    const availability = await getCardAvailability(cand.characterId);
    if (availability.spare <= 0) continue;
    const [liveListingsRes, liveOrdersRes, livePricesRes] = await Promise.all([
      kyaraApi(`/market/listings?characterId=${cand.characterId}&type=fixed&sort=price_asc&pageSize=20`, {
        auth: false
      }).catch(() => null),
      kyaraApi(`/market/buy-orders?characterId=${cand.characterId}`, { auth: false }).catch(() => null),
      kyaraApi(`/market/prices/${cand.characterId}`, { auth: false }).catch(() => null)
    ]);

    const refMedian = livePricesRes?.median7d ?? cand.referenceMedian;
    const liveDepth = computeLiveMarketDepth(liveListingsRes?.items, refMedian);
    const orders = Array.isArray(liveOrdersRes) ? liveOrdersRes : [];
    const bestBuyOrder = orders.length > 0 ? Math.max(...orders.map((o: any) => Number(o.price) || 0)) : null;

    const liveStats = {
      median7d: refMedian,
      median30d: livePricesRes?.median30d ?? cand.referenceMedian,
      sales7d: livePricesRes?.sales7d ?? cand.sales7d,
      liveDepth,
      lowestFixed: liveDepth.lowestFixed,
      highestFixed: liveDepth.highestFixed,
      bestBuyOrder: Number.isFinite(bestBuyOrder) && bestBuyOrder! > 0 ? bestBuyOrder : null
    };

    const reevaluated = evaluateDuplicate(
      { id: cand.characterId, name: cand.name, rarity: cand.rarity, series: cand.series },
      availability.entry,
      liveStats,
      { [cand.rarity]: cand.recycleValue },
      state.currentSettings,
      availability.listed,
      availability.pinned
    );

    if (reevaluated.canAutoRecycle && state.currentSettings.autoRecycleEnabled && state.currentSettings.autoSellTurboLiquidity) {
      if (state.currentSettings.dryRun) {
        await appendJournal('recycle', `[SIMULATION] Recyclerait ${cand.name} ×1`);
      } else {
        try {
          const result = await kyaraApi(`/me/collection/${cand.characterId}/recycle`, { method: 'POST', body: { qty: 1 } });
          const gained = Number(result?.gained ?? cand.recycleValue);
          await recordCumulativeMetric({ chakraFromRecycle: gained, cardsRecycled: 1 });
          await appendJournal('recycle', `Recyclage Turbo : ${cand.name} (+${gained} ◆)`);
        } catch (err: any) {
          await appendJournal('warn', `Recyclage impossible : ${err.message}`);
        }
      }
      continue;
    }

    if (!reevaluated.canAutoSell) {
      continue;
    }

    const sellPrice = reevaluated.prices.recommended;
    const netProceeds = reevaluated.fees.netProceeds;
    const durationHours = [12, 24, 48].includes(Number(state.currentSettings.autoSellDurationHours))
      ? Number(state.currentSettings.autoSellDurationHours)
      : 12;

    if (state.currentSettings.dryRun) {
      listedCount += 1;
      slotsAvailable -= 1;
      alreadyListedCharIds.add(cand.characterId);
      await appendJournal(
        'sell',
        `[SIMULATION] Mettrait en vente ${cand.name} [${cand.rarity}] à ${sellPrice} ◆ (net ${netProceeds} ◆)`
      );
      continue;
    }

    try {
      const created = await kyaraApi('/market/listings', {
        method: 'POST',
        withPass: true,
        body: {
          characterId: cand.characterId,
          type: 'fixed',
          price: sellPrice,
          buyoutPrice: null,
          durationHours
        }
      });
      listedCount += 1;
      slotsAvailable -= 1;
      alreadyListedCharIds.add(cand.characterId);
      if (created?.id) {
        state.previousActiveListings.set(String(created.id), {
          characterId: cand.characterId,
          name: cand.name,
          price: sellPrice,
          endsAt: created.endsAt || null,
          createdAt: created.createdAt || new Date().toISOString()
        });
      }
      await appendJournal(
        'sell',
        `Mise en vente auto : ${cand.name} [${cand.rarity}] à ${sellPrice} ◆ (net +${netProceeds} ◆ · prob 24h ${reevaluated.saleProb.p24h}%)`
      );
    } catch (err: any) {
      await appendJournal('warn', `Échec mise en vente ${cand.name} : ${err.message}`);
      if (err.code === 'too_many_listings' || err.code === 'pass_required') {
        break;
      }
    }
  }

  return { listedCount, slotsAvailable };
}
