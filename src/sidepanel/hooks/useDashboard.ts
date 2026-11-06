import { useState, useEffect, useCallback } from 'react';
import type { DashboardState } from '../../types/kyara';
import type { ExtensionCommand, CommandResponse } from '../../types/messages';

export function sendCommand(cmd: ExtensionCommand): Promise<CommandResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(cmd, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: 'Réponse vide' });
      }
    });
  });
}

export function useDashboard() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [pinnedCards, setPinnedCards] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (forcePrices = false, scanMarketDeals = false) => {
    setLoading(true);
    const res = await sendCommand({ type: 'km:cmd:refresh', forcePrices, scanMarketDeals });
    setLoading(false);
    if (res?.dashboard) {
      setDashboard(res.dashboard);
    }
    return res;
  }, []);

  const scanDeals = useCallback(async () => {
    setLoading(true);
    const res = await sendCommand({ type: 'km:cmd:scan-deals' });
    setLoading(false);
    if (res?.dashboard) {
      setDashboard(res.dashboard);
    }
    return res;
  }, []);

  useEffect(() => {
    chrome.storage.local.get(['kmDashboard', 'kmPinnedCards']).then((stored: any) => {
      if (stored.kmDashboard) {
        setDashboard(stored.kmDashboard as DashboardState);
      }
      if (Array.isArray(stored.kmPinnedCards)) {
        setPinnedCards(new Set(stored.kmPinnedCards.map(Number)));
      }
    });

    // Auto-sync with kyara.games on mount
    void refresh(false);

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.kmDashboard?.newValue) {
        setDashboard(changes.kmDashboard.newValue as DashboardState);
      }
      if (changes.kmPinnedCards?.newValue) {
        setPinnedCards(new Set(((changes.kmPinnedCards.newValue as number[]) || []).map(Number)));
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const togglePin = useCallback(async (characterId: number) => {
    const res = await sendCommand({ type: 'km:cmd:toggle-pin', characterId });
    if (res?.ok) {
      setPinnedCards((prev) => {
        const next = new Set(prev);
        if (res.isPinned) next.add(characterId);
        else next.delete(characterId);
        return next;
      });
      if (res.dashboard) {
        setDashboard(res.dashboard);
      }
    }
    return res;
  }, []);

  return {
    dashboard,
    pinnedCards,
    loading,
    refresh,
    scanDeals,
    togglePin,
    sendCommand
  };
}
