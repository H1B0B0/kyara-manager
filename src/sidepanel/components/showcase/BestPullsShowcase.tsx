import React, { useState } from 'react';
import type { AutopilotPullRecord } from '../../../types/kyara';
import { RarityPill } from '../common/RarityPill';
import { t } from '../../../lib/i18n';

export interface BestPullsShowcaseProps {
  pulls: AutopilotPullRecord[];
  onClear: () => void;
}

const StarIcon: React.FC = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ marginRight: 4, display: 'inline-block', verticalAlign: '-1px' }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const BestPullsShowcase: React.FC<BestPullsShowcaseProps> = ({ pulls, onClear }) => {
  const [filter, setFilter] = useState<'all' | 'M' | 'L' | 'E' | 'new'>('all');

  const filteredPulls = pulls.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'new') return Boolean(p.isNew);
    return p.rarity === filter;
  });

  const openWiki = (cid: number) => {
    chrome.tabs.create({ url: `https://kyara.games/wiki/${cid}` });
  };

  if (pulls.length === 0) {
    return null;
  }

  return (
    <div className="card card--best-pulls">
      <div className="card__header">
        <div className="best-pulls-title-wrap">
          <span className="kanji-box kanji-box--gold" aria-hidden="true">神</span>
          <div>
            <h3 className="card__title">
              {t('bestPullsTitle')}
              {pulls.length > 0 && <span className="counter-pill">{pulls.length}</span>}
            </h3>
            <p className="card__subtitle">{t('bestPullsSubtitle')}</p>
          </div>
        </div>
        {pulls.length > 0 && (
          <button type="button" onClick={onClear} className="btn btn--ghost btn--xs">
            {t('bestPullsClear')}
          </button>
        )}
      </div>

      {/* Filter Chips */}
      {pulls.length > 0 && (
        <div className="best-pulls-filters" role="group" aria-label="Filtrer les tirages">
          <button
            type="button"
            className={`chip-filter ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('bestPullsFilterAll')} ({pulls.length})
          </button>
          <button
            type="button"
            className={`chip-filter chip-filter--M ${filter === 'M' ? 'is-active' : ''}`}
            onClick={() => setFilter('M')}
          >
            <StarIcon />
            {t('bestPullsFilterMythic')} ({pulls.filter((p) => p.rarity === 'M').length})
          </button>
          <button
            type="button"
            className={`chip-filter chip-filter--L ${filter === 'L' ? 'is-active' : ''}`}
            onClick={() => setFilter('L')}
          >
            <StarIcon />
            {t('bestPullsFilterLegendary')} ({pulls.filter((p) => p.rarity === 'L').length})
          </button>
          <button
            type="button"
            className={`chip-filter chip-filter--E ${filter === 'E' ? 'is-active' : ''}`}
            onClick={() => setFilter('E')}
          >
            <StarIcon />
            {t('bestPullsFilterEpic')} ({pulls.filter((p) => p.rarity === 'E').length})
          </button>
        </div>
      )}

      {/* Grid of Rare Character Cards */}
      {filteredPulls.length === 0 ? (
        <div className="best-pulls-empty">
          <p>{t('bestPullsEmpty')}</p>
        </div>
      ) : (
        <div className="best-pulls-grid">
          {filteredPulls.map((pull, idx) => (
            <div
              key={`${pull.characterId}-${pull.pulledAt}-${idx}`}
              className={`pull-card pull-card--${pull.rarity}`}
              onClick={() => openWiki(pull.characterId)}
              title="Cliquer pour ouvrir sur Kyara"
              role="button"
              tabIndex={0}
            >
              <div className="pull-card__img-wrap">
                {pull.image ? (
                  <img
                    src={pull.image}
                    alt={pull.name}
                    className="pull-card__img"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="pull-card__img-placeholder">{pull.rarity}</div>
                )}
                {pull.isNew && <span className="pull-card__new-tag">{t('bestPullsNewBadge')}</span>}
              </div>

              <div className="pull-card__info">
                <div className="pull-card__head">
                  <strong className="pull-card__name">{pull.name}</strong>
                  <RarityPill rarity={pull.rarity} />
                </div>
                <span className="pull-card__series">{pull.series || 'Autre'}</span>
                <div className="pull-card__foot">
                  <span className="pull-card__pack">{pull.packName}</span>
                  {pull.medianPrice !== undefined && (
                    <span className="pull-card__val">~{pull.medianPrice} ◆</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
