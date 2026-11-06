import { Rarity } from '../types/kyara';

export interface SiteAuth {
  token: string | null;
  deviceId: string;
  pass: string | null;
}

export interface KyaraApiOptions {
  method?: string;
  body?: any;
  withPass?: boolean;
  extraHeaders?: Record<string, string>;
  auth?: boolean;
}

export interface CatalogItem {
  id: number;
  name: string;
  series: string;
  rarity: Rarity;
  rank?: number;
}

export interface PriceInfo {
  median7d: number | null;
  median30d: number | null;
  sales7d: number | null;
  sales30d: number | null;
  at: number;
}

export interface RuntimeCache {
  catalogById: Map<number, CatalogItem> | null;
  catalogAt: number;
  packPools: Record<string, number[]>;
  packPoolsAt: number;
  collectionPrices: Map<number, PriceInfo>;
  rarityAvgPrices: Record<string, number>;
  recycleMap: Record<string, number>;
}

export interface CumulativeStats {
  chakraFromSales: number;
  chakraFromRecycle: number;
  cardsSold: number;
  cardsRecycled: number;
  boostersOpenedCount: number;
  newCardsPulledCount: number;
  mythicsPulledCount: number;
  legendariesPulledCount: number;
  startedAt: number;
}

export interface ActiveListingInfo {
  characterId: number;
  name: string;
  price: number;
  endsAt: string | null;
  createdAt: string | null;
}

export interface PullEventDetail {
  at: number;
  detail: any;
}
