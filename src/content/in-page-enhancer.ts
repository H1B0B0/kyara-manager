import { runtimeCache } from './cache';
import { renderInPageBars, type EnhancerContext } from './in-page-bars';

const ENHANCED_ATTR = 'data-km-enhanced';
const WIKI_LINK_RE = /\/wiki\/(\d+)(?:[?#].*)?$/;

function createBadge(charId: number, ctx: EnhancerContext): { badge: HTMLElement | null; state: 'wish' | 'missing' | 'owned' } {
  const isWish = ctx.wishlistIds.has(charId);
  const isOwned = ctx.ownedIds.has(charId);
  const isPinned = ctx.pinnedIds.has(charId);
  const dupe = ctx.duplicateById.get(charId);
  const priceEntry = runtimeCache.collectionPrices.get(charId);
  const median = Number(priceEntry?.median7d ?? priceEntry?.median30d);
  const priceLabel = Number.isFinite(median) && median > 0 ? ` ~${Math.round(median)}◆` : '';
  const state: 'wish' | 'missing' | 'owned' = isWish ? 'wish' : !isOwned ? 'missing' : 'owned';

  if (!isWish && isOwned && !dupe && !isPinned && !priceLabel) {
    return { badge: null, state };
  }

  const badge = document.createElement('span');
  if (isWish) {
    badge.className = 'km-inpage-badge km-inpage-badge--wish';
    badge.textContent = `★ Envie${priceLabel}`;
  } else if (!isOwned) {
    badge.className = 'km-inpage-badge km-inpage-badge--missing';
    badge.textContent = `Manquante${priceLabel}`;
  } else if (dupe && (dupe.spare ?? 0) > 0) {
    const qty = dupe.verdict === 'RECYCLER' ? (dupe.recyclableSpare ?? dupe.spare) : dupe.spare;
    const verdict = isPinned ? 'Protégée' : dupe.verdict === 'VENDRE' ? `VENDRE ~${dupe.prices?.recommended || '?'}◆` : `RECYCLER +${dupe.recycleValue || '?'}◆`;
    badge.className = 'km-inpage-badge km-inpage-badge--dupe';
    badge.textContent = `×${qty} ${verdict}`;
  } else if (isPinned) {
    badge.className = 'km-inpage-badge km-inpage-badge--owned';
    badge.textContent = `Protégée${priceLabel}`;
  } else {
    badge.className = 'km-inpage-badge km-inpage-badge--owned';
    badge.textContent = `Possédé${priceLabel}`;
  }
  return { badge, state };
}

function buildContext(dashboard: any, wishlist: any[], pinnedCards: number[], settings: any): EnhancerContext {
  const ownedIds = new Set<number>();
  if (runtimeCache.ownedIds instanceof Set) {
    for (const cid of runtimeCache.ownedIds) {
      if (Number.isFinite(cid) && cid > 0) ownedIds.add(cid);
    }
  }
  const duplicateById = new Map<number, any>();
  if (Array.isArray(dashboard?.duplicates)) {
    for (const d of dashboard.duplicates) {
      const cid = Number(d?.characterId);
      if (Number.isFinite(cid) && cid > 0) {
        ownedIds.add(cid);
        duplicateById.set(cid, d);
      }
    }
  }

  const wishlistIds = new Set<number>();
  for (const w of Array.isArray(wishlist) ? wishlist : []) {
    const cid = Number(w?.characterId);
    if (Number.isFinite(cid) && cid > 0) wishlistIds.add(cid);
  }
  if (Array.isArray(dashboard?.wishlist)) {
    for (const w of dashboard.wishlist) {
      const cid = Number(w?.characterId);
      if (Number.isFinite(cid) && cid > 0) wishlistIds.add(cid);
    }
  }

  const pinnedIds = new Set<number>((Array.isArray(pinnedCards) ? pinnedCards : []).map(Number).filter(Number.isFinite));
  return { ownedIds, wishlistIds, pinnedIds, duplicateById, dashboard, settings };
}

/**
 * Attaches a non-intrusive MutationObserver that annotates `/wiki/<id>` links
 * and injects contextual Kyara Manager tactical bars across kyara.games routes.
 */
export function setupInPageEnhancer(): () => void {
  let ctx: EnhancerContext = {
    ownedIds: new Set(),
    wishlistIds: new Set(),
    pinnedIds: new Set(),
    duplicateById: new Map(),
    dashboard: null,
    settings: null
  };
  let rafId = 0;

  const annotate = () => {
    rafId = 0;
    renderInPageBars(ctx);

    const path = window.location.pathname || '';
    if (!path.startsWith('/marche') && !path.startsWith('/collection') && !path.startsWith('/renaissance')) {
      return;
    }
    if (ctx.ownedIds.size === 0 && ctx.wishlistIds.size === 0 && runtimeCache.collectionPrices.size === 0) {
      return;
    }

    const links = document.querySelectorAll<HTMLAnchorElement>(`a[href*="/wiki/"]:not([${ENHANCED_ATTR}])`);
    let count = 0;
    for (const link of links) {
      if (count >= 120) break;
      const href = link.getAttribute('href') || '';
      const match = href.match(WIKI_LINK_RE);
      if (!match) continue;
      link.setAttribute(ENHANCED_ATTR, '1');
      if (link.closest('#km-floating-hud, #km-cockpit-overlay, header, .km-inpage-bar')) continue;

      const charId = Number(match[1]);
      if (!Number.isFinite(charId) || charId <= 0) continue;
      if (link.nextElementSibling?.classList.contains('km-inpage-badge')) continue;

      const { badge, state } = createBadge(charId, ctx);
      const container = link.closest('article, [role="listitem"], li, .card') as HTMLElement | null;
      if (container && !container.closest('nav, header')) {
        container.setAttribute('data-km-state', state);
      }
      if (!badge) continue;
      link.insertAdjacentElement('afterend', badge);
      count += 1;
    }
  };

  const scheduleAnnotate = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(annotate);
  };

  const reloadState = async () => {
    try {
      const { kmDashboard, kmWishlist, kmPinnedCards, settings } = (await chrome.storage.local.get([
        'kmDashboard',
        'kmWishlist',
        'kmPinnedCards',
        'settings'
      ])) as {
        kmDashboard?: any;
        kmWishlist?: any[];
        kmPinnedCards?: number[];
        settings?: any;
      };
      ctx = buildContext(kmDashboard || null, kmWishlist || [], kmPinnedCards || [], settings || null);
      scheduleAnnotate();
    } catch {}
  };

  void reloadState();

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (changes.kmDashboard || changes.kmWishlist || changes.kmPinnedCards || changes.settings)) {
      document.querySelectorAll('.km-inpage-badge').forEach((el) => el.remove());
      document.querySelectorAll(`a[${ENHANCED_ATTR}]`).forEach((el) => el.removeAttribute(ENHANCED_ATTR));
      document.querySelectorAll('[data-km-state]').forEach((el) => el.removeAttribute('data-km-state'));
      void reloadState();
    }
  };
  chrome.storage?.onChanged?.addListener(onStorage);
  window.addEventListener('popstate', scheduleAnnotate);

  const observer = new MutationObserver(() => {
    scheduleAnnotate();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    observer.disconnect();
    chrome.storage?.onChanged?.removeListener(onStorage);
    window.removeEventListener('popstate', scheduleAnnotate);
    document.querySelectorAll('.km-inpage-badge, .km-inpage-bar').forEach((el) => el.remove());
    document.querySelectorAll(`a[${ENHANCED_ATTR}]`).forEach((el) => el.removeAttribute(ENHANCED_ATTR));
    document.querySelectorAll('[data-km-state]').forEach((el) => el.removeAttribute('data-km-state'));
  };
}
