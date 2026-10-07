/**
 * How far a point on the board is from the nearest road. Scenery uses it to
 * stay off the tiles: forests thin out toward the road, mountains and hills
 * sink to nothing before they reach it.
 *
 * Road segments are bucketed into a coarse grid, so a lookup only checks the
 * handful of segments nearby rather than every edge on the board.
 */

import type { Board } from '../engine/types.ts';

/** Distance from p to the segment ab, in the xz-plane. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  const cx = ax + dx * t - px;
  const cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export type Clearance = (x: number, z: number) => number;

const CELL = 3;
/** Beyond this, the exact distance doesn't matter to any caller. */
const FAR = CELL * 2;

export function roadClearance(board: Board): Clearance {
  const segs: Array<[number, number, number, number]> = [];
  for (const n of Object.values(board.nodes)) {
    for (const id of n.next) {
      const m = board.nodes[id];
      segs.push([n.pos[0], n.pos[2], m.pos[0], m.pos[2]]);
    }
  }
  const buckets = new Map<string, number[]>();
  const key = (i: number, j: number): string => `${i},${j}`;
  segs.forEach(([ax, az, bx, bz], k) => {
    const i0 = Math.floor((Math.min(ax, bx) - FAR) / CELL);
    const i1 = Math.floor((Math.max(ax, bx) + FAR) / CELL);
    const j0 = Math.floor((Math.min(az, bz) - FAR) / CELL);
    const j1 = Math.floor((Math.max(az, bz) + FAR) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = buckets.get(key(i, j)) ?? [];
        list.push(k);
        buckets.set(key(i, j), list);
      }
    }
  });
  return (x, z) => {
    const list = buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return FAR;
    let d = FAR;
    for (const k of list) {
      const s = segs[k];
      d = Math.min(d, segDist(x, z, s[0], s[1], s[2], s[3]));
    }
    return d;
  };
}
