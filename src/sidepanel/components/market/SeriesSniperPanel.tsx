import React, { useMemo, useState } from 'react';
import type { SeriesProgress } from '../../../types/kyara';
import { RarityPill } from '../common/RarityPill';

export interface SeriesSniperPanelProps {
  seriesProgress?: SeriesProgress[];
  onCompleteSeries: (series: SeriesProgress) => void;
  onAddSeriesToWishlist: (series: SeriesProgress) => void;
}

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.16s ease' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const HeartPlusIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-4.35-9.33-8.5C.8 9.2 2.4 5 6.5 5c2.2 0 3.9 1.2 4.8 2.6C12.2 6.2 13.9 5 16.1 5c4.1 0 5.7 4.2 3.83 7.5C17.6 16.65 12 21 12 21z" />
  </svg>
);

export const SeriesSniperPanel: React.FC<SeriesSniperPanelProps> = ({
  seriesProgress = [],
  onCompleteSeries,
  onAddSeriesToWishlist
}) => {
  const [query, setQuery] = useState('');
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = seriesProgress.filter((s) => s.missingCount > 0 && (!q || s.series.toLowerCase().includes(q)));
    return [...list].sort((a, b) => b.completionPct - a.completionPct || a.missingCount - b.missingCount);
  }, [seriesProgress, query]);

  const toggleExpand = (seriesName: string) => {
    setExpandedSeries((prev) => ({ ...prev, [seriesName]: !prev[seriesName] }));
  };

  return (
    <div className="card card--compact series-sniper-panel">
      <div className="card__header">
        <div className="tile-head tile-head--sm">
          <span className="kanji-box kanji-box--sm kanji-box--cyan" aria-hidden="true">系</span>
          <div>
            <h2 className="card__title">Radar de Séries</h2>
            <p className="card__desc">Séries presque complètes prêtes à être terminées.</p>
          </div>
        </div>
        <span className="mono-badge">{filtered.length}</span>
      </div>

      <div className="series-search-wrap">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une série…"
          className="input input--search series-search"
          aria-label="Rechercher une série"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state-box">
          <span className="empty-state-box__icon">系</span>
          <strong className="empty-state-box__title">Aucune série presque complète</strong>
          <p className="empty-state-box__text">
            {query.trim()
              ? 'Aucune série ne correspond à cette recherche.'
              : 'Actualise la collection pour détecter les séries à finaliser.'}
          </p>
        </div>
      ) : (
        <div className="series-list">
          {filtered.map((s) => {
            const isOpen = Boolean(expandedSeries[s.series]);
            return (
              <div key={s.series} className="series-card">
                <div className="series-card__top">
                  <button
                    type="button"
                    className="series-card__toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleExpand(s.series)}
                  >
                    <div className="series-card__identity">
                      <strong className="series-card__name">{s.series}</strong>
                      <span className="series-card__stats font-mono">
                        {s.completionPct}% · {s.owned}/{s.total} · -{s.missingCount} manquante(s)
                      </span>
                    </div>
                    <div className="series-card__right">
                      <span className="series-card__cost font-mono">
                        ~{new Intl.NumberFormat('fr-FR').format(s.estimatedCostToComplete)} ◆
                      </span>
                      <ChevronIcon open={isOpen} />
                    </div>
                  </button>
                </div>

                <div className="series-progress-track" aria-hidden="true">
                  <div
                    className="series-progress-fill"
                    style={{ width: `${Math.min(100, Math.max(0, s.completionPct))}%` }}
                  />
                </div>

                {isOpen && s.missingCards.length > 0 && (
                  <div className="series-missing-list">
                    {s.missingCards.map((card) => (
                      <div key={card.characterId} className="series-missing-row">
                        <div className="series-missing-row__left">
                          <RarityPill rarity={card.rarity} />
                          <span className="series-missing-row__name">{card.name}</span>
                        </div>
                        <span className="series-missing-row__price font-mono">~{card.estimatedPrice} ◆</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="series-card__actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--xs"
                    onClick={() => onCompleteSeries(s)}
                  >
                    Compléter ({s.missingCount})
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--xs"
                    onClick={() => onAddSeriesToWishlist(s)}
                  >
                    <HeartPlusIcon />
                    <span>+ Envies</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
