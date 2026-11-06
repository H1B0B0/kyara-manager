import { kyaraApi } from '../api';
import { state } from '../state';
import { recordCumulativeMetric, appendJournal } from '../journal';
import { getCardAvailability } from '../safety';

export async function executeAutoRecycle(dashboard: any): Promise<{ recycledCards: number; recycledCopies: number; chakraGained: number }> {
  const candidates = (dashboard?.duplicates || []).filter((d: any) => d.canAutoRecycle && d.spare > 0);
  if (!candidates.length) {
    return { recycledCards: 0, recycledCopies: 0, chakraGained: 0 };
  }

  let recycledCards = 0;
  let recycledCopies = 0;
  let chakraGained = 0;

  for (const cand of candidates) {
    const { spare } = await getCardAvailability(cand.characterId);
    const safeSpare = Math.min(cand.spare, spare);
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
