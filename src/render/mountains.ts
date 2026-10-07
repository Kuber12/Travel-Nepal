/**
 * Mountains and hills, built as height fields rather than cones:
 *
 *  - `massif`  a single great peak: spur ridges radiating from the summit,
 *              a ragged base, an optional second summit (Machhapuchhre's
 *              fishtail), snow that settles on the gentler faces and leaves
 *              the steep rock bare, alpine grass at the foot.
 *  - `ridgeStrip` a whole range as one connected strip — the Himalayan
 *              skyline along the north edge of the board, the Mountain
 *              Expedition's massif — that rises out of the ground on its
 *              south side and never covers a tile (a mask keeps it off the roads).
 *  - `terracedHill` the stepped rice terraces of the middle hills.
 *
 * Every face takes its colour from its height and steepness, and shading is
 * flat, so the forms read as carved facets in the board-game style. All
 * randomness is seeded: every screen in an online room sees the same range.
 */

import * as THREE from 'three';
import { fbm, ridged, seeded } from './noise.ts';

const SNOW = new THREE.Color(0xf6f9fc);
const SNOW_SHADE = new THREE.Color(0xd5e2ef);
const ICE = new THREE.Color(0xc4d8ea);
const ROCK_LIGHT = new THREE.Color(0x9a9b9f);
const ROCK = new THREE.Color(0x777b84);
const ROCK_DARK = new THREE.Color(0x5a5f6b);
const ROCK_WARM = new THREE.Color(0x857a6c);
const ALPINE = new THREE.Color(0x8a9a5e);
const MEADOW = new THREE.Color(0x6f9a48);
const FOREST = new THREE.Color(0x4b7a3e);

export type SnowStyle = {
  /** Fraction of the height where snow starts settling. */
  snowline: number;
  /** Fraction below which the slopes are green. */
  treeline: number;
};

const tmp = new THREE.Color();

/** The colour of one face, from where it sits on the mountain and how steep it is. */
function faceColour(u: number, ny: number, n: number, style: SnowStyle, out: THREE.Color): THREE.Color {
  const line = style.snowline + (n - 0.5) * 0.16;
  if (u > line + 0.2 || (u > line && ny > 0.42)) {
    // Snow: brightest where it faces the sky, bluer in the steep shade.
    out.copy(SNOW).lerp(SNOW_SHADE, THREE.MathUtils.clamp(1 - ny, 0, 1) * 0.9);
    if (ny < 0.45) out.lerp(ICE, 0.35);
    return out;
  }
  if (u < style.treeline) {
    out.copy(FOREST).lerp(MEADOW, THREE.MathUtils.clamp(u / Math.max(style.treeline, 0.01), 0, 1));
    return out.lerp(ALPINE, n * 0.3);
  }
  if (u < style.treeline + 0.1 && ny > 0.6) return out.copy(ALPINE).lerp(ROCK_WARM, n * 0.5);
  // Bare rock in strata, darker on the steep faces.
  const band = Math.floor(u * 14 + n * 2) % 2 === 0 ? 0.15 : 0;
  out.copy(ROCK_LIGHT).lerp(ROCK, 0.4 + band).lerp(ROCK_DARK, THREE.MathUtils.clamp((0.75 - ny) * 1.2, 0, 1));
  return out.lerp(ROCK_WARM, n * 0.35);
}

/** Turn a list of triangles into a flat-shaded mesh coloured face by face. */
function facetedMesh(
  tris: number[],
  height: number,
  style: SnowStyle,
  seed: number,
  colour?: (cx: number, cy: number, cz: number, ny: number, out: THREE.Color) => THREE.Color,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    nrm.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    const n = fbm(cx * 0.9, cz * 0.9, 2, seed);
    if (colour) colour(cx, cy, cz, Math.abs(nrm.y), tmp);
    else faceColour(cy / height, Math.abs(nrm.y), n, style, tmp);
    for (let k = 0; k < 3; k++) tmp.toArray(colours, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Push the two triangles of a grid quad, choosing the diagonal that follows the ridge. */
function quad(tris: number[], p00: number[], p10: number[], p01: number[], p11: number[]): void {
  const flip = Math.abs(p00[1] - p11[1]) > Math.abs(p10[1] - p01[1]);
  if (flip) {
    tris.push(...p00, ...p01, ...p10, ...p10, ...p01, ...p11);
  } else {
    tris.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10);
  }
}

// --- a single great peak ---------------------------------------------------------------

export type MassifOptions = {
  height: number;
  radius: number;
  seed?: number;
  /** Ridges running down from the summit. */
  spurs?: number;
  /** 1 is a straight cone; higher is a steeper summit over a broader foot. */
  sharpness?: number;
  /** A second summit beside the first, as a fraction of the height (Machhapuchhre). */
  twin?: { angle: number; distance: number; height: number };
  snowline?: number;
  treeline?: number;
  /** Detail: rings out from the summit and segments around. */
  rings?: number;
  segments?: number;
};

export function massif(o: MassifOptions): THREE.Mesh {
  const seed = o.seed ?? 1;
  const rnd = seeded(seed * 7919 + 17);
  const H = o.height;
  const R = o.radius;
  const sharp = o.sharpness ?? 1.45;
  const spurs = Array.from({ length: o.spurs ?? 5 }, () => ({
    a: rnd() * Math.PI * 2,
    w: 0.22 + rnd() * 0.32,
    k: 0.55 + rnd() * 0.45,
  }));
  const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ridge = (theta: number): number =>
    spurs.reduce((m, s) => Math.max(m, s.k * Math.exp(-(angDiff(theta, s.a) ** 2) / (s.w * s.w))), 0);
  const twin = o.twin
    ? { x: Math.cos(o.twin.angle) * o.twin.distance * R, z: Math.sin(o.twin.angle) * o.twin.distance * R, h: o.twin.height * H }
    : null;

  const heightAt = (x: number, z: number): number => {
    const d = Math.hypot(x, z) / R;
    const theta = Math.atan2(z, x);
    // How far the foot reaches in this direction: further along a spur.
    const reach = 0.72 + 0.42 * ridge(theta) + (fbm(Math.cos(theta) * 1.7 + seed, Math.sin(theta) * 1.7, 3, seed) - 0.5) * 0.4;
    let h = H * Math.pow(Math.max(0, 1 - d / reach), sharp);
    // Spurs hold their height a little further down.
    h *= 0.86 + 0.2 * ridge(theta) * Math.min(1, d * 2.5);
    // Crags and gullies.
    h += (ridged(x * 1.3 / R + seed, z * 1.3 / R, 3, seed) - 0.5) * H * 0.09 * Math.min(1, d * 3) * (1 - Math.min(1, d));
    if (twin) {
      const dt = Math.hypot(x - twin.x, z - twin.z) / (R * 0.42);
      h = Math.max(h, twin.h * Math.pow(Math.max(0, 1 - dt), sharp * 0.85));
    }
    return h;
  };

  const NR = o.rings ?? 16;
  const NS = o.segments ?? 48;
  const outer = 1.25;
  const rings: number[][][] = [];
  for (let i = 0; i <= NR; i++) {
    const t = Math.pow(i / NR, 1.12) * outer;
    const ring: number[][] = [];
    for (let j = 0; j < NS; j++) {
      const theta = (j / NS) * Math.PI * 2 + (i % 2) * (Math.PI / NS);
      const x = Math.cos(theta) * t * R;
      const z = Math.sin(theta) * t * R;
      // The outermost ring tucks just under the ground so the foot never floats.
      const y = i === NR ? -0.06 : heightAt(x, z);
      ring.push([x, Math.max(y, i === NR ? -0.06 : 0), z]);
    }
    rings.push(ring);
  }
  const tris: number[] = [];
  const summit = [0, heightAt(0, 0), 0];
  for (let j = 0; j < NS; j++) {
    const a = rings[1][j];
    const b = rings[1][(j + 1) % NS];
    tris.push(...summit, ...b, ...a);
  }
  for (let i = 1; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      const a = rings[i][j];
      const b = rings[i][(j + 1) % NS];
      const c = rings[i + 1][j];
      const d = rings[i + 1][(j + 1) % NS];
      quad(tris, a, b, c, d);
    }
  }
  // Wind each triangle so its face points outward (up).
  fixWinding(tris);
  const top = Math.max(H, twin?.h ?? 0);
  const mesh = facetedMesh(tris, top, { snowline: o.snowline ?? 0.5, treeline: o.treeline ?? 0.1 }, seed);
  mesh.userData.summit = new THREE.Vector3(0, summit[1], 0);
  return mesh;
}

/** Make every triangle face upward, whatever order its corners were pushed in. */
function fixWinding(tris: number[]): void {
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i];
    const az = tris[i + 2];
    const bx = tris[i + 3];
    const bz = tris[i + 5];
    const cx = tris[i + 6];
    const cz = tris[i + 8];
    // y of (b - a) × (c - a): positive means the face points up.
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) {
      for (let k = 0; k < 3; k++) {
        const t = tris[i + 3 + k];
        tris[i + 3 + k] = tris[i + 6 + k];
        tris[i + 6 + k] = t;
      }
    }
  }
}

// --- a connected range --------------------------------------------------------------------

export type StripPeak = {
  /** Where the summit stands. */
  x: number;
  z: number;
  height: number;
  /** Half-width of the peak's foot. */
  radius: number;
  sharpness?: number;
};

export type RidgeStripOptions = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  peaks: StripPeak[];
  /** Height of the saddle ridge that joins the peaks. */
  ridgeHeight?: number;
  /** Which edges rise from nothing: 'south' fades in from z0, 'all' from every edge. */
  fade?: 'south' | 'all';
  /** 0..1 multiplier per point — used to keep the range off the roads. */
  mask?: (x: number, z: number) => number;
  cell?: number;
  seed?: number;
  snowline?: number;
  treeline?: number;
};

export function ridgeStrip(o: RidgeStripOptions): THREE.Mesh {
  const seed = o.seed ?? 3;
  const cell = o.cell ?? 0.24;
  const ridgeH = o.ridgeHeight ?? 1;
  const spanZ = o.z1 - o.z0;
  const crestZ = o.z0 + spanZ * 0.62;
  const top = Math.max(ridgeH, ...o.peaks.map((p) => p.height));

  const heightAt = (x: number, z: number): number => {
    // The saddle: a jagged crest running east-west, highest along its spine.
    const across = Math.exp(-(((z - crestZ) / (spanZ * 0.42)) ** 2));
    let h = ridgeH * across * (0.45 + 0.75 * ridged(x * 0.32 + seed, z * 0.32, 4, seed));
    for (const p of o.peaks) {
      const dx = x - p.x;
      const dz = z - p.z;
      const theta = Math.atan2(dz, dx);
      // Spurs: the foot reaches further along a few noisy directions.
      const reach = p.radius * (0.8 + 0.45 * ridged(Math.cos(theta) * 1.6 + p.x, Math.sin(theta) * 1.6, 2, seed + 11));
      const d = Math.hypot(dx, dz) / reach;
      if (d >= 1) continue;
      let ph = p.height * Math.pow(1 - d, p.sharpness ?? 1.5);
      ph += (ridged(x * 1.4, z * 1.4, 2, seed + 5) - 0.5) * p.height * 0.1 * d * (1 - d) * 4;
      h = Math.max(h, ph);
    }
    let fade = THREE.MathUtils.smoothstep(z, o.z0, o.z0 + spanZ * 0.45);
    if (o.fade === 'all') {
      // (smoothstep needs its edges in order, so the far sides fade as 1 − rise.)
      fade *= 1 - THREE.MathUtils.smoothstep(z, o.z1 - spanZ * 0.3, o.z1);
      fade *= THREE.MathUtils.smoothstep(x, o.x0, o.x0 + spanZ * 0.4) * (1 - THREE.MathUtils.smoothstep(x, o.x1 - spanZ * 0.4, o.x1));
    }
    h *= fade;
    if (o.mask) h *= o.mask(x, z);
    return Math.max(0, h);
  };

  const nx = Math.max(2, Math.round((o.x1 - o.x0) / cell));
  const nz = Math.max(2, Math.round(spanZ / cell));
  const grid: number[][][] = [];
  for (let i = 0; i <= nx; i++) {
    const col: number[][] = [];
    for (let j = 0; j <= nz; j++) {
      const x = o.x0 + ((o.x1 - o.x0) * i) / nx;
      const z = o.z0 + (spanZ * j) / nz;
      const edge = i === 0 || j === 0 || i === nx || (o.fade === 'all' && j === nz);
      col.push([x, edge ? -0.04 : heightAt(x, z) - 0.02, z]);
    }
    grid.push(col);
  }
  const tris: number[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p01 = grid[i][j + 1];
      const p11 = grid[i + 1][j + 1];
      // Skip flat ground entirely: the board shows through.
      if (Math.max(p00[1], p10[1], p01[1], p11[1]) <= 0.001) continue;
      quad(tris, p00, p10, p01, p11);
    }
  }
  fixWinding(tris);
  const mesh = facetedMesh(tris, top, { snowline: o.snowline ?? 0.5, treeline: o.treeline ?? 0.14 }, seed);
  // So tents, flags and climbers can stand on the slope itself.
  mesh.userData.heightAt = (x: number, z: number): number => Math.max(0, heightAt(x, z) - 0.02);
  return mesh;
}

// --- terraced hills ---------------------------------------------------------------------------

const TERRACE_GREENS = [0x8cc152, 0x7cb342, 0x9ccc65, 0xa5c75a, 0x6fa63c];
const TERRACE_GOLD = [0xd8c050, 0xe2b93b];

/**
 * A middle-hills hillside cut into rice terraces: each step a level field,
 * green with young rice, the odd one golden with mustard or ripe grain, and
 * the risers between them in bare earth.
 */
export function terracedHill(radius: number, height: number, seed = 1, steps = 6): THREE.Mesh {
  const rnd = seeded(seed * 31 + 7);
  const NR = steps * 3 + 2;
  const NS = 44;
  const stepH = height / steps;
  const fields = Array.from({ length: steps + 1 }, () =>
    new THREE.Color(rnd() < 0.18 ? TERRACE_GOLD[Math.floor(rnd() * TERRACE_GOLD.length)] : TERRACE_GREENS[Math.floor(rnd() * TERRACE_GREENS.length)]),
  );
  const earth = new THREE.Color(0x9a7a4e);
  const reachAt = (theta: number): number => 1 + (fbm(Math.cos(theta) * 1.4 + seed, Math.sin(theta) * 1.4, 3, seed) - 0.5) * 0.45;
  const smoothH = (x: number, z: number): number => {
    const theta = Math.atan2(z, x);
    const d = Math.hypot(x, z) / (radius * reachAt(theta));
    if (d >= 1) return 0;
    const s = 1 - d;
    return height * s * s * (3 - 2 * s);
  };
  // Quantise into level steps, keeping a sliver of the slope so risers show.
  const terrace = (h: number): number => {
    const level = Math.floor(h / stepH);
    const frac = h / stepH - level;
    return (level + THREE.MathUtils.smoothstep(frac, 0.78, 1)) * stepH;
  };
  const rings: number[][][] = [];
  for (let i = 0; i <= NR; i++) {
    const t = (i / NR) * 1.08;
    const ring: number[][] = [];
    for (let j = 0; j < NS; j++) {
      const theta = (j / NS) * Math.PI * 2;
      const x = Math.cos(theta) * t * radius * reachAt(theta);
      const z = Math.sin(theta) * t * radius * reachAt(theta);
      ring.push([x, i === NR ? -0.04 : terrace(smoothH(x, z)), z]);
    }
    rings.push(ring);
  }
  const tris: number[] = [];
  const summit = [0, terrace(height), 0];
  for (let j = 0; j < NS; j++) tris.push(...summit, ...rings[1][(j + 1) % NS], ...rings[1][j]);
  for (let i = 1; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      quad(tris, rings[i][j], rings[i][(j + 1) % NS], rings[i + 1][j], rings[i + 1][(j + 1) % NS]);
    }
  }
  fixWinding(tris);
  return facetedMesh(tris, height, { snowline: 2, treeline: 0 }, seed, (_x, y, _z, ny, out) => {
    if (ny < 0.8) return out.copy(earth).lerp(fields[Math.min(steps, Math.floor(y / stepH))], 0.25);
    return out.copy(fields[Math.min(steps, Math.round(y / stepH))]);
  });
}
