import React, { useState, useMemo } from 'react';
import type { JournalItem, JournalType } from '../../../types/journal';
import { t } from '../../../lib/i18n';

export interface AutopilotJournalProps {
  journal: JournalItem[];
  onClear: () => void;
}

type JournalFilterKey = 'all' | 'sell' | 'recycle' | 'booster' | 'market';

const JournalIcon: React.FC<{ type: JournalType }> = ({ type }) => {
  switch (type) {
    case 'sell':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'recycle':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    case 'booster':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case 'market':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'mission':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'afk':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'error':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
};

const badgeLabelMap: Record<JournalType, string> = {
  sell: 'VENTE',
  recycle: 'RECYCL.',
  booster: 'PACK',
  market: 'MARCHÉ',
  mission: 'MISSION',
  afk: 'AFK',
  error: 'ERREUR',
  warn: 'AVIS',
  info: 'INFO',
  success: 'SUCCÈS'
};

export const AutopilotJournal: React.FC<AutopilotJournalProps> = ({ journal, onClear }) => {
  const [filter, setFilter] = useState<JournalFilterKey>('all');

  const counts = useMemo(() => {
    return {
      all: journal.length,
      sell: journal.filter((j) => j.type === 'sell').length,
      recycle: journal.filter((j) => j.type === 'recycle').length,
      booster: journal.filter((j) => j.type === 'booster').length,
      market: journal.filter((j) => j.type === 'market').length
    };
  }, [journal]);

  const filteredJournal = useMemo(() => {
    if (filter === 'all') return journal;
    return journal.filter((item) => item.type === filter);
  }, [journal, filter]);

  const filterButtons: Array<{ key: JournalFilterKey; label: string }> = [
    { key: 'all', label: 'Tout' },
    { key: 'sell', label: 'Ventes' },
    { key: 'recycle', label: 'Recyclage' },
    { key: 'booster', label: 'Boosters' },
    { key: 'market', label: 'Marché' }
  ];

  return (
    <div className="card card--journal card--compact">
      <div className="card__header">
        <div className="journal-title-wrap">
          <span className="kanji-box kanji-box--sm kanji-box--acc" aria-hidden="true">誌</span>
          <h3 className="card__title">
            {t('journalTitle')}
            {journal.length > 0 && <span className="counter-pill">{journal.length}</span>}
          </h3>
        </div>
        {journal.length > 0 && (
          <button type="button" onClick={onClear} className="btn btn--ghost btn--xs">
            {t('clear')}
          </button>
        )}
      </div>

      {journal.length > 0 && (
        <div className="journal-filters" role="group" aria-label="Filtrer le journal d'activité">
          {filterButtons.map(({ key, label }) => {
            const count = counts[key];
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                className={`journal-filter-pill ${isActive ? 'is-active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      <ul className="journal-list">
        {filteredJournal.length === 0 ? (
          <li className="journal-empty">
            {journal.length === 0 ? t('journalEmpty') : 'Aucune entrée dans cette catégorie.'}
          </li>
        ) : (
          filteredJournal.slice(0, 50).map((item, idx) => {
            const badgeLabel = badgeLabelMap[item.type] || 'INFO';
            return (
              <li key={`${item.ts}-${idx}`} className={`journal-item journal-item--${item.type}`}>
                <div className="journal-item__lead">
                  <span className={`journal-badge journal-badge--${item.type}`}>
                    <JournalIcon type={item.type} />
                    <span className="journal-badge__text">{badgeLabel}</span>
                  </span>
                  <span className="journal-item__msg">{item.message}</span>
                </div>
                <time className="journal-time">
                  {new Date(item.ts).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </time>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};
