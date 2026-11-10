import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';
import { evaluateDuplicate } from '../../lib/analytics/duplicates';
import { createLimiter } from '../../lib/concurrency';
import type { SellMode } from '../../types/settings';
import { isInterrupted, loadCardLedger, type CardLedger } from '../safety';
import { fetchLiveStats } from './sell-live';
import { recycleCopies } from './auto-recycle';
import { HINT_TTL_MS, loadRepriceHints, retireStaleListings, saveRepriceHints } from './reprice';

export interface SellOptions {
  /** Overrides the saved sell mode for this run only (e.g. the "sell everything fast" button). */
  mode?: SellMode;
}

export interface SellResult {
  listedCount: number;
  slotsAvailable: number;
  repriced: number;
  recycledCopies: number;
}

const FETCH_CONCURRENCY = 5;

function sellPriority(d: any): number {
  const p = d.saleProb?.p12h ?? 10;
  return p * (d.fees?.netProceeds ?? 0);
}

export async function executeAutoSell(dashboard: any, ledger?: CardLedger, options: SellOptions = {}): Promise<SellResult> {
  const settings = options.mode ? { ...state.currentSettings, autoSellMode: options.mode } : state.currentSettings;
  const result: SellResult = { listedCount: 0, slotsAvailable: 0, repriced: 0, recycledCopies: 0 };
  const duplicates: any[] = dashboard?.duplicates || [];
  const book = ledger ?? (await loadCardLedger());
  const hints = await loadRepriceHints();

  const stale = await retireStaleListings({ book, duplicates, hints, settings });
  result.repriced = stale.cancelled;

  const maxSlots = Math.max(1, Math.min(10, Number(settings.autoSellMaxListings ?? 10)));
  let slots = Math.max(0, maxSlots - book.listings.length);
  result.slotsAvailable = slots;

  const recycleRarities: string[] = Array.isArray(settings.autoRecycleRarities) ? settings.autoRecycleRarities : ['C', 'U'];
  // With a forced mode, verdicts computed under the saved mode are not trusted: live data decides.
  const eligible = (d: any) =>
    !d.pinned && d.spare > 0 && (options.mode ? d.verdict !== 'PROTÉGÉ' : Boolean(d.canAutoSell));
  const listedChars = new Set<number>(book.listings.map((l: any) => Number(l.character?.id ?? l.characterId)));
  const pool = duplicates
    .filter((d) => !listedChars.has(d.characterId) && (stale.chars.has(d.characterId) || eligible(d)))
    .sort((a, b) => sellPriority(b) - sellPriority(a));

  // Market reads for upcoming cards run ahead while the current card is being listed.
  const lookahead = Math.max(4, Math.min(10, slots * 2));
  const fetchLimiter = createLimiter(FETCH_CONCURRENCY);
  const live = new Map<number, ReturnType<typeof fetchLiveStats>>();
  const prefetch = (i: number) => {
    if (i < pool.length && !live.has(i)) live.set(i, fetchLimiter(() => fetchLiveStats(pool[i])));
  };
  for (let i = 0; i < lookahead; i += 1) prefetch(i);

  try {
    for (let i = 0; i < pool.length; i += 1) {
      if (slots <= 0 || isInterrupted()) break;
      prefetch(i + lookahead);
      const cand = pool[i];
      const stats = await live.get(i)!;
      const avail = book.get(cand.characterId);
      if (avail.spare <= 0) continue;

      const ev = evaluateDuplicate(
        { id: cand.characterId, name: cand.name, rarity: cand.rarity, series: cand.series },
        avail.entry,
        stats,
        { [cand.rarity]: cand.recycleValue },
        settings,
        avail.listed,
        avail.pinned
      );
      const canRecycle = settings.autoRecycleEnabled && recycleRarities.includes(cand.rarity);

      if (ev.canAutoRecycle && canRecycle && ev.sellProfile?.turbo) {
        if (!book.reserve(cand.characterId, avail.spare, 'recycle')) continue;
        const done = await recycleCopies(book, cand, avail.spare, 'Recyclage Turbo');
        if (done) result.recycledCopies += done.qty;
        continue;
      }
      if (!ev.canAutoSell) continue;

      let price = ev.prices.recommended;
      const hint = hints.get(cand.characterId);
      if (hint && Date.now() - hint.at < HINT_TTL_MS) {
        if (hint.ceiling < ev.prices.minSafe && ev.sellProfile?.recycleStale && canRecycle) {
          // Stalled below the safety floor: free the slot by recycling instead of dumping.
          hints.delete(cand.characterId);
          if (book.reserve(cand.characterId, 1, 'recycle')) {
            const done = await recycleCopies(book, cand, 1, 'Recyclé après stagnation');
            if (done) result.recycledCopies += done.qty;
          }
          continue;
        }
        price = Math.min(price, Math.max(hint.ceiling, ev.prices.minSafe));
      }
      const durationHours = ev.sellProfile?.durationHours ?? 12;

      if (settings.dryRun) {
        slots -= 1;
        result.listedCount += 1;
        await appendJournal(
          'sell',
          `[SIMULATION] Mettrait en vente ${cand.name} [${cand.rarity}] à ${price} ◆ (${ev.sellTier}, net ${ev.fees.netProceeds} ◆)`
        );
        continue;
      }
      if (!book.reserve(cand.characterId, 1, 'list')) continue;
      try {
        const created = await kyaraApi('/market/listings', {
          method: 'POST',
          withPass: true,
          priority: 'high',
          body: { characterId: cand.characterId, type: 'fixed', price, buyoutPrice: null, durationHours }
        });
        slots -= 1;
        result.listedCount += 1;
        const info = {
          characterId: cand.characterId,
          name: cand.name,
          price,
          endsAt: created?.endsAt || null,
          createdAt: created?.createdAt || new Date().toISOString()
        };
        book.listingCreated({ id: String(created?.id ?? `local-${cand.characterId}-${Date.now()}`), ...info });
        if (created?.id) state.previousActiveListings.set(String(created.id), info);
        await appendJournal(
          'sell',
          `Mise en vente ${ev.sellTier === 'fast' ? '⚡ rapide' : ev.sellTier === 'patient' ? 'patiente' : 'auto'} : ${cand.name} [${cand.rarity}] à ${price} ◆ (net +${ev.fees.netProceeds} ◆ · prob 24h ${ev.saleProb.p24h}%)`
        );
      } catch (err: any) {
        book.release(cand.characterId, 1, 'list');
        await appendJournal('warn', `Échec mise en vente ${cand.name} : ${err.message}`);
        if (err.code === 'too_many_listings' || err.code === 'pass_required') break;
      }
    }
  } finally {
    result.slotsAvailable = slots;
    await saveRepriceHints(hints).catch(() => {});
  }
  return result;
}
