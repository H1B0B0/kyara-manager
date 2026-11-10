export type JournalType = 'info' | 'success' | 'warn' | 'error' | 'sell' | 'recycle' | 'booster' | 'market' | 'mission' | 'afk';

export interface JournalItem {
  ts: number;
  type: JournalType;
  message: string;
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
