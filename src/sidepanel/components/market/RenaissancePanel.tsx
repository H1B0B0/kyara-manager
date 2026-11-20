import React, { useEffect, useState } from 'react';
import type { Rarity, RarityProgress, RenaissanceSummary } from '../../../types/kyara';
import type { KyaraSettings } from '../../../types/settings';
import { RarityPill } from '../common/RarityPill';

export interface RenaissancePanelProps {
  renaissance?: RenaissanceSummary;
  settings: KyaraSettings;
  onUpdateSettings: (partial: Partial<KyaraSettings>) => void;
  onQuickBatchForRarity: (rarity: Rarity, missingCount: number) => void;
}

const RARITIES: Rarity[] = ['C', 'U', 'R', 'E', 'L', 'M'];

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SlidersIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

export const RenaissancePanel: React.FC<RenaissancePanelProps> = ({
  renaissance, settings, onUpdateSettings, onQuickBatchForRarity
}) => {
  const [expanded, setExpanded] = useState(true);
  const [editingTargets, setEditingTargets] = useState(false);
  const [draftTargets, setDraftTargets] = useState<Record<Rarity, string>>({ C: '', U: '', R: '', E: '', L: '', M: '' });

  useEffect(() => {
    const next: Record<Rarity, string> = { C: '', U: '', R: '', E: '', L: '', M: '' };
    for (const r of RARITIES) {
      const val = settings.renaissanceTargets?.[r] ?? renaissance?.byRarity?.[r]?.target;
      next[r] = val !== undefined ? String(val) : '';
    }
    setDraftTargets(next);
  }, [settings.renaissanceTargets, renaissance?.byRarity]);

  const focusSet = new Set<Rarity>(settings.renaissanceTargetRarities || ['C', 'U', 'R']);

  const toggleFocusRarity = (r: Rarity) => {
    const next = new Set(focusSet);
    if (next.has(r)) {
      if (next.size <= 1) return;
      next.delete(r);
    } else {
      next.add(r);
    }
    onUpdateSettings({ renaissanceTargetRarities: RARITIES.filter((item) => next.has(item)) });
  };

  const handleTargetInputChange = (r: Rarity, raw: string) => {
    setDraftTargets((prev) => ({ ...prev, [r]: raw }));
    const nextOverrides: Partial<Record<Rarity, number>> = { ...(settings.renaissanceTargets || {}) };
    if (raw.trim() === '') {
      delete nextOverrides[r];
      onUpdateSettings({ renaissanceTargets: nextOverrides });
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      nextOverrides[r] = Math.floor(parsed);
      onUpdateSettings({ renaissanceTargets: nextOverrides });
    }
  };

  const getCellData = (r: Rarity): RarityProgress => {
    const base = renaissance?.byRarity?.[r];
    const owned = base?.owned ?? 0;
    const total = base?.total ?? 0;
    const target = settings.renaissanceTargets?.[r] ?? base?.target ?? 0;
    const remainingForTarget = Math.max(0, target - owned);
    const targetPct = target > 0 ? Math.min(100, Math.round((owned / target) * 100)) : 100;
    return {
      rarity: r, owned, total, missing: base?.missing ?? Math.max(0, total - owned),
      target, remainingForTarget, pct: base?.pct ?? (total > 0 ? Math.round((owned / total) * 100) : 0),
      targetPct, estimatedCostChakra: base?.estimatedCostChakra ?? 0
    };
  };

  const overallPct = renaissance?.overallPct ?? 0;
  const remainingCost = renaissance?.estimatedRemainingCost ?? 0;

  return (
    <div className={`card card--compact renaissance-panel ${settings.renaissanceFocusEnabled ? 'is-enabled' : ''}`}>
      <div className="ren-header">
        <div className="ren-header__left">
          <span className="kanji-box kanji-box--acc" aria-hidden="true">転</span>
          <div className="ren-header__titles">
            <h2 className="card__title">Focus Renaissance</h2>
            <p className="ren-header__sub font-mono">
              {overallPct}% · ~{new Intl.NumberFormat('fr-FR').format(remainingCost)} ◆ restants
            </p>
          </div>
        </div>
        <div className="ren-header__controls">
          <input
            type="checkbox" role="switch" id="sw-renaissance-focus" className="switch switch--sm"
            aria-label="Activer le Focus Renaissance"
            checked={Boolean(settings.renaissanceFocusEnabled)}
            onChange={(e) => onUpdateSettings({ renaissanceFocusEnabled: e.target.checked })}
          />
          <button
            type="button" className="ren-collapse-btn" aria-expanded={expanded}
            aria-label={expanded ? 'Replier la grille Renaissance' : 'Déplier la grille Renaissance'}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronIcon open={expanded} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ren-body">
          <div className="renaissance-grid">
            {RARITIES.map((r) => {
              const cell = getCellData(r);
              const isFocused = focusSet.has(r);
              return (
                <div key={r} data-rarity={r} className={`ren-cell ${isFocused ? 'is-focused' : ''}`}>
                  <div className="ren-cell__top">
                    <div className="ren-cell__left">
                      <RarityPill rarity={r} />
                      <button
                        type="button" aria-pressed={isFocused} onClick={() => toggleFocusRarity(r)}
                        className={`ren-focus-pill ${isFocused ? 'is-active' : ''}`}
                        title={isFocused ? `Retirer ${r} du focus` : `Cibler ${r} en priorité`}
                      >
                        Focus
                      </button>
                    </div>
                    <span className="ren-cell__ratio font-mono">{cell.owned}/{cell.target}</span>
                  </div>
                  <div className="ren-progress-track" aria-hidden="true">
                    <div className="ren-progress-fill" style={{ width: `${Math.min(100, Math.max(0, cell.targetPct))}%` }} />
                  </div>
                  <div className="ren-cell__bottom">
                    {cell.remainingForTarget > 0 ? (
                      <>
                        <span className="ren-cell__rem font-mono">-{cell.remainingForTarget}</span>
                        <button
                          type="button" className="btn btn--xs ren-lot-btn"
                          onClick={() => onQuickBatchForRarity(r, Math.min(50, cell.remainingForTarget))}
                          title={`Pré-remplir un lot de ${Math.min(50, cell.remainingForTarget)} cartes ${r}`}
                        >
                          Lot
                        </button>
                      </>
                    ) : (
                      <span className="ren-cell__done font-mono">Complet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ren-footer">
            <button type="button" className="ren-edit-toggle" aria-expanded={editingTargets} onClick={() => setEditingTargets((v) => !v)}>
              <SlidersIcon />
              <span>Ajuster objectifs</span>
            </button>
            <span className="ren-focus-summary font-mono">
              Cibles : {RARITIES.filter((r) => focusSet.has(r)).join(', ')}
            </span>
          </div>

          {editingTargets && (
            <div className="ren-targets-editor" aria-label="Objectifs Renaissance par rareté">
              {RARITIES.map((r) => (
                <label key={r} className="ren-target-field">
                  <RarityPill rarity={r} />
                  <input
                    type="number" min={0} max={99999} step={1} value={draftTargets[r]}
                    onChange={(e) => handleTargetInputChange(r, e.target.value)}
                    className="input input--num ren-target-input" aria-label={`Objectif Renaissance ${r}`}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
