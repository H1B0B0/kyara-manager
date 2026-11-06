import { kyaraApi } from './api';
import { state } from './state';
import { computeSpareCopies } from '../lib/analytics/fees';
import { extractActiveListings } from './snapshot';

export function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} invalide`);
  return number;
}

/** Never authorize a destructive action from a cached dashboard. */
export async function getCardAvailability(characterId: number) {
  const [collection, market, stored] = await Promise.all([
    kyaraApi('/me/collection?lean=1'),
    kyaraApi('/me/market'),
    chrome.storage.local.get('kmPinnedCards')
  ]);
  if (!Array.isArray(collection) || !Array.isArray(market?.listings)) {
    throw new Error('Collection ou annonces indisponibles. Action annulée.');
  }
  const pinned = new Set<number>((Array.isArray(stored.kmPinnedCards) ? stored.kmPinnedCards : []).map(Number));
  const entry = collection.find((item: any) => Number(item.characterId ?? item.id) === characterId);
  const listings = extractActiveListings(market);
  const listed = listings.reduce((sum: number, item: any) =>
    sum + (Number(item.character?.id ?? item.characterId) === characterId ? Math.max(1, Number(item.qty) || 1) : 0), 0);
  const keep = Math.max(1, Math.floor(Number(state.currentSettings.autoRecycleKeepCopies) || 1));
  const spare = pinned.has(characterId) ? 0 : Math.max(0, computeSpareCopies(entry, listed) - (keep - 1));
  return { entry, listings, pinned, listed, spare };
}
