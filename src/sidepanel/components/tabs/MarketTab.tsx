import React, { useState, useMemo } from 'react';
import type { MarketDeal, ProfitableTrade } from '../../../types/kyara';
import { RarityPill } from '../common/RarityPill';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';

export interface MarketTabProps {
  deals: MarketDeal[];
  trades: ProfitableTrade[];
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

export const MarketTab: React.FC<MarketTabProps> = ({ deals, trades, onToast, onRefresh }) => {
  const [filter, setFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (filter === 'FLIP') return d.isGoodFlip;
      if (filter === 'MISSING') return d.isMissing;
      return true;
    });
  }, [deals, filter]);

  const handleBuy = async (deal: MarketDeal) => {
    setBuyingId(deal.listingId);
    onToast(`Achat de ${deal.name} en cours…`);
    const res = await sendCommand({
      type: 'km:cmd:buy-listing',
      listingId: deal.listingId,
      price: deal.buyPrice,
      name: deal.name
    });
    setBuyingId(null);
    if (res?.ok) {
      onToast(`Acheté avec succès : ${deal.name} (${deal.buyPrice} ◆)`);
      onRefresh();
    } else {
      onToast(res?.error || 'Erreur lors de l’achat');
    }
  };

  return (
    <section className="tab-panel is-active">
      {/* Scanner Control Card */}
      <div className="card card--compact">
        <div className="card__header">
          <div>
            <h2 className="card__title">Scanner d'Opportunités &amp; Arbitrage</h2>
            <p className="card__desc">
              Cible les annonces sous la médiane live avec marge nette positive après taxes (5% + 2%).
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn--primary btn--sm"
          >
            <span>{t('btnScanDeals')}</span>
          </button>
        </div>

        <div className="toolbar toolbar--tight" style={{ marginTop: '8px' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="select"
            aria-label="Filtrer les opportunités"
          >
            <option value="ALL">{t('filterAllDeals')} ({deals.length})</option>
            <option value="FLIP">{t('filterFlipsOnly')}</option>
            <option value="MISSING">{t('filterMissingOnly')}</option>
          </select>

          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle__btn ${viewMode === 'cards' ? 'is-active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Vue Cartes"
            >
              Fiches
            </button>
            <button
              type="button"
              className={`view-toggle__btn ${viewMode === 'table' ? 'is-active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Vue Tableau"
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Deals Content */}
      {filteredDeals.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">市</span>
          <strong className="empty-state-box__title">Aucune opportunité pour le moment</strong>
          <p className="empty-state-box__text">{t('noDeals')}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn--ghost btn--sm"
            style={{ marginTop: '10px' }}
          >
            Scanner le marché maintenant
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* Opportunity Cards View */
        <div className="deal-card-list">
          {filteredDeals.map((d) => (
            <div key={d.listingId} className={`deal-card rarity-${d.rarity.toLowerCase()}`}>
              <div className="deal-card__header">
                <div className="deal-card__identity">
                  <RarityPill rarity={d.rarity} />
                  <div>
                    <strong className="deal-card__name">{d.name}</strong>
                    <span className="deal-card__series">{d.series || 'Kyara'}</span>
                  </div>
                </div>
                <div className="deal-card__badge-stack">
                  <span className="discount-pill">-{d.discountPct}%</span>
                  {d.isMissing && <span className="missing-badge">★ Manquante</span>}
                </div>
              </div>

              {/* 3 Metrics Mini Grid */}
              <div className="deal-card__metrics">
                <div className="metric-cell">
                  <span className="metric-cell__label">Prix Achat</span>
                  <strong className="metric-cell__val metric-cell__val--buy">{d.buyPrice} ◆</strong>
                </div>
                <div className="metric-cell">
                  <span className="metric-cell__label">Revente Cible</span>
                  <strong className="metric-cell__val">{d.targetResalePrice} ◆</strong>
                </div>
                <div className="metric-cell">
                  <span className="metric-cell__label">Gain Net</span>
                  <strong className="metric-cell__val metric-cell__val--gain">+{d.flipProfit} ◆</strong>
                </div>
              </div>

              <div className="deal-card__footer">
                <span className="deal-card__roi">
                  ROI : +{d.roiPct}% · {d.sales7d} ventes/7j
                </span>
                <button
                  type="button"
                  onClick={() => handleBuy(d)}
                  disabled={buyingId === d.listingId}
                  className="btn btn--primary btn--xs"
                >
                  {buyingId === d.listingId ? 'Achat…' : `Acheter (${d.buyPrice} ◆)`}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Classic Table View */
        <div className="table-wrapper">
          <table className="data-table data-table--market">
            <thead>
              <tr>
                <th>{t('thCard')}</th>
                <th className="num">{t('thBuy')}</th>
                <th className="num">{t('thMedian7d')}</th>
                <th className="num">{t('thResale')}</th>
                <th className="num">{t('thNetMargin')}</th>
                <th>{t('thAction')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((d) => (
                <tr key={d.listingId}>
                  <td data-label={t('thCard')}>
                    <RarityPill rarity={d.rarity} />
                    <strong>{d.name}</strong>
                    {d.isMissing && <span className="badge-missing">★</span>}
                  </td>
                  <td data-label={t('thBuy')} className="num font-mono">
                    {d.buyPrice} ◆
                  </td>
                  <td data-label={t('thMedian7d')} className="num font-mono">
                    {d.refMedian} ◆
                  </td>
                  <td data-label={t('thResale')} className="num font-mono">
                    {d.targetResalePrice} ◆
                  </td>
                  <td data-label={t('thNetMargin')} className="num font-mono text-gain">
                    +{d.flipProfit} ◆ (+{d.roiPct}%)
                  </td>
                  <td data-label={t('thAction')}>
                    <button
                      type="button"
                      onClick={() => handleBuy(d)}
                      disabled={buyingId === d.listingId}
                      className="btn btn--primary btn--xs"
                    >
                      {buyingId === d.listingId ? '…' : t('btnBuy')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trades Section */}
      <div className="card card--compact" style={{ marginTop: '14px' }}>
        <div className="card__header">
          <div>
            <h3 className="card__title">🤝 Échanges Rentables (Trades)</h3>
            <p className="card__desc">Propositions d'échange du marché où vous gagnez de la valeur.</p>
          </div>
          <span className="badge font-mono">{trades.length}</span>
        </div>

        {trades.length === 0 ? (
          <div className="empty-state-box">
            <span className="empty-state-box__icon">🤝</span>
            <p className="empty-state-box__text">Aucun échange avantageux disponible sur le marché pour l'instant.</p>
          </div>
        ) : (
          <div className="trades-list">
            {trades.map((tr) => (
              <div key={tr.listingId} className="trade-item">
                <div className="trade-item__col">
                  <span className="trade-item__label">Offert</span>
                  <strong>{tr.offered.name}</strong>
                  <span className="trade-item__val font-mono">{tr.offered.median7d} ◆</span>
                </div>
                <div className="trade-item__arrow">➔</div>
                <div className="trade-item__col">
                  <span className="trade-item__label">Demandé</span>
                  <strong>{tr.wanted.name}</strong>
                  <span className="trade-item__val font-mono">{tr.wanted.median7d} ◆</span>
                </div>
                <div className="trade-item__gain text-gain font-mono">
                  +{tr.profit} ◆
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
