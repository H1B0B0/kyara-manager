import { CumulativeStats } from './types';
import { runtimeCache } from './cache';
import { RARITY_PRICE_FLOORS } from '../lib/analytics/constants';

export const JOURNAL_MAX = 80;

export const DEFAULT_CUMULATIVE_STATS: CumulativeStats = {
  chakraFromSales: 0,
  chakraFromRecycle: 0,
  cardsSold: 0,
  cardsRecycled: 0,
  boostersOpenedCount: 0,
  newCardsPulledCount: 0,
  mythicsPulledCount: 0,
  legendariesPulledCount: 0,
  startedAt: Date.now()
};

export async function recordCumulativeMetric(deltas: Partial<CumulativeStats> = {}): Promise<CumulativeStats | null> {
  try {
    const { kmCumulativeStats } = (await chrome.storage.local.get('kmCumulativeStats')) as { kmCumulativeStats?: any };
    const current = { ...DEFAULT_CUMULATIVE_STATS, ...(kmCumulativeStats || {}) };
    const updated: CumulativeStats = {
      chakraFromSales: (current.chakraFromSales || 0) + (deltas.chakraFromSales || 0),
      chakraFromRecycle: (current.chakraFromRecycle || 0) + (deltas.chakraFromRecycle || 0),
      cardsSold: (current.cardsSold || 0) + (deltas.cardsSold || 0),
      cardsRecycled: (current.cardsRecycled || 0) + (deltas.cardsRecycled || 0),
      boostersOpenedCount: (current.boostersOpenedCount || 0) + (deltas.boostersOpenedCount || 0),
      newCardsPulledCount: (current.newCardsPulledCount || 0) + (deltas.newCardsPulledCount || 0),
      mythicsPulledCount: (current.mythicsPulledCount || 0) + (deltas.mythicsPulledCount || 0),
      legendariesPulledCount: (current.legendariesPulledCount || 0) + (deltas.legendariesPulledCount || 0),
      startedAt: current.startedAt || Date.now()
    };
    await chrome.storage.local.set({ kmCumulativeStats: updated });
    return updated;
  } catch (err) {
    console.warn('[KyaraManager] Failed to record cumulative metric:', err);
    return null;
  }
}

export async function appendJournal(kind: string, text: string, details: any = null): Promise<void> {
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
}

export async function recordBestPulls(cards: any[], packName: string): Promise<void> {
  if (!Array.isArray(cards) || cards.length === 0) return;
  try {
    const { kmBestPulls } = (await chrome.storage.local.get('kmBestPulls')) as { kmBestPulls?: any[] };
    const existing = Array.isArray(kmBestPulls) ? kmBestPulls : [];
    const now = Date.now();
    const RARITY_WEIGHT: Record<string, number> = { M: 6, L: 5, E: 4, R: 3, U: 2, C: 1 };

    const newEntries: any[] = [];
    for (const c of cards) {
      const cid = Number(c.id ?? c.characterId);
      if (!Number.isFinite(cid)) continue;
      const r = (c.rarity || 'C').toUpperCase();
      if (!['M', 'L', 'E', 'R'].includes(r) && !c.isNew) continue;

      const catalogCard = runtimeCache.catalogById?.get(cid) || { name: '', series: '', image: '' };
      const priceInfo = runtimeCache.collectionPrices?.get(cid);
      const medianPrice = Number.isFinite(priceInfo?.median7d)
        ? priceInfo!.median7d
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
        medianPrice
      });
    }

    if (newEntries.length === 0) return;

    const combined = [...newEntries, ...existing];
    combined.sort((a, b) => {
      const wA = RARITY_WEIGHT[a.rarity] || 0;
      const wB = RARITY_WEIGHT[b.rarity] || 0;
      if (wB !== wA) return wB - wA;
      return b.pulledAt - a.pulledAt;
    });

    const trimmed = combined.slice(0, 60);
    await chrome.storage.local.set({ kmBestPulls: trimmed });
  } catch {}
}
