import React, { useState, useMemo } from 'react';
import type { WishlistItem, WishlistSuggestion, DuplicateCard, MarketDeal } from '../../../types/kyara';
import { RarityPill } from '../common/RarityPill';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';

export interface WishlistTabProps {
  wishlist: WishlistItem[];
  suggestions: WishlistSuggestion[];
  duplicates: DuplicateCard[];
  deals: MarketDeal[];
  onAddWish: (item: { characterId: number; name: string; series?: string; rarity?: string; budgetChakra?: number; autoBuy?: boolean }) => Promise<any>;
  onRemoveWish: (characterId: number) => Promise<any>;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

const FlameIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export const WishlistTab: React.FC<WishlistTabProps> = ({
  wishlist, suggestions, duplicates, deals, onAddWish, onRemoveWish, onToast, onRefresh
}) => {
  const [search, setSearch] = useState('');
  const [budget, setBudget] = useState<string>('');
  const [autoBuy, setAutoBuy] = useState(false);
  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [showAuto, setShowAuto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [catalogList, setCatalogList] = useState<any[]>([]);

  React.useEffect(() => {
    chrome.storage?.local?.get('kmCatalogCache').then((stored: any) => {
      if (Array.isArray(stored?.kmCatalogCache?.list)) setCatalogList(stored.kmCatalogCache.list);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.kmCatalogCache) {
        const cached = changes.kmCatalogCache.newValue as { list?: any[] };
        setCatalogList(Array.isArray(cached?.list) ? cached.list : []);
      }
    };
    chrome.storage?.onChanged?.addListener(listener);
    return () => chrome.storage?.onChanged?.removeListener(listener);
  }, []);

  const autocompleteList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const map = new Map<number, any>();
    const addList = (items: any[]) => {
      for (const item of items) {
        const id = Number(item.characterId || item.id);
        const name = item.name;
        if (id && name && !map.has(id)) {
          map.set(id, {
            characterId: id,
            name,
            series: item.series || '',
            rarity: item.rarity || 'C',
            refMedian: item.referenceMedian || item.refMedian || 50
          });
        }
      }
    };
    addList(suggestions);
    addList(duplicates);
    addList(deals);
    addList(catalogList);
    return Array.from(map.values())
      .filter((c) => c.name.toLowerCase().includes(q) || c.series.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, suggestions, duplicates, deals, catalogList]);

  const handleSelectAutocomplete = (item: any) => {
    setSelectedChar(item);
    setSearch(item.name);
    if (!budget) setBudget(String(item.refMedian || 50));
    setShowAuto(false);
  };

  const handleAdd = async () => {
    if (!selectedChar) { onToast('Sélectionne une carte dans les résultats'); return; }
    const budgetNum = Number(budget);
    if (!Number.isSafeInteger(budgetNum) || budgetNum <= 0) {
      onToast('Indique un budget entier supérieur à zéro');
      return;
    }
    setSubmitting(true);
    const res = await onAddWish({
      characterId: selectedChar.characterId,
      name: selectedChar.name,
      series: selectedChar.series || '',
      rarity: selectedChar.rarity || 'C',
      budgetChakra: budgetNum,
      autoBuy
    });
    setSubmitting(false);
    if (res?.ok) {
      onToast(`${selectedChar.name} ajouté aux envies !`);
      setSearch('');
      setBudget('');
      setAutoBuy(false);
      setSelectedChar(null);
      onRefresh();
    } else { onToast(res?.error || "Erreur d'ajout"); }
  };

  const handleBuyWish = async (item: WishlistItem) => {
    if (!item.bestListingId || !item.lowestMarketPrice) return;
    setBuyingId(item.bestListingId);
    onToast(`Achat de ${item.name}…`);
    const res = await sendCommand({
      type: 'km:cmd:buy-listing',
      listingId: item.bestListingId,
      price: item.lowestMarketPrice,
      name: item.name
    });
    setBuyingId(null);
    if (res?.ok) {
      onToast(`Acheté avec succès : ${item.name} (${item.lowestMarketPrice} ◆)`);
      onRefresh();
    } else { onToast(res?.error || 'Erreur lors de l’achat'); }
  };

  return (
    <section className="tab-panel is-active">
      <div className="card card--compact" style={{ position: 'relative' }}>
        <div className="card__header">
          <div>
            <h2 className="card__title">{t('wishlistTitle')}</h2>
            <p className="card__desc">{t('wishlistDesc')}</p>
          </div>
          {wishlist.length > 0 && (
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
          )}
        </div>

        <div className="wishlist-add-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedChar(null); setShowAuto(true); }}
            onFocus={() => setShowAuto(true)}
            placeholder={t('wishlistSearchPlaceholder')}
            className="input"
          />
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={t('wishlistBudgetLabel')}
            min="1"
            className="input input--num"
          />
          <button type="button" onClick={handleAdd} disabled={submitting || !selectedChar} className="btn btn--primary btn--sm">
            <span>+ {t('wishlistBtnAdd')}</span>
          </button>
        </div>

        <label className="check-row" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={autoBuy} onChange={(e) => setAutoBuy(e.target.checked)} />
          <span>Autoriser l'achat automatique dans le budget (si module Envies actif).</span>
        </label>

        {showAuto && autocompleteList.length > 0 && (
          <div className="wishlist-autocomplete">
            {autocompleteList.map((item) => (
              <button
                type="button"
                key={item.characterId}
                className="wishlist-autocomplete__item"
                onClick={() => handleSelectAutocomplete(item)}
              >
                <RarityPill rarity={item.rarity} />
                <strong>{item.name}</strong>
                <span style={{ color: 'var(--mut)', fontSize: '11px' }}>({item.series || '—'}) · ~{item.refMedian} ◆</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {wishlist.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">札</span>
          <strong className="empty-state-box__title">Aucune carte dans tes envies</strong>
          <p className="empty-state-box__text">{t('wishlistEmpty')}</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="wishlist-card-list">
          {wishlist.map((w) => {
            const hasPrice = Number.isFinite(w.lowestMarketPrice) && (w.lowestMarketPrice || 0) > 0;
            const hasBudget = Number.isFinite(w.budgetChakra) && w.budgetChakra! > 0;
            const canBuy = Boolean(w.bestListingId && hasPrice && (!hasBudget || (w.lowestMarketPrice || 0) <= w.budgetChakra!));
            const budgetPct = hasPrice && hasBudget ? Math.min(100, Math.round((w.lowestMarketPrice! / w.budgetChakra!) * 100)) : null;

            return (
              <div key={w.characterId} className={`wishlist-card rarity-${w.rarity?.toLowerCase() || 'c'}`}>
                <div className="wishlist-card__header">
                  <div className="wishlist-card__identity">
                    <RarityPill rarity={w.rarity || 'C'} />
                    <div>
                      <strong className="wishlist-card__name">{w.name}</strong>
                      <span className="wishlist-card__series">{w.series || 'Kyara'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveWish(w.characterId)}
                    className="btn-trash"
                    title="Retirer cette carte"
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </div>

                <div className="wishlist-card__metrics">
                  <div className="metric-cell">
                    <span className="metric-cell__label">Budget Fixé</span>
                    <strong className="metric-cell__val">{hasBudget ? `${w.budgetChakra} ◆` : 'Illimité'}</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-cell__label">Plancher Marché</span>
                    <strong className={`metric-cell__val ${canBuy ? 'metric-cell__val--gain' : ''}`}>
                      {hasPrice ? `${w.lowestMarketPrice} ◆` : 'Aucune offre'}
                    </strong>
                  </div>
                </div>

                {/* Kyara Budget Progress Bar */}
                {hasPrice && hasBudget && budgetPct !== null && (
                  <div className="wishlist-budget-bar">
                    <div className="wishlist-budget-bar__labels">
                      <span>Marché : {w.lowestMarketPrice} ◆</span>
                      <span>Budget : {w.budgetChakra} ◆ ({budgetPct}%)</span>
                    </div>
                    <div className="wishlist-budget-bar__track">
                      <div
                        className={`wishlist-budget-bar__fill ${w.lowestMarketPrice! <= w.budgetChakra! ? 'is-ok' : 'is-over'}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="wishlist-card__footer">
                  <span className={`wishlist-status-pill ${canBuy ? 'is-deal' : ''}`}>
                    {hasPrice ? (
                      canBuy ? (
                        <>
                          <FlameIcon /> Offre disponible dans le budget !
                        </>
                      ) : (
                        'Offre au-dessus du budget'
                      )
                    ) : (
                      'En attente d’offres'
                    )}
                  </span>
                  {canBuy && (
                    <button
                      type="button"
                      onClick={() => handleBuyWish(w)}
                      disabled={buyingId === w.bestListingId}
                      className="btn btn--primary btn--xs"
                    >
                      {buyingId === w.bestListingId ? 'Achat…' : `Acheter (${w.lowestMarketPrice} ◆)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table data-table--wishlist">
            <thead>
              <tr>
                <th>{t('thWishCharacter')}</th>
                <th className="num">{t('thWishFloor')}</th>
                <th className="num">{t('thWishBudget')}</th>
                <th>{t('thWishStatus')}</th>
                <th>{t('thWishAction')}</th>
              </tr>
            </thead>
            <tbody>
              {wishlist.map((w) => {
                const hasPrice = Number.isFinite(w.lowestMarketPrice) && (w.lowestMarketPrice || 0) > 0;
                const hasBudget = Number.isFinite(w.budgetChakra) && (w.budgetChakra || 0) > 0;
                const canBuy = Boolean(w.bestListingId && hasPrice && (!hasBudget || (w.lowestMarketPrice || 0) <= w.budgetChakra!));

                return (
                  <tr key={w.characterId}>
                    <td data-label={t('thWishCharacter')}>
                      <RarityPill rarity={w.rarity || 'C'} />
                      <strong>{w.name}</strong>
                      {w.series && <span className="sub-meta">{w.series}</span>}
                    </td>
                    <td data-label={t('thWishFloor')} className="num font-mono">
                      {hasPrice ? <strong>{w.lowestMarketPrice} ◆</strong> : <span style={{ color: 'var(--mut)' }}>—</span>}
                    </td>
                    <td data-label={t('thWishBudget')} className="num font-mono">
                      {hasBudget ? `${w.budgetChakra} ◆` : <span style={{ color: 'var(--mut)' }}>Illimité</span>}
                    </td>
                    <td data-label={t('thWishStatus')}>
                      {hasPrice ? (
                        canBuy ? <span className="verdict-badge verdict-badge--sell">Disponible !</span> : <span className="verdict-badge verdict-badge--hold">Trop cher</span>
                      ) : (
                        <span className="verdict-badge">Aucune offre</span>
                      )}
                    </td>
                    <td data-label={t('thWishAction')}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {canBuy && (
                          <button
                            type="button"
                            onClick={() => handleBuyWish(w)}
                            disabled={buyingId === w.bestListingId}
                            className="btn btn--primary btn--xs"
                          >
                            {buyingId === w.bestListingId ? '…' : t('btnBuy')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveWish(w.characterId)}
                          className="btn btn--ghost btn--xs"
                          title="Supprimer"
                          aria-label="Supprimer"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Smart Daily Suggestions */}
      <div className="card card--sub" style={{ marginTop: '16px' }}>
        <div className="card__header">
          <div>
            <h3 className="card__title">{t('wishlistDailySuggestions')}</h3>
            <p className="card__desc" style={{ fontSize: '11px', color: 'var(--fg2)' }}>
              Cartes pour finir vos albums les plus avancés au meilleur coût.
            </p>
          </div>
          <span className="badge font-mono">{suggestions.length}</span>
        </div>
        <div className="wishlist-suggestions-grid">
          {suggestions.length === 0 ? (
            <div className="empty-state-box" style={{ padding: '16px 10px' }}>
              <p className="empty-state-box__text">
                Toutes vos séries avancées sont complètes ou en cours d'analyse !
              </p>
            </div>
          ) : (
            suggestions.map((s) => (
              <div key={s.characterId} className="wishlist-suggestion-card">
                <div className="wishlist-suggestion-card__header">
                  <div>
                    <RarityPill rarity={s.rarity} />
                    <strong>{s.name}</strong>
                  </div>
                  <span className="badge font-mono">{s.completionPct}% série</span>
                </div>
                <div className="wishlist-suggestion-card__meta">
                  <span>Série : {s.series || '—'}</span>
                  <span>Cote : ~{s.refMedian} ◆</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onAddWish({
                      characterId: s.characterId,
                      name: s.name,
                      series: s.series,
                      rarity: s.rarity,
                      budgetChakra: s.refMedian || 50
                    })
                  }
                  className="btn btn--ghost btn--xs"
                  style={{ marginTop: '6px', width: '100%' }}
                >
                  + Ajouter aux envies
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
