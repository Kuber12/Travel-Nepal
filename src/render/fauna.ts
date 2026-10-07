/**
 * The animals of the board. Bodies are turned on a lathe, so each has a real
 * silhouette — the rhino's armoured barrel, the chital's slim waist — and can
 * wear a painted coat: the chital's rows of white spots, the tiger's stripes,
 * the rhino's studded hide. Necks, legs, trunks, horns, antlers and tails are
 * smooth tapered tubes along curves, so knees bend, necks arch and horns
 * sweep instead of being stacked blocks.
 *
 * Each animal returns a Group standing on y = 0, facing +x, with a gentle idle
 * animation on `userData.tick`. The parts that animation moves are marked, so
 * the rest of the animal can be baked into a few draw calls (see bake.ts).
 */

import * as THREE from 'three';
import { GOLD, mat, type Tick } from './props.ts';
import { seeded } from './noise.ts';

const SEG = 24;

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/**
 * The parts the idle animation moves. They stay whole when the animal is
 * baked (see bake.ts); everything else on it is fused into a few draw calls.
 */
function moving(animal: THREE.Object3D, ...parts: THREE.Object3D[]): void {
  for (const p of parts) p.userData.keep = true;
  animal.userData.bakeable = true;
}

// --- building blocks ------------------------------------------------------------------

type V3 = [number, number, number];
type Radius = (t: number) => number;

/** Taper linearly from r0 to r1. */
const taper = (r0: number, r1: number): Radius => (t) => r0 + (r1 - r0) * t;
/** Swell from r0 through rm (at the middle) to r1. */
const swell = (r0: number, rm: number, r1: number): Radius => (t) =>
  (1 - t) * (1 - t) * r0 + 2 * t * (1 - t) * (2 * rm - (r0 + r1) / 2) + t * t * r1;

/** A sphere stretched into an ellipsoid with radii (rx, ry, rz). */
function blob(rx: number, ry: number, rz: number, material: THREE.Material, seg = SEG): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), material);
  m.scale.set(rx, ry, rz);
  return m;
}

/**
 * A smooth tube along a curve through `points`, its radius following
 * `radius(t)` from start (t = 0) to end (t = 1), with rounded ends.
 */
function sinew(points: V3[], radius: Radius, material: THREE.Material, segments = 12, radial = 12): THREE.Group {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, c);
    const r = radius(i / segments);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, material));
  for (const end of [0, 1]) {
    const r = radius(end);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, radial, Math.max(6, radial / 2)), material);
    cap.position.copy(curve.getPointAt(end));
    g.add(cap);
  }
  return g;
}

/**
 * A body turned on a lathe along x: `profile` is [x, radius] pairs from tail to
 * head; the cross-section is squashed to `sy` tall and `sz` wide. Its UVs run
 * around the body (u: 0.25 belly, 0.75 back) and along it (v: 0 tail, 1 head),
 * which is how the coat textures below are painted.
 */
function lathe(profile: [number, number][], material: THREE.Material, sy = 1, sz = 1, segments = 32, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const pts = profile.map(([x, r]) => new THREE.Vector2(r, x));
  const geo = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  geo.rotateZ(-Math.PI / 2);
  geo.scale(1, sy, sz);
  return new THREE.Mesh(geo, material);
}

/** A leg from hip through knee to foot. */
function leg(points: V3[], radius: Radius, material: THREE.Material): THREE.Group {
  return sinew(points, radius, material, 10, 10);
}

/** Two glossy eyes at ±z with a catch-light, a little proud of the head surface. */
function eyes(x: number, y: number, z: number, r: number, iris?: number): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    if (iris !== undefined) {
      const ring = blob(r * 1.25, r * 1.25, r * 0.6, mat(iris, 0.3), 12);
      ring.position.set(x, y, s * z);
      g.add(ring);
    }
    const e = blob(r, r, r * 0.75, mat(0x14100c, 0.12, 0.1), 12);
    e.position.set(x + (iris !== undefined ? r * 0.2 : 0), y, s * (z + (iris !== undefined ? r * 0.3 : 0)));
    const glint = blob(r * 0.28, r * 0.28, r * 0.2, mat(0xffffff, 0.2), 6);
    glint.position.set(e.position.x + r * 0.35, y + r * 0.35, s * (Math.abs(e.position.z) + r * 0.55));
    g.add(e, glint);
  }
  return g;
}

/** A swinging tail from a pivot: a tapered tube with an optional tuft. */
function tail(at: V3, points: V3[], radius: Radius, material: THREE.Material, tuft?: THREE.Material, tuftSize = 1): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  pivot.add(sinew(points, radius, material, 10, 8));
  if (tuft) {
    const end = points[points.length - 1];
    const t = blob(0.05 * tuftSize, 0.1 * tuftSize, 0.05 * tuftSize, tuft, 12);
    t.position.set(end[0], end[1] - 0.05 * tuftSize, end[2]);
    pivot.add(t);
  }
  return pivot;
}

// --- painted coats ------------------------------------------------------------------------

const coats = new Map<string, THREE.MeshStandardMaterial>();

/** A material wearing a coat painted on a canvas, made once and shared. */
function coat(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, roughness = 0.85, repeat?: [number, number]): THREE.MeshStandardMaterial {
  const hit = coats.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  const m = new THREE.MeshStandardMaterial({ map: t, roughness });
  coats.set(key, m);
  return m;
}

/** Fine mottling, so no hide reads as plastic. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, seed: number, dark: string, light: string, n = 700): void {
  const rnd = seeded(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? dark : light;
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** The rhino's hide: grey-brown, studded with the round tubercles of its armour. */
const rhinoHide = (): THREE.MeshStandardMaterial =>
  coat('rhino', 256, 256, (g, w, h) => {
    g.fillStyle = '#8f8b84';
    g.fillRect(0, 0, w, h);
    mottle(g, w, h, 3, 'rgba(70, 64, 58, 0.12)', 'rgba(190, 184, 172, 0.1)');
    const rnd = seeded(9);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 2 + rnd() * 3.5;
      g.fillStyle = 'rgba(176, 170, 160, 0.35)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(64, 58, 52, 0.35)';
      g.lineWidth = 1;
      g.stroke();
    }
  }, 0.88, [3, 2]);

const elephantHide = (): THREE.MeshStandardMaterial =>
  coat('elephant', 256, 256, (g, w, h) => {
    g.fillStyle = '#7f7974';
    g.fillRect(0, 0, w, h);
    mottle(g, w, h, 5, 'rgba(60, 55, 52, 0.12)', 'rgba(170, 160, 152, 0.1)');
    // Fine wrinkles.
    const rnd = seeded(15);
    g.strokeStyle = 'rgba(55, 50, 46, 0.22)';
    g.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 6, y + (rnd() - 0.5) * 6, x + 10 + rnd() * 10, y + (rnd() - 0.5) * 4);
      g.stroke();
    }
  }, 0.9, [3, 2]);

/** The chital: rufous, with rows of white spots along the flanks and a pale belly. */
const chitalCoat = (): THREE.MeshStandardMaterial =>
  coat('chital', 512, 256, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    // u: 0 flank, 0.25 belly, 0.5 flank, 0.75 back, 1 flank.
    base.addColorStop(0, '#c0702e');
    base.addColorStop(0.18, '#e8d6b8');
    base.addColorStop(0.25, '#f4ead8');
    base.addColorStop(0.32, '#e8d6b8');
    base.addColorStop(0.45, '#c0702e');
    base.addColorStop(0.75, '#9a5424');
    base.addColorStop(1, '#c0702e');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    mottle(g, w, h, 21, 'rgba(90, 40, 10, 0.08)', 'rgba(230, 160, 90, 0.08)', 400);
    // The dark line down the spine.
    g.fillStyle = 'rgba(70, 30, 8, 0.55)';
    g.fillRect(w * 0.74, 0, w * 0.02, h);
    // Rows of white spots either side of it.
    const rnd = seeded(33);
    for (const centre of [0.6, 0.9]) {
      for (let row = 0; row < 4; row++) {
        const u = centre + (centre < 0.75 ? -1 : 1) * (row - 1.5) * 0.045;
        for (let y = 18; y < h - 14; y += 16 + rnd() * 6) {
          g.fillStyle = 'rgba(255, 250, 238, 0.95)';
          g.beginPath();
          g.ellipse(((u + (rnd() - 0.5) * 0.012) % 1) * w, y + (row % 2) * 7, 3.6, 4.6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }, 0.8);

/** The gharial: olive scutes in rows over the back, cream below. */
const gharialHide = (): THREE.MeshStandardMaterial =>
  coat('gharial', 512, 256, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#6b7448');
    base.addColorStop(0.18, '#c9c19a');
    base.addColorStop(0.32, '#c9c19a');
    base.addColorStop(0.5, '#6b7448');
    base.addColorStop(0.75, '#4f5a36');
    base.addColorStop(1, '#6b7448');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30, 36, 20, 0.45)';
    g.lineWidth = 2;
    for (let x = w * 0.45; x < w * 1.05; x += 18) {
      for (let y = 0; y < h; y += 14) {
        g.strokeRect(x % w, y + ((x / 18) % 2) * 7, 15, 11);
      }
    }
  }, 0.75);

/** A Bengal tiger: orange, black stripes down the flanks, white below. */
const tigerCoat = (): THREE.MeshStandardMaterial =>
  coat('tiger', 512, 256, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#e0802c');
    base.addColorStop(0.15, '#f4e6cc');
    base.addColorStop(0.25, '#fbf4e6');
    base.addColorStop(0.35, '#f4e6cc');
    base.addColorStop(0.5, '#e0802c');
    base.addColorStop(0.75, '#c8661e');
    base.addColorStop(1, '#e0802c');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const rnd = seeded(77);
    g.fillStyle = '#1c120c';
    // Each stripe: a tapered, wavy band from the spine down one flank.
    for (let y = 10; y < h - 6; y += 13 + rnd() * 6) {
      for (const dir of [-1, 1]) {
        const len = w * (0.2 + rnd() * 0.08);
        const x0 = w * 0.75;
        const wob = (rnd() - 0.5) * 10;
        g.beginPath();
        g.moveTo(x0, y - 4);
        g.quadraticCurveTo(x0 + dir * len * 0.5, y - 5 + wob, x0 + dir * len, y + wob * 0.6);
        g.quadraticCurveTo(x0 + dir * len * 0.5, y + 3 + wob, x0, y + 4);
        g.closePath();
        g.fill();
      }
    }
  }, 0.8);

/** Rings round a tail: u runs along the tube, so rings are columns. */
function ringed(key: string, a: string, b: string, tip?: string): THREE.MeshStandardMaterial {
  return coat(key, 256, 32, (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    for (let x = 20; x < w; x += 36) g.fillRect(x, 0, 14, h);
    if (tip) {
      g.fillStyle = tip;
      g.fillRect(w * 0.86, 0, w * 0.14, h);
    }
  }, 0.85);
}

/** A face painted on a sphere: SphereGeometry puts the +x side at u = 0.5. */
function face(key: string, base: string, paint: (g: CanvasRenderingContext2D, cx: number, cy: number) => void): THREE.MeshStandardMaterial {
  return coat(key, 512, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    paint(g, w / 2, h / 2);
  }, 0.85);
}

/** A woven saddle blanket: a coloured ground, a gold border, a pattern. */
function blanket(key: string, ground: string, border: string, pattern: string): THREE.MeshStandardMaterial {
  const m = coat(key, 256, 256, (g, w, h) => {
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    g.fillStyle = border;
    g.fillRect(0, 0, w, 22);
    g.fillRect(0, h - 22, w, 22);
    g.fillRect(0, 0, 22, h);
    g.fillRect(w - 22, 0, 22, h);
    g.fillStyle = pattern;
    for (let x = 40; x < w - 30; x += 34) {
      for (let y = 40; y < h - 30; y += 34) {
        g.beginPath();
        g.moveTo(x, y - 10);
        g.lineTo(x + 10, y);
        g.lineTo(x, y + 10);
        g.lineTo(x - 10, y);
        g.fill();
      }
    }
  }, 0.75);
  m.side = THREE.DoubleSide;
  return m;
}

// --- greater one-horned rhinoceros --------------------------------------------

export function rhino(): THREE.Group {
  const group = new THREE.Group();
  const hide = rhinoHide();
  const fold = mat(0x75716a, 0.9);
  const horn = mat(0x3f362e, 0.45);
  const nail = mat(0xa8a194, 0.6);

  const body = new THREE.Group();
  group.add(body);
  // The barrel, dipping where the armour plates overlap.
  const torso = lathe(
    [[-0.98, 0], [-0.95, 0.2], [-0.86, 0.34], [-0.7, 0.43], [-0.5, 0.47], [-0.36, 0.47], [-0.31, 0.44], [-0.26, 0.48],
      [-0.05, 0.5], [0.15, 0.5], [0.24, 0.47], [0.29, 0.5], [0.42, 0.49], [0.55, 0.43], [0.66, 0.33], [0.72, 0.2], [0.74, 0]],
    hide, 1, 0.86,
  );
  torso.position.y = 0.84;
  body.add(torso);
  // The overhanging rims of the shoulder, saddle and rump plates.
  for (const [x, r] of [[-0.31, 0.475], [0.25, 0.495]]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.024, 8, 40, Math.PI + 0.9), fold);
    rim.rotation.set(0, -Math.PI / 2, -0.45);
    rim.scale.set(0.86, 1, 1);
    rim.position.set(x, 0.84, 0);
    body.add(rim);
  }

  // The head hangs low and long, on a pivot so it can swing.
  const headPivot = new THREE.Group();
  headPivot.position.set(0.58, 0.9, 0);
  body.add(headPivot);
  const head = new THREE.Group();
  head.rotation.z = -0.42;
  headPivot.add(head);
  head.add(lathe([[-0.06, 0], [-0.02, 0.19], [0.1, 0.235], [0.26, 0.215], [0.42, 0.17], [0.56, 0.145], [0.64, 0.12], [0.69, 0.07], [0.7, 0]], hide, 0.95, 0.8));
  const lip = blob(0.06, 0.05, 0.07, mat(0x8a7a72, 0.8), 12);
  lip.position.set(0.68, -0.06, 0);
  head.add(lip);
  for (const s of [-1, 1]) {
    const nostril = blob(0.014, 0.01, 0.01, mat(0x2a2420, 0.7), 8);
    nostril.position.set(0.665, 0.02, s * 0.06);
    head.add(nostril);
    // Tube-shaped ears with a fringe at the tip, turned outward.
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 14, 1, true), mat(0x7f7b74, 0.85));
    (ear.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ear.position.set(0.02, 0.25, s * 0.12);
    ear.rotation.set(s * 0.5, 0, 0.45);
    const fringe = blob(0.03, 0.02, 0.03, mat(0x4a443e, 0.95), 8);
    fringe.position.set(-0.025, 0.34, s * 0.16);
    head.add(ear, fringe);
  }
  head.add(sinew([[0.5, 0.08, 0], [0.55, 0.22, 0], [0.5, 0.37, 0]], taper(0.075, 0.012), horn, 10, 12));
  head.add(eyes(0.3, 0.06, 0.155, 0.022));

  // Stocky legs, a knee in each, on three-toed feet.
  for (const [x, z] of [[-0.55, -0.25], [-0.55, 0.25], [0.4, -0.24], [0.4, 0.24]]) {
    group.add(leg([[x, 0.74, z], [x + 0.03, 0.38, z * 1.03], [x, 0.08, z]], swell(0.17, 0.15, 0.135), hide));
    const foot = blob(0.15, 0.07, 0.15, fold, 14);
    foot.position.set(x + 0.02, 0.05, z);
    group.add(foot);
    for (let k = -1; k <= 1; k++) {
      const toe = blob(0.045, 0.035, 0.045, nail, 8);
      toe.position.set(x + 0.02 + 0.13 * Math.cos(k * 0.7), 0.04, z + 0.13 * Math.sin(k * 0.7));
      group.add(toe);
    }
  }
  const swish = tail([-0.95, 1.0, 0], [[0, 0, 0], [-0.07, -0.18, 0], [-0.06, -0.38, 0]], taper(0.035, 0.016), hide, mat(0x3a3530, 0.9), 0.6);
  group.add(swish);

  moving(group, headPivot, body, swish);
  group.userData.tick = ((_dt: number, t: number) => {
    headPivot.rotation.y = Math.sin(t * 0.7) * 0.22;
    headPivot.rotation.z = Math.sin(t * 1.3) * 0.06 - 0.06;
    body.scale.y = 1 + Math.sin(t * 2) * 0.012;
    swish.rotation.x = Math.sin(t * 2.6) * 0.4;
  }) satisfies Tick;
  return shadowed(group);
}

// --- Asian elephant -------------------------------------------------------------

export function elephant(): THREE.Group {
  const group = new THREE.Group();
  const hide = elephantHide();
  const dark = mat(0x5c5652, 0.9);
  const ivory = mat(0xf1e8d2, 0.35);
  const nailMat = mat(0xd8cfbc, 0.5);

  const torso = lathe(
    [[-0.86, 0], [-0.84, 0.28], [-0.72, 0.48], [-0.5, 0.6], [-0.15, 0.64], [0.2, 0.63], [0.45, 0.57], [0.62, 0.46], [0.72, 0.3], [0.75, 0]],
    hide, 1, 0.8,
  );
  torso.position.y = 1.2;
  // The Asian elephant's arched back, highest in the middle.
  const arch = blob(0.6, 0.3, 0.42, hide);
  arch.position.set(-0.08, 1.58, 0);
  group.add(torso, arch);

  // The head, with the twin domes on top and a painted festival forehead.
  const head = new THREE.Group();
  head.position.set(0.8, 1.42, 0);
  group.add(head);
  const skull = blob(0.38, 0.44, 0.36, hide);
  skull.position.set(0.06, 0, 0);
  head.add(skull);
  for (const s of [-1, 1]) {
    const dome = blob(0.17, 0.17, 0.15, hide, 16);
    dome.position.set(0.04, 0.36, s * 0.11);
    head.add(dome);
  }
  head.add(eyes(0.3, 0.04, 0.28, 0.026));
  const forehead = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    coat('elephant-forehead', 256, 256, (g, w) => {
      // Festival paint: a flower between the eyes, rings of dots, curling vines.
      g.clearRect(0, 0, w, w);
      const c = w / 2;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.strokeStyle = 'rgba(200, 52, 47, 0.9)';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(c, c + 30);
        g.bezierCurveTo(c + s * 40, c + 70, c + s * 90, c + 40, c + s * 80, c);
        g.bezierCurveTo(c + s * 72, c - 26, c + s * 50, c - 20, c + s * 56, c - 4);
        g.stroke();
        g.strokeStyle = 'rgba(250, 246, 236, 0.9)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(c, c + 44);
        g.bezierCurveTo(c + s * 46, c + 92, c + s * 108, c + 52, c + s * 98, c - 4);
        g.stroke();
      }
      g.fillStyle = 'rgba(250, 246, 236, 0.95)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * 46, c - 20 + Math.sin(a) * 46, 4, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillStyle = i % 2 ? '#f2c230' : '#f29a1e';
        g.beginPath();
        g.ellipse(c + Math.cos(a) * 18, c - 20 + Math.sin(a) * 18, 16, 8, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#c8342f';
      g.beginPath();
      g.arc(c, c - 20, 9, 0, Math.PI * 2);
      g.fill();
    }, 0.6),
  );
  (forehead.material as THREE.MeshStandardMaterial).transparent = true;
  forehead.rotation.y = Math.PI / 2;
  forehead.position.set(0.43, 0.1, 0);
  head.add(forehead);

  // Trunk: a chain of smooth tapering segments, curling down, animated.
  const trunkRoot = new THREE.Group();
  trunkRoot.position.set(0.4, -0.14, 0);
  head.add(trunkRoot);
  const trunkSegs: THREE.Group[] = [];
  let parent: THREE.Group = trunkRoot;
  const N = 8;
  for (let i = 0; i < N; i++) {
    const r0 = 0.15 - i * 0.012;
    const seg = new THREE.Group();
    seg.add(sinew([[0, 0, 0], [0, -0.16, 0]], taper(r0, r0 - 0.012), hide, 2, 14));
    // Wrinkle rings.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r0 - 0.006, 0.007, 6, 20), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.08;
    seg.add(ring);
    seg.position.y = i === 0 ? 0 : -0.15;
    parent.add(seg);
    trunkSegs.push(seg);
    parent = seg;
  }
  const finger = blob(0.04, 0.03, 0.04, hide, 10);
  finger.position.set(0.04, -0.17, 0);
  parent.add(finger);

  for (const s of [-1, 1]) {
    head.add(sinew([[0.34, -0.24, s * 0.13], [0.48, -0.36, s * 0.14], [0.6, -0.32, s * 0.15]], taper(0.045, 0.014), ivory, 10, 10));
  }

  // Ears: rounded, thin, flapping.
  const ears: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.25);
    shape.bezierCurveTo(-0.35, 0.3, -0.42, -0.1, -0.2, -0.35);
    shape.bezierCurveTo(-0.05, -0.45, 0.05, -0.2, 0, 0.25);
    const ear = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.01, curveSegments: 16 }),
      mat(0x6e6864, 0.9),
    );
    ear.position.set(0.02, 0.06, s * 0.32);
    if (s < 0) ear.rotation.y = Math.PI;
    ears.push(ear);
    head.add(ear);
  }

  // Pillar legs, a hint of knee, broad feet with four toenails each.
  for (const x of [-0.46, 0.46]) {
    for (const z of [-0.27, 0.27]) {
      group.add(leg([[x, 1.05, z], [x + 0.03, 0.55, z], [x, 0.1, z]], swell(0.22, 0.19, 0.185), hide));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 22), hide);
      foot.position.set(x, 0.06, z);
      group.add(foot);
      for (let k = 0; k < 4; k++) {
        const a = -0.75 + k * 0.5;
        const nail = blob(0.04, 0.035, 0.035, nailMat, 8);
        nail.position.set(x + 0.2 * Math.cos(a), 0.05, z + 0.2 * Math.sin(a));
        group.add(nail);
      }
    }
  }

  // A festival blanket over the back, red and gold, with tassels.
  const cloth = blanket('elephant-blanket', '#a8223a', '#e2b23a', '#f2d27a');
  const rAt = (x: number): number => {
    const p: [number, number][] = [[-0.5, 0.6], [-0.15, 0.64], [0.2, 0.63], [0.45, 0.57]];
    for (let i = 1; i < p.length; i++) {
      if (x <= p[i][0]) {
        const k = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
        return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k;
      }
    }
    return p[p.length - 1][1];
  };
  const span = 1.15;
  const drape = lathe(
    Array.from({ length: 9 }, (_, i) => {
      const x = -0.42 + i * 0.1;
      return [x, rAt(x) + 0.03] as [number, number];
    }),
    cloth, 1, 0.8, 24, Math.PI * 1.5 - span, span * 2,
  );
  drape.position.y = 1.2;
  group.add(drape);
  for (const s of [-1, 1]) {
    for (let x = -0.38; x <= 0.4; x += 0.13) {
      const tassel = blob(0.025, 0.045, 0.025, GOLD(), 8);
      const r = rAt(x) + 0.03;
      tassel.position.set(x, 1.2 + Math.cos(span) * r - 0.05, s * Math.sin(span) * r * 0.8);
      group.add(tassel);
    }
  }
  // A carved seat with gilt rails.
  const seatY = 1.92;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.46), mat(0x5a3220, 0.6));
  base.position.set(-0.05, seatY, 0);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.4), mat(0xc8342f, 0.7));
  cushion.position.set(-0.05, seatY + 0.07, 0);
  group.add(base, cushion);
  for (const [dx, dz] of [[-0.23, -0.21], [-0.23, 0.21], [0.13, -0.21], [0.13, 0.21]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), GOLD());
    post.position.set(-0.05 + dx + 0.05, seatY + 0.13, dz);
    group.add(post);
  }
  for (const dz of [-0.21, 0.21]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8), GOLD());
    rail.rotation.z = Math.PI / 2;
    rail.position.set(-0.05, seatY + 0.23, dz);
    group.add(rail);
  }

  const swish = tail([-0.84, 1.36, 0], [[0, 0, 0], [-0.08, -0.3, 0], [-0.06, -0.62, 0]], taper(0.04, 0.02), hide, dark, 0.9);
  group.add(swish);

  moving(group, ...trunkSegs, ...ears, swish);
  group.userData.tick = ((_dt: number, t: number) => {
    trunkSegs.forEach((seg, i) => {
      seg.rotation.z = Math.sin(t * 1.1 - i * 0.35) * 0.11 + (i > 4 ? 0.2 : 0.04);
    });
    ears[0].rotation.y = Math.PI + Math.sin(t * 2.3) * 0.35 - 0.2;
    ears[1].rotation.y = -Math.sin(t * 2.3) * 0.35 + 0.2;
    swish.rotation.x = Math.sin(t * 1.9) * 0.35;
  }) satisfies Tick;
  return shadowed(group);
}

// --- spotted deer (chital) ------------------------------------------------------

export function deer(seed = 0): THREE.Group {
  const group = new THREE.Group();
  const spotted = chitalCoat();
  const rufous = mat(0xb8682e, 0.8);
  const pale = mat(0xf2e6d0, 0.85);
  const hoof = mat(0x2a2420, 0.6);
  const antler = mat(0xd8c8a8, 0.6);

  const torso = lathe(
    [[-0.43, 0], [-0.41, 0.09], [-0.34, 0.155], [-0.18, 0.17], [0.05, 0.16], [0.22, 0.165], [0.32, 0.15], [0.38, 0.11], [0.41, 0.05], [0.42, 0]],
    spotted, 1.12, 0.85,
  );
  torso.position.y = 0.68;
  group.add(torso);

  // A long neck arching up to a fine head; the whole of it dips to graze.
  const headPivot = new THREE.Group();
  headPivot.position.set(0.32, 0.76, 0);
  group.add(headPivot);
  headPivot.add(sinew([[0, 0, 0], [0.08, 0.12, 0], [0.13, 0.25, 0]], taper(0.085, 0.055), rufous, 10, 12));
  const head = new THREE.Group();
  head.position.set(0.15, 0.28, 0);
  head.rotation.z = -0.5;
  headPivot.add(head);
  head.add(lathe([[-0.07, 0], [-0.05, 0.06], [0.02, 0.075], [0.1, 0.06], [0.17, 0.04], [0.2, 0.025], [0.21, 0]], rufous, 1.05, 0.8, 20));
  const nose = blob(0.025, 0.022, 0.025, hoof, 10);
  nose.position.set(0.205, 0.005, 0);
  head.add(nose, eyes(0.03, 0.035, 0.052, 0.014));
  for (const s of [-1, 1]) {
    const ear = blob(0.07, 0.022, 0.036, rufous, 12);
    ear.position.set(-0.04, 0.06, s * 0.075);
    ear.rotation.set(s * 0.7, 0, 0.45);
    const inner = blob(0.05, 0.012, 0.022, pale, 10);
    inner.position.set(-0.038, 0.062, s * 0.083);
    inner.rotation.copy(ear.rotation);
    head.add(ear, inner);
    // Lyre-shaped antlers sweeping up and back, with a brow tine and a top fork.
    head.add(sinew([[-0.02, 0.07, s * 0.025], [-0.12, 0.2, s * 0.08], [-0.1, 0.34, s * 0.12], [-0.16, 0.44, s * 0.1]], taper(0.015, 0.006), antler, 12, 8));
    head.add(sinew([[-0.04, 0.11, s * 0.04], [0.05, 0.17, s * 0.06]], taper(0.01, 0.004), antler, 4, 6));
    head.add(sinew([[-0.1, 0.33, s * 0.115], [-0.03, 0.4, s * 0.13]], taper(0.008, 0.004), antler, 4, 6));
  }

  // Slender legs: straight in front, hocks bent behind.
  for (const z of [-0.075, 0.075]) {
    group.add(leg([[0.27, 0.64, z], [0.28, 0.33, z], [0.27, 0.04, z]], taper(0.045, 0.02), rufous));
    group.add(leg([[-0.3, 0.68, z], [-0.27, 0.44, z], [-0.37, 0.26, z], [-0.31, 0.04, z]], taper(0.065, 0.02), rufous));
    for (const x of [0.27, -0.31]) {
      const h = blob(0.026, 0.022, 0.022, hoof, 8);
      h.position.set(x, 0.022, z);
      group.add(h);
    }
  }
  const scut = tail([-0.41, 0.78, 0], [[0, 0, 0], [-0.05, -0.07, 0], [-0.06, -0.15, 0]], taper(0.028, 0.016), rufous);
  const flash = blob(0.024, 0.06, 0.02, pale, 8);
  flash.position.set(-0.05, -0.08, 0);
  scut.add(flash);
  group.add(scut);

  moving(group, headPivot);
  group.userData.tick = ((_dt: number, t: number) => {
    // Graze, look up, graze.
    const p = (Math.sin(t * 0.5 + seed) + 1) / 2;
    headPivot.rotation.z = -p * 1.15;
  }) satisfies Tick;
  return shadowed(group);
}

// --- gharial --------------------------------------------------------------------

export function gharial(): THREE.Group {
  const group = new THREE.Group();
  const hide = gharialHide();
  const skin = mat(0x5f6b45, 0.7);
  const tooth = mat(0xf2ecd8, 0.4);
  const body = lathe([[-0.52, 0], [-0.5, 0.08], [-0.35, 0.15], [-0.1, 0.18], [0.2, 0.17], [0.42, 0.13], [0.56, 0.09], [0.6, 0]], hide, 0.5, 1.05);
  body.position.y = 0.11;
  group.add(body);
  const head = blob(0.14, 0.075, 0.11, skin);
  head.position.set(0.62, 0.1, 0);
  group.add(head);
  for (const s of [-1, 1]) {
    const bump = blob(0.035, 0.03, 0.03, skin, 10);
    bump.position.set(0.6, 0.165, s * 0.05);
    group.add(bump);
  }
  group.add(eyes(0.615, 0.185, 0.055, 0.016, 0xc8b040));
  // The long, thin snout and the bulb — the ghara — at its tip.
  group.add(sinew([[0.7, 0.09, 0], [0.95, 0.08, 0], [1.18, 0.075, 0]], taper(0.045, 0.026), skin, 10, 12));
  const ghara = blob(0.055, 0.045, 0.06, mat(0x4f5a36, 0.7), 14);
  ghara.position.set(1.2, 0.095, 0);
  group.add(ghara);
  for (let i = 0; i < 8; i++) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 5), tooth);
      t.position.set(0.76 + i * 0.055, 0.055, s * (0.038 - i * 0.0015));
      t.rotation.set(s * 0.5, 0, Math.PI);
      group.add(t);
    }
  }
  // A long tail with twin crests of scutes.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.5, 0.11, 0);
  tailPivot.add(lathe([[-0.95, 0], [-0.8, 0.035], [-0.5, 0.08], [-0.2, 0.12], [0, 0.15]], hide, 0.6, 0.75, 20));
  for (let i = 0; i < 9; i++) {
    const x = -0.1 - i * 0.09;
    const r = 0.15 - i * 0.013;
    for (const s of [-1, 1]) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 5), skin);
      crest.position.set(x, r * 0.6, s * 0.02);
      tailPivot.add(crest);
    }
  }
  group.add(tailPivot);
  for (const x of [0.35, -0.3]) {
    for (const s of [-1, 1]) {
      group.add(leg([[x, 0.09, s * 0.12], [x + 0.06, 0.06, s * 0.24], [x + 0.1, 0.02, s * 0.3]], taper(0.045, 0.03), skin));
      const foot = blob(0.06, 0.015, 0.045, skin, 10);
      foot.position.set(x + 0.13, 0.015, s * 0.31);
      group.add(foot);
    }
  }
  moving(group, tailPivot);
  group.userData.tick = ((_dt: number, t: number) => {
    tailPivot.rotation.y = Math.sin(t * 0.9) * 0.25;
  }) satisfies Tick;
  return shadowed(group);
}

// --- yak ------------------------------------------------------------------------

export function yak(color = 0x2e2622, seed = 0): THREE.Group {
  const group = new THREE.Group();
  const hair = mat(color, 0.95);
  const fringe = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, -0.03), roughness: 1, side: THREE.DoubleSide });
  const horn = mat(0xe9e0c8, 0.5);
  const hoof = mat(0x2a2420, 0.6);
  const rnd = seeded(seed * 31 + 5);

  const torso = lathe(
    [[-0.58, 0], [-0.55, 0.2], [-0.42, 0.3], [-0.1, 0.32], [0.2, 0.33], [0.4, 0.31], [0.52, 0.24], [0.57, 0.12], [0.58, 0]],
    hair, 1.05, 0.92,
  );
  torso.position.y = 0.8;
  const hump = blob(0.32, 0.27, 0.27, hair);
  hump.position.set(0.22, 1.02, 0);
  group.add(torso, hump);
  // The long skirt of hair, ragged at the hem, that hangs to the knees.
  const skirtGeo = new THREE.CylinderGeometry(0.34, 0.4, 0.46, 36, 4, true);
  const pos = skirtGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -0.2) pos.setY(i, pos.getY(i) - rnd() * 0.12);
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, fringe);
  skirt.scale.set(1.62, 1, 0.92);
  skirt.position.set(0, 0.58, 0);
  group.add(skirt);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.55, 0.8, 0);
  group.add(headPivot);
  const head = blob(0.17, 0.17, 0.15, hair);
  head.position.set(0.1, -0.06, 0);
  const forelock = blob(0.12, 0.08, 0.13, fringe, 14);
  forelock.position.set(0.06, 0.08, 0);
  const muzzle = blob(0.08, 0.08, 0.1, mat(0x3c3330, 0.8), 14);
  muzzle.position.set(0.24, -0.15, 0);
  headPivot.add(head, forelock, muzzle, eyes(0.18, 0.0, 0.12, 0.018));
  if (seed % 2 === 0 && color < 0x606060) {
    // Many Himalayan yaks have a white face.
    const blaze = blob(0.1, 0.09, 0.07, mat(0xf0ebe0, 0.9), 14);
    blaze.position.set(0.19, -0.02, 0);
    headPivot.add(blaze);
  }
  for (const s of [-1, 1]) {
    headPivot.add(sinew([[0.04, 0.06, s * 0.11], [0.03, 0.11, s * 0.26], [0.13, 0.27, s * 0.3]], taper(0.036, 0.008), horn, 10, 10));
  }
  for (const x of [-0.32, 0.32]) {
    for (const z of [-0.15, 0.15]) {
      group.add(leg([[x, 0.62, z], [x, 0.32, z], [x, 0.06, z]], taper(0.075, 0.055), hair));
      const h = blob(0.06, 0.04, 0.06, hoof, 10);
      h.position.set(x, 0.035, z);
      group.add(h);
    }
  }
  const swish = tail([-0.58, 0.86, 0], [[0, 0, 0], [-0.06, -0.22, 0], [-0.05, -0.42, 0]], taper(0.03, 0.02), hair, fringe, 1.5);
  group.add(swish);

  // Trekking kit: a striped blanket, a load either side, a bell at the throat.
  const kit = blanket(`yak-blanket`, '#c8342f', '#f2c230', '#2b5fb8');
  const drape = lathe([[-0.26, 0.345], [-0.1, 0.35], [0.06, 0.355], [0.18, 0.35]], kit, 1.05, 0.92, 20, Math.PI * 1.5 - 1.05, 2.1);
  drape.position.y = 0.8;
  group.add(drape);
  for (const s of [-1, 1]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.12), mat(0x8a5a32, 0.85));
    bag.position.set(-0.05, 0.86, s * 0.4);
    bag.rotation.x = s * -0.25;
    group.add(bag);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 20), mat(0xc8342f, 0.7));
  strap.rotation.y = Math.PI / 2;
  strap.position.set(0.56, 0.68, 0);
  const bell = blob(0.045, 0.06, 0.045, GOLD(), 12);
  bell.position.set(0.6, 0.53, 0);
  group.add(strap, bell);

  moving(group, headPivot, swish);
  group.userData.tick = ((_dt: number, t: number) => {
    headPivot.rotation.z = Math.sin(t * 0.8 + seed) * 0.12 - 0.15;
    swish.rotation.x = Math.sin(t * 2.2 + seed) * 0.4;
  }) satisfies Tick;
  return shadowed(group);
}

// --- rhesus macaque -------------------------------------------------------------

export function monkey(seed = 0): THREE.Group {
  const group = new THREE.Group();
  const fur = mat(0x9a7a56, 0.9);
  const rump = mat(0xb27860, 0.9);
  const skin = mat(0xe0a090, 0.7);
  const body = blob(0.13, 0.18, 0.12, fur);
  body.position.set(0, 0.24, 0);
  body.rotation.z = -0.25;
  const seat = blob(0.1, 0.06, 0.1, rump, 14);
  seat.position.set(-0.04, 0.08, 0);
  group.add(body, seat);
  // The head turns to look about; the face, ears and brow turn with it.
  const head = new THREE.Group();
  head.position.set(0.07, 0.45, 0);
  group.add(head);
  const skull = blob(0.095, 0.09, 0.09, fur, 18);
  const muzzle = blob(0.045, 0.065, 0.07, skin, 14);
  muzzle.position.set(0.065, -0.01, 0);
  const brow = blob(0.05, 0.02, 0.075, fur, 12);
  brow.position.set(0.06, 0.045, 0);
  head.add(skull, muzzle, brow, eyes(0.103, 0.012, 0.026, 0.011));
  for (const s of [-1, 1]) {
    const ear = blob(0.012, 0.03, 0.026, skin, 8);
    ear.position.set(0.0, 0.02, s * 0.09);
    head.add(ear);
    group.add(sinew([[0.05, 0.36, s * 0.1], [0.12, 0.24, s * 0.12], [0.17, 0.13, s * 0.08]], taper(0.03, 0.022), fur, 8, 8));
    const hand = blob(0.025, 0.02, 0.025, skin, 8);
    hand.position.set(0.18, 0.12, s * 0.075);
    group.add(hand);
    group.add(sinew([[-0.02, 0.12, s * 0.08], [0.1, 0.09, s * 0.1], [0.1, 0.03, s * 0.08]], taper(0.045, 0.03), fur, 8, 8));
    const foot = blob(0.05, 0.018, 0.028, skin, 8);
    foot.position.set(0.13, 0.015, s * 0.08);
    group.add(foot);
  }
  group.add(sinew([[-0.1, 0.1, 0], [-0.24, 0.05, 0.04], [-0.3, 0.14, 0.12], [-0.27, 0.24, 0.14]], taper(0.02, 0.012), fur, 12, 8));
  moving(group, head);
  group.userData.tick = ((_dt: number, t: number) => {
    head.rotation.y = Math.sin(t * 1.7 + seed) * 0.5;
  }) satisfies Tick;
  return shadowed(group);
}

// --- Indian peafowl ---------------------------------------------------------------

/** The displayed train: green quills fanning out, rows of eye-spots, a scalloped edge. */
function peacockTrain(): THREE.MeshStandardMaterial {
  const m = coat('peacock-train', 512, 512, (g) => {
    const c = 256;
    g.clearRect(0, 0, 512, 512);
    // The fan, scalloped at the rim (canvas angles π..2π are the upper half).
    g.beginPath();
    g.moveTo(c, c);
    for (let i = 0; i <= 120; i++) {
      const a = Math.PI + (i / 120) * Math.PI;
      const r = 236 + Math.cos(i * 1.57) * 10;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath();
    const body = g.createRadialGradient(c, c, 10, c, c, 250);
    body.addColorStop(0, '#4a5a2a');
    body.addColorStop(0.5, '#2f7a4a');
    body.addColorStop(1, '#3f8a3a');
    g.fillStyle = body;
    g.fill();
    // Quills.
    g.strokeStyle = 'rgba(232, 214, 140, 0.45)';
    g.lineWidth = 1.5;
    for (let i = 0; i <= 64; i++) {
      const a = Math.PI + (i / 64) * Math.PI;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * 240, c + Math.sin(a) * 240);
      g.stroke();
    }
    // Rows of eye-spots, staggered.
    const eye = (x: number, y: number, a: number, s: number): void => {
      const layers: [number, string][] = [[1, '#c89a3a'], [0.78, '#1f8a5a'], [0.58, '#1d5fb0'], [0.34, '#0b1f4a']];
      for (const [k, col] of layers) {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x, y, 11 * s * k, 14 * s * k, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
    };
    for (const [r, n, s] of [[222, 30, 1], [178, 24, 0.9], [134, 18, 0.8], [92, 12, 0.65]] as const) {
      for (let i = 0; i < n; i++) {
        const a = Math.PI + ((i + (n % 2 ? 0.5 : 0.25)) / n) * Math.PI;
        eye(c + Math.cos(a) * r, c + Math.sin(a) * r, a, s);
      }
    }
  }, 0.4);
  m.transparent = true;
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  m.metalness = 0.15;
  return m;
}

export function peacock(): THREE.Group {
  const group = new THREE.Group();
  const blue = mat(0x1d4fa0, 0.3, 0.35);
  const bronze = mat(0x2f7a4a, 0.35, 0.3);
  const body = blob(0.15, 0.12, 0.11, blue);
  body.position.set(0, 0.32, 0);
  const back = blob(0.13, 0.08, 0.1, bronze);
  back.position.set(-0.06, 0.36, 0);
  group.add(body, back);
  for (const s of [-1, 1]) {
    const wing = blob(0.11, 0.05, 0.05, mat(0xa0784a, 0.7), 12);
    wing.position.set(-0.07, 0.31, s * 0.08);
    group.add(wing);
  }
  group.add(sinew([[0.08, 0.38, 0], [0.13, 0.47, 0], [0.13, 0.58, 0]], taper(0.05, 0.032), blue, 10, 10));
  const head = blob(0.045, 0.04, 0.035, blue, 14);
  head.position.set(0.14, 0.61, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 8), mat(0xc8b090, 0.5));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.19, 0.605, 0);
  group.add(head, beak, eyes(0.162, 0.618, 0.024, 0.008));
  for (const s of [-1, 1]) {
    for (const dy of [0.012, -0.01]) {
      const stripe = blob(0.02, 0.005, 0.004, mat(0xffffff, 0.5), 6);
      stripe.position.set(0.155, 0.615 + dy, s * 0.033);
      group.add(stripe);
    }
  }
  // The crest: a little fan of bare-shafted feathers with blue tips.
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.16;
    group.add(sinew([[0.135, 0.64, 0], [0.135 - Math.sin(a) * 0.02, 0.7, Math.sin(a) * 0.04]], taper(0.003, 0.003), blue, 2, 4));
    const tip = blob(0.012, 0.014, 0.006, blue, 6);
    tip.position.set(0.135 - Math.sin(a) * 0.02, 0.71, Math.sin(a) * 0.04);
    group.add(tip);
  }
  // The train, raised in display.
  const fan = new THREE.Group();
  fan.position.set(-0.1, 0.3, 0);
  fan.rotation.z = 0.28;
  const train = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48, 0, Math.PI), peacockTrain());
  train.rotation.y = Math.PI / 2;
  fan.add(train);
  group.add(fan);
  for (const z of [-0.04, 0.04]) {
    group.add(leg([[0, 0.24, z], [0.01, 0.12, z], [0, 0.01, z]], taper(0.012, 0.008), mat(0x8a7a6a, 0.6)));
  }
  moving(group, fan);
  group.userData.tick = ((_dt: number, t: number) => {
    fan.rotation.y = Math.sin(t * 6) * 0.02; // the shiver of a displaying peacock
    fan.scale.setScalar(0.96 + Math.max(0, Math.sin(t * 0.4)) * 0.06);
  }) satisfies Tick;
  return shadowed(group);
}

// --- red panda --------------------------------------------------------------------

export function redPanda(): THREE.Group {
  const group = new THREE.Group();
  const rust = mat(0xb5481e, 0.85);
  const black = mat(0x2a1a14, 0.85);
  const white = mat(0xf4eadc, 0.85);
  const body = lathe([[-0.22, 0], [-0.2, 0.08], [-0.1, 0.115], [0.08, 0.11], [0.18, 0.09], [0.22, 0.05], [0.23, 0]], rust, 1, 0.95, 24);
  body.position.y = 0.2;
  group.add(body);
  const head = new THREE.Group();
  head.position.set(0.24, 0.27, 0);
  group.add(head);
  // The face: white cheeks and brows, the dark "tear" lines below the eyes.
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 24, 18),
    face('panda-face', '#b5481e', (g, cx, cy) => {
      g.fillStyle = '#f4eadc';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + s * 44, cy + 18, 30, 22, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + s * 30, cy - 26, 12, 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#5a2210';
      g.lineWidth = 8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * 22, cy - 6);
        g.quadraticCurveTo(cx + s * 30, cy + 20, cx + s * 22, cy + 44);
        g.stroke();
      }
    }),
  );
  const muzzle = blob(0.045, 0.035, 0.045, white, 12);
  muzzle.position.set(0.075, -0.025, 0);
  const nose = blob(0.014, 0.012, 0.016, black, 8);
  nose.position.set(0.118, -0.015, 0);
  head.add(skull, muzzle, nose, eyes(0.072, 0.018, 0.04, 0.012));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.065, 12), white);
    ear.position.set(-0.01, 0.085, s * 0.06);
    ear.rotation.x = s * 0.45;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.05, 10), rust);
    inner.position.set(0.004, 0.083, s * 0.058);
    inner.rotation.x = s * 0.45;
    head.add(ear, inner);
  }
  for (const x of [-0.12, 0.12]) {
    for (const z of [-0.06, 0.06]) {
      group.add(leg([[x, 0.17, z], [x, 0.09, z], [x + 0.01, 0.02, z]], taper(0.034, 0.026), black));
    }
  }
  // The thick, ringed tail, curling up behind.
  const tailRoot = new THREE.Group();
  tailRoot.position.set(-0.2, 0.2, 0);
  tailRoot.add(sinew([[0, 0, 0], [-0.12, 0.02, 0], [-0.22, 0.07, 0], [-0.3, 0.15, 0]], taper(0.058, 0.04), ringed('panda-tail', '#b5481e', '#e8a070'), 16, 12));
  group.add(tailRoot);
  moving(group, tailRoot, head);
  group.userData.tick = ((_dt: number, t: number) => {
    tailRoot.rotation.z = Math.sin(t * 1.2) * 0.15;
    head.rotation.y = Math.sin(t * 0.6) * 0.3;
  }) satisfies Tick;
  return shadowed(group);
}

// --- a sacred cow, ambling the roads as cows do -----------------------------------

export function cow(seed = 0): THREE.Group {
  const group = new THREE.Group();
  const hide = mat(0xf2ede2, 0.85);
  const grey = mat(0x9a948a, 0.85);
  const hoof = mat(0x3a332c, 0.6);
  const torso = lathe(
    [[-0.5, 0], [-0.48, 0.15], [-0.38, 0.23], [-0.1, 0.25], [0.2, 0.25], [0.38, 0.23], [0.47, 0.16], [0.5, 0.08], [0.51, 0]],
    hide, 1, 0.84,
  );
  torso.position.y = 0.62;
  const hump = blob(0.12, 0.13, 0.1, hide);
  hump.position.set(0.3, 0.84, 0);
  const dewlap = blob(0.1, 0.15, 0.04, hide, 12);
  dewlap.position.set(0.45, 0.5, 0);
  group.add(torso, hump, dewlap);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.47, 0.74, 0);
  group.add(headPivot);
  const head = new THREE.Group();
  head.position.set(0.06, 0.02, 0);
  head.rotation.z = -0.7;
  headPivot.add(head);
  head.add(lathe([[-0.06, 0], [-0.04, 0.08], [0.06, 0.085], [0.18, 0.07], [0.25, 0.06], [0.28, 0]], hide, 1.05, 0.8, 20));
  const muzzle = blob(0.045, 0.05, 0.055, grey, 12);
  muzzle.position.set(0.27, 0, 0);
  // A red tika on the forehead.
  const tika = blob(0.012, 0.016, 0.004, mat(0xc8102e, 0.5), 8);
  tika.position.set(0.09, 0.075, 0);
  tika.rotation.z = 0.7;
  head.add(muzzle, tika, eyes(0.05, 0.045, 0.066, 0.015));
  for (const s of [-1, 1]) {
    const ear = blob(0.07, 0.022, 0.035, hide, 10);
    ear.position.set(-0.02, 0.03, s * 0.1);
    ear.rotation.x = s * 0.3;
    head.add(ear);
    // Horns painted for a festival, sweeping up.
    head.add(sinew([[-0.03, 0.07, s * 0.05], [-0.07, 0.15, s * 0.09], [-0.03, 0.22, s * 0.1]], taper(0.02, 0.006), mat(0xd8783a, 0.5), 8, 8));
  }
  // A marigold garland round the neck.
  const garland = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const f = blob(0.03, 0.03, 0.03, mat(i % 2 ? 0xf29a1e : 0xf2c230, 0.8), 8);
    f.position.set(0, Math.cos(a) * 0.15, Math.sin(a) * 0.13);
    garland.add(f);
  }
  garland.position.set(0.43, 0.66, 0);
  garland.rotation.z = 0.5;
  group.add(garland);
  for (const z of [-0.1, 0.1]) {
    group.add(leg([[0.3, 0.52, z], [0.31, 0.28, z], [0.3, 0.04, z]], taper(0.045, 0.026), hide));
    group.add(leg([[-0.32, 0.56, z], [-0.3, 0.36, z], [-0.37, 0.2, z], [-0.32, 0.04, z]], taper(0.06, 0.026), hide));
    for (const x of [0.3, -0.32]) {
      const h = blob(0.034, 0.025, 0.032, hoof, 8);
      h.position.set(x, 0.022, z);
      group.add(h);
    }
  }
  const swish = tail([-0.5, 0.72, 0], [[0, 0, 0], [-0.03, -0.2, 0], [-0.02, -0.42, 0]], taper(0.018, 0.012), hide, grey, 0.5);
  group.add(swish);
  moving(group, headPivot, swish);
  group.userData.tick = ((_dt: number, t: number) => {
    headPivot.rotation.z = Math.sin(t * 0.6 + seed) * 0.1;
    swish.rotation.x = Math.sin(t * 2.4 + seed) * 0.45;
  }) satisfies Tick;
  return shadowed(group);
}

// --- Bengal tiger, padding through the Terai grass ----------------------------------

export function tiger(): THREE.Group {
  const group = new THREE.Group();
  const striped = tigerCoat();
  const orange = mat(0xd9792a, 0.8);
  const white = mat(0xf8f0e0, 0.85);
  const torso = lathe(
    [[-0.52, 0], [-0.5, 0.1], [-0.4, 0.16], [-0.2, 0.17], [0.05, 0.165], [0.25, 0.18], [0.4, 0.16], [0.48, 0.1], [0.5, 0]],
    striped, 1.08, 0.9,
  );
  torso.position.y = 0.52;
  group.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.47, 0.58, 0);
  group.add(headPivot);
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 18),
    face('tiger-face', '#d9792a', (g, cx, cy) => {
      g.fillStyle = '#fbf4e6';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + s * 40, cy + 22, 34, 24, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + s * 26, cy - 22, 14, 9, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#1c120c';
      g.lineWidth = 6;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * 12, cy - 70);
        g.quadraticCurveTo(cx + i * 15, cy - 50, cx + i * 6, cy - 34);
        g.stroke();
      }
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(cx + s * (64 + k * 16), cy - 12 + k * 14);
          g.quadraticCurveTo(cx + s * (80 + k * 14), cy - 2 + k * 14, cx + s * (96 + k * 12), cy + 10 + k * 12);
          g.stroke();
        }
      }
    }),
  );
  skull.scale.set(1.05, 0.92, 1);
  skull.position.set(0.08, 0.02, 0);
  const muzzle = blob(0.07, 0.055, 0.08, white, 14);
  muzzle.position.set(0.18, -0.035, 0);
  const nose = blob(0.022, 0.016, 0.026, mat(0x8a4a3a, 0.6), 8);
  nose.position.set(0.24, -0.005, 0);
  headPivot.add(skull, muzzle, nose, eyes(0.18, 0.04, 0.062, 0.016, 0xd8a020));
  for (const s of [-1, 1]) {
    const ear = blob(0.036, 0.042, 0.016, orange, 10);
    ear.position.set(0.04, 0.13, s * 0.08);
    ear.rotation.x = s * 0.4;
    headPivot.add(ear);
  }
  for (const z of [-0.085, 0.085]) {
    group.add(leg([[0.32, 0.5, z], [0.34, 0.26, z], [0.32, 0.05, z]], taper(0.075, 0.05), orange));
    group.add(leg([[-0.36, 0.54, z], [-0.32, 0.32, z], [-0.42, 0.18, z], [-0.38, 0.05, z]], taper(0.085, 0.05), orange));
    for (const x of [0.33, -0.37]) {
      const paw = blob(0.06, 0.035, 0.05, white, 10);
      paw.position.set(x + 0.02, 0.03, z);
      group.add(paw);
    }
  }
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.5, 0.56, 0);
  tailPivot.add(sinew([[0, 0, 0], [-0.2, -0.14, 0], [-0.38, -0.12, 0], [-0.5, 0.0, 0]], taper(0.038, 0.028), ringed('tiger-tail', '#d9792a', '#1c120c', '#1c120c'), 16, 10));
  group.add(tailPivot);
  moving(group, headPivot, tailPivot);
  group.userData.tick = ((_dt: number, t: number) => {
    headPivot.rotation.y = Math.sin(t * 0.45) * 0.35;
    tailPivot.rotation.x = Math.sin(t * 1.6) * 0.3;
    tailPivot.rotation.y = Math.sin(t * 0.9) * 0.15;
  }) satisfies Tick;
  return shadowed(group);
}

// --- danphe, the Himalayan monal: Nepal's national bird --------------------------------

export function danphe(): THREE.Group {
  const group = new THREE.Group();
  const violet = mat(0x3a3aa0, 0.25, 0.6);
  const green = mat(0x1f9a6a, 0.25, 0.6);
  const copper = mat(0xc8601e, 0.3, 0.55);
  const rufous = mat(0xc8642a, 0.7);
  // A plump, pheasant-shaped body, tipped forward a little.
  const body = blob(0.15, 0.095, 0.095, violet);
  body.position.set(0, 0.2, 0);
  body.rotation.z = 0.15;
  const back = blob(0.1, 0.05, 0.08, green);
  back.position.set(-0.03, 0.265, 0);
  const rumpPatch = blob(0.045, 0.03, 0.055, mat(0xf4f0e8, 0.6), 10);
  rumpPatch.position.set(-0.11, 0.25, 0);
  group.add(body, back, rumpPatch);
  // A short copper-gold neck.
  group.add(sinew([[0.08, 0.24, 0], [0.11, 0.3, 0], [0.12, 0.34, 0]], taper(0.06, 0.045), copper, 6, 10));
  const headPivot = new THREE.Group();
  headPivot.position.set(0.125, 0.37, 0);
  group.add(headPivot);
  const head = blob(0.048, 0.042, 0.04, green, 14);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.04, 8), mat(0x8a8a8a, 0.5));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.055, -0.008, 0);
  headPivot.add(head, beak);
  for (const s of [-1, 1]) {
    const patch = blob(0.02, 0.016, 0.008, mat(0x2ab0d8, 0.3), 8);
    patch.position.set(0.02, 0.004, s * 0.034);
    headPivot.add(patch);
  }
  headPivot.add(eyes(0.025, 0.006, 0.036, 0.007));
  // The crest: a short spray of spatula-tipped feathers.
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.18;
    const tipAt: V3 = [-0.03, 0.08, Math.sin(a) * 0.035];
    headPivot.add(sinew([[0, 0.035, 0], tipAt], taper(0.003, 0.003), green, 2, 4));
    const tip = blob(0.016, 0.009, 0.007, green, 6);
    tip.position.set(...tipAt);
    headPivot.add(tip);
  }
  const tailFan = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20, Math.PI * 0.7, Math.PI * 0.6), rufous);
  (tailFan.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  tailFan.rotation.x = -Math.PI / 2;
  tailFan.rotation.y = -0.25;
  tailFan.position.set(-0.06, 0.2, 0);
  group.add(tailFan);
  for (const z of [-0.04, 0.04]) {
    group.add(leg([[0.01, 0.13, z], [0.03, 0.07, z], [0.02, 0.01, z]], taper(0.013, 0.009), mat(0x7a7a72, 0.6)));
  }
  moving(group, headPivot);
  group.userData.tick = ((_dt: number, t: number) => {
    // Peck, look, peck.
    headPivot.rotation.z = Math.max(0, Math.sin(t * 1.3)) * -0.7;
  }) satisfies Tick;
  return shadowed(group);
}
