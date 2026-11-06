import type { UpdateState } from '../types/updates';

let applying: Promise<void> | null = null;
let checking: Promise<void> | null = null;

async function readUpdate(): Promise<{ kmUpdate?: UpdateState }> {
  return await chrome.storage.local.get('kmUpdate') as { kmUpdate?: UpdateState };
}

async function storeUpdate(patch: Partial<UpdateState>): Promise<void> {
  const { kmUpdate } = await readUpdate();
  await chrome.storage.local.set({ kmUpdate: { ...kmUpdate, currentVersion: chrome.runtime.getManifest().version, ...patch } });
}

export function applyPendingUpdate(): Promise<void> {
  if (applying) return applying;
  applying = (async () => {
    const { kmUpdate } = await readUpdate();
    if (!kmUpdate?.availableVersion || !['available', 'waiting', 'installing'].includes(kmUpdate.status)) return;
    const tabs = await chrome.tabs.query({ url: ['https://kyara.games/*', 'https://*.kyara.games/*'] });
    const results = await Promise.all(tabs.filter((tab) => tab.id !== undefined).map(async (tab) => {
      try { return await chrome.tabs.sendMessage(tab.id!, { type: 'km:prepare-update' }); }
      catch { return null; } // A closed or uninjected tab has no extension operation to finish.
    }));
    if (results.some((result) => result?.busy)) {
      await storeUpdate({ status: 'waiting' });
      return;
    }
    await storeUpdate({ status: 'installing' });
    // Keep the progress message visible before the extension contexts are replaced.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    chrome.runtime.reload();
  })().finally(() => { applying = null; });
  return applying;
}

export async function updateAvailable(version: string): Promise<void> {
  await storeUpdate({ status: 'available', availableVersion: version, error: undefined });
  await applyPendingUpdate();
}

export function checkForUpdate(): Promise<void> {
  if (checking) return checking;
  checking = (async () => {
    const { kmUpdate } = await readUpdate();
    if (kmUpdate?.availableVersion && ['available', 'waiting', 'installing'].includes(kmUpdate.status)) {
      await applyPendingUpdate();
      return;
    }
    if (Date.now() - (kmUpdate?.checkedAt || 0) < 60000) {
      await storeUpdate({ status: 'throttled' });
      return;
    }
    await storeUpdate({ status: 'checking', checkedAt: Date.now(), error: undefined });
    try {
      const result = await chrome.runtime.requestUpdateCheck();
      if (result.status === 'update_available') await updateAvailable(result.version!);
      else {
        const latest = await readUpdate();
        if (!latest.kmUpdate?.availableVersion) await storeUpdate({ status: result.status });
      }
    } catch (err: any) {
      await storeUpdate({ status: 'error', error: String(err?.message || err) });
    }
  })().finally(() => { checking = null; });
  return checking;
}
