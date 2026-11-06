export interface JournalItem {
  ts: number;
  type: 'info' | 'success' | 'warn' | 'error';
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
