import { runtimeCache } from './cache';
import { toggleCockpitOverlay } from './overlay';
import { navigateSpaTo } from './automation/spa-navigator';
import {
  chooseBestDailyHandIndices,
  chooseBestRaidTeamIndices,
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
  const existing = document.getElementById('km-inpage-games-bar');
  if (existing && main.firstElementChild === existing && existing.dataset.mini === (isMiniGame ? '1' : '0')) return;
  existing?.remove();

  const bar = document.createElement('section');
  bar.id = 'km-inpage-games-bar';
  bar.className = 'km-inpage-bar';
  bar.dataset.mini = isMiniGame ? '1' : '0';
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

function beginAnnotation(sig: string): boolean {
  if (sig && sig === lastSig && document.querySelector(`.${HINT_CLASS}, .km-slot-recommended`)) {
    return false;
  }
  lastSig = sig;
  clearPreviousHints();
  return true;
}

function markWin(el: HTMLElement, label: string): void {
  el.classList.add('km-slot-recommended');
  const badge = document.createElement('span');
  badge.className = `${HINT_CLASS} km-game-hint--win`;
  badge.textContent = label;
  el.appendChild(badge);
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
    const arena = document.querySelector('main .arena');
    if (!arena) return;
    const candidates = Array.from(arena.querySelectorAll<HTMLElement>('button, [role="button"]')).filter((el) =>
      Boolean(el.querySelector('img[src*="/cards/"]') || el.querySelector('.pf-name'))
    );
    if (candidates.length < 2) return;
    const ids = candidates.map((c) => extractCardIdFromUrl(c.querySelector<HTMLImageElement>('img')?.src));
    const names = candidates.map((c) => c.querySelector('.pf-name')?.textContent?.trim() || c.textContent?.trim() || '');
    const sig = `${path}:${ids.join(',')}:${names.join('|')}`;
    if (!beginAnnotation(sig)) return;
    const { winnerIndex, ranks } = pickMostLovedWinner(ids, names, catalog);
    candidates.forEach((card, idx) => {
      const rankLabel = ranks[idx] !== null ? `#${ranks[idx]}` : '#?';
      if (idx === winnerIndex) {
        markWin(card, `👑 ${rankLabel} Plus aimé`);
      } else {
        const badge = document.createElement('span');
        badge.className = `${HINT_CLASS} km-game-hint--lose`;
        badge.textContent = rankLabel;
        card.appendChild(badge);
      }
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
    const labels = choiceBtns.map((b) => (b.innerText || b.textContent || '').trim());
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
    const best = chooseBestDailyHandIndices(cards);
    const sig = `${path}:${cards.map((c) => `${c.name}-${c.rarity}`).join('|')}:${best.join(',')}`;
    if (!beginAnnotation(sig)) return;
    best.forEach((idx) => {
      if (slots[idx]) markWin(slots[idx], '★ Combo');
    });
    return;
  }

  if (path.startsWith('/jouer/raid-du-jour') || path.startsWith('/jouer/raid')) {
    const poolBtns = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.arena .draft .pool button.pick, main .pool button.pick')
    );
    if (poolBtns.length > 0) {
      const cards = parseRaidPoolCards(poolBtns);
      const best = chooseBestRaidTeamIndices(cards, 5);
      const sig = `${path}:pool:${poolBtns.length}:${best.join(',')}`;
      if (!beginAnnotation(sig)) return;
      best.forEach((idx, pos) => {
        if (poolBtns[idx]) markWin(poolBtns[idx], `⚔ Raid #${pos + 1}`);
      });
      return;
    }
    const finishBtn = findButtonByText(
      document.querySelector('.panel.game.fighting') || document,
      /^(Finish(?:\s*[×x]\d+)?|Terminer(?:\s*[×x]\d+)?)$/i
    );
    if (finishBtn && beginAnnotation(`${path}:fight:${finishBtn.textContent}`)) {
      markWin(finishBtn, '⚡ Terminer');
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
    const labels = choiceBtns.map((b) => (b.innerText || b.textContent || '').trim());
    const match = findBlindTestMatch(hintText, labels, catalog || undefined);
    if (match.confident && choiceBtns[match.index]) {
      if (!beginAnnotation(`${path}:${hintText}:${labels.join('|')}:${match.index}`)) return;
      markWin(choiceBtns[match.index], '♪ Réponse');
    }
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
      if (remembered && !seenKeys.has(remembered)) seenKeys.set(remembered, nextPairNum++);
      if (remembered && !sig && !tile.disabled && !tile.querySelector(`.${HINT_CLASS}`)) {
        const badge = document.createElement('span');
        badge.className = `${HINT_CLASS} km-game-hint--win`;
        badge.textContent = `#${seenKeys.get(remembered)}`;
        tile.appendChild(badge);
      }
    });
  }
}
