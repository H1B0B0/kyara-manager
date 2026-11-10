import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';
import { mapLimit } from '../../lib/concurrency';
import { nextRepriceCeiling, resolveSellProfile } from '../../lib/analytics/sell-profile';
import type { CardLedger } from '../safety';

const HINTS_KEY = 'kmRepriceHints';
export const HINT_TTL_MS = 24 * 3600 * 1000;

/** After a listing stalls, the next listing of that card must start below this price. */
export interface RepriceHint {
  ceiling: number;
  steps: number;
  at: number;
}

export async function loadRepriceHints(now = Date.now()): Promise<Map<number, RepriceHint>> {
  const stored = (await chrome.storage.local.get(HINTS_KEY)) as Record<string, Record<string, RepriceHint> | undefined>;
  const hints = new Map<number, RepriceHint>();
  for (const [id, hint] of Object.entries(stored[HINTS_KEY] || {})) {
    if (hint && now - Number(hint.at) < HINT_TTL_MS && Number(hint.ceiling) > 0) hints.set(Number(id), hint);
  }
  return hints;
}

export async function saveRepriceHints(hints: Map<number, RepriceHint>): Promise<void> {
  await chrome.storage.local.set({ [HINTS_KEY]: Object.fromEntries(hints) });
}

/** Called when a sale is confirmed: the market accepted our price, so stop stepping it down. */
export async function clearRepriceHint(characterId: number): Promise<void> {
  const hints = await loadRepriceHints();
  if (hints.delete(Number(characterId))) await saveRepriceHints(hints);
}

const listingCharacterId = (listing: any): number => Number(listing?.character?.id ?? listing?.characterId);

interface RetireInput {
  book: CardLedger;
  duplicates: any[];
  hints: Map<number, RepriceHint>;
  settings: typeof state.currentSettings;
}

/**
 * Cancels listings that stalled longer than their price tier allows, in parallel, and records
 * a lower price ceiling for each card so the relisting really moves instead of repeating itself.
 */
export async function retireStaleListings({ book, duplicates, hints, settings }: RetireInput) {
  const chars = new Set<number>();
  if (Number(settings.autoSellExpireHours ?? 12) <= 0) return { cancelled: 0, chars };

  const now = Date.now();
  const { kmPinnedCards = [] } = await chrome.storage.local.get('kmPinnedCards');
  const pinned = new Set<number>((Array.isArray(kmPinnedCards) ? kmPinnedCards : []).map(Number));
  const recycleRarities: string[] = Array.isArray(settings.autoRecycleRarities) ? settings.autoRecycleRarities : ['C', 'U'];
  const dupById = new Map<number, any>(duplicates.map((d) => [Number(d.characterId), d]));

  const stale = [...book.listings].filter((listing) => {
    const characterId = listingCharacterId(listing);
    const rarity = listing.character?.rarity || listing.rarity || dupById.get(characterId)?.rarity;
    const createdMs = Date.parse(listing.createdAt || '');
    if (!Number.isFinite(createdMs) || pinned.has(characterId)) return false;
    if ((rarity === 'M' && !settings.autoSellIncludeM) || (rarity === 'L' && settings.autoSellIncludeL === false)) return false;
    const dup = dupById.get(characterId);
    const profile = dup?.sellProfile ?? resolveSellProfile(settings, Number(listing.price) || null);
    if (now - createdMs < profile.staleMinutes * 60000) return false;
    // Already at the safety floor: cancelling would only burn a deposit fee, unless we can recycle instead.
    const canRecycle = profile.recycleStale && settings.autoRecycleEnabled && recycleRarities.includes(rarity);
    const floor = Number(dup?.prices?.minSafe) || 0;
    return !(floor > 0 && Number(listing.price) <= floor && !canRecycle);
  });

  if (!stale.length) return { cancelled: 0, chars };
  if (settings.dryRun) {
    for (const listing of stale) {
      await appendJournal('sell', `[SIMULATION] Réévaluerait l'annonce stagnante : ${listing.name || listing.character?.name || listingCharacterId(listing)}`);
    }
    return { cancelled: 0, chars };
  }

  const results = await mapLimit(stale, 3, async (listing) => {
    await kyaraApi(`/market/listings/${encodeURIComponent(listing.id)}/cancel`, { method: 'POST', priority: 'high' });
    return listing;
  });

  let cancelled = 0;
  const failures: string[] = [];
  results.forEach((result) => {
    if (result.status === 'rejected') {
      failures.push(String(result.reason?.message || result.reason));
      return;
    }
    const listing = result.value;
    const characterId = listingCharacterId(listing);
    const dup = dupById.get(characterId);
    const profile = dup?.sellProfile ?? resolveSellProfile(settings, Number(listing.price) || null);
    book.listingCancelled(listing.id);
    state.previousActiveListings.delete(String(listing.id));
    hints.set(characterId, {
      ceiling: nextRepriceCeiling(Number(listing.price), profile.repriceDiscountPct),
      steps: (hints.get(characterId)?.steps || 0) + 1,
      at: now
    });
    chars.add(characterId);
    cancelled += 1;
  });
  if (cancelled) {
    await saveRepriceHints(hints);
    await appendJournal('info', `${cancelled} annonce(s) stagnante(s) retirée(s) : relancées moins chères après réévaluation.`);
  }
  if (failures.length) await appendJournal('warn', `Retrait impossible (${failures.length}) : ${failures[0]}`);
  return { cancelled, chars };
}
