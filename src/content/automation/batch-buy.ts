import { kyaraApi } from '../api';
import { ensureCollectionPrices, runtimeCache } from '../cache';
import { appendJournal } from '../journal';
import { isInterrupted } from '../safety';
import { state } from '../state';
import type { BatchMissingPreview, BatchMissingPreviewItem, Rarity } from '../../types/kyara';

export interface BatchBuyRequest {
  rarity: Rarity | 'RENAISSANCE';
  maxUnitPrice: number;
  qty: number;
  maxTotalBudget?: number;
  listingIds?: string[];
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
  const targetRarities = state.currentSettings.renaissanceTargetRarities;
  const allowedRarities: Rarity[] =
    req.rarity === 'RENAISSANCE'
      ? (Array.isArray(targetRarities) && targetRarities.length ? targetRarities : ['C', 'U', 'R'])
      : [req.rarity];
  const allowedSet = new Set<Rarity>(allowedRarities);
  const rarityParam = allowedRarities.length === 1 ? `&rarity=${encodeURIComponent(allowedRarities[0])}` : '';

  const rawMatches: BatchMissingPreviewItem[] = [];
  const now = Date.now();
  for (let page = 1; page <= 6; page += 1) {
    const res = await kyaraApi(`/market/listings?type=fixed&sort=price_asc&pageSize=50&page=${page}${rarityParam}`, { auth: true }).catch(() => ({ items: [] }));
    const items = Array.isArray(res?.items) ? res.items : [];
    if (!items.length) break;

    let highestPagePrice = 0;
    for (const item of items) {
      const price = Number(item?.price);
      if (Number.isFinite(price) && price > highestPagePrice) highestPagePrice = price;
      if (!item?.id || item.status !== 'active' || item.isMine) continue;
      if (item.endsAt && Date.parse(item.endsAt) <= now) continue;
      const char = item.character || {};
      const characterId = Number(char.id ?? item.characterId);
      const rarity = (char.rarity || 'C') as Rarity;
      if (!VALID_RARITIES.has(rarity) || !allowedSet.has(rarity)) continue;
      if (!Number.isFinite(characterId) || characterId <= 0 || ownedSet.has(characterId)) continue;
      if (!Number.isFinite(price) || price <= 0 || price > maxUnitPrice) continue;
      rawMatches.push({
        listingId: String(item.id), characterId, name: char.name || `Carte #${characterId}`,
        series: char.series || '', rarity, price, median7d: null
      });
    }
    if (highestPagePrice > maxUnitPrice || rawMatches.length >= qty * 2) break;
  }

  rawMatches.sort((a, b) => a.price - b.price);
  const seenCharIds = new Set<number>();
  const uniqueMissing = rawMatches.filter((item) => !seenCharIds.has(item.characterId) && Boolean(seenCharIds.add(item.characterId)));

  const picked: BatchMissingPreviewItem[] = [];
  let runningCost = 0;
  for (const item of uniqueMissing) {
    if (picked.length >= qty || (maxTotalBudget && runningCost + item.price > maxTotalBudget)) break;
    runningCost += item.price;
    picked.push(item);
  }

  if (picked.length > 0) {
    await ensureCollectionPrices(picked.map((p) => p.characterId), false);
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
  const minReserve = Math.max(0, Number(state.currentSettings.autoBuyMinChakraReserve ?? 200));

  const preview = await previewBatchMissingBuy({ ...req, qty, maxUnitPrice, maxTotalBudget });
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
  const checkBudget = (price: number): string | undefined => {
    if (maxTotalBudget && totalSpent + price > maxTotalBudget) return 'Budget max atteint';
    if (currentChakra - price < minReserve) return `Réserve Chakra (${minReserve} ◆) atteinte`;
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
      freshPrice = Number(fresh?.type === 'fixed' ? fresh.price : fresh?.buyoutPrice);
      if (!fresh || fresh.status !== 'active' || fresh.isMine || !Number.isFinite(freshPrice) || freshPrice <= 0 || freshPrice > maxUnitPrice) {
        failedCount += 1;
        continue;
      }
    } catch { failedCount += 1; continue; }

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
    } catch { failedCount += 1; }
  }

  const prefix = state.currentSettings.dryRun ? '[SIMULATION] ' : '';
  await appendJournal('buy', `${prefix}Achat par lot [${req.rarity}] : ${boughtCount} carte(s) manquante(s) achetée(s) pour ${totalSpent} ◆`);
  return { boughtCount, totalSpent, failedCount, remainingChakra: currentChakra, boughtNames, stoppedReason };
}
