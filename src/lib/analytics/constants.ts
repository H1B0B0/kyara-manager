import type { Rarity } from '../../types/kyara';

export const RARITIES: Rarity[] = ['C', 'U', 'R', 'E', 'L', 'M'];

export const RARITY_LABELS: Record<Rarity, string> = {
  C: 'Commune',
  U: 'Peu commune',
  R: 'Rare',
  E: 'Épique',
  L: 'Légendaire',
  M: 'Mythique'
};

export const DEFAULT_RECYCLE_VALUES: Record<Rarity, number> = {
  C: 1,
  U: 1,
  R: 3,
  E: 10,
  L: 40,
  M: 150
};

export const RARITY_PRICE_FLOORS: Record<Rarity, number> = {
  C: 3,
  U: 3,
  R: 3,
  E: 15,
  L: 100,
  M: 815
};

export const MARKET_FEES = {
  saleTaxPct: 5,
  listingFeePct: 2,
  listingFeeMin: 1
};
