import React from 'react';
import type { DashboardState } from '../../types/kyara';
import { t } from '../../lib/i18n';

export interface KpiGridProps {
  dashboard: DashboardState | null;
  maxListings: number;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ dashboard, maxListings }) => {
  const me = dashboard?.me as any;
  const chakra = me?.chakra ?? 0;
  const chakraFmt = me?.chakra !== undefined ? new Intl.NumberFormat('fr-FR').format(me.chakra) : '0';
  const chakraHeld = typeof me?.chakraHeld === 'number' ? me.chakraHeld : 0;

  const freePacks = me?.freePacks ?? 0;
  const freeMax = me?.freePacksMax ?? 10;
  const bonus = me?.bonusPacks ? ` +${me.bonusPacks}` : '';
  const boosterPct = freeMax > 0 ? Math.min(100, Math.max(0, Math.round((freePacks / freeMax) * 100))) : 0;

  const listingsCount = dashboard?.activeListings?.length ?? 0;
  const listingsMax = maxListings || 10;
  const marketPct = listingsMax > 0 ? Math.min(100, Math.max(0, Math.round((listingsCount / listingsMax) * 100))) : 0;
  const freeSlots = Math.max(0, listingsMax - listingsCount);

  const pity = me?.pity ?? 0;
  const pityPct = Math.min(100, Math.max(0, Math.round((pity / 250) * 100)));

  const chakraPct = (chakra + chakraHeld) > 0 ? Math.min(100, Math.max(15, Math.round((chakra / (chakra + chakraHeld)) * 100))) : 100;

  return (
    <section className="kpi-bar" aria-label="Indicateurs clés">
      <div className="kpi-card kpi-card--chakra">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiChakra')}</span>
          <span className="kpi-card__icon" aria-hidden="true">◆</span>
        </div>
        <strong className="kpi-card__value kpi-card__value--chakra">{chakraFmt} ◆</strong>
        <span className="kpi-card__sub">
          {chakraHeld > 0 ? `+${chakraHeld} ◆ en vente` : 'Solde disponible'}
        </span>
        <div className="kpi-progress" aria-hidden="true">
          <div className="kpi-progress__bar kpi-progress__bar--chakra" style={{ width: `${chakraPct}%` }} />
        </div>
      </div>

      <div className="kpi-card kpi-card--packs">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiBoosters')}</span>
          <span className="kpi-card__icon" aria-hidden="true">札</span>
        </div>
        <strong className="kpi-card__value">{freePacks} / {freeMax}{bonus}</strong>
        <span className="kpi-card__sub">
          {freePacks >= freeMax ? 'Stock plein' : 'Ouverture auto prête'}
        </span>
        <div className="kpi-progress" aria-hidden="true">
          <div className="kpi-progress__bar kpi-progress__bar--packs" style={{ width: `${boosterPct}%` }} />
        </div>
      </div>

      <div className="kpi-card kpi-card--listings">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiMarket')}</span>
          <span className="kpi-card__icon" aria-hidden="true">市</span>
        </div>
        <strong className="kpi-card__value">{listingsCount} / {listingsMax}</strong>
        <span className="kpi-card__sub">
          {freeSlots} emplacement{freeSlots > 1 ? 's' : ''} libre{freeSlots > 1 ? 's' : ''}
        </span>
        <div className="kpi-progress" aria-hidden="true">
          <div className="kpi-progress__bar kpi-progress__bar--listings" style={{ width: `${marketPct}%` }} />
        </div>
      </div>

      <div className="kpi-card kpi-card--pity">
        <div className="kpi-card__head">
          <span className="kpi-card__label">{t('kpiPity')}</span>
          <span className="kpi-card__icon" aria-hidden="true">神</span>
        </div>
        <strong className="kpi-card__value">{pity} / 250</strong>
        <span className="kpi-card__sub">
          {pity >= 240 ? 'Seuil Mythique imminent' : '250 = Mythique garantie'}
        </span>
        <div className="kpi-progress" aria-hidden="true">
          <div className="kpi-progress__bar kpi-progress__bar--pity" style={{ width: `${pityPct}%` }} />
        </div>
      </div>
    </section>
  );
};
