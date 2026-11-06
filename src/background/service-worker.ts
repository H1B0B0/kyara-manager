import { mergeSettings, type KyaraSettings } from '../types/settings';
import { checkForUpdate, updateAvailable, applyPendingUpdate } from './updates';

const ALARM_NAME = 'kyara-manager-tick';
const KYARA_URL_PATTERNS = ['https://kyara.games/*', 'https://*.kyara.games/*'];

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

async function findKyaraTabs(): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ url: KYARA_URL_PATTERNS });
  return [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
}

async function sendToKyaraTab(payload: any, { focusTab = false }: { focusTab?: boolean } = {}): Promise<any> {
  const tabs = await findKyaraTabs();
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
  await chrome.storage.local.set({ kmUpdate: {
    status: details.reason === 'update' ? 'updated' : 'idle',
    currentVersion: chrome.runtime.getManifest().version
  } });
  await ensureAlarm();
  await updateBadgeFromState();
  const tabs = await findKyaraTabs();
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await injectContentScriptIfNeeded(tab.id);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await updateBadgeFromState();
});

chrome.runtime.onUpdateAvailable.addListener((details) => {
  void updateAvailable(details.version).catch(console.warn);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await updateBadgeFromState();
  await applyPendingUpdate();
  const { settings } = (await chrome.storage.local.get('settings')) as { settings?: KyaraSettings };
  if (!settings?.masterEnabled) return;
  await sendToKyaraTab({ type: 'km:alarm-tick' });
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
        await checkForUpdate();
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
