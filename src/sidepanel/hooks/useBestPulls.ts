import { useState, useEffect, useCallback } from 'react';
import type { AutopilotPullRecord } from '../../types/kyara';

export function useBestPulls() {
  const [bestPulls, setBestPulls] = useState<AutopilotPullRecord[]>([]);

  useEffect(() => {
    chrome.storage.local.get('kmBestPulls').then((stored) => {
      if (Array.isArray(stored.kmBestPulls)) {
        setBestPulls(stored.kmBestPulls);
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.kmBestPulls?.newValue) return;
      setBestPulls(Array.isArray(changes.kmBestPulls.newValue) ? changes.kmBestPulls.newValue : []);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearBestPulls = useCallback(async () => {
    setBestPulls([]);
    await chrome.storage.local.set({ kmBestPulls: [] });
  }, []);

  return { bestPulls, clearBestPulls };
}
