import { runtimeCache } from './cache';
import { toggleCockpitOverlay } from './overlay';
import { navigateSpaTo } from './automation/spa-navigator';
import { chooseBestDailyHandIndices, extractCardIdFromUrl, matchCharacterChoice, pickMostLovedWinner } from '../lib/analytics/games-solver';
import type { EnhancerContext } from './in-page-bars';
import type { Rarity } from '../types/kyara';

const HINT_CLASS = 'km-game-hint';
const memoryNotes = new Map<number, string>();

function pill(text: string, variant = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `km-inpage-pill${variant ? ` km-inpage-pill--${variant}` : ''}`;
  span.textContent = text;
  return span;
}

function btn(text: string, primary = false, onClick?: (el: HTMLButtonElement) => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `km-inpage-btn${primary ? ' km-inpage-btn--primary' : ''}`;
  el.textContent = text;
  if (onClick) el.addEventListener('click', () => onClick(el));
  return el;
}

function runCmdBtn(button: HTMLButtonElement, payload: Record<string, any>, doneText: string): void {
  if (button.disabled) return;
  const orig = button.textContent || '';
  button.disabled = true;
  button.textContent = '…';
  void chrome.runtime
    .sendMessage(payload)
    .then((res: any) => {
      button.textContent = res?.ok ? doneText : (res?.error?.slice(0, 24) || orig);
      setTimeout(() => {
        button.disabled = false;
        button.textContent = orig;
      }, 1500);
    })
    .catch(() => {
      button.disabled = false;
      button.textContent = orig;
    });
}

export function renderGamesBar(ctx: EnhancerContext): void {
  const main = document.querySelector('main');
  if (!main) return;
  const existing = document.getElementById('km-inpage-games-bar');
  if (existing && main.firstElementChild === existing) return;
  existing?.remove();

  const bar = document.createElement('section');
  bar.id = 'km-inpage-games-bar';
  bar.className = 'km-inpage-bar';
  bar.setAttribute('aria-label', 'Kyara Manager — Salle de Jeux');

  const left = document.createElement('div');
  left.className = 'km-inpage-bar__left';
  const seal = document.createElement('span');
  seal.className = 'km-inpage-bar__seal';
  seal.textContent = '遊';
  const title = document.createElement('strong');
  title.className = 'km-inpage-bar__title';
  title.textContent = 'Salle de Jeux & Lot';
  left.append(seal, title);

  const arcade = ctx.dashboard?.arcade;
  if (arcade) {
    left.append(
      pill(`Jour : ${arcade.today}/${arcade.dayCap} 🎟`, arcade.today >= arcade.dayCap ? 'owned' : 'gold'),
      pill(`Semaine : ${arcade.week}/${arcade.weekCap}`),
      pill(`Solde : ${arcade.balance} 🎟`, arcade.canBuyLot ? 'gold' : '')
    );
    if (arcade.bestLotLabel && arcade.bestLotPrice) {
      left.append(
        pill(
          arcade.canBuyLot
            ? `✓ Dispo : ${arcade.bestLotLabel}`
            : `Cible : ${arcade.bestLotLabel} (${arcade.bestLotPrice} 🎟)`,
          arcade.canBuyLot ? 'owned' : ''
        )
      );
    }
  } else {
    left.append(pill('Cap : 60/jour · Lot Lég. 200 🎟 · Sceau Myth. 1000 🎟', 'gold'));
  }

  const actions = document.createElement('div');
  actions.className = 'km-inpage-bar__actions';

  const isMiniGame = (window.location.pathname || '').split('/').filter(Boolean).length >= 2 &&
    !window.location.pathname.startsWith('/jouer/comptoir');

  if (isMiniGame) {
    actions.appendChild(
      btn('Résoudre manche', false, (b) => runCmdBtn(b, { type: 'km:cmd:solve-current-game' }, 'Joué !'))
    );
  }
  actions.append(
    btn('Farmer la Salle', true, (b) => runCmdBtn(b, { type: 'km:cmd:run-games-farm' }, 'Farm OK')),
    btn('Comptoir Boosters', false, () => void navigateSpaTo('/jouer/comptoir')),
    btn('Cockpit', false, () => toggleCockpitOverlay())
  );

  bar.append(left, actions);
  main.prepend(bar);
}

function clearPreviousHints(): void {
  document.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll('.km-slot-recommended').forEach((el) => el.classList.remove('km-slot-recommended'));
}

/**
 * Passively highlights winning answers, rank # popularity, optimal Daily Hand combos,
 * and memorized pairs on `/jouer/*` when `autoGamesSolverOverlay` is enabled.
 */
export function annotateActiveMiniGame(ctx: EnhancerContext): void {
  if (ctx.settings?.autoGamesSolverOverlay === false) return;
  const path = window.location.pathname || '';
  const catalog = runtimeCache.catalogById;

  if (path.startsWith('/jouer/plus-aime') && catalog) {
    const arena = document.querySelector('main .arena');
    if (!arena) return;
    const candidates = Array.from(arena.querySelectorAll<HTMLElement>('button, [role="button"]')).filter((el) =>
      Boolean(el.querySelector('img[src*="/cards/"]') || el.querySelector('.pf-name'))
    );
    if (candidates.length < 2) return;
    clearPreviousHints();
    const ids = candidates.map((c) => extractCardIdFromUrl(c.querySelector<HTMLImageElement>('img')?.src));
    const names = candidates.map((c) => c.querySelector('.pf-name')?.textContent?.trim() || c.textContent?.trim() || '');
    const { winnerIndex, ranks } = pickMostLovedWinner(ids, names, catalog);

    candidates.forEach((card, idx) => {
      const badge = document.createElement('span');
      const rankLabel = ranks[idx] !== null ? `#${ranks[idx]}` : '#?';
      badge.className = `${HINT_CLASS} ${idx === winnerIndex ? 'km-game-hint--win' : 'km-game-hint--lose'}`;
      badge.textContent = idx === winnerIndex ? `👑 ${rankLabel} Plus aimé` : rankLabel;
      card.classList.add('km-slot-recommended');
      if (idx !== winnerIndex) card.classList.remove('km-slot-recommended');
      card.appendChild(badge);
    });
    return;
  }

  if ((path.startsWith('/jouer/qui-est-ce') || path.startsWith('/jouer/serie-express')) && catalog) {
    const arena = document.querySelector('main .arena');
    if (!arena) return;
    const imgs = Array.from(arena.querySelectorAll<HTMLImageElement>('img[src*="/cards/"]'));
    const clueIds = imgs.map((img) => extractCardIdFromUrl(img.src)).filter((id): id is number => id !== null);
    const choiceBtns = Array.from(arena.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
      (b) => !b.querySelector('img[src*="/cards/"]') && (b.innerText || '').trim().length > 0
    );
    if (!clueIds.length || !choiceBtns.length) return;
    const idx = matchCharacterChoice(
      clueIds,
      choiceBtns.map((b) => (b.innerText || b.textContent || '').trim()),
      catalog,
      path.startsWith('/jouer/serie-express') ? 'series' : 'character'
    );
    if (idx >= 0) {
      clearPreviousHints();
      const badge = document.createElement('span');
      badge.className = `${HINT_CLASS} km-game-hint--win`;
      badge.textContent = '✓ Réponse';
      choiceBtns[idx].classList.add('km-slot-recommended');
      choiceBtns[idx].appendChild(badge);
    }
    return;
  }

  if (path.startsWith('/jouer/main-du-jour')) {
    const slots = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.hand button.slot'));
    if (!slots.length) return;
    const cards = slots.map((slot) => {
      const name = slot.querySelector('.pf-name')?.textContent?.trim() || '';
      const rawR = (slot.querySelector('.pf-seal')?.textContent?.trim() || 'C').toUpperCase();
      const rarity: Rarity = (['C', 'U', 'R', 'E', 'L', 'M'].includes(rawR) ? rawR : 'C') as Rarity;
      const series = slot.querySelector('.pf-ser')?.textContent?.trim() || '';
      const family = slot.querySelector('.pf-rib')?.getAttribute('title')?.trim() || '';
      return { name, series, family, rarity };
    });
    const best = new Set(chooseBestDailyHandIndices(cards));
    clearPreviousHints();
    slots.forEach((slot, idx) => {
      if (best.has(idx)) {
        slot.classList.add('km-slot-recommended');
      }
    });
    return;
  }

  if (path.startsWith('/jouer/memoire')) {
    const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main .felt button'));
    if (tiles.length < 4) return;
    const seenKeys = new Map<string, number>();
    let nextPairNum = 1;
    tiles.forEach((tile, idx) => {
      const img = tile.querySelector<HTMLImageElement>('img[src*="/cards/"]');
      const name = tile.querySelector('.pf-name')?.textContent?.trim();
      const sig = img?.src ? `id:${extractCardIdFromUrl(img.src) || img.src}` : name ? `name:${name}` : null;
      if (sig) memoryNotes.set(idx, sig);
      const remembered = memoryNotes.get(idx);
      if (remembered && !seenKeys.has(remembered)) {
        seenKeys.set(remembered, nextPairNum++);
      }
      if (remembered && !sig && !tile.disabled && !tile.querySelector(`.${HINT_CLASS}`)) {
        const badge = document.createElement('span');
        badge.className = `${HINT_CLASS} km-game-hint--win`;
        badge.textContent = `#${seenKeys.get(remembered)}`;
        tile.appendChild(badge);
      }
    });
  }
}
