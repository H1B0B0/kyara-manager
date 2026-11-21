import React from 'react';
import type { CumulativeStats } from '../../../types/journal';
import { t } from '../../../lib/i18n';

export interface RoiDashboardCardProps {
  stats: CumulativeStats;
  onResetRoi: () => void;
}

/** Cumulative ROI telemetry and 24h yield projection panel for the Cockpit sidebar. */
export const RoiDashboardCard: React.FC<RoiDashboardCardProps> = ({ stats, onResetRoi }) => {
  const totalRoiChakra = (stats.chakraFromSales || 0) + (stats.chakraFromRecycle || 0);
  const hourlyHistory = Array.isArray(stats.hourlyHistory) ? stats.hourlyHistory : [];
  const elapsedHours = Math.max(1, (Date.now() - (stats.startedAt || Date.now())) / 3600000);
  const hourlyRate = hourlyHistory.length > 0
    ? Math.round(hourlyHistory.reduce((sum, b) => sum + (b.totalChakra || 0), 0) / hourlyHistory.length)
    : Math.round(totalRoiChakra / elapsedHours);
  const projected8h = Math.round(hourlyRate * 8);

  const sparklineCoords = (() => {
    if (hourlyHistory.length < 2) return null;
    const vals = hourlyHistory.map((b) => Math.max(0, b.totalChakra || 0));
    const maxVal = Math.max(1, ...vals);
    const pts = vals.map((v, idx) => `${((idx / (vals.length - 1)) * 240).toFixed(1)},${(31 - (v / maxVal) * 28).toFixed(1)}`);
    return { polyline: pts.join(' '), area: `0,34 ${pts.join(' ')} 240,34` };
  })();

  const roiBoxes = [
    { cls: 'roi-stat-box--chakra', label: 'Chakra total généré', iconCls: 'roi-icon--gold', icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />, val: `+${new Intl.NumberFormat('fr-FR').format(totalRoiChakra)} ◆` },
    { cls: '', label: 'Ventes marché', iconCls: 'roi-icon--acc', icon: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>, val: `${stats.cardsSold || 0} vendue(s)`, sub: `+${stats.chakraFromSales || 0} ◆ net` },
    { cls: '', label: 'Recyclage', iconCls: 'roi-icon--ok', icon: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>, val: `${stats.cardsRecycled || 0} recyclée(s)`, sub: `+${stats.chakraFromRecycle || 0} ◆` },
    { cls: '', label: 'Boosters & Tirages', iconCls: 'roi-icon--purple', icon: <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>, val: `${stats.boostersOpenedCount || 0} ouverts`, sub: `${(stats.mythicsPulledCount || 0) + (stats.legendariesPulledCount || 0)} L/M tirées` }
  ];

  return (
    <div className="card card--roi">
      <div className="card__header">
        <div className="roi-title-wrap">
          <span className="kanji-box kanji-box--gold" aria-hidden="true">益</span>
          <div>
            <h3 className="card__title">{t('roiTitle')}</h3>
            <p className="card__subtitle">{t('roiSubtitle')}</p>
          </div>
        </div>
        <button type="button" onClick={onResetRoi} className="btn btn--ghost btn--xs">{t('reset')}</button>
      </div>

      <div className="roi-grid">
        {roiBoxes.map((b) => (
          <div key={b.label} className={`roi-stat-box ${b.cls}`}>
            <div className="roi-stat-box__top">
              <span className="roi-stat-box__label">{b.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`roi-stat-box__icon ${b.iconCls}`} aria-hidden="true">{b.icon}</svg>
            </div>
            <strong className="roi-stat-box__val">{b.val}</strong>
            {b.sub && <span className="roi-stat-box__sub">{b.sub}</span>}
          </div>
        ))}
      </div>

      <div className="roi-yield-strip font-mono">
        <span>
          Rendement : <strong>{hourlyRate.toLocaleString('fr-FR')} ◆/h</strong> · Projection 8h :{' '}
          <strong className="roi-yield-strip__proj">~{projected8h.toLocaleString('fr-FR')} ◆</strong>
        </span>
        {sparklineCoords && (
          <svg className="roi-sparkline" viewBox="0 0 240 34" preserveAspectRatio="none" aria-label="Historique de rendement horaire 24h">
            <defs>
              <linearGradient id="roiSparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5c518" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#f5c518" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon points={sparklineCoords.area} fill="url(#roiSparkGrad)" />
            <polyline points={sparklineCoords.polyline} fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
};
