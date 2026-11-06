import { sleep } from '../utils';

export async function navigateSpaTo(targetPath: string): Promise<boolean> {
  if (location.pathname === targetPath) return true;
  const existingLink = document.querySelector(`a[href="${CSS.escape(targetPath)}"]`) as HTMLAnchorElement | null;
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
    if (location.pathname === targetPath) return true;
    await sleep(80);
  }
  return location.pathname === targetPath;
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
