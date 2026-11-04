const ALARM_NAME = "kyara-manager-tick";
const KYARA_URL_PATTERNS = ["https://kyara.games/*", "https://*.kyara.games/*"];

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.warn("[Kyara Manager] setPanelBehavior warning:", err);
});

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
}

async function updateBadgeFromState() {
  try {
    const { settings } = await chrome.storage.local.get("settings");
    const isRunning = Boolean(settings?.masterEnabled);
    await chrome.action.setBadgeText({ text: isRunning ? "ON" : "" });
    if (isRunning) {
      await chrome.action.setBadgeBackgroundColor({ color: "#ff4d2e" });
    }
  } catch (err) {
    console.warn("[Kyara Manager] Badge update failed:", err);
  }
}

async function injectContentScriptIfNeeded(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/content.css"]
    }).catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/analytics.js", "content/content.js"]
    });
    return true;
  } catch (err) {
    console.warn("[Kyara Manager] Auto-inject failed on tab", tabId, err);
    return false;
  }
}

async function findKyaraTabs() {
  const tabs = await chrome.tabs.query({ url: KYARA_URL_PATTERNS });
  return [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
}

async function sendToKyaraTab(payload, { focusTab = false } = {}) {
  const tabs = await findKyaraTabs();
  if (!tabs.length) {
    return {
      ok: false,
      error: "Aucun onglet kyara.games ouvert. Clique sur « Ouvrir kyara.games »."
    };
  }

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (focusTab && !tab.active) {
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, payload);
      if (response) return response;
    } catch {
      // Tab was opened before extension loaded/reloaded — auto-inject content scripts now!
      const injected = await injectContentScriptIfNeeded(tab.id);
      if (injected) {
        await new Promise((r) => setTimeout(r, 180));
        try {
          const retryResponse = await chrome.tabs.sendMessage(tab.id, payload);
          if (retryResponse) return retryResponse;
        } catch {
          // Continue to next tab if any
        }
      }
    }
  }

  return {
    ok: false,
    error: "Impossible de joindre l'onglet kyara.games. Vérifie que la page a fini de charger."
  };
}

async function showDesktopNotification(title, message, idPrefix = "km-notif") {
  try {
    const { settings } = await chrome.storage.local.get("settings");
    if (settings && settings.notificationsEnabled === false) return;
    await chrome.notifications.create(`${idPrefix}-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title,
      message
    });
  } catch (err) {
    console.warn("[Kyara Manager] Notification error:", err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await updateBadgeFromState();
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings?.masterEnabled) return;
  await sendToKyaraTab({ type: "km:alarm-tick" });
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes.settings) {
    await updateBadgeFromState();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || typeof message.type !== "string") {
        sendResponse({ ok: false, error: "Message invalide" });
        return;
      }

      if (message.type === "km:open-sidepanel") {
        const windowId = sender?.tab?.windowId;
        if (windowId !== undefined) {
          await chrome.sidePanel.open({ windowId });
          sendResponse({ ok: true });
          return;
        }
        const focused = await chrome.windows.getLastFocused();
        if (focused?.id !== undefined) {
          await chrome.sidePanel.open({ windowId: focused.id });
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "km:notify") {
        await showDesktopNotification(
          message.title || "Kyara Manager",
          message.message || "",
          message.idPrefix || "km"
        );
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "km:open-kyara-tab") {
        const tabs = await findKyaraTabs();
        if (tabs.length && tabs[0].id !== undefined) {
          await chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          await chrome.tabs.create({ url: "https://kyara.games" });
        }
        sendResponse({ ok: true });
        return;
      }

      if (message.type.startsWith("km:cmd:")) {
        const shouldFocus =
          message.type === "km:cmd:open-pack" || message.type === "km:cmd:open-recommended";
        const res = await sendToKyaraTab(message, { focusTab: shouldFocus });
        sendResponse(res);
        return;
      }

      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});
