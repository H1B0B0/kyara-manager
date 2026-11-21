import { kyaraApi } from './api';
import { runtimeCache } from './cache';
import { toggleCockpitOverlay } from './overlay';

export interface EnhancerContext {
  ownedIds: Set<number>;
  wishlistIds: Set<number>;
  pinnedIds: Set<number>;
  duplicateById: Map<number, any>;
  dashboard: any;
  settings: any;
}

const BAR_IDS = [
  'km-inpage-wiki-bar',
  'km-inpage-market-bar',
  'km-inpage-collection-bar',
  'km-inpage-rebirth-bar',
  'km-inpage-boosters-bar'
];

const WIKI_ROUTE_RE = /^\/wiki\/(\d+)/;
const pendingPriceProbes = new Map<number, Promise<number | null>>();

async function probeWikiPrice(charId: number): Promise<number | null> {
  const existing = runtimeCache.collectionPrices.get(charId);
  const cachedMed = Number(existing?.median7d ?? existing?.median30d);
  if (Number.isFinite(cachedMed) && cachedMed > 0) return cachedMed;

  if (!pendingPriceProbes.has(charId)) {
    const req = kyaraApi(`/market/prices/${charId}`, { auth: false })
      .then((res) => {
        const m7 = Number(res?.median7d);
        const m30 = Number(res?.median30d);
        if ((Number.isFinite(m7) && m7 > 0) || (Number.isFinite(m30) && m30 > 0)) {
          runtimeCache.collectionPrices.set(charId, {
            median7d: Number.isFinite(m7) && m7 > 0 ? m7 : null,
            median30d: Number.isFinite(m30) && m30 > 0 ? m30 : null,
            sales7d: Number(res?.sales7d) || 0,
            sales30d: Number.isFinite(Number(res?.sales30d)) ? Number(res.sales30d) : null,
            at: Date.now()
          });
        }
        return (Number.isFinite(m7) && m7 > 0 ? m7 : Number.isFinite(m30) && m30 > 0 ? m30 : null);
      })
      .catch(() => null);
    pendingPriceProbes.set(charId, req);
  }
  return pendingPriceProbes.get(charId)!;
}

function sendBgCmd(btn: HTMLButtonElement, payload: Record<string, any>, successLabel?: string): void {
  if (btn.disabled) return;
  const orig = btn.textContent || '';
  btn.disabled = true;
  btn.textContent = '…';
  void chrome.runtime
    .sendMessage(payload)
    .then((res: any) => {
      if (res?.ok && successLabel) {
        btn.textContent = successLabel;
      } else if (!res?.ok && res?.error) {
        btn.textContent = res.error.slice(0, 26);
      } else {
        btn.textContent = orig;
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = orig;
      }, 1500);
    })
    .catch(() => {
      btn.disabled = false;
      btn.textContent = orig;
    });
}

function pill(text: string, variant = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `km-inpage-pill${variant ? ` km-inpage-pill--${variant}` : ''}`;
  span.textContent = text;
  return span;
}

function actionBtn(text: string, primary = false, onClick?: (btn: HTMLButtonElement) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `km-inpage-btn${primary ? ' km-inpage-btn--primary' : ''}`;
  btn.textContent = text;
  if (onClick) btn.addEventListener('click', () => onClick(btn));
  return btn;
}

function mountBarInMain(bar: HTMLElement): void {
  const main = document.querySelector('main');
  if (!main) return;
  if (main.firstElementChild?.id === bar.id) return;
  BAR_IDS.forEach((id) => {
    if (id !== bar.id) document.getElementById(id)?.remove();
  });
  document.getElementById(bar.id)?.remove();
  main.prepend(bar);
}

function createBar(id: string, kanji: string, titleText: string): {
  bar: HTMLElement;
  left: HTMLElement;
  actions: HTMLElement;
} {
  const bar = document.createElement('section');
  bar.id = id;
  bar.className = 'km-inpage-bar';
  bar.setAttribute('aria-label', `Kyara Manager — ${titleText}`);

  const left = document.createElement('div');
  left.className = 'km-inpage-bar__left';
  const seal = document.createElement('span');
  seal.className = 'km-inpage-bar__seal';
  seal.textContent = kanji;
  const title = document.createElement('strong');
  title.className = 'km-inpage-bar__title';
  title.textContent = titleText;
  left.append(seal, title);

  const actions = document.createElement('div');
  actions.className = 'km-inpage-bar__actions';
  bar.append(left, actions);
  return { bar, left, actions };
}

function renderWikiBar(charId: number, ctx: EnhancerContext): void {
  const { bar, left, actions } = createBar('km-inpage-wiki-bar', '評', `Carte #${charId}`);
  const isOwned = ctx.ownedIds.has(charId);
  const isWish = ctx.wishlistIds.has(charId);
  const isPinned = ctx.pinnedIds.has(charId);
  const cardName =
    runtimeCache.catalogById?.get(charId)?.name ||
    document.querySelector('main h1')?.textContent?.trim() ||
    `Carte #${charId}`;

  if (isWish) left.appendChild(pill('★ Dans vos Envies', 'wish'));
  else if (isOwned) left.appendChild(pill('Possédée', 'owned'));
  else left.appendChild(pill('Manquante', 'missing'));

  const cachedMed = Number(
    runtimeCache.collectionPrices.get(charId)?.median7d ??
      runtimeCache.collectionPrices.get(charId)?.median30d
  );
  const medPill = pill(
    Number.isFinite(cachedMed) && cachedMed > 0 ? `Médiane 7j : ~${Math.round(cachedMed)} ◆` : 'Médiane : scan…',
    'gold'
  );
  left.appendChild(medPill);

  const pinBtn = actionBtn(isPinned ? 'Protégée' : 'Protéger', false, (b) =>
    sendBgCmd(b, { type: 'km:cmd:toggle-pin', characterId: charId }, isPinned ? 'Déverrouillée' : 'Protégée')
  );
  if (isPinned) pinBtn.classList.add('is-active');

  const initialBudget = Number.isFinite(cachedMed) && cachedMed > 0 ? Math.max(5, Math.round(cachedMed * 0.9)) : 20;
  const wishBtn = actionBtn(`★ + Envie (~${initialBudget} ◆)`, false, (b) => {
    const m = Number(runtimeCache.collectionPrices.get(charId)?.median7d) || 20;
    sendBgCmd(
      b,
      { type: 'km:cmd:wishlist-add', characterId: charId, name: cardName, budgetChakra: Math.max(5, Math.round(m * 0.9)), autoBuy: true },
      'Ajoutée ★'
    );
  });

  const initialBid = Number.isFinite(cachedMed) && cachedMed > 0 ? Math.max(1, Math.round(cachedMed * 0.75)) : 10;
  const orderBtn = actionBtn(`Ordre -25% (${initialBid} ◆)`, true, (b) => {
    const m = Number(runtimeCache.collectionPrices.get(charId)?.median7d) || 10;
    sendBgCmd(
      b,
      { type: 'km:cmd:place-buy-order', characterId: charId, price: Math.max(1, Math.round(m * 0.75)), name: cardName },
      'Ordre posé'
    );
  });

  actions.append(pinBtn, wishBtn, orderBtn, actionBtn('Cockpit', false, () => toggleCockpitOverlay()));
  mountBarInMain(bar);

  if (!Number.isFinite(cachedMed) || cachedMed <= 0) {
    void probeWikiPrice(charId).then((med) => {
      if (med && med > 0 && document.getElementById('km-inpage-wiki-bar')) {
        medPill.textContent = `Médiane 7j : ~${Math.round(med)} ◆`;
        wishBtn.textContent = `★ + Envie (~${Math.max(5, Math.round(med * 0.9))} ◆)`;
        orderBtn.textContent = `Ordre -25% (${Math.max(1, Math.round(med * 0.75))} ◆)`;
      }
    });
  }
}

export function renderInPageBars(ctx: EnhancerContext): void {
  const path = window.location.pathname || '/';
  const wikiMatch = path.match(WIKI_ROUTE_RE);
  if (wikiMatch) {
    renderWikiBar(Number(wikiMatch[1]), ctx);
    return;
  }

  if (path.startsWith('/marche')) {
    const { bar, left, actions } = createBar('km-inpage-market-bar', '市', 'Filtres & Radar Marché');
    const dealsCount = ctx.dashboard?.deals?.length ?? 0;
    left.appendChild(pill(`${dealsCount} deal(s)`, 'gold'));

    const hideBtn = actionBtn('Estomper possédées', false, (b) => {
      const on = document.body.classList.toggle('km-hide-owned-cards');
      b.classList.toggle('is-active', on);
    });
    hideBtn.classList.toggle('is-active', document.body.classList.contains('km-hide-owned-cards'));

    const hiBtn = actionBtn('Surligner manquantes', false, (b) => {
      const on = document.body.classList.toggle('km-highlight-missing');
      b.classList.toggle('is-active', on);
    });
    hiBtn.classList.toggle('is-active', document.body.classList.contains('km-highlight-missing'));

    actions.append(
      hideBtn,
      hiBtn,
      actionBtn('Scanner (6s)', true, (b) => sendBgCmd(b, { type: 'km:cmd:run-market-watch' }, 'Scan OK')),
      actionBtn('Lots / Séries', false, () => toggleCockpitOverlay())
    );
    mountBarInMain(bar);
    return;
  }

  if (path.startsWith('/collection') && ctx.dashboard?.collectionStats) {
    const cs = ctx.dashboard.collectionStats;
    const { bar, left, actions } = createBar('km-inpage-collection-bar', '集', 'Gestion Doublons');
    const activeCount = ctx.dashboard?.activeListings?.length ?? 0;
    const maxSlots = ctx.settings?.autoSellMaxListings ?? 10;
    left.append(
      pill(`Vendables : ${cs.sellableDuplicatesCount ?? 0} (+${cs.sellableNetTotal ?? 0} ◆)`, 'gold'),
      pill(`Recyclables : ${cs.recyclableDuplicatesCount ?? 0} (+${cs.recyclableChakraTotal ?? 0} ◆)`, 'owned'),
      pill(`Créneaux : ${activeCount}/${maxSlots}`)
    );
    actions.append(
      actionBtn('Auto-Vente', true, (b) => sendBgCmd(b, { type: 'km:cmd:sell-now' }, 'Vente OK')),
      actionBtn('Recyclage Turbo', false, (b) => sendBgCmd(b, { type: 'km:cmd:bulk-recycle' }, 'Recyclé')),
      actionBtn('Cockpit', false, () => toggleCockpitOverlay())
    );
    mountBarInMain(bar);
    return;
  }

  if (path.startsWith('/renaissance') && ctx.dashboard?.renaissance) {
    const ren = ctx.dashboard.renaissance;
    const { bar, left, actions } = createBar('km-inpage-rebirth-bar', '転', 'Pré-Vol Renaissance');
    left.append(
      pill(`Cycle : ${Math.round(ren.overallPct ?? 0)}%`, 'gold'),
      pill(`Payout C/U/R/E : +${ren.rebirthPayoutChakra ?? 0} ◆`, 'owned')
    );
    if ((ren.blockingListingsCount ?? 0) > 0) {
      left.appendChild(pill(`Bloquantes : ${ren.blockingListingsCount}`, 'warn'));
      actions.appendChild(
        actionBtn(`Retirer annonces C/U/R/E (${ren.blockingListingsCount})`, true, (b) =>
          sendBgCmd(b, { type: 'km:cmd:cancel-rebirth-blocking-listings' }, 'Retirées')
        )
      );
    }
    actions.appendChild(actionBtn('Acheter manquantes par lot', !ren.blockingListingsCount, () => toggleCockpitOverlay()));
    mountBarInMain(bar);
    return;
  }

  if (path === '/' && ctx.dashboard?.boosters?.recommendedNew) {
    const rec = ctx.dashboard.boosters.recommendedNew;
    const me = ctx.dashboard.me || {};
    const { bar, left, actions } = createBar('km-inpage-boosters-bar', '札', 'Booster Sniper');
    left.append(
      pill(`#1 : ${rec.name} (EV ~${rec.expectedChakraValue} ◆ · Nouv. ${rec.probAtLeastOneNewPct}%)`, 'gold'),
      pill(`Pitié : ${me.pity ?? 0}/250`),
      pill(me.goldenIn !== null && me.goldenIn !== undefined && me.goldenIn <= 1 ? '金 Pack Doré Prêt' : `Doré : ${me.goldenIn ?? '?'}`)
    );
    actions.append(
      actionBtn(`Ouvrir ${rec.name}`, true, (b) => sendBgCmd(b, { type: 'km:cmd:open-recommended' }, 'Ouvert')),
      actionBtn('Cockpit', false, () => toggleCockpitOverlay())
    );
    mountBarInMain(bar);
    return;
  }

  BAR_IDS.forEach((id) => document.getElementById(id)?.remove());
}
