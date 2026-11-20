import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashboardState } from '../../types/kyara';
import type { ExtensionCommand, CommandResponse } from '../../types/messages';

const pendingCommandKeys = new Set<string>();

const READ_ONLY_COMMANDS = new Set([
  'km:cmd:refresh',
  'km:cmd:scan-deals',
  'km:cmd:preview-batch-buy',
  'km:cmd:scan-buy-orders'
]);

function getCommandLockKey(cmd: ExtensionCommand): string {
  const c = cmd as any;
  const target = c.listingId ?? c.characterId ?? c.packId ?? c.rarity ?? '';
  return `${cmd.type}:${target}`;
}

export function sendCommand(cmd: ExtensionCommand): Promise<CommandResponse> {
  const mutation = cmd.type.startsWith('km:cmd:') && !READ_ONLY_COMMANDS.has(cmd.type);
  const lockKey = getCommandLockKey(cmd);
  if (mutation && pendingCommandKeys.has(lockKey)) {
    return Promise.resolve({ ok: false, error: 'Cette action est déjà en cours. Patiente jusqu’à sa confirmation.' });
  }
  if (mutation) pendingCommandKeys.add(lockKey);
  return new Promise<CommandResponse>((resolve) => {
    try { chrome.runtime.sendMessage(cmd, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: 'Réponse vide' });
      }
    }); } catch (err: any) { resolve({ ok: false, error: String(err?.message || err) }); }
  }).finally(() => { if (mutation) pendingCommandKeys.delete(lockKey); });
}

export function useDashboard() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [pinnedCards, setPinnedCards] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(0);

  const refresh = useCallback(async (forcePrices = false, scanMarketDeals = false) => {
    setLoading(true);
    pending.current += 1;
    const res = await sendCommand({ type: 'km:cmd:refresh', forcePrices, scanMarketDeals });
    setLoading(--pending.current > 0);
    setError(res.ok ? null : res.error || 'Synchronisation impossible');
    if (res?.dashboard) {
      setDashboard(res.dashboard);
    }
    return res;
  }, []);

  const scanDeals = useCallback(async () => {
    setLoading(true);
    pending.current += 1;
    const res = await sendCommand({ type: 'km:cmd:scan-deals' });
    setLoading(--pending.current > 0);
    setError(res.ok ? null : res.error || 'Scan impossible');
    if (res?.dashboard) {
      setDashboard(res.dashboard);
    }
    return res;
  }, []);

  useEffect(() => {
    let dashboardChanged = false;
    let pinsChanged = false;
    let active = true;
    chrome.storage.local.get(['kmDashboard', 'kmPinnedCards']).then((stored: any) => {
      if (!active) return;
      if (!dashboardChanged && stored.kmDashboard) {
        setDashboard(stored.kmDashboard as DashboardState);
      }
      if (!pinsChanged && Array.isArray(stored.kmPinnedCards)) {
        setPinnedCards(new Set(stored.kmPinnedCards.map(Number)));
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.kmDashboard?.newValue) {
        dashboardChanged = true;
        setDashboard(changes.kmDashboard.newValue as DashboardState);
      }
      if (changes.kmPinnedCards?.newValue) {
        pinsChanged = true;
        setPinnedCards(new Set(((changes.kmPinnedCards.newValue as number[]) || []).map(Number)));
      }
    };

    chrome.storage.onChanged.addListener(listener);
    void refresh(false);
    return () => { active = false; chrome.storage.onChanged.removeListener(listener); };
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
    error,
    refresh,
    scanDeals,
    togglePin,
    sendCommand
  };
}
