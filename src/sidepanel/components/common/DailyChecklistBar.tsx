import React from 'react';
import type { DashboardState } from '../../../types/kyara';
import type { TabId } from '../Navigation';

export interface DailyChecklistBarProps {
  dashboard: DashboardState | null;
  onNavigateTab: (tab: TabId) => void;
  onOpenDailyPack: () => void;
  onClaimMissions?: () => void;
}

export const DailyChecklistBar: React.FC<DailyChecklistBarProps> = ({
  dashboard,
  onNavigateTab,
  onOpenDailyPack,
  onClaimMissions
}) => {
  const dailyPackReady = Boolean(
    (dashboard?.boosters?.all || []).find((p) => p.packId === 'daily')?.canOpenNow
  );
  const goldenReady = Boolean(
    dashboard?.boosters?.isGoldenNext ||
      (dashboard?.me?.goldenIn !== null &&
        dashboard?.me?.goldenIn !== undefined &&
        dashboard.me.goldenIn <= 1)
  );
  const missionsCount = Number((dashboard as any)?.claimableMissions ?? 0);
  const renEnabled = Boolean(dashboard?.renaissance?.enabled);
  const blockingCount = renEnabled
    ? Number(dashboard?.renaissance?.blockingListingsCount ?? 0)
    : 0;

  const hasActions =
    dailyPackReady || goldenReady || missionsCount > 0 || blockingCount > 0;

  if (!hasActions) return null;

  return (
    <div className="daily-checklist-bar" role="region" aria-label="Actions rapides du jour">
      {dailyPackReady && (
        <button
          type="button"
          className="checklist-pill checklist-pill--acc"
          onClick={onOpenDailyPack}
          title="Ouvrir le Pack du Jour gratuit"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 12 20 22 4 22 4 12" />
            <rect x="2" y="7" width="20" height="5" />
            <line x1="12" y1="22" x2="12" y2="7" />
          </svg>
          <span>Pack du Jour</span>
        </button>
      )}

      {goldenReady && (
        <button
          type="button"
          className="checklist-pill checklist-pill--gold"
          onClick={() => onNavigateTab('boosters')}
          title="Voir le Pack Doré prêt dans Boosters"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>Pack Doré prêt</span>
        </button>
      )}

      {missionsCount > 0 && (
        <button
          type="button"
          className="checklist-pill checklist-pill--purple"
          onClick={() => (onClaimMissions ? onClaimMissions() : onNavigateTab('autopilot'))}
          title="Réclamer les récompenses de mission"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span>Missions ({missionsCount})</span>
        </button>
      )}

      {blockingCount > 0 && (
        <button
          type="button"
          className="checklist-pill checklist-pill--warn"
          onClick={() => onNavigateTab('market')}
          title="Gérer les annonces bloquantes pour la Renaissance"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Bloquantes C/U/R/E ({blockingCount})</span>
        </button>
      )}
    </div>
  );
};
