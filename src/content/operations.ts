import { state, loadSettings } from './state';

const BUSY = "Une action est déjà en cours dans un onglet Kyara. Réessaie après sa fin.";

/** The origin-wide lock covers the whole read/check/write operation, across tabs. */
export async function runExclusive<T>(action: () => Promise<T>): Promise<T> {
  if (state.updatePending) throw new Error('Mise à jour en cours. Les nouvelles actions sont suspendues.');
  return navigator.locks.request('kyara-manager-actions', { ifAvailable: true }, async (lock) => {
    if (!lock || state.isOperationRunning) throw new Error(BUSY);
    if (state.updatePending || !chrome.runtime?.id) throw new Error('Extension en cours de mise à jour.');
    state.isOperationRunning = true;
    try {
      await loadSettings();
      return await action();
    } finally {
      state.isOperationRunning = false;
    }
  });
}

export type TaskDomain = 'market-buy' | 'inventory' | 'boosters' | 'games' | 'general';

let activeDomainTasks = 0;

/**
 * Runs a user-triggered command in a domain-specific queue so independent domains
 * (market buying, duplicate selling/recycling, booster opening, background cycles)
 * run in parallel, and same-domain clicks queue smoothly instead of throwing BUSY.
 */
export async function runDomainTask<T>(domain: TaskDomain, action: () => Promise<T>): Promise<T> {
  if (state.updatePending) throw new Error('Mise à jour en cours. Les nouvelles actions sont suspendues.');
  return navigator.locks.request(`kyara-manager-domain-${domain}`, async () => {
    if (state.updatePending || !chrome.runtime?.id) throw new Error('Extension en cours de mise à jour.');
    activeDomainTasks += 1;
    state.isOperationRunning = true;
    try {
      await loadSettings();
      return await action();
    } finally {
      activeDomainTasks = Math.max(0, activeDomainTasks - 1);
      state.isOperationRunning = activeDomainTasks > 0;
    }
  });
}
