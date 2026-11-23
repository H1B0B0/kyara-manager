import type { Rarity } from '../../types/kyara';
import { isInterrupted } from '../safety';
import { sleep } from '../utils';

export const KM_IGNORE_SEL = '#km-inpage-games-bar, .km-inpage-bar, #km-floating-hud, #km-cockpit-overlay';
export const ADVANCE_IGNORE_SEL = `${KM_IGNORE_SEL}, .play-tool, .tabs, .sh`;

export const START_MODE_RE = /^(?:Play solo|Jouer solo|Jouer en solo)\b/i;

export const REPLAY_BTN_RE =
  /^(?:Play again|Rejouer|Try again|R[eé]essayer|New game|Nouvelle partie|New expedition|Nouvelle exp[eé]dition|Nouvelle [eé]quipe|Rejouer pour t'entra[iî]ner|Rejouer le chapitre|Rematch|Revanche|Quitter la table|Jouer [aà] Main Kyara|Play Kyara Hand)$/i;

export const NEXT_BTN_RE =
  /^(?:Suivant(?:e)?|Suite|Continuer|Voir le r[eé]sultat|Question suivante|Manche suivante|Main suivante|Tour suivant|Vague suivante|[EÉ]tape suivante|Combattre|Affronter le boss|Entrer dans la boutique|Ouvrir le tr[eé]sor|Reprendre la route|Attaquer|Valider|Confirmer(?:\s+l'[eé]quipe)?|Valider\s+l'[eé]quipe|Terminer(?:\s*[×x]\d+)?|Finir|Fin|Encaisser|R[eé]cup[eé]rer|R[eé]clamer|Collecter|Distribuer|Next(?:\s+(?:question|round|hand|turn|wave|step|stage))?|Continue|See the result|Proceed|Advance|Submit|Confirm(?:\s+the\s+team)?|Validate|Fight|Finish(?:\s*[×x]\d+)?|Done|Claim|Collect|Deal)(?:\s*[→➜›»>▶].*)?$/i;

export const ADVANCE_EXCLUDE_RE =
  /\b(?:discord|copier|copy|partager|share|classement|leaderboard|ranking|r[eè]gles|rules|son|sound|audio|mute|d[eé]fausser|discard|abandonner|forfeit|se retirer|retreat|retour|back)\b/i;

const DISCORD_GATE_RE = /discord|403|lie.*discord|connect.*discord|toutes tes parties du jour|guest_games/i;
const GUEST_LIMIT_RE = /toutes tes parties du jour|guest_games/i;

let fastForTestMode = false;

export function setGamesFastModeForTest(fast: boolean): void {
  fastForTestMode = fast;
}

export function isGamesFastModeForTest(): boolean {
  return fastForTestMode;
}

export function safeInterrupted(): boolean {
  try {
    return isInterrupted();
  } catch {
    return false;
  }
}

export async function humanSleep(minMs: number, maxMs = minMs): Promise<void> {
  if (fastForTestMode || safeInterrupted()) return;
  const lo = Math.max(0, minMs);
  const hi = Math.max(lo, maxMs);
  const targetMs = Math.round(lo + ((Math.random() + Math.random()) / 2) * (hi - lo));
  const deadline = Date.now() + targetMs;
  while (!safeInterrupted()) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(left, 250));
  }
}

function collectCleanText(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    if (node.nodeValue) out.push(node.nodeValue);
    return;
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (el.classList?.contains('km-game-hint') || el.hasAttribute('data-km-ignore')) return;
    if (el.tagName === 'BR') {
      out.push(' ');
      return;
    }
    for (let child = el.firstChild; child; child = child.nextSibling) {
      collectCleanText(child, out);
    }
  }
}

export function cleanBtnText(el: Element): string {
  const parts: string[] = [];
  collectCleanText(el, parts);
  return parts.join('').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isElementVisible(el: Element | null, ignoreSelector = KM_IGNORE_SEL): boolean {
  if (!el || el.closest(ignoreSelector)) return false;
  if ((el as HTMLElement).hidden || el.closest('[hidden]')) return false;
  const htmlEl = el as HTMLElement;
  if (htmlEl.style?.display === 'none' || htmlEl.style?.visibility === 'hidden') return false;
  try {
    if (typeof getComputedStyle === 'function') {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  } catch {}
  return true;
}

export function isButtonUsable(btn: HTMLButtonElement | null, ignoreSelector = KM_IGNORE_SEL): boolean {
  if (!btn) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  return isElementVisible(btn, ignoreSelector);
}

export function findButtonByText(root: ParentNode, re: RegExp, ignoreSelector = KM_IGNORE_SEL): HTMLButtonElement | null {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  return (
    Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(
      (b) => isButtonUsable(b, ignoreSelector) && re.test(cleanBtnText(b))
    ) || null
  );
}

export function hasDiscordGate(): boolean {
  if (typeof document === 'undefined') return false;
  const gateNodes = document.querySelectorAll(
    'main .wait .ko, main .err, .extra p.err, main p.err, main .gate, main .guest-gate, main .locked, main [role="alert"]'
  );
  if (Array.from(gateNodes).some((el) => !el.closest(KM_IGNORE_SEL) && DISCORD_GATE_RE.test(el.textContent || ''))) {
    return true;
  }
  const main = document.querySelector('main');
  return Boolean(main && GUEST_LIMIT_RE.test(main.textContent || ''));
}

export async function waitForEnabledButton(
  finder: () => HTMLButtonElement | null,
  timeoutMs = 2800
): Promise<HTMLButtonElement | null> {
  const deadline = Date.now() + (fastForTestMode ? 0 : timeoutMs);
  while (true) {
    const btn = finder();
    if (btn && isButtonUsable(btn)) return btn;
    if (fastForTestMode || safeInterrupted() || Date.now() >= deadline) return null;
    await sleep(90);
  }
}

export function findAdvanceOrNextButton(root?: ParentNode): HTMLButtonElement | null {
  const scope = root ?? (typeof document !== 'undefined' ? document.querySelector('main') || document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;

  const usable = Array.from(scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter((b) =>
    isButtonUsable(b, ADVANCE_IGNORE_SEL)
  );
  const labeled = usable.filter((b) => {
    const txt = cleanBtnText(b);
    return (
      Boolean(txt) &&
      !REPLAY_BTN_RE.test(txt) &&
      !START_MODE_RE.test(txt) &&
      !ADVANCE_EXCLUDE_RE.test(txt) &&
      NEXT_BTN_RE.test(txt)
    );
  });
  if (labeled.length > 0) {
    return labeled.find((b) => Boolean(b.closest('.arena, .foot .actions, .extra, .actions'))) || labeled[0];
  }

  const containers = Array.from(scope.querySelectorAll<HTMLElement>('.arena, .foot .actions, .extra, .actions'));
  for (const box of containers.length ? containers : [scope]) {
    const match = Array.from(
      box.querySelectorAll<HTMLButtonElement>('.btn.btn-acc:not(:disabled), button.next:not(:disabled)')
    ).find((b) => {
      if (!isButtonUsable(b, ADVANCE_IGNORE_SEL) || b.classList.contains('mode') || b.closest('.modes, .hand, .pool, .picker')) {
        return false;
      }
      if (b.getAttribute('role') === 'tab' || b.querySelector('.tcg.pf, .pf-name')) return false;
      const txt = cleanBtnText(b);
      if (!txt) return b.classList.contains('next');
      if (REPLAY_BTN_RE.test(txt) || START_MODE_RE.test(txt) || ADVANCE_EXCLUDE_RE.test(txt)) return false;
      return !/^(?:Play|Jouer|Discard|D[eé]fausser|Hit|Tirer|Carte|Stand|Rester|Stopper)\b/i.test(txt);
    });
    if (match) return match;
  }
  return null;
}

export async function clickAdvanceOrNextButton(
  root?: ParentNode,
  minMs = 700,
  maxMs = 1300
): Promise<boolean> {
  const initial = findAdvanceOrNextButton(root);
  if (!initial) return false;
  if (minMs > 0) await humanSleep(minMs, maxMs);
  if (safeInterrupted()) return false;
  const btn = minMs > 0 ? findAdvanceOrNextButton(root) : initial;
  if (!btn || !isButtonUsable(btn, ADVANCE_IGNORE_SEL)) return false;
  btn.click();
  await humanSleep(650, 1100);
  return true;
}

export function isGameFinishedScreen(slug: string): boolean {
  if (typeof document === 'undefined') return false;
  const main = document.querySelector('main') || document;

  const hasActiveTiles = Array.from(main.querySelectorAll('button.tile')).some((el) => isElementVisible(el));
  const hasActiveSlots = Array.from(main.querySelectorAll('button.slot')).some((el) => isElementVisible(el));
  const hasActiveChoices = Array.from(main.querySelectorAll('div.choices button.choice')).some((el) => isElementVisible(el));
  const hasActiveDuel = Array.from(main.querySelectorAll('div.duel button.pick')).some((el) => isElementVisible(el));
  const hasActiveFeltActions = Array.from(main.querySelectorAll<HTMLButtonElement>('div.felt-in .actions button')).some(
    (b) => isElementVisible(b) && !REPLAY_BTN_RE.test(cleanBtnText(b))
  );
  const isFighting = Boolean(main.querySelector('.panel.game.fighting'));

  if (hasActiveTiles || hasActiveSlots || hasActiveChoices || hasActiveDuel || hasActiveFeltActions || isFighting) {
    return false;
  }

  const hasEndBox = Array.from(main.querySelectorAll('.box.end')).some((el) => isElementVisible(el));
  if (hasEndBox) return true;

  const hasShare = Array.from(main.querySelectorAll('.sh')).some((el) => isElementVisible(el));
  if (hasShare) return true;

  const replayBtn = findButtonByText(main, REPLAY_BTN_RE);
  if (!replayBtn) return false;

  if (slug === 'main-du-jour' && main.querySelector('button.slot')) {
    return false;
  }
  return true;
}

export function parseRarityFromCardEl(el: Element): Rarity {
  const rawSeal = el.querySelector('.pf-seal')?.textContent?.trim().toUpperCase() || '';
  if (['C', 'U', 'R', 'E', 'L', 'M'].includes(rawSeal)) return rawSeal as Rarity;
  const match = (el.querySelector('.tcg.pf')?.className || el.className || '').match(/\bp-([CURELM])\b/i);
  return (match ? match[1].toUpperCase() : 'C') as Rarity;
}
