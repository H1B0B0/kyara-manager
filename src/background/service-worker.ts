import { mergeSettings, type KyaraSettings } from '../types/settings';
import type { DashboardState } from '../types/kyara';
import type { UpdateState } from '../types/updates';
import {
  checkForUpdate,
  updateAvailable,
  applyPendingUpdate,
  pollForUpdateSilently,
  dismissUpdateNotification,
  isCwsManaged,
  getCwsStoreUrl
} from './updates';
import {
  getGameWorkerTabId,
  ensureGameWorkerTab,
  closeGameWorkerTab,
  handleRemovedTab
} from './games-tab';

const ALARM_NAME = 'kyara-manager-tick';
const KYARA_URL_PATTERNS = ['https://kyara.games/*', 'https://*.kyara.games/*'];
const WORKER_GAMES_COOLDOWN_MS = 3 * 60 * 1000;

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch((err) => {
  console.warn('[Kyara Manager] setPanelBehavior warning:', err);
});

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
}

async function updateBadgeFromState(): Promise<void> {
  try {
    const { settings } = (await chrome.storage.local.get('settings')) as { settings?: KyaraSettings };
    const isRunning = Boolean(settings?.masterEnabled);
    await chrome.action.setBadgeText({ text: isRunning ? 'ON' : '' });
    if (isRunning) {
      await chrome.action.setBadgeBackgroundColor({ color: '#ff4d2e' });
    }
  } catch (err) {
    console.warn('[Kyara Manager] Badge update failed:', err);
  }
}

const injections = new Map<number, Promise<boolean>>();
async function injectContentScriptIfNeeded(tabId: number): Promise<boolean> {
  if (injections.has(tabId)) return injections.get(tabId)!;
  const injection = (async () => {
    try {
      const version = chrome.runtime.getManifest().version;
      const pong = await chrome.tabs.sendMessage(tabId, { type: 'km:ping' }).catch(() => null);
      if (pong?.version === version) return true;
      const [legacy] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => Boolean((globalThis as any).__kyaraManagerInjected) && !(globalThis as any).__kyaraManagerRuntime
      });
      if (legacy?.result) {
        // Versions <=1.4.1 cannot dispose their old timers and listeners.
        await chrome.tabs.reload(tabId);
        return false;
      }
      for (const script of chrome.runtime.getManifest().content_scripts || []) {
        if (script.css?.length) await chrome.scripting.insertCSS({ target: { tabId }, files: script.css });
        if (script.js?.length) await chrome.scripting.executeScript({
          target: { tabId }, files: script.js, world: (script as typeof script & { world?: chrome.scripting.ExecutionWorld }).world || 'ISOLATED'
        });
      }
      return true;
    } catch (err) {
      console.warn('[Kyara Manager] Auto-inject failed on tab', tabId, err);
      return false;
    }
  })().finally(() => injections.delete(tabId));
  injections.set(tabId, injection);
  return injection;
}

function isGamesTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) return false;
  try {
    const pathname = new URL(tab.url).pathname;
    return pathname === '/jouer' || pathname.startsWith('/jouer/');
  } catch {
    return /\/jouer(?:\/|$|\?|#)/.test(tab.url);
  }
}

export async function findKyaraTabs(
  { preferNonGame = false, excludeGameWorker = true }: { preferNonGame?: boolean; excludeGameWorker?: boolean } = {}
): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ url: KYARA_URL_PATTERNS });
  let list = [...tabs];
  if (excludeGameWorker && list.length > 1) {
    const workerTabId = await getGameWorkerTabId();
    if (workerTabId !== null) {
      const nonWorker = list.filter((t) => t.id !== workerTabId);
      if (nonWorker.length > 0) list = nonWorker;
    }
  }
  return list.sort((a, b) => {
    if (preferNonGame) {
      const gameDiff = Number(isGamesTab(a)) - Number(isGamesTab(b));
      if (gameDiff !== 0) return gameDiff;
    }
    return Number(Boolean(b.active)) - Number(Boolean(a.active));
  });
}

async function sendToGameWorkerTab(payload: any, targetGame?: string): Promise<any> {
  const workerTabId = await ensureGameWorkerTab(injectContentScriptIfNeeded, targetGame);
  if (workerTabId === null) {
    return { ok: false, error: "Impossible d'ouvrir l'onglet dédié Salle de Jeux." };
  }
  try {
    return (await chrome.tabs.sendMessage(workerTabId, payload)) || { ok: false, error: 'Réponse vide de la Salle de Jeux.' };
  } catch {
    return { ok: false, error: 'Connexion interrompue avec l’onglet dédié Salle de Jeux.' };
  }
}

async function sendToKyaraTab(
  payload: any,
  { focusTab = false, preferNonGame = false }: { focusTab?: boolean; preferNonGame?: boolean } = {}
): Promise<any> {
  const tabs = await findKyaraTabs({ preferNonGame });
  if (!tabs.length) {
    return {
      ok: false,
      error: 'Aucun onglet kyara.games ouvert. Clique sur « Ouvrir kyara.games ».'
    };
  }

  const tab = tabs.find((item) => item.id !== undefined);
  if (!tab) return { ok: false, error: 'Aucun onglet Kyara disponible.' };
  if (focusTab && !tab.active) await chrome.tabs.update(tab.id!, { active: true });
  if (!await injectContentScriptIfNeeded(tab.id!)) {
    return { ok: false, error: "L'onglet Kyara est en cours de rechargement. Réessaie une fois la page prête." };
  }
  try {
    // Deliver once. A lost response may follow a successful purchase or recycle.
    return await chrome.tabs.sendMessage(tab.id!, payload) || { ok: false, error: 'Réponse vide de Kyara.' };
  } catch {
    return { ok: false, error: 'Connexion interrompue. Vérifie le résultat dans Kyara avant de relancer cette action.' };
  }
}

async function showDesktopNotification(title: string, message: string, idPrefix = 'km-notif'): Promise<void> {
  try {
    const { settings } = (await chrome.storage.local.get('settings')) as { settings?: KyaraSettings };
    if (settings && settings.notificationsEnabled === false) return;
    await chrome.notifications.create(`${idPrefix}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message
    });
  } catch (err) {
    console.warn('[Kyara Manager] Notification error:', err);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const cwsInstall = isCwsManaged();
  const cwsUrl = getCwsStoreUrl();
  await chrome.storage.local.set({
    kmUpdate: {
      status: details.reason === 'update' ? 'updated' : 'idle',
      currentVersion: chrome.runtime.getManifest().version,
      cwsInstall,
      cwsUrl,
      ...(details.reason === 'update' ? { source: 'cws' as const } : {})
    } satisfies UpdateState
  });
  await ensureAlarm();
  await updateBadgeFromState();
  const tabs = await findKyaraTabs({ excludeGameWorker: false });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await injectContentScriptIfNeeded(tab.id);
    }
  }
});

chrome.tabs.onRemoved?.addListener((tabId) => {
  void handleRemovedTab(tabId);
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await updateBadgeFromState();
  void pollForUpdateSilently().catch(() => {});
});

chrome.runtime.onUpdateAvailable.addListener((details) => {
  void updateAvailable(details.version).catch(console.warn);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await updateBadgeFromState();
  await applyPendingUpdate();
  void pollForUpdateSilently().catch(() => {});
  const stored = (await chrome.storage.local.get(['settings', 'kmDashboard', 'kmLastWorkerGamesAt'])) as {
    settings?: KyaraSettings;
    kmDashboard?: DashboardState;
    kmLastWorkerGamesAt?: number;
  };
  const settings = stored.settings;
  if (!settings?.masterEnabled) return;

  const tasks: Array<Promise<any>> = [
    sendToKyaraTab({ type: 'km:alarm-tick' }, { preferNonGame: true })
  ];

  const arcade = stored.kmDashboard?.arcade;
  const canFarmDedicated =
    Boolean(settings.autoGamesEnabled) &&
    settings.autoGamesDedicatedTab !== false &&
    Boolean(arcade?.enabled) &&
    !arcade?.blocked &&
    (arcade?.today ?? 0) < (arcade?.dayCap ?? 60) &&
    (arcade?.week ?? 0) < (arcade?.weekCap ?? 300) &&
    Date.now() - (Number(stored.kmLastWorkerGamesAt) || 0) >= WORKER_GAMES_COOLDOWN_MS;

  if (canFarmDedicated) {
    await chrome.storage.local.set({ kmLastWorkerGamesAt: Date.now() });
    tasks.push(
      sendToGameWorkerTab(
        {
          type: 'km:cmd:run-games-farm',
          gameId: settings.autoGamesTargetGame || 'all',
          manual: false,
          dedicatedTab: true
        },
        settings.autoGamesTargetGame
      )
    );
  }

  await Promise.allSettled(tasks);
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    await updateBadgeFromState();
  }
});

let settingsQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (res: any) => void) => {
  (async () => {
    try {
      if (!message || typeof message.type !== 'string') {
        sendResponse({ ok: false, error: 'Message invalide' });
        return;
      }

      if (message.type === 'km:update-check') {
        await checkForUpdate({
          includeRemote: Boolean(message.includeRemote),
          bypassThrottle: Boolean(message.bypassThrottle)
        });
        const { kmUpdate } = (await chrome.storage.local.get('kmUpdate')) as { kmUpdate?: UpdateState };
        sendResponse({ ok: true, kmUpdate });
        return;
      }
      if (message.type === 'km:update-apply') {
        await applyPendingUpdate();
        const { kmUpdate } = (await chrome.storage.local.get('kmUpdate')) as { kmUpdate?: any };
        sendResponse({ ok: true, kmUpdate });
        return;
      }
      if (message.type === 'km:update-dismiss') {
        await dismissUpdateNotification();
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'km:save-settings') {
        const turn = settingsQueue.then(async () => {
          const stored = await chrome.storage.local.get('settings');
          await chrome.storage.local.set({ settings: mergeSettings(stored.settings, message.settings || {}) });
        });
        settingsQueue = turn.catch(() => {});
        await turn;
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'km:open-sidepanel') {
        const windowId = sender?.tab?.windowId;
        if (windowId !== undefined) {
          await (chrome.sidePanel as any).open({ windowId });
          sendResponse({ ok: true });
          return;
        }
        const focused = await chrome.windows.getLastFocused();
        if (focused?.id !== undefined) {
          await (chrome.sidePanel as any).open({ windowId: focused.id });
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'km:notify') {
        await showDesktopNotification(
          message.title || 'Kyara Manager',
          message.message || '',
          message.idPrefix || 'km'
        );
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'km:open-kyara-tab') {
        const tabs = await findKyaraTabs();
        if (tabs.length && tabs[0].id !== undefined) {
          await chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          await chrome.tabs.create({ url: 'https://kyara.games' });
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'km:cmd:close-games-tab') {
        const closed = await closeGameWorkerTab();
        sendResponse({ ok: true, closed });
        return;
      }

      if (message.type === 'km:cmd:focus-games-tab') {
        const workerId = await getGameWorkerTabId();
        if (workerId !== null) {
          await chrome.tabs.update(workerId, { active: true });
        } else {
          await chrome.tabs.create({ url: 'https://kyara.games/jouer', active: true });
        }
        sendResponse({ ok: true, tabId: workerId });
        return;
      }

      if (message.type === 'km:cmd:run-games-farm') {
        const { settings } = (await chrome.storage.local.get('settings')) as { settings?: KyaraSettings };
        if (settings?.autoGamesDedicatedTab !== false) {
          const res = await sendToGameWorkerTab(
            { ...message, manual: message.manual !== false, dedicatedTab: true },
            message.gameId
          );
          sendResponse(res);
          return;
        }
        const res = await sendToKyaraTab(message, { focusTab: false });
        sendResponse(res);
        return;
      }

      if (message.type.startsWith('km:cmd:')) {
        const shouldFocus =
          message.type === 'km:cmd:open-pack' || message.type === 'km:cmd:open-recommended';
        const res = await sendToKyaraTab(message, { focusTab: shouldFocus });
        sendResponse(res);
        return;
      }

      sendResponse({ ok: true });
    } catch (err: any) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});
