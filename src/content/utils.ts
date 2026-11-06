import { SiteAuth } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomJitter(maxMs = 110): number {
  return Math.floor(Math.random() * maxMs);
}

export function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function readSiteAuth(): SiteAuth {
  let pass: string | null = null;
  try {
    const rawPass = localStorage.getItem('kyara_pass');
    const parsed = rawPass ? JSON.parse(rawPass) : null;
    if (parsed && typeof parsed.pass === 'string' && Number(parsed.expiresAt) > Date.now()) {
      pass = parsed.pass;
    }
  } catch {
    pass = null;
  }

  let token: string | null = null;
  try {
    token = localStorage.getItem('kyara_token') || null;
  } catch {
    token = null;
  }

  let deviceId = '';
  try {
    deviceId = localStorage.getItem('kyara_device') || '';
  } catch {
    deviceId = '';
  }

  return { token, deviceId, pass };
}

export function notifyDesktop(title: string, message: string, idPrefix = 'km'): void {
  chrome.runtime
    .sendMessage({
      type: 'km:notify',
      title,
      message,
      idPrefix
    })
    .catch(() => {});
}
