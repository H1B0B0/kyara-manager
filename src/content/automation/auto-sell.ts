import { kyaraApi } from '../api';
import { runtimeCache } from '../cache';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal } from '../journal';
import { computeNetProceeds } from '../../lib/analytics/fees';
import { computeLiveMarketDepth } from '../../lib/analytics/market-depth';
import { evaluateDuplicate } from '../../lib/analytics/duplicates';
import { DEFAULT_RECYCLE_VALUES, RARITY_PRICE_FLOORS } from '../../lib/analytics/constants';

export async function executeAutoSell(dashboard: any): Promise<{ listedCount: number; slotsAvailable: number }> {
  const now = Date.now();
  const expireHours = Number(state.currentSettings.autoSellExpireHours ?? 2);
  let activeListings = [...(dashboard?.activeListings || [])];

  if (expireHours > 0) {
    const maxAgeMs = expireHours * 3600 * 1000;
    const recycleMap = runtimeCache.recycleMap || DEFAULT_RECYCLE_VALUES;
    for (const listing of [...activeListings]) {
      const createdMs = listing.createdAt ? Date.parse(listing.createdAt) : NaN;
      if (Number.isFinite(createdMs) && now - createdMs >= maxAgeMs) {
        const charId = Number(listing.character?.id ?? listing.characterId);
        const rarity = listing.character?.rarity || 'C';
        const cardName = listing.character?.name || listing.name || `Carte #${charId}`;
        const recycleValue = Number(recycleMap?.[rarity] ?? DEFAULT_RECYCLE_VALUES[rarity as keyof typeof DEFAULT_RECYCLE_VALUES] ?? 1);
        const rarityFloor = Number(RARITY_PRICE_FLOORS[rarity as keyof typeof RARITY_PRICE_FLOORS] ?? 3);
        const currentNet = computeNetProceeds(listing.price);

        const isLowMargin = currentNet <= recycleValue + 1 || rarity === 'C' || rarity === 'U';

        if (state.currentSettings.dryRun) {
          await appendJournal(
            'sell',
            `[SIMULATION] Annonce stagnante (> ${expireHours}h) ${cardName} : ${isLowMargin ? 'retirerait et recyclerait' : 'baisserait le prix'}`
          );
          continue;
        }

        try {
          await kyaraApi(`/market/listings/${encodeURIComponent(listing.id)}/cancel`, { method: 'POST' });
          activeListings = activeListings.filter((x) => x.id !== listing.id);
          state.previousActiveListings.delete(String(listing.id));

          if (isLowMargin || state.currentSettings.autoSellRecycleExpired) {
            await kyaraApi(`/me/collection/${charId}/recycle`, {
              method: 'POST',
              body: { qty: 1 }
            }).catch(() => {});
            await appendJournal(
              'recycle',
              `Annonce non vendue après ${expireHours}h : ${cardName} retirée et recyclée (+${recycleValue} ◆) car vente trop lente`
            );
          } else {
            const discountPct = Number(state.currentSettings.autoSellRepriceDiscountPct ?? 5);
            const loweredPrice = Math.max(rarityFloor, Math.round(listing.price * (1 - discountPct / 100)));

            if (loweredPrice < listing.price) {
              const relistRes = await kyaraApi('/market/listings', {
                method: 'POST',
                withPass: true,
                body: {
                  characterId: charId,
                  type: 'fixed',
                  price: loweredPrice,
                  buyoutPrice: null,
                  durationHours: 12
                }
              }).catch(() => null);

              if (relistRes) {
                activeListings.push({ ...listing, price: loweredPrice, createdAt: new Date().toISOString() });
                await appendJournal(
                  'sell',
                  `Repricing auto (> ${expireHours}h sans vente) : ${cardName} ajustée de ${listing.price} ◆ à ${loweredPrice} ◆`
                );
              }
            } else {
              await kyaraApi(`/me/collection/${charId}/recycle`, {
                method: 'POST',
                body: { qty: 1 }
              }).catch(() => {});
              await appendJournal(
                'recycle',
                `Annonce au plancher non vendue (> ${expireHours}h) : ${cardName} recyclée (+${recycleValue} ◆) pour libérer 1 créneau`
              );
            }
          }
        } catch {}
      }
    }
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

    const [liveListingsRes, liveOrdersRes, livePricesRes] = await Promise.all([
      kyaraApi(`/market/listings?characterId=${cand.characterId}&type=fixed&sort=price_asc&pageSize=20`, {
        auth: false
      }).catch(() => null),
      kyaraApi(`/market/buy-orders?characterId=${cand.characterId}`, { auth: false }).catch(() => null),
      kyaraApi(`/market/prices/${cand.characterId}`, { auth: false }).catch(() => null)
    ]);

    const refMedian = livePricesRes?.median7d ?? cand.median7d;
    const liveDepth = computeLiveMarketDepth(liveListingsRes?.items, refMedian);
    const orders = Array.isArray(liveOrdersRes) ? liveOrdersRes : [];
    const bestBuyOrder = orders.length > 0 ? Math.max(...orders.map((o: any) => Number(o.price) || 0)) : null;

    const liveStats = {
      median7d: refMedian,
      median30d: livePricesRes?.median30d ?? cand.median30d,
      sales7d: livePricesRes?.sales7d ?? cand.sales7d,
      liveDepth,
      lowestFixed: liveDepth.lowestFixed,
      highestFixed: liveDepth.highestFixed,
      bestBuyOrder: Number.isFinite(bestBuyOrder) && bestBuyOrder! > 0 ? bestBuyOrder : null
    };

    const reevaluated = evaluateDuplicate(
      { id: cand.characterId, name: cand.name, rarity: cand.rarity, series: cand.series },
      { characterId: cand.characterId, qty: cand.qty },
      liveStats,
      { [cand.rarity]: cand.recycleValue },
      state.currentSettings,
      cand.activeListedQty
    );

    if (reevaluated.verdict === 'RECYCLER') {
      if (state.currentSettings.autoSellTurboLiquidity !== false) {
        try {
          await kyaraApi(`/me/collection/${cand.characterId}/recycle`, { method: 'POST', body: { qty: 1 } });
          await recordCumulativeMetric({ chakraFromRecycle: cand.recycleValue, cardsRecycled: 1 });
          await appendJournal('recycle', `Recyclage Turbo direct : ${cand.name} (+${cand.recycleValue} ◆) car rentabilité de vente trop faible`);
        } catch {}
      }
      continue;
    }

    if (reevaluated.verdict !== 'VENDRE') {
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
