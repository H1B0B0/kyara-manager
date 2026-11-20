import React, { useEffect, useMemo, useState } from 'react';
import type { DashboardState, MarketDeal, ProfitableTrade, Rarity } from '../../../types/kyara';
import { DEFAULT_SETTINGS, type KyaraSettings } from '../../../types/settings';
import { RarityPill } from '../common/RarityPill';
import { RenaissancePanel } from '../market/RenaissancePanel';
import { BatchBuyPanel } from '../market/BatchBuyPanel';
import { t } from '../../../lib/i18n';
import { sendCommand } from '../../hooks/useDashboard';

export interface MarketTabProps {
  deals: MarketDeal[];
  trades: ProfitableTrade[];
  dashboard?: DashboardState | null;
  settings?: KyaraSettings;
  onUpdateSettings?: (partial: Partial<KyaraSettings>) => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
  onScanDeals?: () => Promise<any>;
}

type MarketSubTab = 'deals' | 'batch' | 'trades';
type DealCategory = 'ALL' | 'RENAISSANCE' | 'MISSING' | 'FLIP' | 'WISHLIST';
type DealSort = 'profit' | 'price_asc' | 'discount' | 'missing';

const RARITY_CHIPS: Array<'ALL' | Rarity> = ['ALL', 'C', 'U', 'R', 'E', 'L', 'M'];
const CATEGORY_CHIPS: Array<{ key: DealCategory; label: string }> = [
  { key: 'ALL', label: 'Tous' },
  { key: 'RENAISSANCE', label: 'Renaissance' },
  { key: 'MISSING', label: 'Manquantes' },
  { key: 'FLIP', label: 'Flips' },
  { key: 'WISHLIST', label: 'Envies' }
];

const SwapArrow: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

const ScanIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const formatChakra = (val: number | null | undefined, signed = false): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const prefix = signed && val > 0 ? '+' : '';
  return `${prefix}${val} ◆`;
};

export const MarketTab: React.FC<MarketTabProps> = ({
  deals, trades, dashboard, settings, onUpdateSettings, onToast, onRefresh, onScanDeals
}) => {
  const [subTab, setSubTab] = useState<MarketSubTab>('deals');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<DealSort>('profit');
  const [rarityFilter, setRarityFilter] = useState<'ALL' | Rarity>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<DealCategory>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [batchSeed, setBatchSeed] = useState<{ rarity?: Rarity | 'RENAISSANCE'; qty?: number }>({});

  const effectiveSettings = settings || DEFAULT_SETTINGS;

  useEffect(() => {
    if (deals.length === 0 && onScanDeals) void onScanDeals();
  }, [deals.length, onScanDeals]);

  const handleUpdateSettings = (partial: Partial<KyaraSettings>) => {
    if (onUpdateSettings) {
      onUpdateSettings(partial);
    } else {
      void sendCommand({ type: 'km:save-settings', settings: partial });
    }
  };

  const handleQuickBatchForRarity = (rarity: Rarity, missingCount: number) => {
    setBatchSeed({ rarity, qty: Math.max(1, Math.min(50, missingCount)) });
    setSubTab('batch');
  };

  const filteredDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = deals.filter((d) => {
      if (rarityFilter !== 'ALL' && d.rarity !== rarityFilter) return false;
      if (categoryFilter === 'RENAISSANCE' && !d.isRenaissanceNeed) return false;
      if (categoryFilter === 'MISSING' && !d.isMissing) return false;
      if (categoryFilter === 'FLIP' && !d.isGoodFlip) return false;
      if (categoryFilter === 'WISHLIST' && !d.isWishlistMatch) return false;
      if (q && !d.name.toLowerCase().includes(q) && !(d.series || '').toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return a.buyPrice - b.buyPrice;
      if (sortBy === 'discount') return (b.discountPct ?? 0) - (a.discountPct ?? 0);
      if (sortBy === 'missing') {
        const scoreA = (a.isRenaissanceNeed ? 2 : 0) + (a.isMissing ? 1 : 0);
        const scoreB = (b.isRenaissanceNeed ? 2 : 0) + (b.isMissing ? 1 : 0);
        return scoreB - scoreA || a.buyPrice - b.buyPrice;
      }
      return (b.flipProfit ?? -999999) - (a.flipProfit ?? -999999);
    });
  }, [deals, rarityFilter, categoryFilter, searchQuery, sortBy]);

  const handleBuy = async (deal: MarketDeal) => {
    setBuyingId(deal.listingId);
    onToast(`Achat de ${deal.name} en cours…`);
    const res = await sendCommand({
      type: 'km:cmd:buy-listing', listingId: deal.listingId, price: deal.buyPrice, name: deal.name
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
    <section className="tab-panel is-active market-pro-container">
      <RenaissancePanel
        renaissance={dashboard?.renaissance}
        settings={effectiveSettings}
        onUpdateSettings={handleUpdateSettings}
        onQuickBatchForRarity={handleQuickBatchForRarity}
      />

      <div className="market-subtabs" role="tablist" aria-label="Vues du marché">
        <button type="button" role="tab" aria-selected={subTab === 'deals'} className={`market-subtab ${subTab === 'deals' ? 'is-active' : ''}`} onClick={() => setSubTab('deals')}>
          Opportunités ({deals.length})
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'batch'} className={`market-subtab ${subTab === 'batch' ? 'is-active' : ''}`} onClick={() => setSubTab('batch')}>
          Achat par lot
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'trades'} className={`market-subtab ${subTab === 'trades' ? 'is-active' : ''}`} onClick={() => setSubTab('trades')}>
          Échanges ({trades.length})
        </button>
      </div>

      {subTab === 'deals' && (
        <>
          <div className="card card--compact">
            <div className="card__header">
              <div className="tile-head tile-head--sm">
                <span className="kanji-box kanji-box--sm kanji-box--acc" aria-hidden="true">市</span>
                <div>
                  <h2 className="card__title">Scanner d'Opportunités</h2>
                  <p className="card__desc">Annonces sous la médiane live &amp; cartes manquantes ciblées.</p>
                </div>
              </div>
              <button
                type="button" disabled={scanning} className="btn btn--primary btn--sm"
                onClick={async () => {
                  setScanning(true);
                  onToast('Scan des annonces du marché en cours…');
                  try {
                    if (onScanDeals) {
                      const res = await onScanDeals();
                      onToast(`${(res?.dashboard?.deals || []).length} opportunité(s) trouvée(s)`);
                    } else onRefresh();
                  } finally { setScanning(false); }
                }}
              >
                <ScanIcon />
                <span>{scanning ? 'Scan…' : 'Scanner'}</span>
              </button>
            </div>

            <div className="market-filter-bar">
              <input
                type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher carte ou série…" className="input input--search" aria-label="Rechercher dans les opportunités"
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as DealSort)} className="select market-sort-select" aria-label="Trier les opportunités">
                <option value="profit">Meilleur profit</option>
                <option value="price_asc">Prix croissant</option>
                <option value="discount">Remise %</option>
                <option value="missing">Manquantes</option>
              </select>
              <div className="view-toggle">
                <button type="button" className={`view-toggle__btn ${viewMode === 'cards' ? 'is-active' : ''}`} onClick={() => setViewMode('cards')}>Fiches</button>
                <button type="button" className={`view-toggle__btn ${viewMode === 'table' ? 'is-active' : ''}`} onClick={() => setViewMode('table')}>Table</button>
              </div>
            </div>

            <div className="capsule-pills market-chip-row" aria-label="Filtrer par rareté">
              {RARITY_CHIPS.map((r) => (
                <button key={r} type="button" onClick={() => setRarityFilter(r)} className={`capsule-pill capsule-pill--xs ${rarityFilter === r ? 'is-active' : ''}`}>
                  {r === 'ALL' ? 'Toutes' : r}
                </button>
              ))}
            </div>

            <div className="capsule-pills market-chip-row" aria-label="Filtrer par catégorie">
              {CATEGORY_CHIPS.map((c) => (
                <button key={c.key} type="button" onClick={() => setCategoryFilter(c.key)} className={`capsule-pill capsule-pill--xs ${categoryFilter === c.key ? 'is-active' : ''}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {filteredDeals.length === 0 ? (
            <div className="empty-state-box">
              <span className="empty-state-box__icon">市</span>
              <strong className="empty-state-box__title">Aucune opportunité correspondante</strong>
              <p className="empty-state-box__text">{t('noDeals')}</p>
              <button type="button" onClick={onRefresh} className="btn btn--ghost btn--sm" style={{ marginTop: '8px' }}>
                Scanner le marché maintenant
              </button>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="deal-card-list">
              {filteredDeals.map((d) => (
                <div key={d.listingId} className={`deal-card rarity-${d.rarity.toLowerCase()}`}>
                  <div className="deal-card__header">
                    <div className="deal-card__identity">
                      <RarityPill rarity={d.rarity} />
                      <div className="deal-card__names">
                        <strong className="deal-card__name">{d.name}</strong>
                        <span className="deal-card__series">{d.series || 'Kyara'}</span>
                      </div>
                    </div>
                    <div className="deal-card__badge-stack">
                      {d.discountPct > 0 && <span className="discount-pill">-{d.discountPct}%</span>}
                      {d.isRenaissanceNeed && <span className="renaissance-badge">Renaissance</span>}
                      {d.isMissing && <span className="missing-badge">Manquante</span>}
                    </div>
                  </div>

                  <div className="deal-card__metrics">
                    <div className="metric-cell">
                      <span className="metric-cell__label">Prix Achat</span>
                      <strong className="metric-cell__val metric-cell__val--buy">{d.buyPrice} ◆</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-cell__label">Revente Cible</span>
                      <strong className="metric-cell__val">{formatChakra(d.targetResalePrice)}</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-cell__label">Gain Net</span>
                      <strong className={`metric-cell__val ${d.flipProfit != null && d.flipProfit > 0 ? 'metric-cell__val--gain' : ''}`}>
                        {formatChakra(d.flipProfit, true)}
                      </strong>
                    </div>
                  </div>

                  <div className="deal-card__footer">
                    <span className="deal-card__roi">
                      {d.roiPct != null ? `ROI : +${d.roiPct}%` : 'ROI : —'} · {d.sales7d} ventes/7j
                    </span>
                    <button type="button" onClick={() => handleBuy(d)} disabled={buyingId === d.listingId} className="btn btn--primary btn--xs">
                      {buyingId === d.listingId ? 'Achat…' : `Acheter (${d.buyPrice} ◆)`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
                        {d.isRenaissanceNeed && <span className="renaissance-badge" style={{ marginLeft: '4px' }}>Ren.</span>}
                        {d.isMissing && <span className="missing-badge" style={{ marginLeft: '4px' }}>Manq.</span>}
                      </td>
                      <td data-label={t('thBuy')} className="num font-mono">{d.buyPrice} ◆</td>
                      <td data-label={t('thMedian7d')} className="num font-mono">{formatChakra(d.refMedian)}</td>
                      <td data-label={t('thResale')} className="num font-mono">{formatChakra(d.targetResalePrice)}</td>
                      <td data-label={t('thNetMargin')} className={`num font-mono ${d.flipProfit != null && d.flipProfit > 0 ? 'text-gain' : ''}`}>
                        {d.flipProfit != null ? `${formatChakra(d.flipProfit, true)}${d.roiPct != null ? ` (+${d.roiPct}%)` : ''}` : '—'}
                      </td>
                      <td data-label={t('thAction')}>
                        <button type="button" onClick={() => handleBuy(d)} disabled={buyingId === d.listingId} className="btn btn--primary btn--xs">
                          {buyingId === d.listingId ? '…' : t('btnBuy')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === 'batch' && (
        <BatchBuyPanel
          userChakra={dashboard?.me?.chakra ?? 0}
          settings={effectiveSettings}
          initialRarity={batchSeed.rarity}
          initialQty={batchSeed.qty}
          onToast={onToast}
          onRefresh={onRefresh}
        />
      )}

      {subTab === 'trades' && (
        <div className="card card--compact">
          <div className="card__header">
            <div className="tile-head tile-head--sm">
              <span className="kanji-box kanji-box--sm kanji-box--cyan" aria-hidden="true">換</span>
              <div>
                <h3 className="card__title">Échanges Rentables (Trades)</h3>
                <p className="card__desc">Propositions d'échange du marché où vous gagnez de la valeur.</p>
              </div>
            </div>
            <span className="badge font-mono">{trades.length}</span>
          </div>
          {trades.length === 0 ? (
            <div className="empty-state-box">
              <span className="empty-state-box__icon">換</span>
              <p className="empty-state-box__text">Aucun échange avantageux disponible sur le marché pour l'instant.</p>
            </div>
          ) : (
            <div className="trades-list">
              {trades.map((tr) => (
                <div key={tr.listingId} className="trade-item">
                  <div className="trade-item__col">
                    <span className="trade-item__label">Offert</span>
                    <strong><RarityPill rarity={tr.offered.rarity} />{tr.offered.name}</strong>
                    <span className="trade-item__val font-mono">{tr.offered.median7d} ◆</span>
                  </div>
                  <div className="trade-item__arrow"><SwapArrow /></div>
                  <div className="trade-item__col">
                    <span className="trade-item__label">Demandé</span>
                    <strong><RarityPill rarity={tr.wanted.rarity} />{tr.wanted.name}</strong>
                    <span className="trade-item__val font-mono">{tr.wanted.median7d} ◆</span>
                  </div>
                  <div className="trade-item__gain text-gain font-mono">+{tr.profit} ◆</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
