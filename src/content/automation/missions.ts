import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';

let lastDailyWikiPingDay = '';

export async function executeAutoClaimMissions(dashboard: any): Promise<{ claimed: boolean }> {
  const isEnabled = state.currentSettings.autoClaimMissions ?? state.currentSettings.autoClaimMissionsEnabled;
  if (!isEnabled) {
    return { claimed: false };
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  let wikiPingedToday = false;
  if (!state.currentSettings.dryRun && lastDailyWikiPingDay !== todayKey) {
    lastDailyWikiPingDay = todayKey;
    wikiPingedToday = true;
    await Promise.all([
      kyaraApi('/characters/1', { auth: true }).catch(() => null),
      kyaraApi('/characters/2', { auth: true }).catch(() => null),
      kyaraApi('/characters/3', { auth: true }).catch(() => null)
    ]);
  }

  if ((dashboard?.claimableMissions ?? 0) <= 0 && !wikiPingedToday) {
    return { claimed: false };
  }
  if (state.currentSettings.dryRun) {
    if ((dashboard?.claimableMissions ?? 0) > 0) {
      await appendJournal('claim', `[SIMULATION] Réclamerait ${dashboard.claimableMissions} récompense(s) de mission`);
      return { claimed: true };
    }
    return { claimed: false };
  }
  try {
    const res = await kyaraApi('/me/progress/claim', {
      method: 'POST',
      body: { kind: 'all' }
    });
    const gainedChakra = Number(res?.gained?.chakra ?? 0);
    const gainedPacks = Number(res?.gained?.bonusPacks ?? 0);
    if (gainedChakra > 0 || gainedPacks > 0 || (dashboard?.claimableMissions ?? 0) > 0) {
      await appendJournal(
        'claim',
        `Missions réclamées (+${gainedChakra} ◆${gainedPacks ? `, +${gainedPacks} booster(s) bonus` : ''})`
      );
      return { claimed: true };
    }
    return { claimed: false };
  } catch {
    return { claimed: false };
  }
}
