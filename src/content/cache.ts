import { RuntimeCache, CatalogItem } from './types';
import { kyaraApi } from './api';
import { mapLimit } from '../lib/concurrency';
import { DEFAULT_RECYCLE_VALUES } from '../lib/analytics/constants';

export const CATALOG_TTL_MS = 12 * 3600 * 1000;
export const PACK_POOLS_TTL_MS = 12 * 3600 * 1000;
export const PRICES_TTL_MS = 15 * 60 * 1000;
const NEGATIVE_PRICE_TTL_MS = 5 * 60 * 1000;
const FAIR_PLAY_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const HIGH_FLOOR_PRICES = new Set([15, 100, 815]);
const ALL_FLOOR_PRICES = new Set([3, 15, 100, 815]);
const PRICE_CACHE_MAX_ENTRIES = 2000;

export interface HydratePricesOptions {
  force?: boolean;
  fallbackDetailIds?: number[];
  detailLimit?: number;
}

export const runtimeCache: RuntimeCache = {
  catalogById: null,
  catalogAt: 0,
  packPools: {},
  packPoolsAt: 0,
  collectionPrices: new Map(),
  ownedIds: new Set(),
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
          const data = await kyaraApi(`/packs/${encodeURIComponent(pack.id)}/characters`, { auth: false });
          const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.characters)
              ? data.characters
              : Array.isArray(data?.items)
                ? data.items
                : [];
          pools[pack.id] = rawList
            .map((entry: any) => Number(entry && typeof entry === 'object' ? (entry.id ?? entry.characterId) : entry))
            .filter(Number.isFinite);
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

function numVal(v: unknown, allowZero = false): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : null;
}

function uniquePositiveIds(ids: number[]): number[] {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isFinite(id) && id > 0)));
}

function chunkIds(ids: number[], size = 200): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

export function extractPriceEntry(raw: unknown, now = Date.now()): any | null {
  if (typeof raw === 'number') {
    const val = numVal(raw);
    return val === null ? null : { median7d: val, median30d: null, sales7d: 1, sales30d: null, lowestFixed: null, lastPrice: null, at: now };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, any>;
  const nested = src.prices && typeof src.prices === 'object' && !Array.isArray(src.prices) ? src.prices : null;
  const item = nested ? { ...src, ...nested } : src;

  const rawMedian30d = numVal(item.median30d);
  const rawLastPrice = numVal(item.lastPrice);
  const median7d =
    numVal(item.median7d) ?? numVal(item.median) ?? numVal(item.fairPrice) ?? numVal(item.refPrice) ?? numVal(item.price) ?? rawMedian30d ?? rawLastPrice;
  const median30d = rawMedian30d ?? numVal(item.median) ?? null;
  const lowestFixed = numVal(item.lowestFixed) ?? numVal(item.lowestPrice) ?? null;
  const sales7d = numVal(item.sales7d, true);
  const sales30d = numVal(item.sales30d, true);
  if (median7d === null && median30d === null && rawLastPrice === null && lowestFixed === null && sales7d === null && sales30d === null) {
    return null;
  }
  return { median7d, median30d, sales7d: sales7d ?? (median7d !== null ? 1 : 0), sales30d, lowestFixed, lastPrice: rawLastPrice, at: now };
}

function mergeCachedPrice(cid: number, parsed: any, source: 'collection' | 'fair-play' | 'detail', force: boolean): void {
  const existing = runtimeCache.collectionPrices.get(cid) as any;
  if (source === 'fair-play') {
    if (parsed.median7d === null && parsed.median30d === null && parsed.lastPrice === null) return;
    runtimeCache.collectionPrices.set(cid, {
      ...existing,
      median7d: !force && Number(existing?.median7d) > 0 ? existing.median7d : (parsed.median7d ?? existing?.median7d ?? null),
      median30d: existing?.median30d ?? parsed.median30d ?? parsed.median7d ?? null,
      sales7d: Number(existing?.sales7d) > 0 ? existing.sales7d : (parsed.sales7d ?? 1),
      sales30d: existing?.sales30d ?? parsed.sales30d ?? null,
      lowestFixed: existing?.lowestFixed ?? parsed.lowestFixed ?? null,
      lastPrice: existing?.lastPrice ?? parsed.lastPrice ?? null,
      source: existing?.source === 'detail' && !force ? 'detail' : 'fair-play',
      at: parsed.at
    } as any);
    return;
  }
  const keep = !force && Number(existing?.median7d) > 0 && parsed.median7d === null;
  runtimeCache.collectionPrices.set(cid, {
    ...existing,
    median7d: keep ? existing.median7d : parsed.median7d,
    median30d: parsed.median30d ?? (keep ? existing?.median30d : null) ?? null,
    sales7d: parsed.sales7d ?? existing?.sales7d ?? 0,
    sales30d: parsed.sales30d ?? existing?.sales30d ?? null,
    lowestFixed: parsed.lowestFixed ?? existing?.lowestFixed ?? null,
    lastPrice: parsed.lastPrice ?? existing?.lastPrice ?? null,
    source: keep ? existing?.source : source,
    at: parsed.at
  } as any);
}

function applyPricePayload(res: unknown, now: number, source: 'collection' | 'fair-play', force: boolean): void {
  if (!res) return;
  const payload = !Array.isArray(res) && typeof res === 'object' ? ((res as any).prices ?? (res as any).items ?? res) : res;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const cid = Number((item as any)?.characterId ?? (item as any)?.id);
      const parsed = cid > 0 ? extractPriceEntry(item, now) : null;
      if (Number.isFinite(cid) && parsed) mergeCachedPrice(cid, parsed, source, force);
    }
    return;
  }
  if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload)) {
      const cid = Number(k);
      const parsed = Number.isFinite(cid) && cid > 0 ? extractPriceEntry(v, now) : null;
      if (parsed) mergeCachedPrice(cid, parsed, source, force);
    }
  }
}

export async function ensureCollectionPrices(characterIds: number[], force = false): Promise<Map<number, any>> {
  const now = Date.now();
  const uniqueIds = uniquePositiveIds(characterIds);
  if (uniqueIds.length === 0) return runtimeCache.collectionPrices;

  const missingIds = uniqueIds.filter((id) => {
    if (force) return true;
    const cached = runtimeCache.collectionPrices.get(id) as any;
    if (!cached) return true;
    if (Number(cached.median7d) > 0 && now - cached.at <= PRICES_TTL_MS) return false;
    if ((cached.source === 'collection' || cached.source === 'detail') && now - cached.at <= NEGATIVE_PRICE_TTL_MS) {
      return false;
    }
    return true;
  });

  await mapLimit(chunkIds(missingIds), 3, async (chunk) => {
    try {
      const res = await kyaraApi(`/me/collection/prices?ids=${chunk.join(',')}`);
      for (const cid of chunk) {
        const existing = runtimeCache.collectionPrices.get(cid) as any;
        const stale =
          !existing ||
          force ||
          now - existing.at > PRICES_TTL_MS ||
          (!(Number(existing.median7d) > 0) && now - existing.at > NEGATIVE_PRICE_TTL_MS);
        if (stale) {
          runtimeCache.collectionPrices.set(cid, {
            ...existing, median7d: null, median30d: null, sales7d: 0, sales30d: 0,
            lowestFixed: existing?.lowestFixed ?? null, lastPrice: existing?.lastPrice ?? null, source: 'collection', at: now
          } as any);
        }
      }
      applyPricePayload(res, now, 'collection', force);
    } catch {}
  });

  const unresolvedIds = uniqueIds.filter((id) => !(Number(runtimeCache.collectionPrices.get(id)?.median7d) > 0));
  if (unresolvedIds.length > 0) await ensureFairPlayPrices(unresolvedIds, force);
  return runtimeCache.collectionPrices;
}

/**
 * Bulk-hydrates reference market prices for any character IDs (including unowned cards)
 * via Kyara's `GET /api/fair-play/prices?ids=` endpoint (max 200 IDs per request).
 */
export async function ensureFairPlayPrices(characterIds: number[], force = false): Promise<Map<number, any>> {
  const now = Date.now();
  const missingIds = uniquePositiveIds(characterIds).filter((id) => {
    if (force) return true;
    const cached = runtimeCache.collectionPrices.get(id) as any;
    if (!cached) return true;
    if (Number(cached.median7d) > 0 && now - cached.at <= PRICES_TTL_MS) return false;
    return !(cached._fpAt && now - cached._fpAt < FAIR_PLAY_RETRY_COOLDOWN_MS);
  });
  if (missingIds.length === 0) return runtimeCache.collectionPrices;

  await mapLimit(chunkIds(missingIds), 3, async (chunk) => {
    try {
      const res = await kyaraApi(`/fair-play/prices?ids=${chunk.join(',')}`, { auth: true });
      for (const cid of chunk) {
        const existing = runtimeCache.collectionPrices.get(cid) as any;
        if (existing) existing._fpAt = now;
        else runtimeCache.collectionPrices.set(cid, { median7d: null, median30d: null, sales7d: 0, sales30d: null, _fpAt: now, at: now } as any);
      }
      applyPricePayload(res, now, 'fair-play', force);
    } catch {}
  });
  return runtimeCache.collectionPrices;
}

function combineParsed(base: any, next: any, now: number): any {
  if (!next) return base;
  if (!base) return next;
  return {
    median7d: next.median7d ?? base.median7d ?? null,
    median30d: next.median30d ?? base.median30d ?? null,
    sales7d: next.sales7d > 0 ? next.sales7d : base.sales7d,
    sales30d: next.sales30d ?? base.sales30d ?? null,
    lowestFixed: next.lowestFixed ?? base.lowestFixed ?? null,
    lastPrice: next.lastPrice ?? base.lastPrice ?? null,
    at: now
  };
}

async function fetchDetailPrice(cid: number): Promise<void> {
  const now = Date.now();
  let lowestFixed: number | null = null;
  let parsed = extractPriceEntry(await kyaraApi(`/market/prices/${cid}`, { auth: false }).catch(() => null), now);

  if (!parsed || !(Number(parsed.median7d) > 0)) {
    const ch = await kyaraApi(`/characters/${cid}`, { auth: false }).catch(() => null);
    parsed = combineParsed(parsed, extractPriceEntry(ch?.prices ?? ch, now), now);
  }
  if (!parsed || !(Number(parsed.median7d) > 0)) {
    const lst = await kyaraApi(`/market/listings?characterId=${cid}&sort=price_asc&pageSize=1`).catch(() => null);
    const firstItem = Array.isArray(lst?.items) ? lst.items[0] : Array.isArray(lst) ? lst[0] : null;
    if (firstItem && typeof firstItem === 'object') {
      lowestFixed = numVal(firstItem.price);
      const lstSource = firstItem.prices && typeof firstItem.prices === 'object' ? firstItem.prices : { ...firstItem, price: undefined };
      parsed = combineParsed(parsed, extractPriceEntry(lstSource, now), now);
    }
  }

  const existing = runtimeCache.collectionPrices.get(cid) as any;
  runtimeCache.collectionPrices.set(cid, {
    ...existing,
    median7d: parsed?.median7d ?? existing?.median7d ?? null,
    median30d: parsed?.median30d ?? existing?.median30d ?? null,
    sales7d: parsed?.sales7d ?? existing?.sales7d ?? 0,
    sales30d: parsed?.sales30d ?? existing?.sales30d ?? null,
    lowestFixed: lowestFixed ?? parsed?.lowestFixed ?? existing?.lowestFixed ?? null,
    lastPrice: parsed?.lastPrice ?? existing?.lastPrice ?? null,
    source: 'detail',
    at: now
  } as any);
}

async function restorePriceCache(now: number): Promise<void> {
  try {
    const storage = typeof chrome !== 'undefined' ? chrome?.storage?.local : null;
    if (!storage?.get) return;
    const stored = (await storage.get('kmPriceCache')) as { kmPriceCache?: any } | undefined;
    const rawEntries = stored?.kmPriceCache?.entries;
    if (!rawEntries || typeof rawEntries !== 'object') return;
    for (const [k, v] of Object.entries(rawEntries)) {
      const cid = Number(k);
      const item = v as any;
      if (!Number.isFinite(cid) || cid <= 0 || !item || now - Number(item.at || 0) > PRICES_TTL_MS || runtimeCache.collectionPrices.has(cid)) continue;
      const m7 = numVal(item.m7 ?? item.median7d);
      if (!m7) continue;
      runtimeCache.collectionPrices.set(cid, {
        median7d: m7, median30d: numVal(item.m30 ?? item.median30d),
        sales7d: numVal(item.s7 ?? item.sales7d, true) ?? 0, sales30d: numVal(item.s30 ?? item.sales30d, true),
        lowestFixed: numVal(item.lf ?? item.lowestFixed), lastPrice: numVal(item.lp ?? item.lastPrice),
        source: item.src, at: Number(item.at)
      } as any);
    }
  } catch {}
}

async function persistPriceCache(now: number): Promise<void> {
  try {
    const storage = typeof chrome !== 'undefined' ? chrome?.storage?.local : null;
    if (!storage?.set) return;
    const entries: Record<string, any> = {};
    let count = 0;
    for (const [cid, p] of runtimeCache.collectionPrices.entries()) {
      if (count >= PRICE_CACHE_MAX_ENTRIES) break;
      const m7 = numVal(p?.median7d);
      if (!m7 || now - Number(p?.at || 0) > PRICES_TTL_MS) continue;
      entries[String(cid)] = {
        m7, m30: p.median30d ?? null, s7: p.sales7d ?? 0, s30: p.sales30d ?? null,
        lf: (p as any).lowestFixed ?? null, lp: (p as any).lastPrice ?? null, src: (p as any).source, at: p.at
      };
      count += 1;
    }
    await storage.set({ kmPriceCache: { at: now, entries } }).catch(() => {});
  } catch {}
}

export async function hydrateCharacterPrices(
  characterIds: number[],
  options: HydratePricesOptions = {}
): Promise<Map<number, any>> {
  const now = Date.now();
  const force = Boolean(options.force);
  const detailLimit = Math.max(0, Number.isFinite(Number(options.detailLimit)) ? Math.floor(Number(options.detailLimit)) : 30);

  if (!force) await restorePriceCache(now);
  const allIds = uniquePositiveIds([...(characterIds || []), ...(options.fallbackDetailIds || [])]);
  if (allIds.length > 0) await ensureCollectionPrices(allIds, force);

  if (detailLimit > 0 && Array.isArray(options.fallbackDetailIds) && options.fallbackDetailIds.length > 0) {
    const detailCandidates = uniquePositiveIds(options.fallbackDetailIds)
      .filter((cid) => {
        const cached = runtimeCache.collectionPrices.get(cid) as any;
        if (!cached) return true;
        const med = Number(cached.median7d);
        if (!Number.isFinite(med) || med <= 0) return force || cached.source !== 'detail' || now - cached.at > PRICES_TTL_MS;
        const suspiciousFloor =
          HIGH_FLOOR_PRICES.has(med) || (cached.source === 'fair-play' && ALL_FLOOR_PRICES.has(med));
        return cached.source !== 'detail' && (force || suspiciousFloor || Number(cached.sales7d ?? 0) === 0);
      })
      .sort((a, b) => (Number(runtimeCache.collectionPrices.get(a)?.median7d) > 0 ? 1 : 0) - (Number(runtimeCache.collectionPrices.get(b)?.median7d) > 0 ? 1 : 0))
      .slice(0, detailLimit);

    if (detailCandidates.length > 0) await mapLimit(detailCandidates, 4, (cid) => fetchDetailPrice(cid));
  }

  await persistPriceCache(Date.now());
  return runtimeCache.collectionPrices;
}
