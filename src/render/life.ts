/**
 * Things that move on their own: black kites riding the thermals over the
 * valley (and sharing them with the paragliders above Phewa Lake, as they do
 * at Sarangkot), a skein of white egrets crossing the Terai, the dawn
 * mountain flight circling the range on its turboprop, and smoke from village
 * chimneys.
 */

import * as THREE from 'three';
import { mat, turboprop, type Tick } from './props.ts';
import { seeded } from './noise.ts';

type Life = { group: THREE.Group; tick: Tick };

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Point `holder` along a path (its +z toward `ahead`) and roll it into the
 * turn toward `centre`, as a flyer banks round a circle.
 */
function fly(holder: THREE.Object3D, at: THREE.Vector3, ahead: THREE.Vector3, centre: THREE.Vector3, bank: number): void {
  holder.position.copy(at);
  holder.lookAt(ahead);
  const forward = ahead.clone().sub(at);
  const toCentre = centre.clone().sub(at);
  // A centre on the flyer's right (−x, since +x is its left) means bank right.
  const side = Math.sign(forward.cross(toCentre).dot(UP)) || 1;
  holder.rotateZ(-side * bank);
}

// --- birds ---------------------------------------------------------------------------

type Wing = { inner: THREE.Group; outer: THREE.Group };

/** A flat panel from a planform drawn with +x out along the wing and +y forward. */
function panel(points: [number, number][], material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2); // planform y → world z: the leading edge faces forward
  return new THREE.Mesh(geo, material);
}

/**
 * A bird facing +z: a body, a head, a tail, and two wings each hinged at the
 * shoulder and the wrist, so a wingbeat bends rather than flaps like a board.
 */
function birdBody(opts: {
  body: THREE.Material;
  head: THREE.Material;
  bill: THREE.Material;
  wing: THREE.Material;
  tip?: THREE.Material;
  inner: [number, number][];
  outer: [number, number][];
  elbow: number;
  tail: [number, number][];
  neck?: boolean;
  legs?: THREE.Material;
}): { group: THREE.Group; wings: Wing[] } {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), opts.body);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.85);
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), opts.head);
  if (opts.neck) {
    // An egret flies with its neck folded back into an S, the head tucked in.
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), opts.head);
    neck.rotation.x = Math.PI / 2 - 0.9;
    neck.position.set(0, 0.04, 0.14);
    head.position.set(0, 0.06, 0.2);
    group.add(neck);
  } else {
    head.position.set(0, 0.02, 0.16);
  }
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.014, opts.neck ? 0.11 : 0.05, 8), opts.bill);
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, head.position.y - 0.01, head.position.z + (opts.neck ? 0.08 : 0.05));
  group.add(head, bill);
  const tail = panel(opts.tail, opts.wing);
  tail.position.set(0, 0.005, -0.12);
  group.add(tail);
  if (opts.legs) {
    for (const x of [-0.015, 0.015]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 5), opts.legs);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(x, -0.02, -0.22);
      group.add(leg);
    }
  }
  const wings: Wing[] = [];
  for (const side of [1, -1]) {
    const mirror = new THREE.Group();
    mirror.scale.x = side; // the planform is drawn for +x; mirror it for the other wing
    const inner = new THREE.Group();
    inner.position.x = 0.035;
    inner.add(panel(opts.inner, opts.wing));
    const outer = new THREE.Group();
    outer.position.x = opts.elbow;
    outer.add(panel(opts.outer, opts.tip ?? opts.wing));
    inner.add(outer);
    mirror.add(inner);
    group.add(mirror);
    wings.push({ inner, outer });
  }
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { group, wings };
}

/** Wings at an angle: `beat` −1..1 through the stroke, the hand lagging the arm. */
function pose(wings: Wing[], beat: number, glide: number, lag: number): void {
  for (const w of wings) {
    w.inner.rotation.z = glide + beat * 0.55;
    w.outer.rotation.z = glide * 0.4 + lag * 0.45;
  }
}

/** The black kite: long angled wings with fingered tips, and a forked tail. */
function kite(): { group: THREE.Group; wings: Wing[] } {
  const brown = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9, side: THREE.DoubleSide });
  return birdBody({
    body: brown,
    head: mat(0x8a7660, 0.9),
    bill: mat(0xd8b040, 0.5),
    wing: brown,
    tip: new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.9, side: THREE.DoubleSide }),
    inner: [[0, 0.07], [0.26, 0.06], [0.26, -0.07], [0, -0.09]],
    // The hand, with four primaries spread like fingers at the tip.
    outer: [[0, 0.06], [0.2, 0.04], [0.3, 0.0], [0.27, -0.015], [0.29, -0.03], [0.25, -0.04], [0.26, -0.055], [0.21, -0.06], [0.2, -0.07], [0, -0.07]],
    elbow: 0.26,
    tail: [[0, 0.02], [0.065, -0.2], [0.02, -0.16], [0, -0.17], [-0.02, -0.16], [-0.065, -0.2]],
  });
}

/** The cattle egret: white, broad rounded wings, neck folded, legs trailing. */
function egret(): { group: THREE.Group; wings: Wing[] } {
  const white = new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.8, side: THREE.DoubleSide });
  return birdBody({
    body: white,
    head: white,
    bill: mat(0xf2c230, 0.5),
    wing: white,
    inner: [[0, 0.08], [0.24, 0.08], [0.24, -0.08], [0, -0.1]],
    outer: [[0, 0.08], [0.16, 0.07], [0.24, 0.02], [0.22, -0.05], [0.12, -0.08], [0, -0.08]],
    elbow: 0.24,
    tail: [[0.045, 0], [0.04, -0.09], [-0.04, -0.09], [-0.045, 0]],
    neck: true,
    legs: mat(0x2a2420, 0.6),
  });
}

/** Black kites circling in a thermal, gliding mostly, with a few lazy wingbeats now and then. */
export function kites(centre: THREE.Vector3, count = 4, radius = 4, seed = 2024): Life {
  const group = new THREE.Group();
  const rnd = seeded(seed);
  const birds = Array.from({ length: count }, () => {
    const b = kite();
    const holder = new THREE.Group();
    holder.add(b.group);
    // Big enough to read from the table, small beside a paraglider.
    b.group.scale.setScalar(0.85 + rnd() * 0.3);
    group.add(holder);
    return {
      holder,
      wings: b.wings,
      r: radius * (0.6 + rnd() * 0.8),
      h: (rnd() - 0.5) * 2.5,
      speed: 0.32 + rnd() * 0.16,
      phase: rnd() * Math.PI * 2,
      flapPhase: rnd() * 10,
      drift: new THREE.Vector3((rnd() - 0.5) * 2, 0, (rnd() - 0.5) * 2),
    };
  });
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const middle = new THREE.Vector3();
  return {
    group,
    tick(_dt, t) {
      for (const b of birds) {
        middle.copy(centre).add(b.drift);
        const at = (u: number, out: THREE.Vector3): THREE.Vector3 =>
          out.set(middle.x + Math.cos(u) * b.r, middle.y + b.h + Math.sin(u * 0.5) * 0.8, middle.z + Math.sin(u) * b.r);
        const s = t * b.speed + b.phase;
        at(s, p);
        at(s + 0.02, ahead);
        fly(b.holder, p, ahead, middle, 0.38);
        // A few beats every so often; otherwise wings held out, tips a touch raised.
        const flapping = Math.sin(t * 0.31 + b.flapPhase) > 0.82;
        const beat = flapping ? Math.sin(t * 7 + b.flapPhase) : 0;
        pose(b.wings, beat, 0.08, flapping ? Math.sin(t * 7 + b.flapPhase - 0.8) : 0.12);
      }
    },
  };
}

/** A loose V of egrets flying a long loop low over the paddies. */
export function egrets(centre: THREE.Vector3, count = 7, rx = 12, rz = 3.5): Life {
  const group = new THREE.Group();
  const birds = Array.from({ length: count }, (_, i) => {
    const b = egret();
    const holder = new THREE.Group();
    b.group.scale.setScalar(1.4);
    holder.add(b.group);
    group.add(holder);
    // Leader first, then alternate sides of the V, each a little further back.
    const rank = Math.ceil(i / 2);
    // Spaced by wingspans, so no two birds overlap.
    return { holder, wings: b.wings, lag: (rank * 1.0) / rx, side: i === 0 ? 0 : i % 2 ? 1 : -1, rank, beat: i * 0.7 };
  });
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const across = new THREE.Vector3();
  const path = (u: number, out: THREE.Vector3): THREE.Vector3 =>
    out.set(centre.x + Math.cos(u) * rx, centre.y + Math.sin(u * 2) * 0.4, centre.z + Math.sin(u) * rz);
  return {
    group,
    tick(_dt, t) {
      for (const b of birds) {
        const s = t * 0.07 - b.lag;
        path(s, p);
        path(s + 0.01, ahead);
        across.subVectors(ahead, p).cross(UP).normalize();
        p.addScaledVector(across, b.side * b.rank * 0.95);
        ahead.addScaledVector(across, b.side * b.rank * 0.95);
        fly(b.holder, p, ahead, centre, 0.18);
        const beat = Math.sin(t * 4.2 + b.beat);
        pose(b.wings, beat, 0.05, Math.sin(t * 4.2 + b.beat - 0.9));
      }
    },
  };
}

/** Kept for older callers: a thermal of kites. */
export function flock(centre: THREE.Vector3, radius: number, count = 6): Life {
  return kites(centre, count, radius / 3);
}

// --- the mountain flight -------------------------------------------------------

/** The dawn mountain flight: a turboprop circling the range, propellers turning. */
export function mountainFlight(centre: THREE.Vector3, radius: number): Life {
  const group = new THREE.Group();
  const plane = turboprop(1.1, { spin: true });
  plane.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  // Nose along +x; wrap it so lookAt (which aims +z) works.
  plane.rotation.y = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(plane);
  group.add(holder);
  const props = plane.userData.props as THREE.Group[];

  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  return {
    group,
    tick(dt, t) {
      const s = t * 0.05 + 1.2;
      const at = (u: number, out: THREE.Vector3): THREE.Vector3 =>
        out.set(centre.x + Math.cos(u) * radius, centre.y + Math.sin(u * 2) * 2, centre.z + Math.sin(u) * radius * 0.55);
      at(s, p);
      at(s + 0.01, ahead);
      fly(holder, p, ahead, centre, 0.2);
      for (const prop of props) prop.rotation.x += dt * 22;
    },
  };
}

/** Kept for older callers. */
export const circlingPlane = mountainFlight;

// --- paragliders over Phewa ----------------------------------------------------

/** A wing's paint: the cells across the span, a bold accent band, a darker trailing edge. */
function wingPaint(main: string, accent: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  // Across is the span (tip to tip), down is the chord (leading edge to trailing edge).
  g.fillStyle = main;
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 32; i++) {
    g.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    g.fillRect(i * 16, 0, 16, 128);
  }
  // A chevron of accent colour across the middle of the wing.
  g.fillStyle = accent;
  g.beginPath();
  g.moveTo(96, 128);
  g.lineTo(256, 30);
  g.lineTo(416, 128);
  g.lineTo(372, 128);
  g.lineTo(256, 62);
  g.lineTo(140, 128);
  g.closePath();
  g.fill();
  // Wingtips in the accent too, and seams between the cells.
  g.fillRect(0, 0, 36, 128);
  g.fillRect(476, 0, 36, 128);
  g.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 32; i++) {
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16, 128);
    g.stroke();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.2)';
  g.fillRect(0, 112, 512, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * A paraglider, flying toward +z: a ram-air wing arched across the sky above
 * the pilot, drawn as a real aerofoil with top and bottom skins, its lines
 * running down to a pilot sitting in a harness, legs out front, hands on the
 * brakes.
 */
function paraglider(main: string, accent: string, harness: number): THREE.Group {
  const group = new THREE.Group();
  const N = 28; // across the span
  const M = 8; // along the chord
  const R = 1.25; // arc radius
  const ARC = 1.0; // half the arc, in radians
  const top: number[] = [];
  const bottom: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * 2 - 1;
    const theta = s * ARC;
    const out = new THREE.Vector3(Math.sin(theta), Math.cos(theta), 0); // away from the pilot
    const centre = new THREE.Vector3(R * Math.sin(theta), R * (Math.cos(theta) - 1), 0);
    const chord = 0.66 * (1 - 0.42 * s * s);
    for (let j = 0; j <= M; j++) {
      const u = j / M; // 0 leading edge, 1 trailing edge
      const z = chord * (0.45 - u) + 0.04 * (1 - s * s);
      const thick = chord * 0.13 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.75);
      const pt = centre.clone().setZ(z);
      top.push(...pt.clone().addScaledVector(out, thick).toArray());
      bottom.push(...pt.clone().addScaledVector(out, -thick * 0.12).toArray());
      uvs.push((s + 1) / 2, 1 - u);
    }
  }
  const skin = (positions: number[]): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j;
        const b = a + M + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const cloth = new THREE.MeshStandardMaterial({ map: wingPaint(main, accent), roughness: 0.65, side: THREE.DoubleSide });
  const under = new THREE.MeshStandardMaterial({ color: new THREE.Color(main).multiplyScalar(0.7), roughness: 0.75, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(skin(top), cloth), new THREE.Mesh(skin(bottom), under));

  // The lines: from the risers at the pilot's shoulders up to the underside.
  const riser = (side: number): THREE.Vector3 => new THREE.Vector3(side * 0.09, -1.18, 0.0);
  const pts: THREE.Vector3[] = [];
  for (const i of [2, 7, 11, 14, 17, 21, 26]) {
    for (const j of [1, 5]) {
      const k = (i * (M + 1) + j) * 3;
      const end = new THREE.Vector3(bottom[k], bottom[k + 1], bottom[k + 2]);
      pts.push(riser(Math.sign(end.x) || 1), end);
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.55 }),
  );
  group.add(lines);

  // The pilot, sitting back in the harness.
  const suit = mat(harness, 0.7);
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 10), suit);
  seat.rotation.x = Math.PI / 2 - 0.35;
  seat.position.set(0, -1.32, -0.03);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.13, 4, 10), mat(0x2a3a5a, 0.7));
  torso.rotation.x = -0.45;
  torso.position.set(0, -1.21, -0.03);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), mat(0xf6f6f6, 0.3));
  helmet.position.set(0, -1.1, -0.01);
  group.add(seat, torso, helmet);
  for (const s of [-1, 1]) {
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 3, 6), mat(0x2a3a5a, 0.7));
    shin.rotation.x = Math.PI / 2 - 0.2;
    shin.position.set(s * 0.04, -1.36, 0.14);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.14, 3, 6), mat(0x2a3a5a, 0.7));
    arm.position.set(s * 0.08, -1.12, 0.0);
    arm.rotation.z = -s * 0.25;
    group.add(shin, arm);
  }
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  group.scale.setScalar(0.7);
  return group;
}

export function paragliders(centre: THREE.Vector3): Life {
  const group = new THREE.Group();
  const wings: [string, string, number][] = [
    ['#e8452c', '#f2c230', 0x2b5fa8],
    ['#2b8fd8', '#ffffff', 0xe8452c],
    ['#8a3fc4', '#f28a3c', 0x2f8f5b],
    ['#f2c230', '#2f8f5b', 0x8a3fc4],
  ];
  const gliders = wings.map(([c, a, h], i) => {
    const g = paraglider(c, a, h);
    const holder = new THREE.Group();
    holder.add(g);
    group.add(holder);
    return { holder, phase: (i / wings.length) * Math.PI * 2, r: 3 + i * 1.1, h: 6.5 + i * 1.2 };
  });
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const middle = new THREE.Vector3();
  return {
    group,
    tick(_dt, t) {
      for (const g of gliders) {
        middle.set(centre.x, centre.y + g.h, centre.z);
        const at = (u: number, out: THREE.Vector3): THREE.Vector3 =>
          out.set(centre.x + Math.cos(u) * g.r, centre.y + g.h + Math.sin(u * 3) * 0.4, centre.z + Math.sin(u) * g.r * 0.8);
        const s = t * 0.18 + g.phase;
        at(s, p);
        at(s + 0.02, ahead);
        fly(g.holder, p, ahead, middle, 0.3);
      }
    },
  };
}

// --- chimney smoke -----------------------------------------------------------

const smokeMat = new THREE.MeshStandardMaterial({
  color: 0xe8e4de,
  transparent: true,
  opacity: 0.6,
  roughness: 1,
  depthWrite: false,
});
const smokeGeo = new THREE.IcosahedronGeometry(0.16, 1);

export function smoke(at: THREE.Vector3, seed = 1): Life {
  const group = new THREE.Group();
  group.position.copy(at);
  const rnd = seeded(seed);
  const PUFFS = 7;
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
    group.add(m);
    return { m, offset: i / PUFFS, drift: rnd() * 0.3 };
  });
  return {
    group,
    tick(_dt, t) {
      for (const p of puffs) {
        const life = (t * 0.22 + p.offset) % 1;
        // Rising and leaning with the breeze, spreading and thinning as it goes.
        p.m.position.set(life * life * (0.9 + p.drift), life * 2.2, Math.sin(life * 6 + p.drift * 10) * 0.12);
        p.m.scale.setScalar(0.5 + life * 2.4);
        (p.m.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - life) * Math.min(life * 6, 1);
      }
    },
  };
}
