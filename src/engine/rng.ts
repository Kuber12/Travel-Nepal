/**
 * Seeded RNG. Every random decision in the game flows through here so that
 * seed + action log fully determines a game — which is what makes the engine
 * safe to run server-authoritatively later.
 *
 * The cursor lives in GameState rather than in a closure, so state stays
 * serialisable and a game can be resumed or replayed from JSON alone.
 */

function mulberry32(a: number): number {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A single float in [0, 1) derived from seed + cursor. */
export function randomAt(seed: number, cursor: number): number {
  return mulberry32(seed + cursor * 0x9e3779b9);
}

export type RngHandle = { seed: number; cursor: number };

/** Integer in [min, max] inclusive. Advances the handle's cursor. */
export function nextInt(rng: RngHandle, min: number, max: number): number {
  const r = randomAt(rng.seed, rng.cursor);
  rng.cursor += 1;
  return min + Math.floor(r * (max - min + 1));
}

/** Roll an n-sided die, 1..n. */
export function rollDie(rng: RngHandle, sides: number): number {
  return nextInt(rng, 1, sides);
}

/** Fisher-Yates using the seeded stream. Returns a new array. */
export function shuffle<T>(rng: RngHandle, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
