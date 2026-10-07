/**
 * Clothes the open ground between the roads the way Nepal's own country runs,
 * south to north:
 *
 *  - the Terai: sal forest, banana groves round the villages, clumps of
 *    bamboo, and rice paddies standing in water;
 *  - the middle hills: broadleaf woods with rhododendron in bloom, and whole
 *    hillsides cut into rice terraces;
 *  - the north: pine and fir climbing the foothills of the Himalaya.
 *
 * Groves thicken and thin with a noise field, with grassy clearings, wild
 * flowers and the odd mani pile or wayside shrine between them. Trees stay
 * lower near the roads and every feature keeps clear of the tiles, so the
 * scenery never hides a square. Everything small is instanced — a handful of
 * draw calls for the whole board — and seeded, so every screen grows the same
 * forest.
 */

import * as THREE from 'three';
import type { Board } from '../engine/types.ts';
import { bake } from './bake.ts';
import { roadClearance } from './clearance.ts';
import { maniStones, wayShrine } from './landmarks.ts';
import { terracedHill } from './mountains.ts';
import { fbm, seeded } from './noise.ts';

const BOARD_Y = 0.4;

export type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Extra ground height (mountain slopes) at a point; 0 on the flat board. */
export type Ground = (x: number, z: number) => number;

type Spot = { x: number; z: number; clear: number; d: number; lat: number };
type Keepout = { x: number; z: number; r: number };

/** Latitude bands, as a fraction of the way from the south edge to the north. */
const TERAI = 0.38;
const HILLS = 0.74;

export type MeadowOptions = {
  /** Mountain slopes: the woods climb them, thinning out toward the tree line. */
  ground?: Ground;
  /** Printed things (the title, the medallions) that hills and paddies must not cover. Trees may. */
  keepClear?: Rect[];
};

export function buildMeadow(board: Board, area: Rect, exclude: Rect[], seed = 7, opts: MeadowOptions = {}): THREE.Group {
  const ground: Ground = opts.ground ?? (() => 0);
  const keepClear = opts.keepClear ?? [];
  const group = new THREE.Group();
  const clearance = roadClearance(board);
  const roadClear = 1.4;
  const excluded = (x: number, z: number, pad = 0): boolean =>
    exclude.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  const latOf = (z: number): number => (z - area.z0) / (area.z1 - area.z0 || 1);

  const rnd = seeded(seed);
  /** 0 = open meadow, 1 = deep forest. */
  const density = (x: number, z: number): number => fbm(x * 0.085 + 3.1, z * 0.085 - 1.7, 4, seed);

  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  const finish = (mesh: THREE.InstancedMesh, n: number, cast = true): void => {
    mesh.count = n;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  // --- landforms first: terraced hills in the middle hills, paddies in the Terai ---
  const keepouts: Keepout[] = [];
  const free = (x: number, z: number, r: number): boolean => keepouts.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + r);
  const sites: Spot[] = [];
  for (let x = area.x0; x <= area.x1; x += 0.7) {
    for (let z = area.z0; z <= area.z1; z += 0.7) {
      if (excluded(x, z, 0.4) || ground(x, z) > 0.05) continue;
      if (keepClear.some((r) => x > r.x0 - 3 && x < r.x1 + 3 && z > r.z0 - 3 && z < r.z1 + 3)) continue;
      const clear = clearance(x, z);
      if (clear > 2.2) sites.push({ x, z, clear, d: 0, lat: latOf(z) });
    }
  }
  // The roomiest spots first.
  sites.sort((a, b) => b.clear - a.clear || a.x - b.x);

  let hills = 0;
  for (const s of sites) {
    if (hills >= 9 || s.lat < TERAI || s.lat > HILLS + 0.06 || s.clear < 2.7) continue;
    const radius = Math.min(s.clear - 1.05, 2.9);
    if (!free(s.x, s.z, radius + 1.2)) continue;
    const hill = terracedHill(radius, radius * (0.42 + rnd() * 0.16), seed + hills * 13, 5 + Math.floor(rnd() * 3));
    hill.position.set(s.x, BOARD_Y - 0.02, s.z);
    hill.rotation.y = rnd() * Math.PI * 2;
    group.add(hill);
    keepouts.push({ x: s.x, z: s.z, r: radius * 1.05 });
    hills++;
  }

  const paddyWater = new THREE.MeshStandardMaterial({ color: 0x8fc7b8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.4 });
  const dikeMat = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 1 });
  const rice: Array<{ x: number; z: number }> = [];
  let paddies = 0;
  for (const s of sites) {
    if (paddies >= 12 || s.lat >= TERAI) continue;
    const w = Math.min(s.clear * 1.15, 3.4);
    const d = Math.min(s.clear * 0.95, 2.8);
    const reach = Math.hypot(w, d) / 2;
    if (!free(s.x, s.z, reach + 0.5) || s.clear < reach * 0.8 + 1.1) continue;
    const plot = new THREE.Group();
    const shoots: Array<{ x: number; z: number }> = [];
    const cols = 2;
    const rows = 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cw = w / cols;
        const cd = d / rows;
        const cx = -w / 2 + cw * (i + 0.5);
        const cz = -d / 2 + cd * (j + 0.5);
        const water = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.12, cd - 0.12), paddyWater);
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 0.015, cz);
        water.receiveShadow = true;
        plot.add(water);
        // Rows of young rice standing in the water.
        for (let a = 0; a < 5; a++) {
          for (let b = 0; b < 4; b++) {
            if (rnd() < 0.2) continue;
            const lx = cx - cw / 2 + 0.2 + ((cw - 0.4) * a) / 4;
            const lz = cz - cd / 2 + 0.18 + ((cd - 0.36) * b) / 3;
            shoots.push({ x: lx, z: lz });
          }
        }
      }
    }
    // Earth bunds around and between the fields.
    for (const [bw, bd, bx, bz] of [[w, 0.12, 0, -d / 2], [w, 0.12, 0, d / 2], [w, 0.1, 0, 0], [0.12, d, -w / 2, 0], [0.12, d, w / 2, 0], [0.1, d, 0, 0]]) {
      const bund = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.07, bd), dikeMat);
      bund.position.set(bx, 0.035, bz);
      bund.receiveShadow = true;
      plot.add(bund);
    }
    const turn = (rnd() - 0.5) * 0.6;
    plot.rotation.y = turn;
    plot.position.set(s.x, BOARD_Y, s.z);
    group.add(plot);
    bake(plot);
    // Rice shoots, carried into world space for the instanced draw.
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const r of shoots) rice.push({ x: s.x + r.x * cos + r.z * sin, z: s.z - r.x * sin + r.z * cos });
    keepouts.push({ x: s.x, z: s.z, r: reach });
    paddies++;
  }
  const riceMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.05, 0.22, 4).translate(0, 0.11, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    rice.length * 3,
  );
  let nr = 0;
  for (const r of rice) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(r.x + (rnd() - 0.5) * 0.08, BOARD_Y + 0.01, r.z + (rnd() - 0.5) * 0.08);
      dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5);
      dummy.scale.set(1, 0.8 + rnd() * 0.5, 1);
      dummy.updateMatrix();
      riceMesh.setMatrixAt(nr, dummy.matrix);
      riceMesh.setColorAt(nr++, colour.setHSL(0.25 + rnd() * 0.04, 0.62, 0.42 + rnd() * 0.1));
    }
  }
  finish(riceMesh, nr, false);

  // --- where the woods grow, and where the clearings are ---
  const trees: Spot[] = [];
  const floor: Spot[] = [];
  const clearings: Spot[] = [];
  const step = 0.52;
  for (let x = area.x0; x <= area.x1; x += step) {
    for (let z = area.z0; z <= area.z1; z += step) {
      const jx = x + (rnd() - 0.5) * step * 0.8;
      const jz = z + (rnd() - 0.5) * step * 0.8;
      if (excluded(jx, jz) || !free(jx, jz, 0.15)) continue;
      const clear = clearance(jx, jz);
      if (clear < roadClear) continue;
      const lift = ground(jx, jz);
      if (lift > 1.1) continue; // above the tree line
      const d = density(jx, jz);
      const s = { x: jx, z: jz, clear, d, lat: latOf(jz) };
      if (d > 0.42) {
        trees.push(s);
        if (lift < 0.05) floor.push(s);
      } else if (d > 0.36) {
        if (lift < 0.05) floor.push(s); // the woodland edge: floor and undergrowth, few trees
        if (rnd() < 0.4) trees.push(s);
      } else if (lift < 0.05) {
        clearings.push(s);
      }
    }
  }

  // --- forest floor: overlapping moss-green discs, just under the roads ---
  const floorMesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.58, 14).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ roughness: 1 }),
    floor.length,
  );
  floor.forEach((s, i) => {
    dummy.position.set(s.x, BOARD_Y - 0.045 + (i % 7) * 0.0006, s.z);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.scale.setScalar(Math.min(1.25, 0.75 + (s.clear - roadClear) * 0.5));
    dummy.updateMatrix();
    floorMesh.setMatrixAt(i, dummy.matrix);
    floorMesh.setColorAt(i, colour.setHSL(0.27 + rnd() * 0.04, 0.42, 0.25 + rnd() * 0.06 + (0.5 - s.d) * 0.1));
  });
  finish(floorMesh, floor.length, false);

  // --- trees ---
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.055, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(0.34, 0.75, 9);
  coneGeo.translate(0, 0.375, 0);
  const crownGeo = new THREE.IcosahedronGeometry(0.36, 1);
  // A banana leaf: long, flat, arching out from the stem.
  const leafGeo = new THREE.SphereGeometry(1, 8, 4);
  leafGeo.scale(0.07, 0.018, 0.34);
  leafGeo.translate(0, 0, 0.3);
  const stalkGeo = new THREE.CylinderGeometry(0.022, 0.028, 1, 6);
  stalkGeo.translate(0, 0.5, 0);
  const tuftGeo = new THREE.IcosahedronGeometry(0.16, 0);

  const cap = trees.length;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), cap * 2);
  const BARK = new THREE.Color(0x5a3e28);
  const SAL_BARK = new THREE.Color(0x6b5440);
  const BANANA_STEM = new THREE.Color(0x7d9440);
  const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), cap * 3);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), cap * 3);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), cap * 6);
  const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), cap * 8);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), cap * 8);
  let nt = 0;
  let nc = 0;
  let nw = 0;
  let nl = 0;
  let ns = 0;
  let nf = 0;

  const conifer = (x: number, y: number, z: number, h: number): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.scale.set(1, h * 0.35, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(nt, dummy.matrix);
    trunks.setColorAt(nt++, BARK);
    const green = colour.setHSL(0.36 + rnd() * 0.04, 0.45, 0.2 + rnd() * 0.06).clone();
    for (let k = 0; k < 3; k++) {
      const w = (1 - k * 0.24) * (0.75 + h * 0.3);
      dummy.position.set(x, y + h * (0.22 + k * 0.24), z);
      dummy.scale.set(w, h * 0.55, w);
      dummy.updateMatrix();
      cones.setMatrixAt(nc, dummy.matrix);
      cones.setColorAt(nc++, green.clone().offsetHSL(0, 0, k * 0.03));
    }
  };

  const broadleaf = (x: number, y: number, z: number, h: number, base: THREE.Color, tall = false): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.scale.set(1, h * (tall ? 0.9 : 0.55), 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(nt, dummy.matrix);
    trunks.setColorAt(nt++, tall ? SAL_BARK : BARK);
    const lobes = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < lobes; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.12 * h;
      const k2 = (0.75 + rnd() * 0.35) * (0.6 + h * 0.45) * (tall ? 0.85 : 1);
      dummy.position.set(x + Math.cos(a) * r, y + h * (tall ? 0.95 : 0.62) + k * 0.08 * h, z + Math.sin(a) * r);
      dummy.scale.set(k2, k2 * 0.85, k2);
      dummy.updateMatrix();
      crowns.setMatrixAt(nw, dummy.matrix);
      crowns.setColorAt(nw++, base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.05));
    }
  };

  const banana = (x: number, y: number, z: number, h: number): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(2.2, h * 0.45, 2.2);
    dummy.updateMatrix();
    trunks.setMatrixAt(nt, dummy.matrix);
    trunks.setColorAt(nt++, BANANA_STEM);
    const top = y + h * 0.45;
    const n = 5 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      dummy.position.set(x, top, z);
      dummy.rotation.set(0.5 + rnd() * 0.4, (k / n) * Math.PI * 2 + rnd() * 0.4, 0, 'YXZ');
      dummy.scale.setScalar(h * (0.85 + rnd() * 0.3));
      dummy.updateMatrix();
      leaves.setMatrixAt(nl, dummy.matrix);
      leaves.setColorAt(nl++, colour.setHSL(0.25 + rnd() * 0.04, 0.6, 0.36 + rnd() * 0.08));
    }
  };

  const bamboo = (x: number, y: number, z: number, h: number): void => {
    const n = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.16;
      const lean = 0.06 + rnd() * 0.12;
      const sh = h * (1.1 + rnd() * 0.7);
      const bx = x + Math.cos(a) * r;
      const bz = z + Math.sin(a) * r;
      dummy.position.set(bx, y, bz);
      dummy.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      dummy.scale.set(1, sh, 1);
      dummy.updateMatrix();
      stalks.setMatrixAt(ns, dummy.matrix);
      stalks.setColorAt(ns++, colour.setHSL(0.2 + rnd() * 0.05, 0.45, 0.42 + rnd() * 0.1));
      // A feathery tuft of leaves near the top.
      dummy.position.set(bx + Math.cos(a) * sh * lean, y + sh * 0.95, bz + Math.sin(a) * sh * lean);
      dummy.rotation.set(rnd(), rnd() * 6, rnd());
      dummy.scale.set(1.3, 0.8, 1.3);
      dummy.updateMatrix();
      tufts.setMatrixAt(nf, dummy.matrix);
      tufts.setColorAt(nf++, colour.setHSL(0.24 + rnd() * 0.05, 0.5, 0.36 + rnd() * 0.08));
    }
  };

  for (const s of trees) {
    // Lower near roads so tiles stay in view; taller deep in the wood.
    const room = Math.min(1, (s.clear - roadClear) / 1.4);
    const h = (0.55 + room * 0.75) * (0.85 + rnd() * 0.35);
    const x = s.x + (rnd() - 0.5) * 0.18;
    const z = s.z + (rnd() - 0.5) * 0.18;
    const lift = ground(x, z);
    const y = BOARD_Y + lift - 0.02;
    const roll = rnd();
    if (lift > 0.25 || s.lat > HILLS) {
      // The north, and any mountain slope: pine and fir, the odd rhododendron.
      if (roll < 0.1 && lift < 0.3) broadleaf(x, y, z, h * 0.8, colour.setHSL(0.98, 0.6, 0.45).clone());
      else conifer(x, y, z, h);
    } else if (s.lat < TERAI) {
      // The Terai: tall sal, with bamboo and banana where the forest opens out.
      if (roll < 0.12 && room > 0.3) bamboo(x, y, z, h);
      else if (roll < 0.22) banana(x, y, z, h * 0.9);
      else broadleaf(x, y, z, h * 1.05, colour.setHSL(0.3 + rnd() * 0.04, 0.5, 0.24 + rnd() * 0.07).clone(), roll > 0.55);
    } else {
      // The middle hills: oak, chestnut and rhododendron, a few pines.
      if (roll < 0.18) conifer(x, y, z, h);
      else if (roll < 0.3) broadleaf(x, y, z, h * 0.85, colour.setHSL(0.97 + rnd() * 0.03, 0.62, 0.44).clone());
      else broadleaf(x, y, z, h, colour.setHSL(0.24 + rnd() * 0.07, 0.5, 0.27 + rnd() * 0.08).clone());
    }
  }
  finish(trunks, nt);
  finish(cones, nc);
  finish(crowns, nw);
  finish(leaves, nl);
  finish(stalks, ns);
  finish(tufts, nf);

  // --- clearings: grass, shrubs and wild flowers, kept sparse ---
  const grassGeo = new THREE.ConeGeometry(0.05, 0.3, 4);
  grassGeo.translate(0, 0.15, 0);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), clearings.length * 3);
  const bloomGeo = new THREE.IcosahedronGeometry(0.06, 0);
  const blooms = new THREE.InstancedMesh(bloomGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), clearings.length);
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), clearings.length);
  // Marigold, mustard, rhododendron red, jasmine white.
  const FLOWERS = [0xf29a1e, 0xf2c230, 0xe2457a, 0xd8283c, 0xf6f2ea];
  let ng = 0;
  let nb = 0;
  let nsh = 0;
  for (const s of clearings) {
    const n = rnd() < 0.4 ? 0 : 1 + Math.floor(rnd() * 3);
    for (let b = 0; b < n; b++) {
      dummy.position.set(s.x + (rnd() - 0.5) * 0.4, BOARD_Y, s.z + (rnd() - 0.5) * 0.4);
      dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4);
      dummy.scale.set(1, 0.6 + rnd() * 0.7, 1);
      dummy.updateMatrix();
      grass.setMatrixAt(ng, dummy.matrix);
      grass.setColorAt(ng++, colour.setHSL(0.24 + rnd() * 0.05, 0.5, 0.34 + rnd() * 0.1));
    }
    if (rnd() < 0.16) {
      dummy.position.set(s.x, BOARD_Y + 0.06, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.6, 1);
      dummy.updateMatrix();
      blooms.setMatrixAt(nb, dummy.matrix);
      blooms.setColorAt(nb++, colour.setHex(FLOWERS[Math.floor(rnd() * FLOWERS.length)]));
    }
    if (rnd() < 0.08 && s.clear > 1.8) {
      dummy.position.set(s.x, BOARD_Y + 0.08, s.z);
      dummy.rotation.set(rnd(), rnd() * 6, rnd());
      dummy.scale.set(1.2, 0.75, 1.2);
      dummy.updateMatrix();
      shrubs.setMatrixAt(nsh, dummy.matrix);
      shrubs.setColorAt(nsh++, colour.setHSL(0.27 + rnd() * 0.05, 0.45, 0.28 + rnd() * 0.06));
    }
  }
  finish(grass, ng, false);
  finish(blooms, nb, false);
  finish(shrubs, nsh);

  // --- a few wayside features in the roomiest clearings, kept well apart ---
  const roomy = clearings.filter((s) => s.clear > 2.1).sort(() => rnd() - 0.5);
  const placed: { x: number; z: number }[] = [];
  let shrines = 0;
  let manis = 0;
  for (const s of roomy) {
    if (!placed.every((p) => Math.hypot(p.x - s.x, p.z - s.z) > 5)) continue;
    let o: THREE.Object3D | null = null;
    if (shrines < 3 && rnd() < 0.4) {
      o = wayShrine(0.9);
      shrines++;
    } else if (manis < 4) {
      o = maniStones(placed.length + 1);
      manis++;
    }
    if (!o) break;
    o.position.set(s.x, BOARD_Y, s.z);
    o.rotation.y = rnd() * Math.PI * 2;
    group.add(o);
    bake(o);
    placed.push({ x: s.x, z: s.z });
  }
  return group;
}
