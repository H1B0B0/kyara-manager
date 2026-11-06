import { useState, useEffect, useCallback } from 'react';
import type { JournalItem, CumulativeStats } from '../../types/journal';
import { sendCommand } from './useDashboard';

export function useJournal() {
  const [journal, setJournal] = useState<JournalItem[]>([]);

  useEffect(() => {
    chrome.storage.local.get('kmJournal').then((stored) => {
      if (Array.isArray(stored.kmJournal)) {
        setJournal(stored.kmJournal);
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.kmJournal?.newValue) return;
      setJournal(Array.isArray(changes.kmJournal.newValue) ? changes.kmJournal.newValue : []);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearJournal = useCallback(async () => {
    setJournal([]);
    await chrome.storage.local.set({ kmJournal: [] });
  }, []);

  return { journal, clearJournal };
}

export const DEFAULT_CUMULATIVE_STATS: CumulativeStats = {
  chakraFromSales: 0,
  chakraFromRecycle: 0,
  cardsSold: 0,
  cardsRecycled: 0,
  boostersOpenedCount: 0,
  newCardsPulledCount: 0,
  mythicsPulledCount: 0,
  legendariesPulledCount: 0,
  startedAt: Date.now()
};

export function useCumulativeStats() {
  const [stats, setStats] = useState<CumulativeStats>(DEFAULT_CUMULATIVE_STATS);

  useEffect(() => {
    chrome.storage.local.get('kmCumulativeStats').then((stored: any) => {
      if (stored.kmCumulativeStats) {
        setStats({ ...DEFAULT_CUMULATIVE_STATS, ...(stored.kmCumulativeStats as CumulativeStats) });
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.kmCumulativeStats?.newValue) return;
      setStats({ ...DEFAULT_CUMULATIVE_STATS, ...(changes.kmCumulativeStats.newValue as CumulativeStats) });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const resetRoi = useCallback(async () => {
    await sendCommand({ type: 'km:cmd:reset-roi' });
    setStats({ ...DEFAULT_CUMULATIVE_STATS, startedAt: Date.now() });
  }, []);

  return { stats, resetRoi };
}
