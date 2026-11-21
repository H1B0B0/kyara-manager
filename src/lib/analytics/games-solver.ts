import type { Rarity } from '../../types/kyara';

export const DAILY_GAMES = ['main-du-jour', 'raid-du-jour'] as const;

export const ALL_PLAYABLE_GAMES = [
  'plus-aime',
  'qui-est-ce',
  'serie-express',
  'memoire',
  'kyara-21',
  'main-kyara',
  'raid',
  'expedition',
  'trois-arcs',
  'blind-test'
] as const;

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

const RAID_RARITY_WEIGHT: Record<Rarity, number> = { C: 10, U: 20, R: 32, E: 48, L: 70, M: 100 };

/**
 * Picks up to `maxTeam` cards maximizing combat power `(attack * 2 + health / 5 + rarityWeight)`
 * plus series synergy bonuses for `/jouer/raid` and `/jouer/raid-du-jour`.
 */
export function chooseBestRaidTeamIndices(
  cards: Array<{ attack?: number; health?: number; rarity?: Rarity; series?: string }>,
  maxTeam = 5
): number[] {
  if (!Array.isArray(cards) || !cards.length || maxTeam <= 0) return [];
  const targetCount = Math.min(maxTeam, cards.length);
  const poolSeries = new Map<string, number>();
  const normSeriesList = cards.map((c) => {
    const s = normalizeText(c?.series);
    if (s) poolSeries.set(s, (poolSeries.get(s) || 0) + 1);
    return s;
  });

  const chosen = new Set<number>();
  const pickedSeries = new Map<string, number>();

  for (let step = 0; step < targetCount; step += 1) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < cards.length; i += 1) {
      if (chosen.has(i)) continue;
      const c = cards[i] || {};
      const base =
        (Number(c.attack) || 0) * 2 +
        (Number(c.health) || 0) / 5 +
        (RAID_RARITY_WEIGHT[c.rarity || 'C'] || 10);
      const s = normSeriesList[i];
      const alreadyPicked = s ? pickedSeries.get(s) || 0 : 0;
      const remainingSame = s ? Math.max(0, (poolSeries.get(s) || 0) - alreadyPicked - 1) : 0;
      const synergy = alreadyPicked * 24 + Math.min(remainingSame, targetCount - step - 1) * 6;
      const total = base + synergy;
      if (total > bestScore) {
        bestScore = total;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    chosen.add(bestIdx);
    const s = normSeriesList[bestIdx];
    if (s) pickedSeries.set(s, (pickedSeries.get(s) || 0) + 1);
  }

  return Array.from(chosen).sort((a, b) => a - b);
}

function scoreBlindTestChoice(normTarget: string, normChoice: string): number {
  if (!normTarget || !normChoice) return 0;
  if (normChoice === normTarget) return 120;
  if (normChoice.length >= 2 && normTarget.includes(normChoice)) return 70 + normChoice.length;
  if (normTarget.length >= 3 && normChoice.includes(normTarget)) return 50 + normTarget.length;
  const targetTokens = new Set(normTarget.split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
  const choiceTokens = normChoice.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!targetTokens.size || !choiceTokens.length) return 0;
  let shared = 0;
  for (const tok of choiceTokens) {
    if (targetTokens.has(tok)) shared += 1;
  }
  return shared > 0 ? shared * 18 : 0;
}

/**
 * Matches an anime/series clue in `/jouer/blind-test`, reporting confidence and falling back to index `0`.
 */
export function findBlindTestMatch(
  hintText: string,
  choices: string[],
  catalogById?: Map<number, any>
): { index: number; confident: boolean } {
  if (!Array.isArray(choices) || !choices.length) return { index: -1, confident: false };
  const normHint = normalizeText(hintText);
  if (!normHint) return { index: 0, confident: false };

  let bestIdx = 0;
  let bestScore = 0;
  const normChoices = choices.map((c) => normalizeText(c));

  normChoices.forEach((normChoice, idx) => {
    const score = scoreBlindTestChoice(normHint, normChoice);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  if (bestScore < 70 && catalogById && normHint.length >= 3) {
    const derivedSeries = new Set<string>();
    for (const ch of catalogById.values()) {
      const cName = normalizeText(ch?.name);
      const cSeries = normalizeText(ch?.series);
      if (!cSeries) continue;
      if ((cName && cName.length >= 3 && normHint.includes(cName)) || (cSeries.length >= 3 && normHint.includes(cSeries))) {
        derivedSeries.add(cSeries);
      }
    }
    for (const series of derivedSeries) {
      normChoices.forEach((normChoice, idx) => {
        const score = scoreBlindTestChoice(series, normChoice);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
    }
  }

  return bestScore > 0 ? { index: bestIdx, confident: true } : { index: 0, confident: false };
}

export function matchBlindTestChoice(hintText: string, choices: string[], catalogById?: Map<number, any>): number {
  return findBlindTestMatch(hintText, choices, catalogById).index;
}

/**
 * Selects the optimal open arc (lane 0..2) in `/jouer/trois-arcs`, prioritizing winning 2 of 3 lanes.
 */
export function pickThreeArcsLineIndex(
  lines: Array<{ myPower: number; oppPower: number; openSlots: number }>
): number {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const alreadyWinning = lines.filter((l) => l.myPower > l.oppPower).length;
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.openSlots <= 0) continue;
    const diff = line.myPower - line.oppPower;
    let score: number;

    if (alreadyWinning < 2) {
      score = diff <= 0 ? 1000 - Math.abs(diff) * 10 + line.openSlots : 500 - diff * 5 + line.openSlots;
    } else if (diff > 0 && diff <= 25) {
      score = 950 - diff * 5 + line.openSlots;
    } else if (diff <= 0 && diff >= -15) {
      score = 720 + diff * 10 + line.openSlots;
    } else if (diff > 0) {
      score = 650 - diff + line.openSlots;
    } else {
      score = 300 + diff + line.openSlots;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Selects the best next selectable node in `/jouer/expedition` (chest > heal > shop/event > combat > boss).
 */
export function pickExpeditionNextIndex(nodes: Array<{ label: string; selectable: boolean }>): number {
  if (!Array.isArray(nodes) || !nodes.length) return -1;
  let bestIdx = -1;
  let bestWeight = -1;

  nodes.forEach((node, idx) => {
    if (!node?.selectable) return;
    const label = normalizeText(node.label);
    let weight = 10;
    if (/(coffre|tresor|chest|treasure|loot|recompense|reward|relique|relic)/.test(label)) weight = 100;
    else if (/(soin|heal|camp|repos|rest|sanctuaire|shrine|fontaine|fountain)/.test(label)) weight = 85;
    else if (/(boutique|shop|marchand|merchant|store|evenement|event|mystere|mystery)/.test(label)) weight = 65;
    else if (/(elite)/.test(label)) weight = 45;
    else if (/(combat|fight|battle|duel|ennemi|enemy|monstre|mob)/.test(label)) weight = 50;
    else if (/(boss|gardien|guardian|final)/.test(label)) weight = 30;

    if (weight > bestWeight) {
      bestWeight = weight;
      bestIdx = idx;
    }
  });
  return bestIdx;
}
