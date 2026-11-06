import React from 'react';
import type { DashboardState } from '../../types/kyara';
import { t } from '../../lib/i18n';

export interface KpiGridProps {
  dashboard: DashboardState | null;
  maxListings: number;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ dashboard, maxListings }) => {
  const me = dashboard?.me;
  const chakraFmt = me?.chakra !== undefined ? new Intl.NumberFormat('fr-FR').format(me.chakra) : '0';
  const freePacks = me?.freePacks ?? 0;
  const freeMax = me?.freePacksMax ?? 10;
  const bonus = me?.bonusPacks ? ` +${me.bonusPacks}` : '';
  const listingsCount = dashboard?.activeListings?.length ?? 0;
  const pity = me?.pity ?? 0;
  const pityPct = Math.min(100, Math.max(0, Math.round((pity / 250) * 100)));

  return (
    <section className="kpi-bar" aria-label="Indicateurs clés">
      <div className="kpi-card kpi-card--chakra">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiChakra')}</span>
          <span className="kpi-card__icon" aria-hidden="true">◆</span>
        </div>
        <strong className="kpi-card__value kpi-card__value--chakra">{chakraFmt} ◆</strong>
      </div>

      <div className="kpi-card kpi-card--packs">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiBoosters')}</span>
          <span className="kpi-card__icon" aria-hidden="true">札</span>
        </div>
        <strong className="kpi-card__value">{freePacks} / {freeMax}{bonus}</strong>
      </div>

      <div className="kpi-card kpi-card--listings">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiMarket')}</span>
          <span className="kpi-card__icon" aria-hidden="true">市</span>
        </div>
        <strong className="kpi-card__value">{listingsCount} / {maxListings}</strong>
      </div>

      <div className="kpi-card kpi-card--pity">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiPity')}</span>
          <span className="kpi-card__icon" aria-hidden="true">神</span>
        </div>
        <strong className="kpi-card__value">{pity} / 250</strong>
        <div className="kpi-progress" aria-hidden="true">
          <div className="kpi-progress__bar" style={{ width: `${pityPct}%` }} />
        </div>
      </div>
    </section>
  );
};
