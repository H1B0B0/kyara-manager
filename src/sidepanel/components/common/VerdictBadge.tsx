import React from 'react';
import { t } from '../../../lib/i18n';

export interface VerdictBadgeProps {
  verdict: 'VENDRE' | 'RECYCLER' | 'CONSERVER' | 'PROTÉGÉ';
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict }) => {
  const badgeClass =
    verdict === 'PROTÉGÉ'
      ? 'verdict-badge--pinned'
      : verdict === 'CONSERVER'
        ? 'verdict-badge--hold'
        : verdict === 'VENDRE'
          ? 'verdict-badge--sell'
          : 'verdict-badge--recycle';

  const label = t(`verdict.${verdict}`) || verdict;

  return (
    <span className={`verdict-badge ${badgeClass}`}>
      {label}
    </span>
  );
};
