/**
 * Dori Tanne — tug of war — as pure rules. Two pullers hammer their keys;
 * every tap drags the rope one notch their way. Whoever drags the marker
 * past their line wins; when time runs out, the side it leans to wins.
 *
 * On one device both players share the keyboard. Online, each browser sends
 * its taps to the server, which owns the rope and tells everyone where it is.
 */

/** Notches from the centre to either line. */
export const TUG_GOAL = 24;
/** Seconds before the referee calls it. */
export const TUG_TIME = 15;
/** A human can't honestly tap faster than this; anything more is ignored. */
export const TUG_MAX_TAPS_PER_SECOND = 16;

export type TugState = {
  /** Negative: the left puller is winning. Positive: the right. */
  pos: number;
  /** Seconds elapsed. */
  t: number;
  winner: 0 | 1 | 'draw' | null;
};

export function newTug(): TugState {
  return { pos: 0, t: 0, winner: null };
}

/** Taps from either side (0 = left, 1 = right), and time passing. */
export function pullTug(s: TugState, left: number, right: number, dt: number): TugState {
  if (s.winner !== null) return s;
  const pos = s.pos + right - left;
  const t = s.t + dt;
  let winner: TugState['winner'] = null;
  if (pos <= -TUG_GOAL) winner = 0;
  else if (pos >= TUG_GOAL) winner = 1;
  else if (t >= TUG_TIME) winner = pos < 0 ? 0 : pos > 0 ? 1 : 'draw';
  return { pos: Math.max(-TUG_GOAL, Math.min(TUG_GOAL, pos)), t: Math.min(t, TUG_TIME), winner };
}
