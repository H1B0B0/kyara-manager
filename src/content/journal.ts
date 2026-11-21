import type { CumulativeStats, HourlyChakraBucket } from '../types/journal';
import * as cacheModule from './cache';
import { RARITY_PRICE_FLOORS } from '../lib/analytics/constants';
import { computeNetProceeds } from '../lib/analytics/fees';

export const JOURNAL_MAX = 80;

function updateHourlyHistory(
  existing: HourlyChakraBucket[] | undefined,
  deltaSales: number,
  deltaRecycle: number
): HourlyChakraBucket[] {
  const list = Array.isArray(existing) ? existing.map((b) => ({ ...b })) : [];
  if (deltaSales <= 0 && deltaRecycle <= 0) return list;
  const hourTs = Math.floor(Date.now() / 3600000) * 3600000;
  const idx = list.findIndex((b) => b.hourTs === hourTs);
  if (idx >= 0) {
    list[idx].salesChakra = (list[idx].salesChakra || 0) + deltaSales;
    list[idx].recycleChakra = (list[idx].recycleChakra || 0) + deltaRecycle;
    list[idx].totalChakra = list[idx].salesChakra + list[idx].recycleChakra;
  } else {
    list.push({ hourTs, salesChakra: deltaSales, recycleChakra: deltaRecycle, totalChakra: deltaSales + deltaRecycle });
  }
  return list.sort((a, b) => a.hourTs - b.hourTs).slice(-24);
}

export async function recordConfirmedSale(id: string, info: { name: string; price: number }): Promise<boolean> {
  return navigator.locks.request('kyara-manager-sales', async () => {
    const { kmRecordedSales } = await chrome.storage.local.get('kmRecordedSales');
    const seen = Array.isArray(kmRecordedSales) ? kmRecordedSales : [];
    if (seen.includes(id)) return false;
    const net = computeNetProceeds(info.price);
    await navigator.locks.request('kyara-manager-metrics', async () => {
      const { kmCumulativeStats } = await chrome.storage.local.get('kmCumulativeStats');
      const current = { ...DEFAULT_CUMULATIVE_STATS, ...(kmCumulativeStats as Partial<CumulativeStats> || {}) };
      const hourlyHistory = updateHourlyHistory(current.hourlyHistory, net, 0);
      await chrome.storage.local.set({
        kmRecordedSales: [id, ...seen].slice(0, 1000),
        kmCumulativeStats: { ...current, cardsSold: current.cardsSold + 1, chakraFromSales: current.chakraFromSales + net, hourlyHistory }
      });
    });
    await appendJournal('sold', `Carte vendue : ${info.name} pour ${info.price} ◆ (net +${net} ◆)`);
    return true;
  });
}

export const DEFAULT_CUMULATIVE_STATS: CumulativeStats = {
  chakraFromSales: 0,
  chakraFromRecycle: 0,
  cardsSold: 0,
  cardsRecycled: 0,
  boostersOpenedCount: 0,
  newCardsPulledCount: 0,
  mythicsPulledCount: 0,
  legendariesPulledCount: 0,
  startedAt: Date.now(),
  hourlyHistory: []
};

export async function recordCumulativeMetric(deltas: Partial<CumulativeStats> = {}): Promise<CumulativeStats | null> {
  return navigator.locks.request('kyara-manager-metrics', async () => {
    try {
      const { kmCumulativeStats } = (await chrome.storage.local.get('kmCumulativeStats')) as { kmCumulativeStats?: any };
      const current = { ...DEFAULT_CUMULATIVE_STATS, ...(kmCumulativeStats || {}) };
      const deltaSales = deltas.chakraFromSales || 0;
      const deltaRecycle = deltas.chakraFromRecycle || 0;
      const hourlyHistory = updateHourlyHistory(current.hourlyHistory, deltaSales, deltaRecycle);
      const updated: CumulativeStats = {
        chakraFromSales: (current.chakraFromSales || 0) + deltaSales,
        chakraFromRecycle: (current.chakraFromRecycle || 0) + deltaRecycle,
        cardsSold: (current.cardsSold || 0) + (deltas.cardsSold || 0),
        cardsRecycled: (current.cardsRecycled || 0) + (deltas.cardsRecycled || 0),
        boostersOpenedCount: (current.boostersOpenedCount || 0) + (deltas.boostersOpenedCount || 0),
        newCardsPulledCount: (current.newCardsPulledCount || 0) + (deltas.newCardsPulledCount || 0),
        mythicsPulledCount: (current.mythicsPulledCount || 0) + (deltas.mythicsPulledCount || 0),
        legendariesPulledCount: (current.legendariesPulledCount || 0) + (deltas.legendariesPulledCount || 0),
        startedAt: current.startedAt || Date.now(),
        hourlyHistory
      };
      await chrome.storage.local.set({ kmCumulativeStats: updated });
      return updated;
    } catch (err) {
      console.warn('[KyaraManager] Failed to record cumulative metric:', err);
      return null;
    }
  });
}

export async function appendJournal(kind: string, text: string, details: any = null): Promise<void> {
  await navigator.locks.request('kyara-manager-journal', async () => {
    try {
      const { kmJournal } = (await chrome.storage.local.get('kmJournal')) as { kmJournal?: any[] };
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        at: Date.now(),
        kind,
        type: kind,
        text,
        message: text,
        details
      };
      const updated = [entry, ...(Array.isArray(kmJournal) ? kmJournal : [])].slice(0, JOURNAL_MAX);
      await chrome.storage.local.set({ kmJournal: updated });
    } catch (err) {
      console.warn('[KyaraManager] Journal write error:', err);
    }
  });
}

const PULL_RARITY_WEIGHT: Record<string, number> = { M: 6, L: 5, E: 4, R: 3, U: 2, C: 1 };

export async function recordBestPulls(cards: any[], packName: string): Promise<void> {
  if (!Array.isArray(cards) || cards.length === 0) return;
  const runtimeCache = cacheModule.runtimeCache as any;
  const eligible: Array<{ card: any; cid: number; rarity: string }> = [];
  for (const card of cards) {
    const cid = Number(card?.id ?? card?.characterId);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    const rarity = String(card?.rarity || 'C').toUpperCase();
    if (!['M', 'L', 'E', 'R'].includes(rarity) && !card?.isNew) continue;
    eligible.push({ card, cid, rarity });
  }
  if (eligible.length === 0) return;

  const missingIds = Array.from(
    new Set(
      [...eligible]
        .sort((a, b) => (PULL_RARITY_WEIGHT[b.rarity] || 0) - (PULL_RARITY_WEIGHT[a.rarity] || 0))
        .filter(({ cid }) => {
          const p = runtimeCache?.collectionPrices?.get?.(cid);
          const m = Number(p?.median7d ?? p?.median30d ?? p?.lastPrice);
          return !Number.isFinite(m) || m <= 0;
        })
        .map(({ cid }) => cid)
    )
  );

  let hydrateFn: any;
  try { hydrateFn = (cacheModule as any).hydrateCharacterPrices; } catch {}
  if (missingIds.length > 0 && typeof hydrateFn === 'function') {
    await hydrateFn(missingIds, { fallbackDetailIds: missingIds, detailLimit: 10 }).catch(() => {});
  }

  await navigator.locks.request('kyara-manager-pulls', async () => {
    try {
      const { kmBestPulls } = (await chrome.storage.local.get('kmBestPulls')) as { kmBestPulls?: any[] };
      const existing = Array.isArray(kmBestPulls) ? kmBestPulls : [];
      const now = Date.now();

      const newEntries: any[] = [];
      for (const { card: c, cid, rarity: r } of eligible) {
        const catalogCard = runtimeCache?.catalogById?.get?.(cid) || { name: '', series: '', image: '' };
        const priceInfo = runtimeCache?.collectionPrices?.get?.(cid);
        const rawReal =
          priceInfo?.median7d ??
          priceInfo?.median30d ??
          priceInfo?.lastPrice ??
          c?.medianPrice ??
          c?.price;
        const parsedReal = Number(rawReal);
        const hasRealPrice = Number.isFinite(parsedReal) && parsedReal > 0;
        const medianPrice = hasRealPrice
          ? parsedReal
          : (RARITY_PRICE_FLOORS[r as keyof typeof RARITY_PRICE_FLOORS] || 5);

        newEntries.push({
          characterId: cid,
          name: c.name || catalogCard.name || `Carte #${cid}`,
          rarity: r,
          series: c.series || catalogCard.series || 'Autre',
          packName: packName || 'Booster',
          pulledAt: now,
          isNew: Boolean(c.isNew),
          image: c.image || (catalogCard as any).image || `https://cdn.kyara.games/cards/${cid}.webp`,
          medianPrice,
          ...(hasRealPrice ? {} : { isFloorFallback: true })
        });
      }

      if (newEntries.length === 0) return;

      const combined = [...newEntries, ...existing];
      combined.sort((a, b) => {
        const wA = PULL_RARITY_WEIGHT[a.rarity] || 0;
        const wB = PULL_RARITY_WEIGHT[b.rarity] || 0;
        if (wB !== wA) return wB - wA;
        return b.pulledAt - a.pulledAt;
      });

      const trimmed = combined.slice(0, 60);
      await chrome.storage.local.set({ kmBestPulls: trimmed });
    } catch {}
  });
}
