import React from 'react';
import type { KyaraSettings } from '../../../types/settings';
import {
  PLAYSTYLE_PRESETS,
  detectActivePreset,
  type PlaystylePresetId
} from '../../../lib/presets';

const SHORT_LABELS: Record<PlaystylePresetId, string> = {
  farm_chakra: 'Farm Chakra',
  rush_renaissance: 'Renaissance',
  zen_collector: 'Mode Zen'
};

export interface PresetsBarProps {
  settings: KyaraSettings;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => void;
  onToast: (msg: string) => void;
}

export const PresetsBar: React.FC<PresetsBarProps> = ({
  settings,
  onUpdateSettings,
  onToast
}) => {
  const activeId = detectActivePreset(settings);
  const activePreset = PLAYSTYLE_PRESETS.find((p) => p.id === activeId) || null;

  return (
    <div className="presets-bar" role="region" aria-label="Profil rapide">
      <div className="presets-bar__head">
        <span className="presets-bar__label">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>Profil rapide</span>
        </span>
        {activePreset && (
          <span className="presets-bar__badge font-mono">Actif</span>
        )}
      </div>

      <div className="presets-bar__pills" role="group" aria-label="Préréglages de style de jeu">
        {PLAYSTYLE_PRESETS.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isActive}
              title={preset.label}
              className={`presets-bar__pill ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                onUpdateSettings(preset.patch);
                onToast(`Profil « ${preset.label} » appliqué`);
              }}
            >
              {SHORT_LABELS[preset.id] || preset.label}
            </button>
          );
        })}
      </div>

      {activePreset && (
        <p className="presets-bar__desc">{activePreset.shortDesc}</p>
      )}
    </div>
  );
};
