import { kyaraApi } from '../api';
import { state } from '../state';
import { appendJournal } from '../journal';

export async function executeAutoClaimMissions(dashboard: any): Promise<{ claimed: boolean }> {
  const isEnabled = state.currentSettings.autoClaimMissions ?? state.currentSettings.autoClaimMissionsEnabled;
  if (!isEnabled || (dashboard?.claimableMissions ?? 0) <= 0) {
    return { claimed: false };
  }
  if (state.currentSettings.dryRun) {
    await appendJournal('claim', `[SIMULATION] Réclamerait ${dashboard.claimableMissions} récompense(s) de mission`);
    return { claimed: true };
  }
  try {
    const res = await kyaraApi('/me/progress/claim', {
      method: 'POST',
      body: { kind: 'all' }
    });
    const gainedChakra = res?.gained?.chakra ?? 0;
    const gainedPacks = res?.gained?.bonusPacks ?? 0;
    await appendJournal(
      'claim',
      `Missions réclamées (+${gainedChakra} ◆${gainedPacks ? `, +${gainedPacks} booster(s) bonus` : ''})`
    );
    return { claimed: true };
  } catch {
    return { claimed: false };
  }
}
