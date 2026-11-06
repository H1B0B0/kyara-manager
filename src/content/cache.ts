import { RuntimeCache, CatalogItem } from './types';
import { kyaraApi } from './api';
import { DEFAULT_RECYCLE_VALUES } from '../lib/analytics/constants';

export const CATALOG_TTL_MS = 12 * 3600 * 1000;
export const PACK_POOLS_TTL_MS = 12 * 3600 * 1000;
export const PRICES_TTL_MS = 15 * 60 * 1000;

export const runtimeCache: RuntimeCache = {
  catalogById: null,
  catalogAt: 0,
  packPools: {},
  packPoolsAt: 0,
  collectionPrices: new Map(),
  rarityAvgPrices: { C: 3, U: 3, R: 6, E: 18, L: 130, M: 950 },
  recycleMap: { ...DEFAULT_RECYCLE_VALUES }
};

export async function ensureCatalog(force = false): Promise<Map<number, CatalogItem>> {
  const now = Date.now();
  if (!force && runtimeCache.catalogById && now - runtimeCache.catalogAt < CATALOG_TTL_MS) {
    return runtimeCache.catalogById;
  }
  try {
    const { kmCatalogCache } = (await chrome.storage.local.get('kmCatalogCache')) as { kmCatalogCache?: any };
    if (!force && kmCatalogCache?.list?.length && now - kmCatalogCache.at < CATALOG_TTL_MS) {
      const map = new Map<number, CatalogItem>();
      for (const c of kmCatalogCache.list) {
        map.set(Number(c.id), c);
      }
      runtimeCache.catalogById = map;
      runtimeCache.catalogAt = kmCatalogCache.at;
      return map;
    }
  } catch {}

  const raw = await kyaraApi('/characters', { auth: false });
  const slim: CatalogItem[] = (Array.isArray(raw) ? raw : []).map((c: any) => ({
    id: Number(c.id),
    name: c.name,
    series: c.series || '',
    rarity: c.rarity || 'C',
    rank: c.rank ?? 999999
  }));
  const map = new Map<number, CatalogItem>();
  for (const c of slim) {
    map.set(c.id, c);
  }
  runtimeCache.catalogById = map;
  runtimeCache.catalogAt = now;
  await chrome.storage.local
    .set({
      kmCatalogCache: { at: now, list: slim }
    })
    .catch(() => {});
  return map;
}

export async function ensurePackPools(packs: any[], force = false): Promise<Record<string, number[]>> {
  const now = Date.now();
  if (
    !force &&
    Object.keys(runtimeCache.packPools).length > 0 &&
    now - runtimeCache.packPoolsAt < PACK_POOLS_TTL_MS
  ) {
    return runtimeCache.packPools;
  }
  try {
    const { kmPackPoolsCache } = (await chrome.storage.local.get('kmPackPoolsCache')) as { kmPackPoolsCache?: any };
    if (!force && kmPackPoolsCache?.pools && now - kmPackPoolsCache.at < PACK_POOLS_TTL_MS) {
      runtimeCache.packPools = kmPackPoolsCache.pools;
      runtimeCache.packPoolsAt = kmPackPoolsCache.at;
      return runtimeCache.packPools;
    }
  } catch {}

  const pools: Record<string, number[]> = {};
  const validPacks = (Array.isArray(packs) ? packs : []).filter((p) => p?.id);
  const batchSize = 6;
  for (let i = 0; i < validPacks.length; i += batchSize) {
    const batch = validPacks.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (pack) => {
        try {
          const ids = await kyaraApi(`/packs/${encodeURIComponent(pack.id)}/characters`, { auth: false });
          if (Array.isArray(ids)) {
            pools[pack.id] = ids.map(Number).filter(Number.isFinite);
          }
        } catch {
          pools[pack.id] = [];
        }
      })
    );
  }

  runtimeCache.packPools = pools;
  runtimeCache.packPoolsAt = now;
  await chrome.storage.local
    .set({
      kmPackPoolsCache: { at: now, pools }
    })
    .catch(() => {});
  return pools;
}

export async function ensureCollectionPrices(characterIds: number[], force = false): Promise<Map<number, any>> {
  const now = Date.now();
  const missingIds = characterIds.filter((id) => {
    if (force) return true;
    const cached = runtimeCache.collectionPrices.get(id);
    return !cached || now - cached.at > PRICES_TTL_MS;
  });

  const batchSize = 350;
  const chunks: number[][] = [];
  for (let i = 0; i < missingIds.length; i += batchSize) {
    chunks.push(missingIds.slice(i, i + batchSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await kyaraApi(`/me/collection/prices?ids=${chunk.join(',')}`);
        const list = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
        for (const item of list) {
          const cid = Number(item.characterId ?? item.id);
          if (Number.isFinite(cid)) {
            runtimeCache.collectionPrices.set(cid, {
              median7d: item.median7d ?? null,
              median30d: item.median30d ?? null,
              sales7d: item.sales7d ?? null,
              sales30d: item.sales30d ?? null,
              at: now
            });
          }
        }
      } catch {}
    })
  );

  return runtimeCache.collectionPrices;
}
