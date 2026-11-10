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

const PinIcon: React.FC<{ active?: boolean }> = ({ active }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const getSellTier = (price: number) =>
  price < 12 ? { label: 'Palier Rapide', cls: 'sell-tier-pill--fast' }
  : price < 60 ? { label: 'Palier Normal', cls: 'sell-tier-pill--normal' }
  : { label: 'Palier Patient', cls: 'sell-tier-pill--patient' };

const getListingAgeMinutes = (listing: MarketListing) => {
  if (!listing.createdAt) return null;
  const diff = Date.now() - new Date(listing.createdAt).getTime();
  return !Number.isNaN(diff) && diff >= 0 ? Math.floor(diff / 60000) : null;
};

const CAPSULE_OPTS = [
  { id: 'ALL', label: 'Tous' },
  { id: 'VENDRE', label: 'À vendre' },
  { id: 'RECYCLER', label: 'À recycler' },
  { id: 'FAST', label: 'Rapide <12◆' },
  { id: 'PATIENT', label: 'Patient ≥60◆' },
  { id: 'PROTÉGÉ', label: 'Protégés' }
];

export const DuplicatesTab: React.FC<DuplicatesTabProps> = ({
  duplicates, stats, activeListings, maxSlots, pinnedCards, settings, onTogglePin, onToast, onRefresh
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [openPedagogyId, setOpenPedagogyId] = useState<number | null>(null);
  const [draining, setDraining] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const turboCandidates = useMemo(
    () => duplicates.filter((d) => d.verdict === 'RECYCLER' && !d.pinned && !pinnedCards.has(d.characterId)),
    [duplicates, pinnedCards]
  );
  const turboCopies = turboCandidates.reduce((acc, c) => acc + (c.recyclableSpare ?? c.spare ?? 1), 0);
  const turboChakra = turboCandidates.reduce((acc, c) => acc + (c.recyclableSpare ?? c.spare ?? 1) * (c.recycleValue || 1), 0);
  const showTurbo = settings.autoSellTurboLiquidity !== false && turboCopies > 0;

  const handleBulkRecycle = async () => {
    setDraining(true);
    onToast('Recyclage Turbo Liquidité en cours…');
    const res = await sendCommand({ type: 'km:cmd:bulk-recycle' });
    setDraining(false);
    if (res?.ok) {
      onToast(t('toastBulkRecycleDone', { count: res.recycledCount ?? 0, chakra: res.chakraGained ?? 0 }));
      onRefresh();
    } else { onToast(res?.error || 'Erreur'); }
  };

  const handleSellOne = async (d: DuplicateCard) => {
    const price = d.prices?.recommended || 10;
    const res = await sendCommand({
      type: 'km:cmd:single-sell',
      characterId: d.characterId,
      price,
      durationHours: settings.autoSellDurationHours || 12
    });
    if (res?.ok) { onToast(`${d.name} en vente à ${price} ◆`); onRefresh(); }
    else { onToast(res?.error || 'Erreur'); }
  };

  const handleRecycleOne = async (d: DuplicateCard) => {
    const recQty = d.recyclableSpare ?? d.spare;
    const res = await sendCommand({ type: 'km:cmd:single-recycle', characterId: d.characterId, qty: recQty, name: d.name });
    if (res?.ok) { onToast(`${d.name} ×${recQty} recyclée(s)`); onRefresh(); }
    else { onToast(res?.error || 'Erreur'); }
  };

  const handleCancelListing = async (listing: MarketListing) => {
    setCancellingId(listing.id);
    const res = await sendCommand({ type: 'km:cmd:cancel-listing', listingId: listing.id, name: listing.name });
    setCancellingId(null);
    if (res?.ok) { onToast(`Annonce retirée : ${listing.name || 'Annonce'}`); onRefresh(); }
    else { onToast(res?.error || 'Erreur'); }
  };

  const filteredDuplicates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return duplicates.filter((d) => {
      const isPinned = Boolean(d.pinned || pinnedCards.has(d.characterId));
      const recPrice = d.prices?.recommended || d.lowestFixed || 10;
      if (filter === 'VENDRE' && d.verdict !== 'VENDRE') return false;
      if (filter === 'RECYCLER' && d.verdict !== 'RECYCLER') return false;
      if (filter === 'CONSERVER' && d.verdict !== 'CONSERVER') return false;
      if (filter === 'PROTÉGÉ' && !isPinned) return false;
      if (filter === 'FAST' && recPrice >= 12) return false;
      if (filter === 'PATIENT' && recPrice < 60) return false;
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

      {showTurbo && (
        <div className="turbo-banner">
          <div className="turbo-banner__main">
            <span className="kanji-box kanji-box--acc" aria-hidden="true">速</span>
            <div className="turbo-banner__text">
              <strong className="turbo-banner__title">{t('turboBannerTitle')}</strong>
              <p className="turbo-banner__desc">{t('turboBannerDesc', { n: turboCopies })}</p>
            </div>
          </div>
          <button type="button" onClick={handleBulkRecycle} disabled={draining} className="btn btn--accent btn--sm">
            <span>{draining ? 'Recyclage…' : t('btnBulkRecycle', { n: turboCopies, chakra: turboChakra })}</span>
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="input input--search"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select">
          <option value="ALL">{t('filterAll')} ({duplicates.length})</option>
          <option value="VENDRE">{t('filterSell')}</option>
          <option value="RECYCLER">{t('filterRecycle')}</option>
          <option value="CONSERVER">{t('filterHold')}</option>
          <option value="FAST">Rapide &lt;12◆</option>
          <option value="PATIENT">Patient ≥60◆</option>
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

      <div className="capsule-pills">
        {CAPSULE_OPTS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`capsule-pill ${filter === opt.id ? 'is-active' : ''}`}
            onClick={() => setFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filteredDuplicates.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">集</span>
          <strong className="empty-state-box__title">Aucun doublon à afficher</strong>
          <p className="empty-state-box__text">{t('noDuplicates')}</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="inventory-card-list">
          {filteredDuplicates.map((d) => {
            const isPinned = Boolean(d.pinned || pinnedCards.has(d.characterId));
            const isPedagogyOpen = openPedagogyId === d.characterId;
            const recPrice = d.prices?.recommended || d.lowestFixed || 10;
            const netGain = d.fees?.netProceeds ?? Math.max(1, Math.round(recPrice * 0.93));
            const tier = getSellTier(recPrice);
            const recQty = d.recyclableSpare ?? d.spare;
            const displayQty = d.verdict === 'RECYCLER' ? recQty : d.spare;

            return (
              <div key={d.characterId} className={`inventory-card rarity-${d.rarity.toLowerCase()} ${isPinned ? 'is-pinned' : ''}`}>
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
                      aria-label="Verrouiller"
                    >
                      <PinIcon active={isPinned} />
                    </button>
                    <span className="spare-badge" title={`${d.owned} en possession, 1 conservée`}>
                      ×{displayQty} en rab
                    </span>
                  </div>
                </div>

                <div className="inventory-card__metrics">
                  <div className="metric-cell">
                    <span className="metric-cell__label">Plancher</span>
                    <strong className="metric-cell__val">{d.lowestFixed || d.referenceMedian || '—'} ◆</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell__label">Net Vente</span>
                    <strong className="metric-cell__val metric-cell__val--gain">+{netGain} ◆</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell__label">Recyclage</span>
                    <strong className="metric-cell__val metric-cell__val--rec">+{d.recycleValue || 1} ◆</strong>
                  </div>
                </div>

                <div className="inventory-card__footer">
                  <div className="inventory-card__verdict">
                    <VerdictBadge verdict={isPinned ? 'PROTÉGÉ' : d.verdict} />
                    <span className={`sell-tier-pill ${tier.cls}`}>{tier.label}</span>
                  </div>
                  <div className="inventory-card__actions">
                    {d.verdict === 'VENDRE' && !isPinned && (
                      <button type="button" onClick={() => handleSellOne(d)} className="btn btn--primary btn--xs">
                        Vendre à {recPrice} ◆
                      </button>
                    )}
                    {d.verdict === 'RECYCLER' && !isPinned && (
                      <button type="button" onClick={() => handleRecycleOne(d)} className="btn btn--accent btn--xs">
                        Recycler (+{(d.recycleValue || 1) * recQty} ◆)
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
                const recQty = d.recyclableSpare ?? d.spare;
                const displayQty = d.verdict === 'RECYCLER' ? recQty : d.spare;
                return (
                  <tr key={d.characterId} className={isPinned ? 'is-pinned' : ''}>
                    <td data-label={t('thCharacter')}>
                      <button
                        type="button"
                        className={`btn-pin ${isPinned ? 'is-active' : ''}`}
                        onClick={() => onTogglePin(d.characterId)}
                        title={isPinned ? 'Déverrouiller' : 'Verrouiller'}
                        aria-label="Verrouiller"
                      >
                        <PinIcon active={isPinned} />
                      </button>
                      <RarityPill rarity={d.rarity} />
                      <strong>{d.name}</strong>
                    </td>
                    <td data-label={t('thSpare')} className="num font-mono">×{displayQty}</td>
                    <td data-label={t('thRecycleVal')} className="num font-mono">{d.recycleValue} ◆</td>
                    <td data-label={t('thMarketPrice')} className="num font-mono">{d.lowestFixed ? `${d.lowestFixed} ◆` : '—'}</td>
                    <td data-label={t('thVerdict')}><VerdictBadge verdict={isPinned ? 'PROTÉGÉ' : d.verdict} /></td>
                    <td data-label={t('thAction')}>
                      {d.verdict === 'VENDRE' && !isPinned && (
                        <button type="button" onClick={() => handleSellOne(d)} className="btn btn--primary btn--xs">
                          {t('btnSell')}
                        </button>
                      )}
                      {d.verdict === 'RECYCLER' && !isPinned && (
                        <button type="button" onClick={() => handleRecycleOne(d)} className="btn btn--accent btn--xs">
                          {t('btnRecycleCount', { n: recQty })}
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

      {/* Active Listings Section with 10-Segment Slot Rack & Age Telemetry */}
      <div className="card card--compact" style={{ marginTop: '14px' }}>
        <div className="card__header">
          <h3 className="card__title">{t('activeListingsTitle')}</h3>
          <span className="badge font-mono">{activeListings.length} / {maxSlots}</span>
        </div>

        <div className="slot-rack" aria-label={`${activeListings.length} sur ${maxSlots} créneaux`}>
          {Array.from({ length: maxSlots || 10 }).map((_, i) => (
            <div
              key={i}
              className={`slot-rack__seg ${i < activeListings.length ? 'is-filled' : 'is-free'}`}
              title={i < activeListings.length ? `Créneau ${i + 1} occupé` : `Créneau ${i + 1} libre`}
            />
          ))}
        </div>

        {activeListings.length === 0 ? (
          <div className="empty-state-box">
            <span className="empty-state-box__icon">市</span>
            <p className="empty-state-box__text">{t('noActiveListings')}</p>
          </div>
        ) : (
          <div className="active-listings-list">
            {activeListings.map((listing) => {
              const age = getListingAgeMinutes(listing);
              return (
                <div key={listing.id} className="active-listing-item">
                  <div className="active-listing-item__info">
                    {listing.rarity && <RarityPill rarity={listing.rarity} />}
                    <strong className="active-listing-item__name">{listing.name || `Carte #${listing.characterId}`}</strong>
                    <span className="active-listing-item__price font-mono">{listing.price} ◆</span>
                    {age !== null && (
                      <span className="listing-age">
                        depuis {age}m
                        {age >= 20 && (
                          <span className="listing-age__reprice-warn" title="20m+ sans vente : réajustement conseillé">
                            Reprisage proche
                          </span>
                        )}
                      </span>
                    )}
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
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
