import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';
import { mapLimit } from '../../lib/concurrency';
import { nextRepriceCeiling, resolveSellProfile } from '../../lib/analytics/sell-profile';
import type { CardLedger } from '../safety';
import { fetchLiveStats } from './sell-live';

const HINTS_KEY = 'kmRepriceHints';
export const HINT_TTL_MS = 24 * 3600 * 1000;

/** After a listing stalls, the next listing of that card must start below this price. */
export interface RepriceHint {
  ceiling: number;
  steps: number;
  at: number;
  evictedUntil?: number;
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
 * Cancels listings that stalled longer than their price tier allows, or got undercut, in parallel,
 * and records a lower price ceiling (or eviction cooldown) so inventory moves efficiently.
 */
export async function retireStaleListings({ book, duplicates, hints, settings }: RetireInput) {
  const chars = new Set<number>();
  if (Number(settings.autoSellExpireHours ?? 12) <= 0 || !book.listings.length) return { cancelled: 0, chars };

  const now = Date.now();
  const { kmPinnedCards = [] } = await chrome.storage.local.get('kmPinnedCards');
  const pinned = new Set<number>((Array.isArray(kmPinnedCards) ? kmPinnedCards : []).map(Number));
  const recycleRarities: string[] = Array.isArray(settings.autoRecycleRarities) ? settings.autoRecycleRarities : ['C', 'U'];
  const dupById = new Map<number, any>(duplicates.map((d) => [Number(d.characterId), d]));

  // First, fetch live lowest market price in parallel for all active listings (max 10)
  const liveStatsResults = await mapLimit(book.listings, 5, (l) =>
    fetchLiveStats({ characterId: listingCharacterId(l) }).catch(() => null)
  );
  const liveLowestByListing = new Map<string, number | null>();
  book.listings.forEach((listing, idx) => {
    const res = liveStatsResults[idx];
    const stats = res && res.status === 'fulfilled' ? res.value : null;
    liveLowestByListing.set(String(listing.id), stats?.lowestFixed ?? null);
  });

  const staleItems: Array<{ listing: any; liveLowest: number | null; isEvicted: boolean }> = [];

  for (const listing of book.listings) {
    const characterId = listingCharacterId(listing);
    const rarity = listing.character?.rarity || listing.rarity || dupById.get(characterId)?.rarity;
    const createdMs = Date.parse(listing.createdAt || '');
    if (!Number.isFinite(createdMs) || pinned.has(characterId)) continue;
    if ((rarity === 'M' && !settings.autoSellIncludeM) || (rarity === 'L' && settings.autoSellIncludeL === false)) continue;

    const dup = dupById.get(characterId);
    const profile = dup?.sellProfile ?? resolveSellProfile(settings, Number(listing.price) || null);
    const ageMinutes = (now - createdMs) / 60000;
    const liveLowest = liveLowestByListing.get(String(listing.id)) ?? null;

    // Check triggers:
    // a) Undercut detected: ageMinutes >= 15 AND liveLowest !== null && liveLowest < Number(listing.price)
    // b) Stale timer reached: ageMinutes >= profile.staleMinutes (20m fast, 45m normal, 90m patient)
    const isUndercut = ageMinutes >= 15 && liveLowest !== null && liveLowest < Number(listing.price);
    const isStale = ageMinutes >= profile.staleMinutes;
    if (!isUndercut && !isStale) continue;

    const canRecycle = profile.recycleStale && settings.autoRecycleEnabled && recycleRarities.includes(rarity);
    const floor = Number(dup?.prices?.minSafe) || 0;
    let isEvicted = false;

    // Eliminate the Floor Deadlock
    if (floor > 0 && Number(listing.price) <= floor) {
      if (canRecycle) {
        // Cancel it so auto-sell recycles it immediately
      } else if (ageMinutes >= profile.staleMinutes * 2) {
        // Stalled at floor for 2x stale window: free the slot if slots are full or other cards wait in inventory
        const maxSlots = Math.max(1, Math.min(10, Number(settings.autoSellMaxListings ?? 10)));
        const hasWaiting = duplicates.some(
          (d: any) =>
            Number(d.characterId) !== characterId &&
            !pinned.has(Number(d.characterId)) &&
            (d.spare > 0 || d.canAutoSell)
        );
        if (book.listings.length >= maxSlots || hasWaiting) {
          isEvicted = true;
        } else {
          continue;
        }
      } else {
        // Within 2x window at floor with no recycle: keep listing
        continue;
      }
    }

    staleItems.push({ listing, liveLowest, isEvicted });
  }

  if (!staleItems.length) return { cancelled: 0, chars };
  if (settings.dryRun) {
    for (const item of staleItems) {
      await appendJournal(
        'sell',
        `[SIMULATION] Réévaluerait l'annonce stagnante : ${item.listing.name || item.listing.character?.name || listingCharacterId(item.listing)}${item.isEvicted ? ' (éviction temporaire)' : ''}`
      );
    }
    return { cancelled: 0, chars };
  }

  const results = await mapLimit(staleItems, 3, async (item) => {
    await kyaraApi(`/market/listings/${encodeURIComponent(item.listing.id)}/cancel`, { method: 'POST', priority: 'high' });
    return item;
  });

  let cancelled = 0;
  const failures: string[] = [];
  results.forEach((result) => {
    if (result.status === 'rejected') {
      failures.push(String(result.reason?.message || result.reason));
      return;
    }
    const { listing, liveLowest, isEvicted } = result.value;
    const characterId = listingCharacterId(listing);
    const dup = dupById.get(characterId);
    const profile = dup?.sellProfile ?? resolveSellProfile(settings, Number(listing.price) || null);
    book.listingCancelled(listing.id);
    state.previousActiveListings.delete(String(listing.id));

    let ceiling = nextRepriceCeiling(Number(listing.price), profile.repriceDiscountPct);
    if (liveLowest !== null && liveLowest < Number(listing.price)) {
      ceiling = Math.min(ceiling, Math.max(1, liveLowest - 1));
    }

    const hintEntry: RepriceHint = {
      ceiling,
      steps: (hints.get(characterId)?.steps || 0) + 1,
      at: now
    };
    if (isEvicted) {
      hintEntry.evictedUntil = now + 2 * 3600 * 1000;
    }
    hints.set(characterId, hintEntry);
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
