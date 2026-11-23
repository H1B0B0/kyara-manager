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
export type SpaPilotOwner = 'games' | 'boosters';

let activeDomainTasks = 0;
let localSpaQueue: Promise<void> = Promise.resolve();

function resolveCurrentPathname(pathname?: string): string {
  if (typeof pathname === 'string') return pathname;
  if (typeof location !== 'undefined' && typeof location?.pathname === 'string') return location.pathname;
  if (typeof window !== 'undefined' && typeof window?.location?.pathname === 'string') return window.location.pathname;
  return '';
}

/** Returns true when the tab is inside an active mini-game route (`/jouer/<slug>`, excluding lobby & `/jouer/comptoir`). */
export function isMiniGameRoute(pathname?: string): boolean {
  const clean = resolveCurrentPathname(pathname).split(/[?#]/)[0].replace(/\/+$/, '');
  return /^\/jouer\/(?!comptoir(?:\/|$)).+/.test(clean);
}

/** Returns true when the games automation owns the tab or the tab is anywhere under `/jouer`. */
export function isOnGamesArea(pathname?: string): boolean {
  if (state.isGamesRunning) return true;
  const clean = resolveCurrentPathname(pathname).split(/[?#]/)[0].replace(/\/+$/, '');
  return clean === '/jouer' || clean.startsWith('/jouer/');
}

/**
 * Serializes SPA/DOM driving between `'games'` and `'boosters'` per tab via `localSpaQueue`
 * so they remain strictly exclusive within the same tab without blocking other Kyara tabs
 * (e.g. the dedicated background games tab and the main user tab run truly in parallel).
 */
export async function runSpaPilotTask<T>(owner: SpaPilotOwner, task: () => Promise<T>): Promise<T> {
  if (state.updatePending || state.disposed) {
    throw new Error('Mise à jour en cours. Les nouvelles actions sont suspendues.');
  }
  const runGuarded = async (): Promise<T> => {
    if (state.updatePending || state.disposed || (typeof chrome !== 'undefined' && !chrome.runtime?.id)) {
      throw new Error('Extension en cours de mise à jour.');
    }
    const previousOwner = state.spaPilotOwner;
    const previousGamesRunning = state.isGamesRunning;
    state.spaPilotOwner = owner;
    if (owner === 'games') state.isGamesRunning = true;
    try {
      return await task();
    } finally {
      if (owner === 'games') state.isGamesRunning = previousGamesRunning;
      state.spaPilotOwner = previousOwner;
    }
  };

  const prev = localSpaQueue;
  let release!: () => void;
  localSpaQueue = new Promise<void>((resolve) => { release = resolve; });
  await prev;
  try {
    return await runGuarded();
  } finally {
    release();
  }
}

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
