import { kyaraApi } from '../api';
import { ensureCollectionPrices, runtimeCache } from '../cache';
import { appendJournal } from '../journal';
import { isInterrupted } from '../safety';
import { hydrateInlineListingPrices } from '../scanner';
import { state } from '../state';
import { fulfilled, mapLimit } from '../../lib/concurrency';
import { OFFICIAL_REBIRTH_1_TARGETS } from '../../lib/analytics/renaissance';
import type { BatchMissingPreview, BatchMissingPreviewItem, Rarity } from '../../types/kyara';

export interface BatchBuyRequest {
  rarity: Rarity | 'RENAISSANCE';
  maxUnitPrice: number;
  qty: number;
  maxTotalBudget?: number;
  listingIds?: string[];
  characterIds?: number[];
  ignoreReserve?: boolean;
}

export interface BatchBuyResult {
  boughtCount: number;
  totalSpent: number;
  failedCount: number;
  remainingChakra: number;
  boughtNames: string[];
  stoppedReason?: string;
}

const VALID_RARITIES = new Set<Rarity>(['C', 'U', 'R', 'E', 'L', 'M']);
const FATAL_BUY_ERROR_CODES = new Set([
  'pass_required',
  'market_locked',
  'insufficient_chakra',
  'http_429',
  'http_401',
  'http_403'
]);

function clampParams(req: BatchBuyRequest) {
  const qty = Math.max(1, Math.min(150, Math.floor(Number(req.qty) || 1)));
  const maxUnitPrice = Math.max(1, Math.min(5000, Math.floor(Number(req.maxUnitPrice) || 1)));
  const rawBudget = Number(req.maxTotalBudget);
  const maxTotalBudget = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.floor(rawBudget) : undefined;
  return { qty, maxUnitPrice, maxTotalBudget };
}

function buildOwnedSet(rawColl: unknown): Set<number> {
  if (!Array.isArray(rawColl)) throw new Error('Collection indisponible.');
  const owned = new Set<number>();
  for (const e of rawColl) {
    const cid = Number((e as any)?.characterId ?? (e as any)?.id);
    if (Number.isFinite(cid) && Number((e as any)?.qty) > 0) owned.add(cid);
  }
  return owned;
}

export async function previewBatchMissingBuy(req: BatchBuyRequest): Promise<BatchMissingPreview> {
  const { qty, maxUnitPrice, maxTotalBudget } = clampParams(req);
  const ownedSet = buildOwnedSet(await kyaraApi('/me/collection?lean=1'));
  const now = Date.now();
  const scannedListings: any[] = [];
  let uniqueMissing: BatchMissingPreviewItem[] = [];

  if (Array.isArray(req.characterIds) && req.characterIds.length > 0) {
    const missingTargetIds = Array.from(
      new Set(req.characterIds.map(Number).filter((id) => Number.isFinite(id) && id > 0 && !ownedSet.has(id)))
    );
    const settled = await mapLimit(missingTargetIds, 5, async (id) => {
      const res = await kyaraApi(`/market/listings?characterId=${id}&type=fixed&sort=price_asc&pageSize=3`, { auth: true }).catch(() => ({ items: [] }));
      const items = Array.isArray(res?.items) ? res.items : [];
      let best: BatchMissingPreviewItem | null = null;
      const matched: any[] = [];
      for (const item of items) {
        const price = Number(item?.price);
        if (!item?.id || item.status !== 'active' || item.isMine) continue;
        if (item.endsAt && Date.parse(item.endsAt) <= now) continue;
        if (!Number.isFinite(price) || price <= 0 || price > maxUnitPrice) continue;
        matched.push(item);
        const char = item.character || {};
        const rarity: Rarity = VALID_RARITIES.has(char.rarity) ? char.rarity : 'C';
        if (!best || price < best.price) {
          best = {
            listingId: String(item.id),
            characterId: Number(char.id ?? item.characterId ?? id),
            name: char.name || `Carte #${id}`,
            series: char.series || '',
            rarity,
            price,
            median7d: null
          };
        }
      }
      return { best, matched };
    });
    const resolved = fulfilled(settled);
    for (const entry of resolved) scannedListings.push(...entry.matched);
    uniqueMissing = resolved
      .map((entry) => entry.best)
      .filter((b): b is BatchMissingPreviewItem => Boolean(b))
      .sort((a, b) => a.price - b.price);
  } else {
    const targetRarities = state.currentSettings.renaissanceTargetRarities;
    let configuredFocus: Rarity[] =
      Array.isArray(targetRarities) && targetRarities.length ? [...targetRarities] : ['C', 'U', 'R', 'E'];
    if (
      configuredFocus.length === 3 &&
      configuredFocus.includes('C') &&
      configuredFocus.includes('U') &&
      configuredFocus.includes('R') &&
      !configuredFocus.includes('E')
    ) {
      configuredFocus.push('E');
    }
    if (req.rarity === 'RENAISSANCE' && runtimeCache.catalogById && runtimeCache.catalogById.size > 0) {
      const ownedByRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, L: 0, M: 0 };
      for (const [cid, ch] of runtimeCache.catalogById.entries()) {
        const r = (ch?.rarity || 'C') as Rarity;
        if (VALID_RARITIES.has(r) && ownedSet.has(Number(cid))) ownedByRarity[r] += 1;
      }
      const neededFocus = configuredFocus.filter((r) => {
        const target = Number(state.currentSettings.renaissanceTargets?.[r]) || OFFICIAL_REBIRTH_1_TARGETS[r];
        return ownedByRarity[r] < target;
      });
      if (neededFocus.length > 0) {
        configuredFocus = neededFocus;
      } else {
        const anyIncomplete = (['C', 'U', 'R', 'E', 'L'] as Rarity[]).filter((r) => {
          const target = Number(state.currentSettings.renaissanceTargets?.[r]) || OFFICIAL_REBIRTH_1_TARGETS[r];
          return ownedByRarity[r] < target;
        });
        if (anyIncomplete.length > 0) configuredFocus = anyIncomplete;
      }
    }

    const allowedRarities: Rarity[] = req.rarity === 'RENAISSANCE' ? configuredFocus : [req.rarity];
    const allowedSet = new Set<Rarity>(allowedRarities);
    const pricePages = allowedRarities.length > 1 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
    const newestPages = [1, 2];
    const rawMatches: BatchMissingPreviewItem[] = [];

    const scanTargets = allowedRarities.flatMap((rarityFilter) => {
      const rarityParam = `&rarity=${encodeURIComponent(rarityFilter)}`;
      return [
        ...pricePages.map((p) => ({
          rarityFilter,
          url: `/market/listings?type=fixed&sort=price_asc&pageSize=50&page=${p}${rarityParam}`
        })),
        ...newestPages.map((p) => ({
          rarityFilter,
          url: `/market/listings?type=fixed&sort=newest&pageSize=50&page=${p}${rarityParam}`
        }))
      ];
    });

    const settledPages = await mapLimit(scanTargets, 5, async ({ rarityFilter, url }) => {
      const res = await kyaraApi(url, { auth: true }).catch(() => ({ items: [] }));
      return { rarityFilter, items: Array.isArray(res?.items) ? res.items : [] };
    });

    const seenListings = new Set<string>();
    for (const { rarityFilter, items } of fulfilled(settledPages)) {
      for (const item of items) {
        if (!item?.id || item.status !== 'active' || item.isMine) continue;
        const lid = String(item.id);
        if (seenListings.has(lid)) continue;
        seenListings.add(lid);
        if (item.endsAt && Date.parse(item.endsAt) <= now) continue;
        const price = Number(item?.price);
        if (!Number.isFinite(price) || price <= 0 || price > maxUnitPrice) continue;
        const char = item.character || {};
        const characterId = Number(char.id ?? item.characterId);
        const rarity = (char.rarity || rarityFilter) as Rarity;
        if (!VALID_RARITIES.has(rarity) || !allowedSet.has(rarity)) continue;
        if (!Number.isFinite(characterId) || characterId <= 0 || ownedSet.has(characterId)) continue;
        scannedListings.push(item);
        rawMatches.push({
          listingId: lid,
          characterId,
          name: char.name || `Carte #${characterId}`,
          series: char.series || '',
          rarity,
          price,
          median7d: null
        });
      }
    }

    rawMatches.sort((a, b) => a.price - b.price);
    const seenCharIds = new Set<number>();
    uniqueMissing = rawMatches.filter((item) => !seenCharIds.has(item.characterId) && Boolean(seenCharIds.add(item.characterId)));
  }

  const missingPriceIds = scannedListings.length > 0 ? hydrateInlineListingPrices(scannedListings, now) : new Set<number>();
  const picked: BatchMissingPreviewItem[] = [];
  let runningCost = 0;
  for (const item of uniqueMissing) {
    if (picked.length >= qty || (maxTotalBudget && runningCost + item.price > maxTotalBudget)) break;
    runningCost += item.price;
    picked.push(item);
  }

  if (picked.length > 0) {
    const missingPickedIds = picked.map((p) => p.characterId).filter((id) => missingPriceIds.has(id));
    if (missingPickedIds.length > 0) {
      await ensureCollectionPrices(missingPickedIds, false);
    }
    for (const item of picked) item.median7d = runtimeCache.collectionPrices.get(item.characterId)?.median7d ?? null;
  }
  const totalCost = picked.reduce((sum, item) => sum + item.price, 0);
  const avgPrice = picked.length > 0 ? Math.round((totalCost / picked.length) * 10) / 10 : 0;
  return { rarity: req.rarity, maxUnitPrice, requestedQty: qty, items: picked, totalCost, avgPrice, totalFound: uniqueMissing.length };
}

export async function executeBatchMissingBuy(req: BatchBuyRequest): Promise<BatchBuyResult> {
  const { qty, maxUnitPrice, maxTotalBudget } = clampParams(req);
  const [bootstrap, rawColl] = await Promise.all([kyaraApi('/me/bootstrap'), kyaraApi('/me/collection?lean=1')]);
  let currentChakra = Number((bootstrap?.me || bootstrap)?.chakra ?? 0);
  const ownedSet = buildOwnedSet(rawColl);
  const minReserve = req.ignoreReserve
    ? 0
    : Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 200));

  const poolQty = Math.min(150, Math.max(qty * 2, 30));
  const preview = await previewBatchMissingBuy({ ...req, qty: poolQty, maxUnitPrice, maxTotalBudget: undefined });
  let candidates = preview.items;
  if (Array.isArray(req.listingIds) && req.listingIds.length > 0) {
    const orderMap = new Map(req.listingIds.map((id, idx) => [String(id), idx]));
    candidates = [...preview.items].sort((a, b) => {
      const ai = orderMap.has(a.listingId) ? orderMap.get(a.listingId)! : Number.MAX_SAFE_INTEGER;
      const bi = orderMap.has(b.listingId) ? orderMap.get(b.listingId)! : Number.MAX_SAFE_INTEGER;
      return ai - bi || a.price - b.price;
    });
  }

  let boughtCount = 0;
  let totalSpent = 0;
  let failedCount = 0;
  const boughtNames: string[] = [];
  let stoppedReason: string | undefined;
  let lastErrorMsg: string | undefined;
  if (candidates.length === 0) {
    stoppedReason = `Aucune carte manquante en vente ≤ ${maxUnitPrice} ◆`;
  }
  const checkBudget = (price: number): string | undefined => {
    if (maxTotalBudget && totalSpent + price > maxTotalBudget) return 'Budget max atteint';
    if (currentChakra - price < minReserve) {
      return minReserve > 0 ? `Réserve Chakra (${minReserve} ◆) atteinte` : `Solde Chakra insuffisant (${currentChakra} ◆)`;
    }
    return undefined;
  };

  for (const item of candidates) {
    if (boughtCount >= qty) break;
    if (isInterrupted()) { stoppedReason = 'Opération interrompue'; break; }
    if (ownedSet.has(item.characterId) || item.price > maxUnitPrice) continue;
    if ((stoppedReason = checkBudget(item.price))) break;

    let freshPrice = item.price;
    try {
      const fresh = await kyaraApi(`/market/listings/${encodeURIComponent(item.listingId)}`, { auth: true });
      const rawFreshPrice = fresh?.type === 'auction' ? fresh?.buyoutPrice : (fresh?.price ?? fresh?.buyoutPrice);
      freshPrice = Number(rawFreshPrice);
      if (
        !fresh ||
        (fresh.status && fresh.status !== 'active') ||
        fresh.isMine ||
        !Number.isFinite(freshPrice) ||
        freshPrice <= 0 ||
        freshPrice > maxUnitPrice
      ) {
        failedCount += 1;
        continue;
      }
    } catch (err: any) {
      failedCount += 1;
      if (err?.code && FATAL_BUY_ERROR_CODES.has(err.code)) {
        stoppedReason = err?.message || String(err);
        break;
      }
      continue;
    }

    if ((stoppedReason = checkBudget(freshPrice))) break;
    if (state.currentSettings.dryRun) {
      boughtCount += 1; totalSpent += freshPrice; ownedSet.add(item.characterId); currentChakra -= freshPrice;
      boughtNames.push(item.name);
      continue;
    }

    try {
      const res = await kyaraApi(`/market/listings/${encodeURIComponent(item.listingId)}/buy`, {
        method: 'POST', withPass: true, priority: 'high'
      });
      boughtCount += 1; totalSpent += freshPrice;
      currentChakra = Number(res?.user?.chakra ?? currentChakra - freshPrice);
      ownedSet.add(item.characterId); boughtNames.push(item.name);
    } catch (err: any) {
      failedCount += 1;
      lastErrorMsg = err?.message || String(err);
      if (err?.code && FATAL_BUY_ERROR_CODES.has(err.code)) {
        stoppedReason = lastErrorMsg;
        break;
      }
    }
  }

  if (boughtCount === 0 && !stoppedReason && lastErrorMsg) {
    stoppedReason = lastErrorMsg;
  }

  const prefix = state.currentSettings.dryRun ? '[SIMULATION] ' : '';
  await appendJournal('buy', `${prefix}Achat par lot [${req.rarity}] : ${boughtCount} carte(s) manquante(s) achetée(s) pour ${totalSpent} ◆${stoppedReason ? ` (${stoppedReason})` : ''}`);
  return { boughtCount, totalSpent, failedCount, remainingChakra: currentChakra, boughtNames, stoppedReason };
}
