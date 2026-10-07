/**
 * The Chautari — the stone resting platform under a pipal tree where
 * travellers in Nepal stop, put their loads down and pass the time. Here it
 * is the friendly-games corner: any travelers can play each other between
 * turns. Winners get a medal, and medals are just for fun — they never count
 * toward the score or decide who wins the journey.
 *
 * This module is the shared catalogue and the public shape of a match. No
 * DOM: the server uses it too.
 */

import type { BaghMove, BaghState } from './baghchal.ts';

/**
 *  race      everyone plays the same round of a score game; best score wins
 *  baghchal  two players, tigers against goats, turn by turn
 *  tug       two players, tug of war, live
 */
export type FunKind = 'race' | 'baghchal' | 'tug';

export type FunGame = {
  id: string;
  kind: FunKind;
  title: string;
  icon: string;
  blurb: string;
  /** Fewest and most players. A race with one player is practice. */
  min: number;
  max: number;
  /** For a race: which score game, and how it's dressed. */
  play?: { game: string; theme?: Record<string, unknown> };
};

export const FUN_GAMES: FunGame[] = [
  {
    id: 'baghchal',
    kind: 'baghchal',
    title: 'Bagh-Chal',
    icon: '🐅',
    blurb: 'Nepal’s own board game. Four tigers hunt; twenty goats try to hem them in. Tigers win with five captures.',
    min: 2,
    max: 2,
  },
  {
    id: 'tug',
    kind: 'tug',
    title: 'Dori Tanne',
    icon: '🪢',
    blurb: 'Tug of war! Hammer your key faster than your rival and drag the rope over your line.',
    min: 2,
    max: 2,
  },
  {
    id: 'stack',
    kind: 'race',
    title: 'Momo Tower',
    icon: '🥟',
    blurb: 'Drop momos on the steamer and build the tallest tower before one topples.',
    min: 1,
    max: 4,
    play: { game: 'stack' },
  },
  {
    id: 'swing',
    kind: 'race',
    title: 'Dashain Ping',
    icon: '🎋',
    blurb: 'Pump the bamboo swing at just the right moment to soar highest at the Dashain fair.',
    min: 1,
    max: 4,
    play: { game: 'swing' },
  },
  {
    id: 'lamps',
    kind: 'race',
    title: 'Tihar Diyo',
    icon: '🪔',
    blurb: 'Keep the festival lamps burning — relight each diyo the moment it flickers out.',
    min: 1,
    max: 4,
    play: { game: 'lamps' },
  },
  {
    id: 'momo-catch',
    kind: 'race',
    title: 'Momo Rush',
    icon: '🍽️',
    blurb: 'Catch the falling momos on your plate — and dodge the chillies.',
    min: 1,
    max: 4,
    play: { game: 'catch', theme: { good: ['🥟'], bad: ['🌶️'], catcher: '🍽️', title: 'Momo Rush' } },
  },
  {
    id: 'climb',
    kind: 'race',
    title: 'Summit Sprint',
    icon: '🏔️',
    blurb: 'Alternate your keys to race up the mountain in eight seconds.',
    min: 1,
    max: 4,
    play: { game: 'climb', theme: { climber: '🧗', goal: '🚩', title: 'Summit Sprint' } },
  },
  {
    id: 'snapshot',
    kind: 'race',
    title: 'Rhino Snapshot',
    icon: '📷',
    blurb: 'Three shots of a rhino on the move. Centre it in the viewfinder.',
    min: 1,
    max: 4,
    play: { game: 'snapshot', theme: { subject: '🦏', title: 'Rhino Snapshot' } },
  },
  {
    id: 'flags',
    kind: 'race',
    title: 'Prayer Flag Memory',
    icon: '🎏',
    blurb: 'Repeat the growing sequence of prayer-flag colours.',
    min: 1,
    max: 4,
    play: { game: 'flags', theme: { title: 'Prayer Flag Memory' } },
  },
  {
    id: 'quiz',
    kind: 'race',
    title: 'Guide’s Quiz',
    icon: '🧭',
    blurb: 'Three questions about Nepal, straight from the cards. Fast answers score more.',
    min: 1,
    max: 4,
    play: { game: 'quiz', theme: { title: 'Guide’s Quiz' } },
  },
];

export function funGame(id: string): FunGame | undefined {
  return FUN_GAMES.find((g) => g.id === id);
}

/** A race's winners: the best score, shared on a tie. Nobody wins practice or an all-zero round. */
export function raceWinners(scores: Array<{ seat: number; score: number }>): number[] {
  if (scores.length < 2) return [];
  const best = Math.max(...scores.map((s) => s.score));
  if (best <= 0) return [];
  return scores.filter((s) => s.score === best).map((s) => s.seat);
}

/** Everything every screen in an online room knows about the current match. */
export type FunPublic = {
  /** Increases with every match in the room. */
  id: number;
  game: string;
  /** The seat that called the game. */
  host: number;
  seed: number;
  participants: number[];
  /** ready: waiting for players to join · play: under way · done: finished */
  stage: 'ready' | 'play' | 'done';
  ready: number[];
  /** Seats that sat out, or never answered. */
  out: number[];
  /** Race: scores posted so far. */
  scores: Array<{ seat: number; score: number; summary: string }>;
  /** Bagh-Chal: the board, and who plays which side. */
  bagh?: BaghState;
  sides?: { T: number; G: number };
  /** Tug of war: the rope, [left seat, right seat]. */
  tug?: { pos: number; t: number; pullers: [number, number] };
  winners?: number[];
  /** A line to show with the result, e.g. "Tigers captured five goats". */
  note?: string;
};

export type FunClientMessage =
  | { t: 'fun-open'; game: string; participants: number[] }
  | { t: 'fun-ready'; join: boolean }
  | { t: 'fun-score'; score: number; summary: string }
  | { t: 'fun-move'; move: BaghMove }
  | { t: 'fun-input'; n: number }
  | { t: 'fun-cancel' };
