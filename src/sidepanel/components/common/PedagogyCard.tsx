import React from 'react';
import type { DecisionPedagogy } from '../../../types/kyara';

export interface PedagogyCardProps {
  pedagogy?: DecisionPedagogy;
  defaultName: string;
}

const AlertIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const CoinIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9 9.5h6a1.5 1.5 0 0 1 0 3H9a1.5 1.5 0 0 0 0 3h6" />
  </svg>
);

const UsersIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const BoltIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const PedagogyCard: React.FC<PedagogyCardProps> = ({ pedagogy, defaultName }) => {
  if (!pedagogy) return null;

  return (
    <div className="pedagogy-card">
      <div className="pedagogy-card__title">
        <span>{pedagogy.title || defaultName}</span>
        {pedagogy.isCrash && (
          <span className="badge-crash">
            <AlertIcon /> Chute du marché (-{pedagogy.crashDiscountPct}%)
          </span>
        )}
      </div>
      <p className="pedagogy-card__why">{pedagogy.why}</p>
      <div className="pedagogy-card__row">
        <span className="pedagogy-card__item">
          <ClockIcon /> <strong>Délai estimé :</strong> {pedagogy.delayEstimate || '12h-24h'}
        </span>{' '}
        ·{' '}
        <span className="pedagogy-card__item">
          <CoinIcon /> <strong>Gain net :</strong> {pedagogy.gainAnalysis}
        </span>{' '}
        ·{' '}
        <span className="pedagogy-card__item">
          <UsersIcon /> <strong>Concurrence :</strong> {pedagogy.competition}
        </span>
        {pedagogy.hourlyExpectedChakra !== undefined && (
          <>
            {' '}·{' '}
            <span className="pedagogy-card__item">
              <BoltIcon /> <strong>Rendement :</strong> ~{pedagogy.hourlyExpectedChakra} ◆/h
            </span>
          </>
        )}
      </div>
    </div>
  );
};
