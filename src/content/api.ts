import { KyaraApiOptions } from './types';
import { sleep, randomJitter, readSiteAuth } from './utils';

let writeQueue = Promise.resolve();
let lastWriteAt = 0;
let rushMultiplier = 1;
let cooldownUntil = 0;

export async function waitForWriteSlot(): Promise<void> {
  const turn = writeQueue.then(async () => {
    const now = Date.now();
    if (cooldownUntil > now) {
      await sleep(cooldownUntil - now);
    }
    const minGap = 340 * rushMultiplier + randomJitter(120);
    const waitMs = lastWriteAt + minGap - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastWriteAt = Date.now();
  });
  writeQueue = turn.catch(() => {});
  return turn;
}

export async function kyaraApi<T = any>(
  path: string,
  { method = 'GET', body, withPass = false, extraHeaders = {}, auth = true }: KyaraApiOptions = {}
): Promise<T> {
  const isWrite = method !== 'GET';
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isWrite) {
      await waitForWriteSlot();
    } else if (cooldownUntil > Date.now()) {
      await sleep(cooldownUntil - Date.now());
    }

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
      cache: 'no-store'
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
      if (attempt + 1 < maxAttempts) {
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
