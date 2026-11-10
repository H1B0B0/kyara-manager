import { kyaraApi } from './api';
import { state } from './state';
import { computeSpareCopies } from '../lib/analytics/fees';
import { extractActiveListings } from './snapshot';

export function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} invalide`);
  return number;
}

/** True once the page runtime is gone or the user switched the autopilot off mid-run. */
export function isInterrupted(): boolean {
  return (
    state.disposed ||
    state.updatePending ||
    !chrome.runtime?.id ||
    (state.abortWhenMasterOff && !state.currentSettings.masterEnabled)
  );
}

export interface CardAvailability {
  entry: any;
  listings: any[];
  pinned: Set<number>;
  listed: number;
  spare: number;
}

type ReserveKind = 'recycle' | 'list';

/**
 * A fresh, in-memory view of what can still be sold or recycled.
 * It is loaded with two requests instead of two per card, and every action reserves its copies
 * synchronously first, so parallel tasks (recycling and selling) can never spend the same copy twice.
 */
export interface CardLedger {
  readonly listings: any[];
  get(characterId: number): CardAvailability;
  reserve(characterId: number, qty: number, kind: ReserveKind): boolean;
  release(characterId: number, qty: number, kind: ReserveKind): void;
  listingCreated(listing: { id: string; characterId: number; price: number; createdAt?: string }): void;
  listingCancelled(listingId: string): void;
}

const listingCharacterId = (item: any): number => Number(item?.character?.id ?? item?.characterId);

export function buildCardLedger(collection: any[], marketListings: any[], pinnedIds: number[]): CardLedger {
  const pinned = new Set<number>(pinnedIds.map(Number));
  const entries = new Map<number, any>();
  for (const item of collection) entries.set(Number(item.characterId ?? item.id), item);
  const listings = extractActiveListings({ listings: marketListings });
  const recycled = new Map<number, number>();
  const pendingList = new Map<number, number>();
  const add = (map: Map<number, number>, id: number, qty: number) =>
    map.set(id, Math.max(0, (map.get(id) || 0) + qty));

  const get = (characterId: number): CardAvailability => {
    const base = entries.get(characterId);
    const gone = recycled.get(characterId) || 0;
    const entry = !base
      ? base
      : {
          ...base,
          qty: Math.max(0, Number(base.qty) - gone),
          ...(base.listable !== undefined && base.listable !== null
            ? { listable: Math.max(0, Number(base.listable) - gone) }
            : {})
        };
    const listed =
      (pendingList.get(characterId) || 0) +
      listings.reduce(
        (sum, item) => sum + (listingCharacterId(item) === characterId ? Math.max(1, Number(item.qty) || 1) : 0),
        0
      );
    const keep = Math.max(1, Math.floor(Number(state.currentSettings.autoRecycleKeepCopies) || 1));
    const spare = pinned.has(characterId) ? 0 : Math.max(0, computeSpareCopies(entry, listed) - (keep - 1));
    return { entry, listings, pinned, listed, spare };
  };

  return {
    listings,
    get,
    reserve(characterId, qty, kind) {
      if (!Number.isInteger(qty) || qty <= 0 || qty > get(characterId).spare) return false;
      add(kind === 'recycle' ? recycled : pendingList, characterId, qty);
      return true;
    },
    release(characterId, qty, kind) {
      add(kind === 'recycle' ? recycled : pendingList, characterId, -qty);
    },
    listingCreated(listing) {
      add(pendingList, listing.characterId, -1);
      listings.push({ ...listing, status: 'active', qty: 1 });
    },
    listingCancelled(listingId) {
      const index = listings.findIndex((item) => String(item.id) === String(listingId));
      if (index >= 0) listings.splice(index, 1);
    }
  };
}

/** Never authorize a destructive action from a cached dashboard. */
export async function loadCardLedger(): Promise<CardLedger> {
  const [collection, market, stored] = await Promise.all([
    kyaraApi('/me/collection?lean=1'),
    kyaraApi('/me/market'),
    chrome.storage.local.get('kmPinnedCards')
  ]);
  if (!Array.isArray(collection) || !Array.isArray(market?.listings)) {
    throw new Error('Collection ou annonces indisponibles. Action annulée.');
  }
  return buildCardLedger(collection, market.listings, Array.isArray(stored.kmPinnedCards) ? stored.kmPinnedCards : []);
}

/** Single-card check used by manual commands. */
export async function getCardAvailability(characterId: number): Promise<CardAvailability> {
  return (await loadCardLedger()).get(characterId);
}
