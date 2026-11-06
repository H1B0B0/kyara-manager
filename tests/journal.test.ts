import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';
vi.mock('../src/content/cache', () => ({ runtimeCache: {} }));

describe('durable operation records', () => {
  beforeEach(() => { vi.resetModules(); mockLocks(); });
  it('does not lose simultaneous journal entries or metric increments', async () => {
    const { data } = mockChrome();
    const { appendJournal, recordCumulativeMetric } = await import('../src/content/journal');
    await Promise.all(Array.from({ length: 8 }, (_, index) => appendJournal('info', `entry-${index}`)));
    await Promise.all(Array.from({ length: 8 }, () => recordCumulativeMetric({ cardsRecycled: 1 })));
    expect(data.kmJournal).toHaveLength(8);
    expect(data.kmCumulativeStats.cardsRecycled).toBe(8);
  });
  it('counts the same confirmed sale once across two refreshes', async () => {
    const { data } = mockChrome();
    const { recordConfirmedSale } = await import('../src/content/journal');
    const results = await Promise.all([recordConfirmedSale('sale-1', { name: 'A', price: 100 }), recordConfirmedSale('sale-1', { name: 'A', price: 100 })]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(data.kmCumulativeStats).toMatchObject({ cardsSold: 1, chakraFromSales: 93 });
  });
});
