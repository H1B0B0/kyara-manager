import { sleep } from '../utils';
import { state } from '../state';
import { isMiniGameRoute } from '../operations';

export interface SpaNavigateOptions {
  owner?: 'games' | 'boosters' | 'nav';
  allowInterruptGame?: boolean;
}

export async function navigateSpaTo(targetPath: string, options?: SpaNavigateOptions): Promise<boolean> {
  if (state.disposed) return false;
  const effectiveOwner = options?.owner ?? state.spaPilotOwner;
  if (!options?.allowInterruptGame && effectiveOwner !== 'games') {
    if (state.isGamesRunning || isMiniGameRoute()) {
      return false;
    }
  }

  const currentPath = typeof location !== 'undefined' ? location.pathname : '';
  if (currentPath === targetPath) return true;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(targetPath) : targetPath;
  const existingLink = document.querySelector(`a[href="${escaped}"]`) as HTMLAnchorElement | null;
  if (existingLink) {
    existingLink.click();
  } else {
    const a = document.createElement('a');
    a.href = targetPath;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const start = Date.now();
  while (Date.now() - start < 4000) {
    if (state.disposed) return false;
    if (typeof location !== 'undefined' && location.pathname === targetPath) return true;
    await sleep(80);
  }
  return typeof location !== 'undefined' && location.pathname === targetPath;
}

export async function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  { timeoutMs = 6000, predicate = null }: { timeoutMs?: number; predicate?: ((el: Element) => boolean) | null } = {}
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const els = Array.from(document.querySelectorAll(selector));
    for (const el of els) {
      if (!predicate || predicate(el)) return el as T;
    }
    await sleep(90);
  }
  return null;
}
