const WORKER_TAB_STORAGE_KEY = 'kmGameWorkerTabId';
const GAMES_HUB_URL = 'https://kyara.games/jouer';
const TAB_LOAD_TIMEOUT_MS = 8000;
const TAB_POLL_MS = 400;

let cachedWorkerTabId: number | null = null;
let pendingEnsure: Promise<number | null> | null = null;

function isKyaraUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'kyara.games' || host.endsWith('.kyara.games');
  } catch {
    return false;
  }
}

async function readStoredWorkerTabId(): Promise<number | null> {
  if (cachedWorkerTabId !== null) return cachedWorkerTabId;
  try {
    const session = (chrome.storage as any)?.session;
    if (!session?.get) return null;
    const stored = await session.get(WORKER_TAB_STORAGE_KEY);
    const id = Number(stored?.[WORKER_TAB_STORAGE_KEY]);
    if (Number.isInteger(id) && id > 0) {
      cachedWorkerTabId = id;
      return id;
    }
  } catch {
    // Session storage unavailable in this context.
  }
  return null;
}

async function persistWorkerTabId(tabId: number | null): Promise<void> {
  cachedWorkerTabId = tabId;
  try {
    const session = (chrome.storage as any)?.session;
    if (!session) return;
    if (tabId === null) {
      await session.remove?.(WORKER_TAB_STORAGE_KEY);
    } else {
      await session.set?.({ [WORKER_TAB_STORAGE_KEY]: tabId });
    }
  } catch {
    // Ignore session persistence errors.
  }
}

export async function getGameWorkerTabId(): Promise<number | null> {
  const id = await readStoredWorkerTabId();
  if (id === null) return null;
  try {
    const tab = await chrome.tabs.get(id);
    if (tab && tab.id !== undefined && isKyaraUrl(tab.url || tab.pendingUrl)) {
      cachedWorkerTabId = tab.id;
      return tab.id;
    }
  } catch {
    // Tab no longer exists.
  }
  await persistWorkerTabId(null);
  return null;
}

async function waitForTabComplete(tabId: number, timeoutMs = TAB_LOAD_TIMEOUT_MS): Promise<boolean> {
  try {
    const current = await chrome.tabs.get(tabId);
    if (current?.status === 'complete') return true;
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      chrome.tabs.onUpdated?.removeListener(onUpdated);
      chrome.tabs.onRemoved?.removeListener(onRemoved);
      resolve(ok);
    };

    const onUpdated = (updatedId: number, changeInfo: { status?: string }) => {
      if (updatedId === tabId && changeInfo?.status === 'complete') finish(true);
    };
    const onRemoved = (removedId: number) => {
      if (removedId === tabId) finish(false);
    };

    chrome.tabs.onUpdated?.addListener(onUpdated);
    chrome.tabs.onRemoved?.addListener(onRemoved);

    pollTimer = setInterval(() => {
      void chrome.tabs.get(tabId).then(
        (t) => { if (t?.status === 'complete') finish(true); },
        () => finish(false)
      );
    }, TAB_POLL_MS);

    timeoutTimer = setTimeout(() => finish(true), timeoutMs);
  });
}

export async function ensureGameWorkerTab(
  injectFn: (tabId: number) => Promise<boolean>,
  _targetGame?: string
): Promise<number | null> {
  if (pendingEnsure) return pendingEnsure;
  const run = (async () => {
    const existingId = await getGameWorkerTabId();
    if (existingId !== null) {
      const injected = await injectFn(existingId);
      return injected ? existingId : null;
    }

    const created = await chrome.tabs.create({
      url: GAMES_HUB_URL,
      active: false,
      pinned: true
    });
    if (created?.id === undefined) return null;

    const tabId = created.id;
    await persistWorkerTabId(tabId);

    if (created.status !== 'complete') {
      const ready = await waitForTabComplete(tabId);
      if (!ready) {
        await persistWorkerTabId(null);
        return null;
      }
    }

    const injected = await injectFn(tabId);
    return injected ? tabId : null;
  })().finally(() => {
    pendingEnsure = null;
  });

  pendingEnsure = run;
  return run;
}

export async function closeGameWorkerTab(): Promise<boolean> {
  const tabId = await getGameWorkerTabId();
  if (tabId === null) return false;
  await persistWorkerTabId(null);
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab may already be closed.
  }
  return true;
}

export async function handleRemovedTab(tabId: number): Promise<void> {
  if (cachedWorkerTabId !== null) {
    if (tabId === cachedWorkerTabId) {
      await persistWorkerTabId(null);
    }
    return;
  }
  const storedId = await readStoredWorkerTabId();
  if (storedId === tabId) {
    await persistWorkerTabId(null);
  }
}
