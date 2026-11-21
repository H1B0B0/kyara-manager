import type { Rarity } from '../../types/kyara';

export interface DailyHandCard {
  name: string;
  series: string;
  family: string;
  rarity: Rarity;
}

const RARITY_ORDER: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, L: 5, M: 6 };

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function extractCardIdFromUrl(url: string | null | undefined): number | null {
  if (!url || typeof url !== 'string') return null;
  const cardMatch = url.match(/\/cards\/(?:sm|md|lg)?\/?(\d+)\.(?:webp|png|jpe?g)/i);
  if (cardMatch) return Number(cardMatch[1]);
  const wikiMatch = url.match(/\/wiki\/(\d+)/);
  if (wikiMatch) return Number(wikiMatch[1]);
  return null;
}

function findByCatalog(
  id: number | null,
  nameHint: string | null | undefined,
  catalogById: Map<number, any> | null | undefined
): any | null {
  if (!catalogById) return null;
  if (id && catalogById.has(id)) return catalogById.get(id);
  const norm = normalizeText(nameHint);
  if (!norm) return null;
  for (const ch of catalogById.values()) {
    if (normalizeText(ch?.name) === norm) return ch;
  }
  return null;
}

/**
 * In `/jouer/plus-aime`, Kyara compares favorites count between two same-rarity cards.
 * Lower catalog `rank` (#1 = most favorited overall) corresponds directly to more fans.
 */
export function pickMostLovedWinner(
  cardIds: Array<number | null>,
  nameHints: string[],
  catalogById: Map<number, any> | null | undefined
): { winnerIndex: number; ranks: Array<number | null> } {
  const ranks = cardIds.map((id, idx) => {
    const ch = findByCatalog(id, nameHints[idx], catalogById);
    const r = Number(ch?.rank);
    return Number.isFinite(r) && r > 0 ? r : null;
  });

  let bestIdx = 0;
  let bestRank = Infinity;
  let anyKnown = false;
  for (let i = 0; i < ranks.length; i += 1) {
    const r = ranks[i];
    if (r !== null && r < bestRank) {
      bestRank = r;
      bestIdx = i;
      anyKnown = true;
    }
  }
  return { winnerIndex: anyKnown ? bestIdx : 0, ranks };
}

/**
 * Matches clue character card IDs to one of the answer buttons in `/jouer/qui-est-ce`
 * (`mode === 'character'`) or `/jouer/serie-express` (`mode === 'series'`).
 */
export function matchCharacterChoice(
  clueIds: number[],
  choices: string[],
  catalogById: Map<number, any> | null | undefined,
  mode: 'character' | 'series'
): number {
  if (!catalogById || !choices.length || !clueIds.length) return -1;
  const targets = new Map<string, number>();
  for (const id of clueIds) {
    const ch = catalogById.get(id);
    if (!ch) continue;
    const raw = mode === 'series' ? ch.series : ch.name;
    const norm = normalizeText(raw);
    if (norm) targets.set(norm, (targets.get(norm) || 0) + 1);
  }
  if (!targets.size) return -1;

  let bestChoiceIdx = -1;
  let bestScore = 0;
  choices.forEach((choice, idx) => {
    const normChoice = normalizeText(choice);
    if (!normChoice) return;
    for (const [target, count] of targets.entries()) {
      const exact = normChoice === target ? 10 : 0;
      const partial = !exact && (normChoice.includes(target) || target.includes(normChoice)) ? 4 : 0;
      const score = (exact || partial) * count;
      if (score > bestScore) {
        bestScore = score;
        bestChoiceIdx = idx;
      }
    }
  });
  return bestChoiceIdx;
}

function scoreDailySubset(cards: DailyHandCard[]): number {
  const n = cards.length;
  if (n === 0) return -1;
  const seriesCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  const rarityCounts = new Map<Rarity, number>();
  let raritySum = 0;

  for (const c of cards) {
    const s = normalizeText(c.series);
    const f = normalizeText(c.family);
    if (s) seriesCounts.set(s, (seriesCounts.get(s) || 0) + 1);
    if (f) familyCounts.set(f, (familyCounts.get(f) || 0) + 1);
    rarityCounts.set(c.rarity, (rarityCounts.get(c.rarity) || 0) + 1);
    raritySum += RARITY_ORDER[c.rarity] || 1;
  }

  const maxSeries = Math.max(0, ...seriesCounts.values());
  const maxFamily = Math.max(0, ...familyCounts.values());
  const rGroups = Array.from(rarityCounts.values()).sort((a, b) => b - a);
  const topR = rGroups[0] || 0;
  const secondR = rGroups[1] || 0;

  let comboScore = 0;
  if (maxSeries >= 5) comboScore += 900;
  else if (maxSeries === 4) comboScore += 550;
  else if (maxSeries === 3) comboScore += 240;

  if (maxFamily >= 5) comboScore += 500;
  else if (maxFamily === 4) comboScore += 220;

  if (topR >= 5) comboScore += 750;
  else if (topR === 4) comboScore += 620;
  else if (topR === 3 && secondR === 2) comboScore += 480;
  else if (topR === 3) comboScore += 280;
  else if (topR === 2 && secondR === 2) comboScore += 180;
  else if (topR === 2) comboScore += 80;

  const sortedRanks = cards.map((c) => RARITY_ORDER[c.rarity] || 1).sort((a, b) => a - b);
  const isStraight =
    n === 5 &&
    sortedRanks.every((v, idx) => idx === 0 || v === sortedRanks[idx - 1] + 1);
  if (isStraight) comboScore += maxFamily >= 5 ? 600 : 340;

  return comboScore + raritySum;
}

/**
 * Finds the highest-synergy 1..5 card combination out of an 8-card `/jouer/main-du-jour` hand.
 */
export function chooseBestDailyHandIndices(cards: DailyHandCard[]): number[] {
  const n = Math.min(cards.length, 8);
  if (n === 0) return [];
  let bestIndices: number[] = [0];
  let bestScore = -1;

  for (let mask = 1; mask < 1 << n; mask += 1) {
    let bits = 0;
    const subset: DailyHandCard[] = [];
    const idxs: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        bits += 1;
        if (bits > 5) break;
        subset.push(cards[i]);
        idxs.push(i);
      }
    }
    if (bits > 5) continue;
    const score = scoreDailySubset(subset);
    if (score > bestScore) {
      bestScore = score;
      bestIndices = idxs;
    }
  }
  return bestIndices;
}

export function shouldHitKyara21(handSum: number, softMythicCount = 0): boolean {
  if (softMythicCount > 0 && handSum <= 17) return true;
  return handSum < 17;
}

const LOT_PRIORITY = ['sceau-mythique', 'legendaire', 'dores-3', 'boosters-5'];

export function recommendArcadeLot(balance: number, lots: any[]): any | null {
  if (!Array.isArray(lots) || !lots.length) return null;
  const available = lots.filter((l) => l && typeof l.price === 'number' && !l.soldOut && (l.left === undefined || l.left === null || l.left > 0));
  const candidates = available.filter((l) => LOT_PRIORITY.includes(String(l.id)) || l.kind === 'pack' || l.kind === 'golden' || l.kind === 'boosters');
  const pool = candidates.length ? candidates : available;

  const affordable = pool.filter((l) => balance >= Number(l.price));
  const sortList = (arr: any[]) =>
    [...arr].sort((a, b) => {
      const ia = LOT_PRIORITY.indexOf(String(a.id));
      const ib = LOT_PRIORITY.indexOf(String(b.id));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return (b.price || 0) - (a.price || 0);
    });

  if (affordable.length > 0) return sortList(affordable)[0];
  return sortList(pool).find((l) => l.id === 'boosters-5' || l.id === 'legendaire') || pool[0] || null;
}
