import { KyaraApiOptions } from './types';
import { sleep, randomJitter, readSiteAuth } from './utils';
import { state } from './state';

const WRITE_GAP_MS = 300;
const WRITE_JITTER_MS = 100;
let lastWriteAt = 0;
let rushMultiplier = 1;
let cooldownUntil = 0;

type WriteWaiter = () => void;
// Index 0 = high priority, 1 = normal. One pump spaces every write, whichever queue it came from.
const writeQueues: WriteWaiter[][] = [[], []];
let pumping = false;

async function pumpWrites(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = writeQueues[0].shift() ?? writeQueues[1].shift();
      if (!next) break;
      const now = Date.now();
      if (cooldownUntil > now) await sleep(cooldownUntil - now);
      const waitMs = lastWriteAt + WRITE_GAP_MS * rushMultiplier + randomJitter(WRITE_JITTER_MS) - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      lastWriteAt = Date.now();
      next();
    }
  } finally {
    pumping = false;
  }
}

export function waitForWriteSlot(priority: 'high' | 'normal' = 'normal'): Promise<void> {
  return new Promise<void>((resolve) => {
    writeQueues[priority === 'high' ? 0 : 1].push(resolve);
    void pumpWrites();
  });
}

export async function kyaraApi<T = any>(
  path: string,
  { method = 'GET', body, withPass = false, extraHeaders = {}, auth = true, priority = 'normal' }: KyaraApiOptions = {}
): Promise<T> {
  const isWrite = method !== 'GET';
  if (state.disposed || !chrome.runtime?.id) throw new Error('Extension rechargée. Actualise cet onglet Kyara.');
  if (isWrite && state.currentSettings.dryRun) {
    throw new Error('Mode simulation actif : aucune modification envoyée à Kyara.');
  }
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isWrite) {
      await waitForWriteSlot(priority);
    } else if (cooldownUntil > Date.now()) {
      await sleep(cooldownUntil - Date.now());
    }

    if (state.disposed || !chrome.runtime?.id) throw new Error('Extension rechargée. Actualise cet onglet Kyara.');
    if (isWrite && state.currentSettings.dryRun) throw new Error('Mode simulation actif : action annulée.');
    const siteAuth = readSiteAuth();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...extraHeaders
    };
    if (siteAuth.deviceId) {
      headers['x-device-id'] = siteAuth.deviceId;
    }
    if (auth && siteAuth.token) {
      headers.Authorization = `Bearer ${siteAuth.token}`;
    }
    if (withPass && siteAuth.pass) {
      headers['x-pass'] = siteAuth.pass;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    });

    const rushHeader = Number(response.headers.get('x-kyara-rush'));
    if (Number.isFinite(rushHeader) && rushHeader >= 1) {
      rushMultiplier = Math.min(4, rushHeader);
    }

    const data = await response.json().catch(() => null);
    if (response.ok) {
      return data as T;
    }

    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1500 * Math.pow(2, attempt) + randomJitter(400);
      cooldownUntil = Math.max(cooldownUntil, Date.now() + backoff);
      // A 503 can arrive after a write committed. Never replay an ambiguous mutation.
      if (attempt + 1 < maxAttempts && (!isWrite || response.status === 429)) {
        continue;
      }
    }

    const err = new Error(data?.message || data?.error || `HTTP ${response.status}`) as any;
    err.status = response.status;
    err.code = data?.error || `http_${response.status}`;
    throw err;
  }
  throw new Error('API request failed after retries');
}
