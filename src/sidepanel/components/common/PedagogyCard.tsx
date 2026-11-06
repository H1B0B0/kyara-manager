import React from 'react';
import type { DecisionPedagogy } from '../../../types/kyara';

export interface PedagogyCardProps {
  pedagogy?: DecisionPedagogy;
  defaultName: string;
}

export const PedagogyCard: React.FC<PedagogyCardProps> = ({ pedagogy, defaultName }) => {
  if (!pedagogy) return null;

  return (
    <div className="pedagogy-card">
      <div className="pedagogy-card__title">
        <span>{pedagogy.title || defaultName}</span>
        {pedagogy.isCrash && (
          <span className="badge-crash">
            🚨 Chute du marché (-{pedagogy.crashDiscountPct}%)
          </span>
        )}
      </div>
      <p className="pedagogy-card__why">{pedagogy.why}</p>
      <div className="pedagogy-card__row">
        <span>⏱️ <strong>Délai estimé :</strong> {pedagogy.delayEstimate || '12h-24h'}</span> ·{' '}
        <span>💰 <strong>Gain net :</strong> {pedagogy.gainAnalysis}</span> ·{' '}
        <span>👥 <strong>Concurrence :</strong> {pedagogy.competition}</span>
        {pedagogy.hourlyExpectedChakra !== undefined && (
          <> · <span>⚡ <strong>Rendement :</strong> ~{pedagogy.hourlyExpectedChakra} ◆/h</span></>
        )}
      </div>
    </div>
  );
};
