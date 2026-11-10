import { kyaraApi } from '../api';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal } from '../journal';
import { isInterrupted, loadCardLedger, type CardLedger } from '../safety';
import { mapLimit } from '../../lib/concurrency';
import { triageDuplicatesLive } from './market-triage';

/** Recycles `qty` reserved copies. The caller must have reserved them in the ledger first. */
export async function recycleCopies(
  book: CardLedger,
  card: { characterId: number; name: string; rarity: string; recycleValue: number },
  qty: number,
  label = 'Recyclé'
): Promise<{ qty: number; gained: number } | null> {
  if (state.currentSettings.dryRun) {
    await appendJournal('recycle', `[SIMULATION] Recyclerait ${card.name} [${card.rarity}] ×${qty} (+${qty * card.recycleValue} ◆)`);
    return { qty, gained: qty * card.recycleValue };
  }
  try {
    const res = await kyaraApi(`/me/collection/${card.characterId}/recycle`, { method: 'POST', body: { qty } });
    const gained = Number(res?.gained ?? qty * card.recycleValue);
    await recordCumulativeMetric({ chakraFromRecycle: gained, cardsRecycled: qty });
    await appendJournal('recycle', `${label} : ${card.name} [${card.rarity}] ×${qty} (+${gained} ◆)`);
    return { qty, gained };
  } catch (err: any) {
    book.release(card.characterId, qty, 'recycle');
    await appendJournal('warn', `Échec recyclage ${card.name} : ${err.message}`);
    return null;
  }
}

export async function executeAutoRecycle(
  dashboard: any,
  ledger?: CardLedger
): Promise<{ recycledCards: number; recycledCopies: number; chakraGained: number }> {
  const total = { recycledCards: 0, recycledCopies: 0, chakraGained: 0 };
  const book = ledger ?? (await loadCardLedger());
  const triaged = await triageDuplicatesLive(dashboard?.duplicates || [], book, state.currentSettings, 18);
  const candidates = triaged.filter(
    (d: any) =>
      !d.pinned &&
      (d.canAutoRecycle || (d.verdict === 'RECYCLER' && state.currentSettings.autoRecycleRarities.includes(d.rarity)))
  );
  if (!candidates.length) return total;

  // Writes are paced by the API layer; a few in flight hide the network latency between them.
  const results = await mapLimit(candidates, 4, async (cand: any) => {
    if (isInterrupted()) return null;
    const avail = book.get(cand.characterId);
    const availQty = (avail as any).recyclable ?? avail.spare;
    const candQty = cand.recyclableSpare ?? cand.spare;
    const qty = Math.min(candQty, availQty);
    if (qty <= 0 || !book.reserve(cand.characterId, qty, 'recycle')) return null;
    return recycleCopies(book, cand, qty);
  });

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    total.recycledCards += 1;
    total.recycledCopies += result.value.qty;
    total.chakraGained += result.value.gained;
  }
  return total;
}
