/**
 * Which mini-game a checkpoint or card plays, how hard it is, and what score
 * wins it. Pure data and functions — no DOM — so the multiplayer server can
 * judge results with exactly the same numbers the browser shows.
 */

import { rivalsFor } from '../../engine/reducer.ts';
import type { GameState, MinigameResult } from '../../engine/types.ts';

export type Difficulty = 0 | 1 | 2;

export type GameTheme = {
  /** Heading shown on the intro, e.g. "Momo Eating Contest". */
  title?: string;
  /** catch: what to catch, what to dodge, and what catches. */
  good?: string[];
  bad?: string[];
  catcher?: string;
  /** snapshot: the subject that moves around. */
  subject?: string;
  /** climb: the climber and the goal. */
  climber?: string;
  goal?: string;
  /** flags: label for the sequence (flags, dance steps, lamps). */
  steps?: string;
};

/** Score needed to pass each game at easy / medium / hard. */
export const GAME_TARGETS: Record<string, [number, number, number]> = {
  gate: [110, 145, 180],
  climb: [26, 32, 38],
  catch: [8, 11, 14],
  snapshot: [120, 165, 205],
  flags: [4, 5, 6],
  match: [50, 60, 66],
  quiz: [200, 230, 300],
  stack: [6, 9, 12],
  swing: [40, 55, 70],
  lamps: [14, 20, 26],
};

export const GAME_TITLES: Record<string, string> = {
  gate: 'Checkpoint Stamp',
  climb: 'Summit Sprint',
  catch: 'Catch!',
  snapshot: 'Snapshot',
  flags: 'Prayer Flag Memory',
  match: 'Pair Up',
  quiz: "Guide's Quiz",
  stack: 'Momo Tower',
  swing: 'Dashain Ping',
  lamps: 'Tihar Diyo',
};

export type Pick = { game: string; theme?: GameTheme };

/** Which game each card plays — themed to what the card is about. */
const BY_CARD: Record<string, Pick> = {
  // Travel & Tour — played solo against the card's target.
  'nm-tour-guide': { game: 'quiz' },
  'cht-tour-jeepsafari': { game: 'snapshot', theme: { subject: '🦏' } },
  'lum-tour-cycle': { game: 'catch', theme: { good: ['🪷', '🌸'], bad: ['🪨'], catcher: '🚲', title: 'Cycle the Sacred Garden' } },
  'pok-tour-paragliding': { game: 'catch', theme: { good: ['🎈', '☁️'], bad: ['🦅'], catcher: '🪂', title: 'Ride the thermals' } },
  'pok-tour-boating': { game: 'gate', theme: { title: 'Row in time' } },
  'him-tour-homestay': { game: 'match' },
  'eas-tour-teapick': { game: 'catch', theme: { good: ['🍃', '🌿'], bad: ['🐛'], catcher: '🧺', title: 'Pick the two leaves and a bud' } },
  'mtn-tour-sherpaguide': { game: 'climb', theme: { climber: '🧗', goal: '🏔️' } },
  'whl-tour-cave': { game: 'flags', theme: { steps: 'lamps', title: "Follow the guide's lamp" } },
  'wtr-tour-tigertrack': { game: 'snapshot', theme: { subject: '🐅' } },
  'wtr-tour-rafting': { game: 'catch', theme: { good: ['🛟', '⭐'], bad: ['🪨'], catcher: '🚣', title: 'Run the rapids' } },

  // Duels — every player plays the same round; the best score wins.
  'nm-duel-momo': { game: 'catch', theme: { good: ['🥟'], bad: ['🌶️'], catcher: '🍽️' } },
  'cht-duel-birdcount': { game: 'snapshot', theme: { subject: '🦜' } },
  'eas-duel-chhurpi': { game: 'climb', theme: { climber: '😬', goal: '🧀', title: 'Chew, chew, chew!' } },
  'him-duel-teahouse': { game: 'climb', theme: { climber: '🥾', goal: '🍵' } },
  'lum-duel-meditation': { game: 'flags', theme: { steps: 'breaths', title: 'Breathe with the bells' } },
  'mtn-duel-summitrace': { game: 'climb', theme: { climber: '🧗', goal: '🚩' } },
  'whl-duel-ridge': { game: 'gate', theme: { title: 'Keep your footing' } },
  'pok-duel-zipline': { game: 'gate', theme: { title: 'Time the drop' } },
  'wtr-duel-maghi': { game: 'flags', theme: { steps: 'steps', title: 'Follow the dance' } },
};

export function pickFor(state: GameState): Pick {
  const pending = state.pendingMinigame!;
  if (pending.source === 'checkpoint') return { game: 'gate' };
  const card = pending.cardId ? state.cards[pending.cardId] : undefined;
  if (card && BY_CARD[card.id]) return BY_CARD[card.id];
  if (card?.category === 'travel-tour') return { game: 'quiz' };
  return { game: 'climb' };
}

/** The card's dice target (4–6) becomes an easy / medium / hard game. */
export function difficultyFor(state: GameState): Difficulty {
  const target = state.pendingMinigame?.spec.target ?? 5;
  return Math.max(0, Math.min(2, target - 4)) as Difficulty;
}

/** Everyone who plays this round: the active traveler first, then any rivals. */
export function participantsFor(state: GameState): number[] {
  const pending = state.pendingMinigame;
  if (!pending) return [];
  const me = state.players[state.currentPlayerIndex];
  return [me.id, ...rivalsFor(state, pending.spec).map((p) => p.id)];
}

/**
 * A computer traveler's score: somewhere either side of the bar, so it wins
 * about half the time and a sharp human beats it more often than not.
 */
export function botScore(game: string, difficulty: Difficulty, seed: number): number {
  const target = GAME_TARGETS[game]?.[difficulty] ?? 10;
  let s = (seed * 2654435761) >>> 0 || 1;
  s = (s * 1664525 + 1013904223) >>> 0;
  const r = s / 4294967296;
  return Math.max(0, Math.round(target * (0.62 + r * 0.6)));
}

/** Turn the scores people posted into the result the reducer takes. */
export function judge(state: GameState, scores: Map<number, number>): MinigameResult {
  const pick = pickFor(state);
  const difficulty = difficultyFor(state);
  const [me, ...rivals] = participantsFor(state);
  const score = scores.get(me) ?? 0;
  const duel = rivals.length > 0;
  const target = GAME_TARGETS[pick.game][difficulty];
  return {
    game: GAME_TITLES[pick.game],
    score,
    passed: duel ? rivals.every((r) => score >= (scores.get(r) ?? 0)) : score >= target,
    target: duel ? undefined : target,
    rivals: rivals.map((playerId) => ({ playerId, score: scores.get(playerId) ?? 0 })),
  };
}
