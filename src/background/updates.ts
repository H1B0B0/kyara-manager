import type { UpdateState } from '../types/updates';

const GITHUB_RELEASE_API = 'https://api.github.com/repos/H1B0B0/kyara-manager/releases/latest';
const REMOTE_POLL_INTERVAL_MS = 15 * 60 * 1000;

let applying: Promise<void> | null = null;
let checking: Promise<void> | null = null;
let remotePolling: Promise<void> | null = null;

async function readUpdate(): Promise<{ kmUpdate?: UpdateState }> {
  return await chrome.storage.local.get('kmUpdate') as { kmUpdate?: UpdateState };
}

async function storeUpdate(patch: Partial<UpdateState>): Promise<void> {
  const { kmUpdate } = await readUpdate();
  await chrome.storage.local.set({ kmUpdate: { ...kmUpdate, currentVersion: chrome.runtime.getManifest().version, ...patch } });
}

export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(current);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

async function checkGithubLatestRelease(): Promise<{ version: string; releaseUrl?: string; notes?: string } | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const res = await fetch(GITHUB_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      const rawTag = String(data?.tag_name || data?.name || '').trim();
      const cleanVersion = rawTag.replace(/^v/i, '');
      if (!/^\d+\.\d+\.\d+/.test(cleanVersion)) return null;
      const rawNotes = typeof data?.body === 'string' ? data.body.trim().slice(0, 180) : undefined;
      return {
        version: cleanVersion,
        releaseUrl: typeof data?.html_url === 'string' ? data.html_url : undefined,
        notes: rawNotes
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export function applyPendingUpdate(): Promise<void> {
  if (applying) return applying;
  applying = (async () => {
    const { kmUpdate } = await readUpdate();
    if (!kmUpdate?.availableVersion || !['available', 'waiting', 'installing'].includes(kmUpdate.status)) return;
    if (kmUpdate.source === 'github') {
      // GitHub release detected before CWS CRX rollout: nudge Chrome Web Store check first.
      const res = await chrome.runtime.requestUpdateCheck().catch(() => null);
      if (res?.status === 'update_available' && res.version) {
        await storeUpdate({ status: 'available', availableVersion: res.version, source: 'cws', error: undefined });
      } else {
        return;
      }
    }
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
  await storeUpdate({ status: 'available', availableVersion: version, source: 'cws', error: undefined });
  await applyPendingUpdate();
}

export async function dismissUpdateNotification(): Promise<void> {
  const { kmUpdate } = await readUpdate();
  if (!kmUpdate) return;
  if (kmUpdate.status === 'updated' || kmUpdate.status === 'error') {
    await storeUpdate({ status: 'idle', error: undefined });
    return;
  }
  if (kmUpdate.availableVersion) {
    await storeUpdate({ dismissedVersion: kmUpdate.availableVersion });
  }
}

export async function pollForUpdateSilently(force = false): Promise<void> {
  if (remotePolling) return remotePolling;
  remotePolling = (async () => {
    const { kmUpdate } = await readUpdate();
    if (kmUpdate?.availableVersion && ['waiting', 'installing'].includes(kmUpdate.status)) {
      if (kmUpdate.source !== 'github') await applyPendingUpdate();
      return;
    }
    if (!force && Date.now() - (kmUpdate?.remoteCheckedAt || 0) < REMOTE_POLL_INTERVAL_MS) {
      return;
    }
    const currentVersion = chrome.runtime.getManifest().version;
    await storeUpdate({ remoteCheckedAt: Date.now() });

    try {
      const cws = await chrome.runtime.requestUpdateCheck().catch(() => null);
      if (cws?.status === 'update_available' && cws.version) {
        await updateAvailable(cws.version);
        return;
      }
      const remote = await checkGithubLatestRelease();
      if (remote && isNewerVersion(remote.version, currentVersion)) {
        await storeUpdate({
          status: 'available',
          availableVersion: remote.version,
          source: 'github',
          releaseUrl: remote.releaseUrl,
          notes: remote.notes,
          error: undefined
        });
      }
    } catch {}
  })().finally(() => { remotePolling = null; });
  return remotePolling;
}

export function checkForUpdate(options: { includeRemote?: boolean } = {}): Promise<void> {
  if (checking) return checking;
  checking = (async () => {
    const { kmUpdate } = await readUpdate();
    if (kmUpdate?.availableVersion && ['available', 'waiting', 'installing'].includes(kmUpdate.status) && kmUpdate.source !== 'github') {
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
      if (result.status === 'update_available') {
        await updateAvailable(result.version!);
        return;
      }
      if (options.includeRemote) {
        const remote = await checkGithubLatestRelease();
        const currentVersion = chrome.runtime.getManifest().version;
        if (remote && isNewerVersion(remote.version, currentVersion)) {
          await storeUpdate({
            status: 'available',
            availableVersion: remote.version,
            source: 'github',
            releaseUrl: remote.releaseUrl,
            notes: remote.notes,
            remoteCheckedAt: Date.now(),
            error: undefined
          });
          return;
        }
      }
      const latest = await readUpdate();
      if (!latest.kmUpdate?.availableVersion || latest.kmUpdate?.source === 'github') {
        await storeUpdate({ status: result.status });
      }
    } catch (err: any) {
      await storeUpdate({ status: 'error', error: String(err?.message || err) });
    }
  })().finally(() => { checking = null; });
  return checking;
}
