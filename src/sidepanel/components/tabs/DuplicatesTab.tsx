import React, { useState, useMemo } from 'react';
import type { DuplicateCard, MarketListing, CollectionStats } from '../../../types/kyara';
import type { KyaraSettings } from '../../../types/settings';
import { RarityPill } from '../common/RarityPill';
import { VerdictBadge } from '../common/VerdictBadge';
import { PedagogyCard } from '../common/PedagogyCard';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';

export interface DuplicatesTabProps {
  duplicates: DuplicateCard[];
  stats?: CollectionStats;
  activeListings: MarketListing[];
  maxSlots: number;
  pinnedCards: Set<number>;
  settings: KyaraSettings;
  onTogglePin: (characterId: number) => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

export const DuplicatesTab: React.FC<DuplicatesTabProps> = ({
  duplicates,
  stats,
  activeListings,
  maxSlots,
  pinnedCards,
  settings,
  onTogglePin,
  onToast,
  onRefresh
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [openPedagogyId, setOpenPedagogyId] = useState<number | null>(null);
  const [draining, setDraining] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Turbo Liquidity candidates
  const turboCandidates = useMemo(() => {
    return duplicates.filter(
      (d) => d.verdict === 'RECYCLER' && !d.pinned && !pinnedCards.has(d.characterId)
    );
  }, [duplicates, pinnedCards]);

  const turboCopies = turboCandidates.reduce((acc, c) => acc + (c.spare || 1), 0);
  const turboChakra = turboCandidates.reduce((acc, c) => acc + (c.spare || 1) * (c.recycleValue || 1), 0);
  const showTurbo = settings.autoSellTurboLiquidity !== false && turboCopies > 0;

  const handleBulkRecycle = async () => {
    setDraining(true);
    onToast('Recyclage Turbo Liquidité en cours…');
    const res = await sendCommand({ type: 'km:cmd:bulk-recycle' });
    setDraining(false);
    if (res?.ok) {
      onToast(t('toastBulkRecycleDone', { count: res.recycledCount || turboCopies, chakra: res.chakraGained || turboChakra }));
      onRefresh();
    } else {
      onToast(res?.error || 'Erreur');
    }
  };

  const handleSellOne = async (d: DuplicateCard) => {
    const price = d.prices?.recommended || 10;
    const res = await sendCommand({
      type: 'km:cmd:single-sell',
      characterId: d.characterId,
      price,
      durationHours: settings.autoSellDurationHours || 12
    });
    if (res?.ok) {
      onToast(`${d.name} en vente à ${price} ◆`);
      onRefresh();
    } else {
      onToast(res?.error || 'Erreur');
    }
  };

  const handleRecycleOne = async (d: DuplicateCard) => {
    const res = await sendCommand({
      type: 'km:cmd:single-recycle',
      characterId: d.characterId,
      qty: d.spare,
      name: d.name
    });
    if (res?.ok) {
      onToast(`${d.name} ×${d.spare} recyclée(s)`);
      onRefresh();
    } else {
      onToast(res?.error || 'Erreur');
    }
  };

  const handleCancelListing = async (listing: MarketListing) => {
    setCancellingId(listing.id);
    const res = await sendCommand({
      type: 'km:cmd:cancel-listing',
      listingId: listing.id,
      name: listing.name
    });
    setCancellingId(null);
    if (res?.ok) {
      onToast(`Annonce retirée : ${listing.name || 'Annonce'}`);
      onRefresh();
    } else {
      onToast(res?.error || 'Erreur');
    }
  };

  const filteredDuplicates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return duplicates.filter((d) => {
      const isPinned = Boolean(d.pinned || pinnedCards.has(d.characterId));
      if (filter === 'VENDRE' && d.verdict !== 'VENDRE') return false;
      if (filter === 'RECYCLER' && d.verdict !== 'RECYCLER') return false;
      if (filter === 'CONSERVER' && d.verdict !== 'CONSERVER') return false;
      if (filter === 'PROTÉGÉ' && !isPinned) return false;
      if (!q) return true;
      return (
        (d.name || '').toLowerCase().includes(q) ||
        (d.series || '').toLowerCase().includes(q) ||
        d.rarity.toLowerCase() === q ||
        String(d.characterId) === q
      );
    });
  }, [duplicates, search, filter, pinnedCards]);

  return (
    <section className="tab-panel is-active">
      {/* Summary Strip */}
      <div className="summary-strip">
        <div className="summary-pill summary-pill--sell">
          <span className="summary-pill__label">{t('dupSummarySell')}</span>
          <strong className="summary-pill__val">
            {t('copiesCount', { n: stats?.sellableDuplicatesCount ?? 0 })} · {stats?.sellableNetTotal ?? 0} net
          </strong>
        </div>
        <div className="summary-pill summary-pill--recycle">
          <span className="summary-pill__label">{t('dupSummaryRecycle')}</span>
          <strong className="summary-pill__val">
            {t('copiesCount', { n: stats?.recyclableDuplicatesCount ?? 0 })} · {stats?.recyclableChakraTotal ?? 0} ◆
          </strong>
        </div>
      </div>

      {/* Turbo Liquidity Banner */}
      {showTurbo && (
        <div className="turbo-banner">
          <div className="turbo-banner__main">
            <span className="turbo-banner__icon">⚡</span>
            <div className="turbo-banner__text">
              <strong className="turbo-banner__title">{t('turboBannerTitle')}</strong>
              <p className="turbo-banner__desc">
                {t('turboBannerDesc', { n: turboCopies })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBulkRecycle}
            disabled={draining}
            className="btn btn--accent btn--sm"
          >
            <span>{draining ? 'Recyclage…' : t('btnBulkRecycle', { n: turboCopies, chakra: turboChakra })}</span>
          </button>
        </div>
      )}

      {/* Toolbar & View Mode Switch */}
      <div className="toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="input input--search"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="select"
        >
          <option value="ALL">{t('filterAll')} ({duplicates.length})</option>
          <option value="VENDRE">{t('filterSell')}</option>
          <option value="RECYCLER">{t('filterRecycle')}</option>
          <option value="CONSERVER">{t('filterHold')}</option>
          <option value="PROTÉGÉ">{t('filterProtected')}</option>
        </select>
        <div className="view-toggle">
          <button
            type="button"
            className={`view-toggle__btn ${viewMode === 'cards' ? 'is-active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Vue Fiches Cartes"
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

      {/* Duplicates Content */}
      {filteredDuplicates.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">集</span>
          <strong className="empty-state-box__title">Aucun doublon à afficher</strong>
          <p className="empty-state-box__text">{t('noDuplicates')}</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* RPG Inventory Cards View */
        <div className="inventory-card-list">
          {filteredDuplicates.map((d) => {
            const isPinned = Boolean(d.pinned || pinnedCards.has(d.characterId));
            const isPedagogyOpen = openPedagogyId === d.characterId;
            const recPrice = d.prices?.recommended || d.lowestFixed || 10;
            const netGain = d.fees?.netProceeds ?? Math.max(1, Math.round(recPrice * 0.93));

            return (
              <div
                key={d.characterId}
                className={`inventory-card rarity-${d.rarity.toLowerCase()} ${isPinned ? 'is-pinned' : ''}`}
              >
                <div className="inventory-card__header">
                  <div className="inventory-card__identity">
                    <RarityPill rarity={d.rarity} />
                    <div className="inventory-card__names">
                      <strong className="inventory-card__name">{d.name}</strong>
                      <span className="inventory-card__series">{d.series || 'Kyara'}</span>
                    </div>
                  </div>
                  <div className="inventory-card__badge-stack">
                    <button
                      type="button"
                      className={`btn-pin ${isPinned ? 'is-active' : ''}`}
                      onClick={() => onTogglePin(d.characterId)}
                      title={isPinned ? 'Déverrouiller' : 'Verrouiller / Protéger'}
                    >
                      📌
                    </button>
                    <span className="spare-badge" title={`${d.owned} en possession, 1 conservée`}>
                      ×{d.spare} en rab
                    </span>
                  </div>
                </div>

                {/* 3 Metrics Grid */}
                <div className="inventory-card__metrics">
                  <div className="metric-cell">
                    <span className="metric-cell__label">Plancher</span>
                    <strong className="metric-cell__val">
                      {d.lowestFixed || d.referenceMedian || '—'} ◆
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell__label">Net Vente</span>
                    <strong className="metric-cell__val metric-cell__val--gain">
                      +{netGain} ◆
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell__label">Recyclage</span>
                    <strong className="metric-cell__val metric-cell__val--rec">
                      +{d.recycleValue || 1} ◆
                    </strong>
                  </div>
                </div>

                {/* Verdict & Actions */}
                <div className="inventory-card__footer">
                  <div className="inventory-card__verdict">
                    <VerdictBadge verdict={isPinned ? 'PROTÉGÉ' : d.verdict} />
                  </div>
                  <div className="inventory-card__actions">
                    {d.verdict === 'VENDRE' && !isPinned && (
                      <button
                        type="button"
                        onClick={() => handleSellOne(d)}
                        className="btn btn--primary btn--xs"
                      >
                        Vendre à {recPrice} ◆
                      </button>
                    )}
                    {d.verdict === 'RECYCLER' && !isPinned && (
                      <button
                        type="button"
                        onClick={() => handleRecycleOne(d)}
                        className="btn btn--accent btn--xs"
                      >
                        Recycler (+{(d.recycleValue || 1) * d.spare} ◆)
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn btn--ghost btn--xs ${isPedagogyOpen ? 'is-active' : ''}`}
                      onClick={() => setOpenPedagogyId(isPedagogyOpen ? null : d.characterId)}
                      title="Afficher l'analyse pédagogique"
                    >
                      {isPedagogyOpen ? 'Masquer' : 'Détails'}
                    </button>
                  </div>
                </div>

                {/* Expandable Pedagogy */}
                {isPedagogyOpen && d.pedagogy && (
                  <div className="inventory-card__pedagogy">
                    <PedagogyCard pedagogy={d.pedagogy} defaultName={d.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Classic Table View */
        <div className="table-wrapper">
          <table className="data-table data-table--duplicates">
            <thead>
              <tr>
                <th>{t('thCharacter')}</th>
                <th className="num">{t('thSpare')}</th>
                <th className="num">{t('thRecycle')}</th>
                <th className="num">{t('thPrice')}</th>
                <th>{t('thDecision')}</th>
                <th>{t('thAction')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDuplicates.map((d) => {
                const isPinned = Boolean(d.pinned || pinnedCards.has(d.characterId));
                return (
                  <tr key={d.characterId} className={isPinned ? 'is-pinned' : ''}>
                    <td data-label={t('thCharacter')}>
                      <button
                        type="button"
                        className={`btn-pin ${isPinned ? 'is-active' : ''}`}
                        onClick={() => onTogglePin(d.characterId)}
                        title={isPinned ? 'Déverrouiller' : 'Verrouiller'}
                      >
                        📌
                      </button>
                      <RarityPill rarity={d.rarity} />
                      <strong>{d.name}</strong>
                    </td>
                    <td data-label={t('thSpare')} className="num font-mono">
                      ×{d.spare}
                    </td>
                    <td data-label={t('thRecycleVal')} className="num font-mono">
                      {d.recycleValue} ◆
                    </td>
                    <td data-label={t('thMarketPrice')} className="num font-mono">
                      {d.lowestFixed ? `${d.lowestFixed} ◆` : '—'}
                    </td>
                    <td data-label={t('thVerdict')}>
                      <VerdictBadge verdict={isPinned ? 'PROTÉGÉ' : d.verdict} />
                    </td>
                    <td data-label={t('thAction')}>
                      {d.verdict === 'VENDRE' && !isPinned && (
                        <button
                          type="button"
                          onClick={() => handleSellOne(d)}
                          className="btn btn--primary btn--xs"
                        >
                          {t('btnSell')}
                        </button>
                      )}
                      {d.verdict === 'RECYCLER' && !isPinned && (
                        <button
                          type="button"
                          onClick={() => handleRecycleOne(d)}
                          className="btn btn--accent btn--xs"
                        >
                          {t('btnRecycleCount', { n: d.spare })}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Active Listings Section */}
      <div className="card card--compact" style={{ marginTop: '14px' }}>
        <div className="card__header">
          <h3 className="card__title">{t('activeListingsTitle')}</h3>
          <span className="badge font-mono">
            {activeListings.length} / {maxSlots}
          </span>
        </div>

        {activeListings.length === 0 ? (
          <div className="empty-state-box">
            <span className="empty-state-box__icon">市</span>
            <p className="empty-state-box__text">{t('noActiveListings')}</p>
          </div>
        ) : (
          <div className="active-listings-list">
            {activeListings.map((listing) => (
              <div key={listing.id} className="active-listing-item">
                <div className="active-listing-item__info">
                  {listing.rarity && <RarityPill rarity={listing.rarity} />}
                  <strong className="active-listing-item__name">{listing.name || `Carte #${listing.characterId}`}</strong>
                  <span className="active-listing-item__price font-mono">{listing.price} ◆</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelListing(listing)}
                  disabled={cancellingId === listing.id}
                  className="btn btn--ghost btn--xs"
                  title="Retirer cette annonce du marché"
                >
                  {cancellingId === listing.id ? 'Annulation…' : 'Annuler'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
