import React, { useState } from 'react';
import type { DashboardState } from '../../../types/kyara';
import type { KyaraGameId, KyaraSettings } from '../../../types/settings';
import { sendCommand } from '../../hooks/useDashboard';
import { CollapsibleModuleCard } from './CollapsibleModuleCard';

export interface GamesModuleCardProps {
  dashboard: DashboardState | null;
  settings: KyaraSettings;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => void;
  onToast: (msg: string) => void;
}

const GAME_OPTIONS: Array<{ id: KyaraGameId; label: string }> = [
  { id: 'all', label: 'Tous les jeux (Rotation auto)' },
  { id: 'main-du-jour', label: 'Main du Jour (Poker quotidien)' },
  { id: 'raid-du-jour', label: 'Raid du Jour (Équipe quotidienne)' },
  { id: 'expedition', label: 'L\'Expédition (Donjon tactique)' },
  { id: 'trois-arcs', label: 'Les Trois Arcs (Duel 3 lignes)' },
  { id: 'main-kyara', label: 'Main Kyara (Poker solo)' },
  { id: 'raid', label: 'Kyara Raid (Combat d\'équipe)' },
  { id: 'kyara-21', label: 'Kyara 21 (Blackjack IA)' },
  { id: 'qui-est-ce', label: 'Qui est-ce ? (4 choix)' },
  { id: 'serie-express', label: 'Série Express (4 choix)' },
  { id: 'blind-test', label: 'Blind Test (Musiques anime)' },
  { id: 'memoire', label: 'Mémoire (8 paires)' },
  { id: 'plus-aime', label: 'Plus aimé (Rang # · Rapide)' }
];

/** Cockpit module controlling the Salle de Jeux (`/jouer`) ticket farmer and live visual solver. */
export const GamesModuleCard: React.FC<GamesModuleCardProps> = ({
  dashboard, settings, expanded, onToggleExpand, onUpdateSettings, onToast
}) => {
  const [farming, setFarming] = useState(false);
  const arcade = dashboard?.arcade;
  const today = arcade?.today ?? 0;
  const dayCap = arcade?.dayCap ?? 60;
  const week = arcade?.week ?? 0;
  const weekCap = arcade?.weekCap ?? 300;
  const balance = arcade?.balance ?? 0;

  const summary = arcade?.blocked === 'guest'
    ? 'Discord requis pour /jouer'
    : `${today}/${dayCap} 🎟 · Solde ${balance} 🎟${arcade?.bestLotLabel ? ` · ${arcade.bestLotLabel}` : ''}`;

  const handleFarmNow = async () => {
    setFarming(true);
    onToast('Farm Salle de Jeux en cours…');
    const res = await (sendCommand({ type: 'km:cmd:run-games-farm', gameId: settings.autoGamesTargetGame || 'all' } as any) as Promise<any>);
    setFarming(false);
    if (res?.ok) {
      const played = res.playedGames ?? 0;
      const earned = res.ticketsEarned ?? 0;
      onToast(`Salle de Jeux : ${played} partie(s)${earned > 0 ? `, +${earned} 🎟` : ''}`);
    } else if (res?.error) {
      onToast(res.error);
    }
  };

  return (
    <CollapsibleModuleCard
      id="games" variant="games" kanji="遊" kanjiTone="purple"
      title="Salle de Jeux & Lot" summary={summary} switchId="sw-autogames"
      checked={Boolean(settings.autoGamesEnabled)} expanded={expanded}
      onToggleExpand={onToggleExpand} onToggleSwitch={(v) => onUpdateSettings({ autoGamesEnabled: v })}
    >
      <p className="module-card__desc">
        Joue les quotidiens (Main &amp; Raid du Jour) et les 12 mini-jeux jusqu&apos;à {dayCap} 🎟/jour pour débloquer Boosters Dorés, Lot Légendaire (200 🎟) et Sceau Mythique (1000 🎟).
      </p>

      {arcade?.blocked === 'guest' && (
        <p className="form-hint" style={{ color: 'var(--warn)', margin: '4px 0 0', fontSize: '11px' }}>
          Compte Discord requis : lie Discord sur kyara.games pour débloquer la Salle de Jeux.
        </p>
      )}

      <div className="switch-row switch-row--compact">
        <label htmlFor="sw-autogames-daily" className="module-card__sublabel">Main du Jour automatique (+10 🎟/jour)</label>
        <input
          type="checkbox" role="switch" id="sw-autogames-daily" className="switch switch--sm"
          checked={settings.autoGamesDailyEnabled !== false}
          onChange={(e) => onUpdateSettings({ autoGamesDailyEnabled: e.target.checked })}
        />
      </div>

      <div className="switch-row switch-row--compact">
        <label htmlFor="sw-autogames-solver" className="module-card__sublabel">Solveur visuel en direct sur /jouer/*</label>
        <input
          type="checkbox" role="switch" id="sw-autogames-solver" className="switch switch--sm"
          checked={settings.autoGamesSolverOverlay !== false}
          onChange={(e) => onUpdateSettings({ autoGamesSolverOverlay: e.target.checked })}
        />
      </div>

      <div className="strategy-selector-row">
        <label htmlFor="sel-games-target" className="strategy-selector-label">Mini-jeu farmé :</label>
        <select
          id="sel-games-target" value={settings.autoGamesTargetGame || 'all'}
          onChange={(e) => onUpdateSettings({ autoGamesTargetGame: e.target.value as KyaraGameId })}
          className="select select--xs" title="Mini-jeu solo farmé automatiquement pour les tickets"
        >
          {GAME_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="module-card__footer" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <span className="mono-stat">
          Semaine : {week}/{weekCap} 🎟 · {arcade?.canBuyLot ? `✓ ${arcade.bestLotLabel} dispo !` : `${arcade?.bestLotLabel || 'Lot Lég.'} (${arcade?.bestLotPrice ?? 200} 🎟)`}
        </span>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
          <button
            type="button" onClick={() => void chrome.tabs?.create({ url: 'https://kyara.games/jouer' })}
            className="btn btn--xs btn--ghost" style={{ whiteSpace: 'nowrap' }}
          >
            Ouvrir /jouer
          </button>
          <button
            type="button" onClick={handleFarmNow}
            disabled={farming || arcade?.blocked === 'guest'}
            className="btn btn--xs btn--primary" style={{ whiteSpace: 'nowrap' }}
          >
            {farming ? 'Farm…' : 'Farmer la Salle'}
          </button>
        </div>
      </div>
    </CollapsibleModuleCard>
  );
};
