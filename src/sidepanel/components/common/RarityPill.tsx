import React from 'react';
import type { Rarity } from '../../../types/kyara';

export interface RarityPillProps {
  rarity?: Rarity | string;
}

export const RarityPill: React.FC<RarityPillProps> = ({ rarity = 'C' }) => {
  return (
    <span className={`rarity-pill rarity-pill--${rarity}`}>
      {rarity}
    </span>
  );
};
