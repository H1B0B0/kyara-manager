import { runtimeCache } from './cache';
import { toggleCockpitOverlay } from './overlay';
import { navigateSpaTo } from './automation/spa-navigator';
import {
  chooseBestDailyHandIndices,
  chooseBestRaidTeamIndices,
  decideMainKyaraAction,
  extractCardIdFromUrl,
  findBlindTestMatch,
  matchCharacterChoice,
  pickExpeditionNextIndex,
  pickMostLovedWinner,
  pickThreeArcsLineIndex
} from '../lib/analytics/games-solver';
import {
  extractBlindTestDom,
  extractThreeArcsState,
  findButtonByText,
  parseHandSlotsDom,
  parseRaidPoolCards
} from './automation/games-extra';
import type { EnhancerContext } from './in-page-bars';

const HINT_CLASS = 'km-game-hint';
const KM_IGNORE_SEL = '#km-inpage-games-bar, .km-inpage-bar, #km-floating-hud, #km-cockpit-overlay';
const memoryNotes = new Map<number, string>();
let lastPath = '';
let lastSig = '';

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
  const path = window.location.pathname || '';
  const segments = path.split('/').filter(Boolean);
  const isMiniGame = segments.length >= 2 && segments[0] === 'jouer' && segments[1] !== 'comptoir';
  const arcade = ctx.dashboard?.arcade;
  const sig = `games:${path}:${isMiniGame ? 1 : 0}:${arcade ? `${arcade.today}/${arcade.dayCap}:${arcade.week}/${arcade.weekCap}:${arcade.balance}:${arcade.canBuyLot ? 1 : 0}:${arcade.bestLotLabel ?? ''}:${arcade.bestLotPrice ?? ''}` : 'none'}`;
  const existing = document.getElementById('km-inpage-games-bar') as HTMLElement | null;
  if (
    existing &&
    main.firstElementChild === existing &&
    (existing.dataset.kmSig === sig ||
      (existing.dataset.mini === (isMiniGame ? '1' : '0') && Boolean(existing.querySelector('button:disabled'))))
  ) {
    return;
  }
  existing?.remove();

  const bar = document.createElement('section');
  bar.id = 'km-inpage-games-bar';
  bar.className = 'km-inpage-bar';
  bar.dataset.mini = isMiniGame ? '1' : '0';
  bar.dataset.kmSig = sig;
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

  if (isMiniGame) {
    actions.appendChild(
      btn('Résoudre manche', false, (b) => runCmdBtn(b, { type: 'km:cmd:solve-current-game' }, 'Joué !'))
    );
  }
  actions.append(
    btn('Farmer la Salle', true, (b) => runCmdBtn(b, { type: 'km:cmd:run-games-farm' }, 'Farm OK')),
    btn('Comptoir Boosters', false, () => void navigateSpaTo('/jouer/comptoir', { owner: 'nav' })),
    btn('Cockpit', false, () => toggleCockpitOverlay())
  );

  bar.append(left, actions);
  main.prepend(bar);
}

function clearPreviousHints(): void {
  document.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll('.km-slot-recommended').forEach((el) => el.classList.remove('km-slot-recommended'));
}

function beginAnnotation(sig: string): boolean {
  if (sig && sig === lastSig && document.querySelector(`.${HINT_CLASS}, .km-slot-recommended`)) {
    return false;
  }
  lastSig = sig;
  clearPreviousHints();
  return true;
}

function createHintBadge(label: string, variant: 'win' | 'lose' = 'win'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `${HINT_CLASS} km-game-hint--${variant}`;
  badge.setAttribute('data-km-ignore', '1');
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = label;
  return badge;
}

function readCleanText(el: Element | null | undefined): string {
  if (!el) return '';
  if (!el.querySelector(`[data-km-ignore], .${HINT_CLASS}`)) {
    return ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[data-km-ignore], .${HINT_CLASS}`).forEach((n) => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function markWin(el: HTMLElement, label: string): void {
  el.classList.add('km-slot-recommended');
  el.appendChild(createHintBadge(label, 'win'));
}

function parseMainKyaraHud(): { handsLeft: number; discardsLeft: number; score: number } {
  const main = document.querySelector('main') || document;
  const discardBtn = document.querySelector<HTMLButtonElement>('.foot .actions button.btn-ghost') || findButtonByText(main, /^(?:Discard|Défausser)\b/i);
  const playBtn = document.querySelector<HTMLButtonElement>('.foot .actions button.btn.btn-acc') || findButtonByText(main, /^(?:Play|Jouer)\b/i);
  const numIn = (txt: string, fallback: number) => {
    const m = txt.match(/\d+/);
    return m ? Number(m[0]) : fallback;
  };
  const scoreEl = document.querySelector('main .score, main .pts, main .hud .val');
  return {
    handsLeft: playBtn && !playBtn.disabled ? numIn(readCleanText(playBtn), 4) : 4,
    discardsLeft: discardBtn && !discardBtn.disabled ? numIn(readCleanText(discardBtn), 1) : 0,
    score: scoreEl ? numIn(readCleanText(scoreEl), 0) : 0
  };
}

/**
 * Passively highlights winning answers, rank # popularity, optimal hands/teams,
 * expedition paths, Three Arcs lanes, and memorized pairs on `/jouer/*`.
 */
export function annotateActiveMiniGame(ctx: EnhancerContext): void {
  if (ctx.settings?.autoGamesSolverOverlay === false) {
    if (lastSig || document.querySelector(`.${HINT_CLASS}, .km-slot-recommended`)) {
      clearPreviousHints();
      lastSig = '';
    }
    return;
  }
  const path = window.location.pathname || '';
  if (path !== lastPath) {
    clearPreviousHints();
    if (!path.startsWith('/jouer/memoire')) memoryNotes.clear();
    lastPath = path;
    lastSig = '';
  }
  const catalog = runtimeCache.catalogById;

  if (path.startsWith('/jouer/plus-aime') && catalog) {
    let candidates = Array.from(document.querySelectorAll<HTMLElement>('main div.duel button.pick:not(:disabled)'));
    if (candidates.length < 2) {
      candidates = Array.from(document.querySelectorAll<HTMLElement>('main .arena button:not(:disabled)')).filter((el) =>
        Boolean(el.querySelector('img[src*="/cards/"]'))
      );
    }
    if (candidates.length < 2) return;
    const ids = candidates.map((c) => extractCardIdFromUrl(c.querySelector<HTMLImageElement>('img[src*="/cards/"], img')?.src));
    const names = candidates.map((c) => readCleanText(c.querySelector('.pf-name')) || readCleanText(c));
    const sig = `${path}:${ids.join(',')}:${names.join('|')}`;
    if (!beginAnnotation(sig)) return;
    const { winnerIndex, ranks } = pickMostLovedWinner(ids, names, catalog);
    candidates.forEach((card, idx) => {
      const rankLabel = ranks[idx] !== null ? `#${ranks[idx]}` : '#?';
      if (idx === winnerIndex) markWin(card, `👑 ${rankLabel} Plus aimé`);
      else card.appendChild(createHintBadge(rankLabel, 'lose'));
    });
    return;
  }

  if ((path.startsWith('/jouer/qui-est-ce') || path.startsWith('/jouer/serie-express')) && catalog) {
    const scope = document.querySelector('main .arena') || document.querySelector('main');
    if (!scope) return;
    const imgs = Array.from(scope.querySelectorAll<HTMLImageElement>('img[src*="/cards/"]'));
    const clueIds = imgs.map((img) => extractCardIdFromUrl(img.src)).filter((id): id is number => id !== null);
    const choiceBtns = Array.from(
      document.querySelectorAll<HTMLButtonElement>('main div.choices button.choice:not(:disabled)')
    ).filter((b) => !b.closest(KM_IGNORE_SEL) && readCleanText(b).length > 0);
    if (!clueIds.length || !choiceBtns.length) return;
    const labels = choiceBtns.map((b) => readCleanText(b));
    const idx = matchCharacterChoice(clueIds, labels, catalog, path.startsWith('/jouer/serie-express') ? 'series' : 'character');
    if (idx >= 0) {
      if (!beginAnnotation(`${path}:${clueIds.join(',')}:${labels.join('|')}:${idx}`)) return;
      markWin(choiceBtns[idx], '✓ Réponse');
    }
    return;
  }

  if (path.startsWith('/jouer/main-du-jour') || path.startsWith('/jouer/main-kyara')) {
    const { cards, slots } = parseHandSlotsDom();
    if (!cards.length) return;
    const enriched = cards.map((card, i) => {
      const id = extractCardIdFromUrl(slots[i]?.querySelector<HTMLImageElement>('img[src*="/cards/"]')?.src);
      const entry = id !== null ? (catalog?.get(id) as any) : null;
      const rawPow = entry?.pow ?? entry?.power;
      return Number.isFinite(Number(rawPow)) ? { ...card, pow: Number(rawPow) } : card;
    });
    const isMainKyara = path.startsWith('/jouer/main-kyara');
    const decision = isMainKyara ? decideMainKyaraAction(enriched, parseMainKyaraHud()) : null;
    const best = decision ? decision.indices : chooseBestDailyHandIndices(enriched);
    const label = decision?.action === 'discard' ? '↺ Défausser' : '★ Combo';
    const sig = `${path}:${enriched.map((c) => `${c.name}-${c.rarity}-${c.pow ?? ''}`).join('|')}:${label}:${best.join(',')}`;
    if (!beginAnnotation(sig)) return;
    best.forEach((idx) => { if (slots[idx]) markWin(slots[idx], label); });
    return;
  }

  if (path.startsWith('/jouer/raid-du-jour') || path.startsWith('/jouer/raid')) {
    const poolBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.arena .draft .pool button.pick, main .pool button.pick'));
    if (poolBtns.length > 0) {
      const best = chooseBestRaidTeamIndices(parseRaidPoolCards(poolBtns), 5);
      if (!beginAnnotation(`${path}:pool:${poolBtns.length}:${best.join(',')}`)) return;
      best.forEach((idx, pos) => { if (poolBtns[idx]) markWin(poolBtns[idx], `⚔ Raid #${pos + 1}`); });
      return;
    }
    const perkBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('main button.perk:not(:disabled), .arena button.perk:not(:disabled)'));
    if (perkBtns.length > 0) {
      if (!beginAnnotation(`${path}:perks:${perkBtns.map((b) => readCleanText(b)).join('|')}`)) return;
      perkBtns.forEach((b) => markWin(b, '★ Bonus'));
      return;
    }
    if (lastSig.startsWith(`${path}:`)) {
      clearPreviousHints();
      lastSig = '';
    }
    return;
  }

  if (path.startsWith('/jouer/expedition')) {
    const picker = document.querySelector('.picker');
    if (picker) {
      const cardBtns = Array.from(picker.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
        (b) => !b.closest(`.foot, .pk-head, .tabs, ${KM_IGNORE_SEL}`) && b.getAttribute('aria-pressed') !== 'true' && Boolean(b.querySelector('.tcg.pf, .pf-name, img'))
      );
      if (cardBtns.length > 0) {
        const best = chooseBestRaidTeamIndices(parseRaidPoolCards(cardBtns), 5);
        if (!beginAnnotation(`${path}:picker:${cardBtns.length}:${best.join(',')}`)) return;
        best.forEach((idx) => {
          if (cardBtns[idx]) markWin(cardBtns[idx], '⚔ Équipe');
        });
        return;
      }
    }

    const mapNodes = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.path.wide button, .arena .screen .map button')
    ).filter((b) => !b.closest(`.tabs, ${KM_IGNORE_SEL}`) && !/Pick the team|Choisir l'équipe/i.test(b.textContent || ''));
    if (mapNodes.length > 0) {
      const nodes = mapNodes.map((b) => ({
        label: (b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || b.textContent || '').trim(),
        selectable: !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !/\b(locked|done|visited)\b/i.test(b.className)
      }));
      const idx = pickExpeditionNextIndex(nodes);
      if (idx >= 0) {
        if (!beginAnnotation(`${path}:map:${nodes.map((n) => `${n.label}${n.selectable ? 1 : 0}`).join('|')}:${idx}`)) return;
        markWin(mapNodes[idx], '★ Recommandé');
      }
      return;
    }

    const actionBtn = findButtonByText(
      document.querySelector('.arena') || document,
      /^(Pick the team|Choisir l'équipe|Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?|Claim|Récupérer|Heal|Soigner|Continue|Continuer)$/i
    );
    if (actionBtn && beginAnnotation(`${path}:act:${actionBtn.textContent}`)) {
      markWin(actionBtn, '▶ Action');
    }
    return;
  }

  if (path.startsWith('/jouer/trois-arcs')) {
    const { arcs, lines } = extractThreeArcsState();
    const kyaraBtn = document.querySelector<HTMLButtonElement>('.who.me-who .acts button.btn-acc.kyara:not(:disabled)');
    if (arcs.length > 0) {
      const bestLine = pickThreeArcsLineIndex(lines);
      const sig = `${path}:${lines.map((l) => `${l.myPower}/${l.oppPower}/${l.openSlots}`).join('|')}:k${kyaraBtn ? 1 : 0}:${bestLine}`;
      if (!beginAnnotation(sig)) return;
      if (bestLine >= 0 && arcs[bestLine]) {
        const target = arcs[bestLine].querySelector<HTMLElement>('button.side.me:not(:disabled)') || arcs[bestLine];
        markWin(target, `★ Ligne ${bestLine + 1}`);
      }
      if (kyaraBtn) markWin(kyaraBtn, '⚡ Kyara !');
      return;
    }
    const modeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.gi .modes.stack button:not(:disabled)'));
    const aiBtn =
      modeBtns.find((b) => /Against the computer|Contre l'ordinateur|VS AI|Contre l'IA|Bot/i.test(b.innerText || b.textContent || '')) ||
      modeBtns.find((b) => /Learn to play|Apprendre|Tutoriel|Tutorial/i.test(b.innerText || b.textContent || ''));
    if (aiBtn && beginAnnotation(`${path}:mode:${aiBtn.textContent}`)) {
      markWin(aiBtn, '▶ Solo IA');
    }
    return;
  }

  if (path.startsWith('/jouer/blind-test')) {
    const { choiceBtns, hintText } = extractBlindTestDom(catalog || new Map());
    if (!choiceBtns.length) return;
    const labels = choiceBtns.map((b) => readCleanText(b));
    const match = findBlindTestMatch(hintText, labels, catalog || undefined);
    if (match.confident && choiceBtns[match.index] && beginAnnotation(`${path}:${hintText}:${labels.join('|')}:${match.index}`)) {
      markWin(choiceBtns[match.index], '♪ Réponse');
    }
    return;
  }

  if (path.startsWith('/jouer/memoire')) {
    let tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main div.grid button.tile'));
    if (!tiles.length) tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('main .felt button'));
    if (tiles.length < 4) {
      if (memoryNotes.size > 0) { memoryNotes.clear(); clearPreviousHints(); }
      return;
    }
    const hasUpOrFound = tiles.some((t) => t.classList.contains('up') || t.classList.contains('found'));
    if (!hasUpOrFound && memoryNotes.size > 0) { memoryNotes.clear(); clearPreviousHints(); }
    const seenKeys = new Map<string, number>();
    let nextPairNum = 1;
    tiles.forEach((tile, idx) => {
      const front = tile.querySelector('.face.front');
      const img = (front || tile).querySelector<HTMLImageElement>('img[src*="/cards/"]');
      const cardId = extractCardIdFromUrl(img?.src);
      if (cardId !== null) memoryNotes.set(idx, `id:${cardId}`);
      const remembered = memoryNotes.get(idx);
      if (remembered && !seenKeys.has(remembered)) seenKeys.set(remembered, nextPairNum++);
      const existingBadge = tile.querySelector(`.${HINT_CLASS}`);
      const canBadge = Boolean(remembered) && !tile.classList.contains('found') && !tile.classList.contains('up') && !tile.disabled;
      if (canBadge && remembered) {
        const label = `#${seenKeys.get(remembered)}`;
        if (!existingBadge) tile.appendChild(createHintBadge(label, 'win'));
        else if (existingBadge.textContent !== label) existingBadge.textContent = label;
      } else if (existingBadge) {
        existingBadge.remove();
      }
    });
  }
}
