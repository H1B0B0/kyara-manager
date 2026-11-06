import { kyaraApi } from '../api';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal } from '../journal';
import { computeSpareCopies } from '../../lib/analytics/fees';

export async function executeAutoRecycle(dashboard: any): Promise<{ recycledCards: number; recycledCopies: number; chakraGained: number }> {
  const candidates = (dashboard?.duplicates || []).filter((d: any) => d.canAutoRecycle && d.spare > 0);
  if (!candidates.length) {
    return { recycledCards: 0, recycledCopies: 0, chakraGained: 0 };
  }

  const freshCollection = await kyaraApi('/me/collection?lean=1');
  const freshById = new Map(
    (Array.isArray(freshCollection) ? freshCollection : []).map((e: any) => [Number(e.characterId), e])
  );
  const activeByChar = new Map<number, number>();
  for (const l of dashboard.activeListings || []) {
    activeByChar.set(l.characterId, (activeByChar.get(l.characterId) || 0) + 1);
  }

  let recycledCards = 0;
  let recycledCopies = 0;
  let chakraGained = 0;

  for (const cand of candidates) {
    const freshEntry = freshById.get(cand.characterId);
    const safeSpare = computeSpareCopies(freshEntry, activeByChar.get(cand.characterId) || 0);
    if (safeSpare <= 0) continue;

    if (state.currentSettings.dryRun) {
      recycledCards += 1;
      recycledCopies += safeSpare;
      chakraGained += safeSpare * cand.recycleValue;
      await appendJournal(
        'recycle',
        `[SIMULATION] Recyclerait ${cand.name} [${cand.rarity}] ×${safeSpare} (+${safeSpare * cand.recycleValue} ◆)`
      );
      continue;
    }

    try {
      const res = await kyaraApi(`/me/collection/${cand.characterId}/recycle`, {
        method: 'POST',
        body: { qty: safeSpare }
      });
      const gained = Number(res?.gained ?? safeSpare * cand.recycleValue);
      recycledCards += 1;
      recycledCopies += safeSpare;
      chakraGained += gained;
      await recordCumulativeMetric({ chakraFromRecycle: gained, cardsRecycled: safeSpare });
      await appendJournal('recycle', `Recyclé : ${cand.name} [${cand.rarity}] ×${safeSpare} (+${gained} ◆)`);
    } catch (err: any) {
      await appendJournal('warn', `Échec recyclage ${cand.name} : ${err.message}`);
    }
  }

  return { recycledCards, recycledCopies, chakraGained };
}
