import type { KyaraSettings } from '../types/settings';

export type PlaystylePresetId = 'farm_chakra' | 'rush_renaissance' | 'zen_collector';

export interface PlaystylePreset {
  id: PlaystylePresetId;
  label: string;
  shortDesc: string;
  patch: Partial<KyaraSettings>;
}

export const PLAYSTYLE_PRESETS: PlaystylePreset[] = [
  {
    id: 'farm_chakra',
    label: 'Farm Chakra',
    shortDesc: 'Vente rapide + recyclage C/U/R + boosters EV, achats OFF',
    patch: {
      autoSellEnabled: true,
      autoSellMode: 'fast',
      autoRecycleEnabled: true,
      autoRecycleRarities: ['C', 'U', 'R'],
      autoBoosterEnabled: true,
      autoBoosterStrategy: 'ev',
      autoOpenMode: 'recommended_ev',
      renaissanceFocusEnabled: false,
      autoMarketEnabled: false,
      autoBuyFlipEnabled: false,
      autoBuyMissingEnabled: false,
      wishlistAutoBuyEnabled: false
    }
  },
  {
    id: 'rush_renaissance',
    label: 'Rush Renaissance',
    shortDesc: 'Focus Renaissance ON + boosters ciblés + vente adaptative',
    patch: {
      autoSellEnabled: true,
      autoSellMode: 'adaptive',
      autoRecycleEnabled: true,
      autoRecycleRarities: ['C', 'U', 'R'],
      autoBoosterEnabled: true,
      autoBoosterStrategy: 'new',
      autoOpenMode: 'recommended_new',
      renaissanceFocusEnabled: true,
      autoBuyMissingEnabled: true,
      autoOpenGoldenSniper: true
    }
  },
  {
    id: 'zen_collector',
    label: 'Collectionneur Zen',
    shortDesc: 'Vente patiente + nouvelles cartes + protection hausses',
    patch: {
      autoSellEnabled: true,
      autoSellMode: 'patient',
      autoRecycleEnabled: true,
      autoRecycleRarities: ['C', 'U'],
      autoBoosterEnabled: true,
      autoBoosterStrategy: 'new',
      autoOpenMode: 'recommended_new',
      renaissanceFocusEnabled: false,
      speculateHoldSurging: true,
      wishlistAutoBuyEnabled: true
    }
  }
];

/** Infers the active playstyle preset from the current settings, or null if customized. */
export function detectActivePreset(settings: Partial<KyaraSettings>): PlaystylePresetId | null {
  if (settings.renaissanceFocusEnabled && settings.autoSellMode === 'adaptive') {
    return 'rush_renaissance';
  }
  if (
    !settings.renaissanceFocusEnabled &&
    settings.autoSellMode === 'fast' &&
    !settings.autoBuyMissingEnabled &&
    !settings.autoMarketEnabled
  ) {
    return 'farm_chakra';
  }
  if (
    !settings.renaissanceFocusEnabled &&
    settings.autoSellMode === 'patient' &&
    settings.speculateHoldSurging !== false
  ) {
    return 'zen_collector';
  }
  return null;
}
