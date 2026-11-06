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
