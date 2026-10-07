/**
 * Low-poly props for the board's picture panels — temples, peaks, trees,
 * animals and buildings — all built from primitives. Each returns a Group
 * standing on y = 0. Animated props hang a `tick(dt, t)` on userData, which
 * the scenery loop calls every frame.
 */

import * as THREE from 'three';
import { seeded } from './noise.ts';

export type Tick = (dt: number, t: number) => void;

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared materials — one per (colour, roughness, metalness, flat) combination. */
export function mat(color: number, roughness = 0.8, metalness = 0, flat = false): THREE.MeshStandardMaterial {
  const key = `${color}-${roughness}-${metalness}-${flat}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat });
    matCache.set(key, m);
  }
  return m;
}

export const GOLD = (): THREE.MeshStandardMaterial => mat(0xe2b23a, 0.28, 0.85);

function shadowed<T extends THREE.Object3D>(o: T, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = receive;
    }
  });
  return o;
}

// --- temples -----------------------------------------------------------------

/** Boudhanath: stepped mandala plinth, white dome, the eyes on all four sides, a gilded 13-step spire. */
export function stupa(scale = 1): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 3; i++) {
    const w = 3.4 - i * 0.5;
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, w), mat(0xf2ede0, 0.9));
    step.position.y = 0.08 + i * 0.16;
    group.add(step);
  }

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0xfdfbf6, 0.75),
  );
  dome.position.y = 0.48;
  dome.scale.y = 0.9;

  const harmika = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.85), GOLD());
  harmika.position.y = 1.85;

  // Painted eyes and the question-mark nose, on every face of the harmika.
  const eyeTex = eyesTexture();
  for (let i = 0; i < 4; i++) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshStandardMaterial({ map: eyeTex, transparent: true, roughness: 0.6 }),
    );
    const a = (i * Math.PI) / 2;
    face.position.set(Math.sin(a) * 0.432, 1.85, Math.cos(a) * 0.432);
    face.rotation.y = a;
    group.add(face);
  }

  // Thirteen rings of the spire, tapering — the steps to enlightenment.
  for (let i = 0; i < 13; i++) {
    const r = 0.42 - i * 0.026;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.1, 14), GOLD());
    ring.position.y = 2.22 + i * 0.1;
    group.add(ring);
  }
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 14), GOLD());
  umbrella.position.y = 3.62;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), GOLD());
  finial.position.y = 3.8;

  group.add(dome, harmika, umbrella, finial);
  shadowed(group);
  group.scale.setScalar(scale);
  group.userData.spireTop = new THREE.Vector3(0, 3.75 * scale, 0);
  return group;
}

let eyes: THREE.Texture | null = null;
function eyesTexture(): THREE.Texture {
  if (eyes) return eyes;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c255';
  g.fillRect(0, 0, 128, 80);
  g.strokeStyle = '#1e2a55';
  g.fillStyle = '#1e2a55';
  g.lineWidth = 5;
  for (const x of [36, 92]) {
    g.beginPath();
    g.ellipse(x, 34, 20, 9, 0, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(x, 34, 6, 0, Math.PI * 2);
    g.fillStyle = '#1e2a55';
    g.fill();
    g.beginPath();
    g.arc(x, 18, 20, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  // The "nose" — the Nepali numeral one.
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 50, 6, Math.PI, Math.PI * 2.4);
  g.quadraticCurveTo(62, 66, 66, 74);
  g.stroke();
  eyes = new THREE.CanvasTexture(c);
  eyes.colorSpace = THREE.SRGBColorSpace;
  return eyes;
}

/** A flared pagoda roof: a four-sided cone whose eaves kick up at the corners. */
export function pagodaRoof(width: number, height: number, color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(width, height, 4, 3, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Bottom ring: push out and lift slightly → a curved eave.
    if (y < -height / 2 + 0.001) {
      pos.setX(i, pos.getX(i) * 1.12);
      pos.setZ(i, pos.getZ(i) * 1.12);
      pos.setY(i, y + height * 0.12);
    } else if (y < height / 6) {
      pos.setX(i, pos.getX(i) * 0.92);
      pos.setZ(i, pos.getZ(i) * 0.92);
    }
  }
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  return roof;
}

/** A Newar pagoda temple — tiered flared roofs over carved-wood walls, on a stepped brick plinth. */
export function pagoda(tiers = 3, scale = 1, roofColor = 0x4a3a30): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(2.7 - i * 0.38, 0.22, 2.7 - i * 0.38),
      mat(i % 2 ? 0xc0754a : 0xa95a37, 0.95),
    );
    step.position.y = 0.11 + i * 0.22;
    group.add(step);
  }

  // Guardian lions at the foot of the stairs.
  for (const x of [-0.45, 0.45]) {
    const lion = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.22), mat(0xd9c9a3, 0.8));
    lion.position.set(x, 1.03, -1.0);
    group.add(lion);
  }

  let y = 0.88;
  for (let i = 0; i < tiers; i++) {
    const width = 1.45 - i * 0.3;
    const h = 0.7 - i * 0.06;

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, h, width), mat(0x7a2e1f, 0.85));
    body.position.y = y + h / 2;

    // Carved wooden windows: a dark band on each face.
    const band = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, h * 0.3, width * 1.02), mat(0x3a1d14, 0.7));
    band.position.y = y + h * 0.55;

    // Gilded edge under each roof.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width * 1.1, 0.05, width * 1.1), GOLD());
    trim.position.y = y + h;

    const roof = pagodaRoof(width * 1.0, 0.5, roofColor);
    roof.position.y = y + h + 0.2;

    group.add(body, band, trim, roof);
    y += h + 0.32;
  }

  const kalash = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 10), GOLD());
  kalash.position.y = y + 0.32;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), GOLD());
  bell.position.y = y + 0.08;
  group.add(kalash, bell);

  shadowed(group);
  group.scale.setScalar(scale);
  return group;
}

/** A shikhara — the stone tower temple, like Krishna Mandir in Patan. */
export function shikhara(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const stone = mat(0xc9b28c, 0.9, 0, true);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), stone);
  base.position.y = 0.25;
  const pavilion = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.6, 1.25), mat(0xb89a72, 0.9));
  pavilion.position.y = 0.8;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.6, 1.9, 8, 4), stone);
  tower.position.y = 2.05;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), GOLD());
  top.position.y = 3.05;
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
    const mini = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), stone);
    mini.position.set(x, 1.45, z);
    group.add(mini);
  }
  group.add(base, pavilion, tower, top);
  shadowed(group);
  group.scale.setScalar(scale);
  return group;
}

/** Maya Devi Temple: a white, low, square-walled shrine with a gilt top. */
export function whiteTemple(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.6), mat(0xf7f5ef, 0.9));
  base.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.0), mat(0xf7f5ef, 0.9));
  top.position.y = 1.0;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), GOLD());
  spire.position.y = 1.6;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.04), mat(0x8e3f2a, 0.6));
  door.position.set(0, 0.25, -0.81);
  group.add(base, top, spire, door);
  return shadowed(group);
}

/** The Ashoka pillar, behind its little railing. */
export function pillar(): THREE.Group {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.0, 12), mat(0xc9b48a, 0.6, 0.1));
  shaft.position.y = 1.0;
  const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.22, 12), mat(0xb39a6a, 0.6));
  capital.position.y = 2.1;
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16, 1, true), mat(0x7a6a50, 0.8));
  fence.position.y = 0.12;
  (fence.material as THREE.Material).side = THREE.DoubleSide;
  group.add(shaft, capital, fence);
  return shadowed(group);
}

/** A whitewashed chorten — the small stupa that marks a mountain village. */
export function chorten(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const white = mat(0xf6f3ea, 0.9);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), white);
  b1.position.y = 0.175;
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), white);
  b2.position.y = 0.475;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), white);
  bulb.position.y = 0.8;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 8), GOLD());
  spire.position.y = 1.35;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.92), mat(0xb2392c, 0.8));
  band.position.y = 0.33;
  group.add(b1, b2, bulb, spire, band);
  shadowed(group);
  group.scale.setScalar(scale);
  return group;
}

/** A prayer-wheel "Maane" wall; the wheels turn. */
export function prayerWheels(): THREE.Group {
  const group = new THREE.Group();

  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.6), mat(0xd8cdb4, 0.95));
  wall.position.y = 0.45;
  group.add(wall);

  const wheels: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 14), GOLD());
    wheel.position.set(-1.3 + i * 0.52, 1.12, -0.38);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.08, 14), mat(0xb2392c, 0.6));
    cap.position.y = 0.25;
    wheel.add(cap);
    wheels.push(wheel);
    group.add(wheel);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 1.4), mat(0x8e3f2a, 0.9));
  roof.position.set(0, 1.45, -0.2);
  group.add(roof);

  group.userData.tick = ((dt: number) => {
    wheels.forEach((w, i) => (w.rotation.y += dt * (1.6 + (i % 3) * 0.3)));
  }) satisfies Tick;
  return shadowed(group);
}

// --- mountains ---------------------------------------------------------------

/** A jagged snow-capped peak: jittered low-poly cone with a ragged snowline. */
export function peak(height: number, radius: number, seed = 1): THREE.Group {
  const rnd = seeded(seed * 977 + 13);
  const geo = new THREE.ConeGeometry(radius, height, 9, 6).toNonIndexed();
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Jitter by original vertex position so shared corners move together.
  const offsets = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y > height / 2 - 0.001) continue; // keep the summit sharp
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let o = offsets.get(key);
    if (!o) {
      const k = y < -height / 2 + 0.001 ? 0.12 : 0.22;
      o = [(rnd() - 0.5) * radius * k, (rnd() - 0.5) * height * 0.05, (rnd() - 0.5) * radius * k];
      offsets.set(key, o);
    }
    if (y > -height / 2 + 0.001) pos.setY(i, y + o[1]);
    pos.setX(i, x + o[0]);
    pos.setZ(i, z + o[2]);
  }

  const colours = new Float32Array(pos.count * 3);
  const snow = new THREE.Color(0xf8fbff);
  const rock = new THREE.Color(0x6f7c8f);
  const rockDark = new THREE.Color(0x58637a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 + height / 2;
    const line = height * (0.5 + (rnd() - 0.5) * 0.22);
    if (y > line) c.copy(snow);
    else c.copy(rock).lerp(rockDark, rnd() * 0.6);
    for (let k = 0; k < 3; k++) c.toArray(colours, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
  );
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  group.userData.summit = new THREE.Vector3(0, height, 0);
  return group;
}

/** A climbers' tent. */
export function tent(color: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 4), mat(color, 0.7, 0, true));
  body.rotation.y = Math.PI / 4;
  body.scale.set(1.3, 1, 0.9);
  body.position.y = 0.25;
  group.add(body);
  return shadowed(group);
}

// --- vegetation ---------------------------------------------------------------

/** Broadleaf tree — sal for Chitwan, with a little colour variation. */
export function tree(scale = 1, rnd: () => number = Math.random): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.2, 6), mat(0x6b4a2f, 0.9));
  trunk.position.y = 0.6;
  group.add(trunk);

  const greens = [0x2f7a3e, 0x3d8a45, 0x27693a, 0x4a9a4c];
  for (let i = 0; i < 3; i++) {
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55 - i * 0.08, 0),
      mat(greens[Math.floor(rnd() * greens.length)], 0.9, 0, true),
    );
    canopy.position.set((i - 1) * 0.3, 1.35 + i * 0.26, (i % 2) * 0.25 - 0.1);
    canopy.rotation.set(rnd() * 3, rnd() * 3, 0);
    group.add(canopy);
  }
  shadowed(group, false);
  group.scale.setScalar(scale);
  return group;
}

/** A conifer for the hills and mountains. */
export function pine(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5), mat(0x5b4030, 1));
  trunk.position.y = 0.25;
  group.add(trunk);
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.12, 0.7, 7), mat(0x2f5d3a, 0.9, 0, true));
    cone.position.y = 0.65 + i * 0.36;
    group.add(cone);
  }
  shadowed(group, false);
  group.scale.setScalar(scale);
  return group;
}

/** Rhododendron — Nepal's national flower, red blooms on a dark bush. */
export function rhododendron(scale = 1, rnd: () => number = Math.random): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.6, 5), mat(0x5b4030, 1));
  trunk.position.y = 0.3;
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x2d5a34, 0.9, 0, true));
  bush.position.y = 0.85;
  bush.scale.y = 0.8;
  group.add(trunk, bush);
  for (let i = 0; i < 9; i++) {
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(0xd8283c, 0.6, 0, true));
    const a = rnd() * Math.PI * 2;
    const e = rnd() * 1.2 - 0.2;
    bloom.position.set(Math.cos(a) * Math.cos(e) * 0.5, 0.85 + Math.sin(e) * 0.42, Math.sin(a) * Math.cos(e) * 0.5);
    group.add(bloom);
  }
  shadowed(group, false);
  group.scale.setScalar(scale);
  return group;
}

/** The great Bodhi tree at Lumbini — a wide, low canopy. */
export function bodhiTree(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 1.4, 7), mat(0x6b4a2f, 0.9));
  trunk.position.y = 0.7;
  group.add(trunk);
  const rnd = seeded(808);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + rnd() * 0.25, 0), mat(0x3f8a3a, 0.9, 0, true));
    puff.position.set(Math.cos(a) * 0.75, 1.6 + rnd() * 0.3, Math.sin(a) * 0.75);
    group.add(puff);
  }
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x4a9a44, 0.9, 0, true));
  top.position.y = 2.1;
  group.add(top);
  shadowed(group, false);
  group.scale.setScalar(scale);
  return group;
}

/** A terraced hillside — the stepped fields of the middle hills. */
export function terrace(radius: number, steps = 4): THREE.Group {
  const group = new THREE.Group();
  const greens = [0x7fa64a, 0x9cbd63, 0x6f9440, 0xb3c96c, 0x86ad4f];

  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * (1 - t * 0.8), radius * (1 - t * 0.62), 0.17, 20),
      mat(greens[i % greens.length], 1),
    );
    ring.position.y = 0.085 + i * 0.16;
    group.add(ring);
  }
  return shadowed(group);
}

/** A row of clipped tea bushes, as on the Ilam slopes. */
export function teaRow(length: number): THREE.Group {
  const group = new THREE.Group();
  const count = Math.max(2, Math.round(length / 0.55));
  for (let i = 0; i < count; i++) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mat(0x3e8d3a, 0.95, 0, true));
    bush.scale.set(1, 0.7, 1);
    bush.position.set(-length / 2 + (i * length) / (count - 1), 0.2, 0);
    group.add(bush);
  }
  return shadowed(group, false);
}

// --- buildings ---------------------------------------------------------------

/** A village house: whitewashed walls, red-ochre lower band, slate roof, a chimney. */
export function house(scale = 1, roofColor = 0x5a5550): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.8), mat(0xf1ece0, 0.9));
  body.position.y = 0.35;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.25, 0.82), mat(0xa8442e, 0.9));
  band.position.y = 0.125;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.45, 4), mat(roofColor, 0.8, 0, true));
  roof.position.y = 0.92;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.8);
  const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.03), mat(0x4a2a1a, 0.6));
  window1.position.set(-0.22, 0.45, -0.41);
  const window2 = window1.clone();
  window2.position.x = 0.22;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), mat(0x8a8078, 0.9));
  chimney.position.set(0.25, 1.0, 0.12);
  group.add(body, band, roof, window1, window2, chimney);
  shadowed(group);
  group.scale.setScalar(scale);
  group.userData.chimney = new THREE.Vector3(0.25, 1.2, 0.12).multiplyScalar(scale);
  return group;
}

/** A Tharu mud hut with a thatched roof. */
export function hut(scale = 1): THREE.Group {
  return house(scale, 0xc9a45a);
}

/** Control tower, terminal, a runway with its markings, and a parked jet. */
export function airport(): THREE.Group {
  const group = new THREE.Group();
  const runway = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, 0.9), mat(0x3b3f45, 0.9));
  runway.position.set(0.3, 0.02, -1.55);
  group.add(runway);
  for (let i = 0; i < 7; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.06), mat(0xffffff, 0.6));
    dash.position.set(-2.2 + i * 0.75, 0.03, -1.55);
    group.add(dash);
  }

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1.2), mat(0xb5402f, 0.8));
  terminal.position.set(0, 0.4, 0.9);
  // A tiered pagoda roof on the terminal, as at Tribhuvan.
  const termRoof = new THREE.Group();
  termRoof.add(pagodaRoof(1.0, 0.42, 0x4a3a30));
  termRoof.scale.set(2.35, 1, 0.95);
  termRoof.position.set(0, 1.0, 0.9);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.02), mat(0x9fd0ea, 0.1, 0.4));
  glass.position.set(0, 0.45, 0.29);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 2.2, 10), mat(0xe8e8e8, 0.6));
  tower.position.set(-1.0, 1.1, 0.9);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.45, 10), mat(0x2b5fa8, 0.15, 0.3));
  cab.position.set(-1.0, 2.4, 0.9);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 1.2, 0.8) }),
  );
  beacon.position.set(-1.0, 2.72, 0.9);

  const plane = turboprop(0.8, { gear: true });
  plane.position.set(0.8, 0.32, -0.4);
  plane.rotation.y = 0.25;

  group.add(terminal, termRoof, glass, tower, cab, beacon, plane);
  shadowed(group);
  group.userData.tick = ((_dt: number, t: number) => {
    beacon.visible = Math.sin(t * 4) > 0;
  }) satisfies Tick;
  return group;
}

let liveryTex: THREE.Texture | null = null;
/**
 * The fuselage's paint, laid out for a lathe body: across is round the body
 * (0.25 belly, 0.75 roof, 0 and 0.5 the flanks), down is tail to nose.
 */
function livery(): THREE.Texture {
  if (liveryTex) return liveryTex;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f7f4';
  g.fillRect(0, 0, W, H);
  // A blue belly and cheatlines, a gold pinstripe.
  g.fillStyle = '#1f4f9a';
  g.fillRect(W * 0.12, 0, W * 0.26, H);
  for (const u of [0.04, 0.42]) {
    g.fillRect(W * u, 0, W * 0.04, H);
  }
  g.fillStyle = '#e2b23a';
  for (const u of [0.095, 0.39]) g.fillRect(W * u, 0, W * 0.012, H);
  // Cabin windows along both flanks, just above the cheatline.
  g.fillStyle = '#2a3442';
  for (const u of [0.955, 0.535]) {
    for (let v = 0.24; v < 0.74; v += 0.034) {
      g.beginPath();
      g.roundRect(W * u - 4, H * (1 - v) - 4, 8, 9, 3);
      g.fill();
    }
  }
  // The cockpit glazing, wrapped over the nose.
  g.fillRect(W * 0.6, H * 0.06, W * 0.3, H * 0.045);
  liveryTex = new THREE.CanvasTexture(c);
  liveryTex.colorSpace = THREE.SRGBColorSpace;
  liveryTex.anisotropy = 8;
  return liveryTex;
}

let emblemTex: THREE.Texture | null = null;
/** The tail emblem: a snowy peak in a gold sun. */
function emblem(): THREE.Texture {
  if (emblemTex) return emblemTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e2b23a';
  g.beginPath();
  g.arc(64, 60, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(18, 100);
  g.lineTo(52, 40);
  g.lineTo(66, 62);
  g.lineTo(80, 46);
  g.lineTo(112, 100);
  g.closePath();
  g.fill();
  emblemTex = new THREE.CanvasTexture(c);
  emblemTex.colorSpace = THREE.SRGBColorSpace;
  return emblemTex;
}

/**
 * A high-wing twin turboprop — the plane of Nepal's domestic routes and the
 * dawn mountain flights — nose along +x. `spin` gives it turning propellers
 * (their groups are on `userData.props`); `gear` lowers the wheels for the apron.
 */
export function turboprop(scale = 1, opts: { spin?: boolean; gear?: boolean } = {}): THREE.Group {
  const plane = new THREE.Group();
  const white = mat(0xf4f4f1, 0.35, 0.1);
  const blue = mat(0x1f4f9a, 0.4, 0.1);
  const grey = mat(0x9aa0a8, 0.35, 0.6);
  const dark = mat(0x2a2e34, 0.5);

  const body = new THREE.LatheGeometry(
    [[-1.15, 0], [-1.12, 0.06], [-0.9, 0.12], [-0.6, 0.19], [-0.3, 0.22], [0.6, 0.22], [0.85, 0.19], [0.98, 0.13], [1.04, 0.06], [1.06, 0]].map(
      ([x, r]) => new THREE.Vector2(r, x),
    ),
    32,
  );
  body.rotateZ(-Math.PI / 2);
  body.scale(1, 1.05, 1);
  const fuselage = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ map: livery(), roughness: 0.35, metalness: 0.1 }));
  plane.add(fuselage);

  // The high wing: a tapered slab across the roof.
  const planform = new THREE.Shape();
  planform.moveTo(0.3, 0);
  planform.lineTo(0.22, 1.5);
  planform.lineTo(-0.04, 1.5);
  planform.lineTo(-0.14, 0);
  planform.lineTo(-0.04, -1.5);
  planform.lineTo(0.22, -1.5);
  planform.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(planform, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  wingGeo.rotateX(Math.PI / 2);
  const wing = new THREE.Mesh(wingGeo, white);
  wing.position.y = 0.255;
  plane.add(wing);

  // Two engines under the wing, each with a six-bladed propeller.
  const props: THREE.Group[] = [];
  for (const z of [-0.62, 0.62]) {
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 14), white);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(0.18, 0.16, z);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 14), grey);
    spinner.rotation.z = -Math.PI / 2;
    spinner.position.set(0.5, 0.16, z);
    const prop = new THREE.Group();
    prop.position.set(0.48, 0.16, z);
    for (let k = 0; k < 6; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.27, 0.05), dark);
      blade.geometry.translate(0, 0.135, 0);
      blade.rotation.x = (k / 6) * Math.PI * 2;
      blade.rotation.y = 0.35;
      prop.add(blade);
    }
    if (opts.spin) {
      const blur = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 28),
        new THREE.MeshBasicMaterial({ color: 0x4a4e54, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      );
      blur.rotation.y = Math.PI / 2;
      prop.add(blur);
    }
    props.push(prop);
    plane.add(nacelle, spinner, prop);
  }

  // The T-tail: a swept blue fin with the emblem, the tailplane on top.
  const finShape = new THREE.Shape();
  finShape.moveTo(-1.12, 0.08);
  finShape.lineTo(-0.72, 0.08);
  finShape.lineTo(-0.94, 0.66);
  finShape.lineTo(-1.12, 0.66);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false });
  finGeo.translate(0, 0, -0.02);
  plane.add(new THREE.Mesh(finGeo, blue));
  for (const s of [-1, 1]) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshStandardMaterial({ map: emblem(), transparent: true, roughness: 0.5 }));
    badge.position.set(-0.95, 0.42, s * 0.022);
    if (s < 0) badge.rotation.y = Math.PI;
    plane.add(badge);
  }
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.95), white);
  tailplane.position.set(-1.0, 0.66, 0);
  plane.add(tailplane);

  if (opts.gear) {
    const wheel = (x: number, z: number, r: number): void => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), grey);
      strut.position.set(x, -0.26, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 14), dark);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(x, -0.34 + (0.06 - r), z);
      plane.add(strut, tyre);
    };
    wheel(0.78, 0, 0.045);
    wheel(-0.05, -0.2, 0.06);
    wheel(-0.05, 0.2, 0.06);
  }
  plane.userData.props = props;
  plane.scale.setScalar(scale);
  return shadowed(plane, false);
}

/** A painted doonga — the wooden rowing boats of Phewa Lake. Bobs on the water. */
export function boat(color: number, phase = 0): THREE.Group {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.8, 4, 8), mat(color, 0.6));
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.7);
  hull.position.y = 0.1;
  const rower = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 3, 6), mat(0xf2c230, 0.7));
  rower.position.y = 0.28;
  const canopy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.4, 10, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xfaf3e0, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  canopy.rotation.z = Math.PI / 2;
  canopy.position.set(-0.22, 0.24, 0);
  group.add(hull, rower, canopy);
  shadowed(group, false);
  group.userData.tick = ((_dt: number, t: number) => {
    // Remember where it was placed, then bob around that.
    group.userData.baseY ??= group.position.y;
    group.position.y = group.userData.baseY + Math.sin(t * 1.6 + phase) * 0.04;
    group.rotation.z = Math.sin(t * 1.2 + phase) * 0.06;
  }) satisfies Tick;
  return group;
}

// --- water -------------------------------------------------------------------

let waterNormals: THREE.Texture | null = null;

/** A tileable ripple normal map, painted from integer-frequency waves. */
function rippleNormals(): THREE.Texture {
  if (waterNormals) return waterNormals;
  const size = 128;
  const h = new Float32Array(size * size);
  const waves = [
    [3, 1, 0.0], [1, 4, 1.3], [5, 2, 2.1], [2, 6, 0.7], [7, 3, 4.0], [4, 7, 5.2],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [fx, fy, p] of waves) {
        v += Math.sin(((x * fx + y * fy) / size) * Math.PI * 2 + p) / (fx + fy);
      }
      h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  waterNormals = tex;
  return tex;
}

/** Flat water with drifting ripples — lakes and rivers. */
export function water(width: number, depth: number, color = 0x3f9fc0): THREE.Mesh {
  const normalMap = rippleNormals().clone();
  normalMap.repeat.set(width / 2.5, depth / 2.5);
  normalMap.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.08,
    metalness: 0.15,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    transparent: true,
    opacity: 0.92,
    envMapIntensity: 1.6,
  });
  const geo = new THREE.PlaneGeometry(width, depth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  mesh.receiveShadow = true;

  // A sandy shore under the edge.
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.5, depth + 0.5), mat(0xd9c99a, 1));
  shore.position.z = -0.01;
  mesh.add(shore);

  mesh.userData.tick = ((dt: number) => {
    normalMap.offset.x += dt * 0.03;
    normalMap.offset.y += dt * 0.017;
  }) satisfies Tick;
  return mesh;
}

/** A suspension footbridge — the steel bridges strung across every Nepali river. */
export function suspensionBridge(span: number): THREE.Group {
  const group = new THREE.Group();
  const steel = mat(0x5d6670, 0.5, 0.6);
  const deckSegs = 10;
  for (let i = 0; i <= deckSegs; i++) {
    const t = i / deckSegs;
    const x = -span / 2 + t * span;
    const sag = Math.sin(t * Math.PI) * 0.12;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(span / deckSegs, 0.04, 0.45), mat(0x8a6a44, 0.9));
    plank.position.set(x, 0.42 - sag, 0);
    group.add(plank);
  }
  for (const side of [-1, 1]) {
    // Towers on each bank.
    for (const z of [-0.26, 0.26]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), steel);
      post.position.set(side * (span / 2 + 0.05), 0.48, z);
      group.add(post);
    }
  }
  // Cables, drawn as thin tubes along a sag curve.
  for (const z of [-0.26, 0.26]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector3(-span / 2 + t * span, 0.95 - Math.sin(t * Math.PI) * 0.4, z));
    }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 4), steel);
    group.add(cable);
  }
  // Prayer flags strung along the rail.
  const flags = prayerFlags(
    new THREE.Vector3(-span / 2, 0.95, 0.26),
    new THREE.Vector3(span / 2, 0.95, 0.26),
    0.4,
    12,
    0.5,
  );
  group.add(flags);
  group.userData.tick = flags.userData.tick;
  return shadowed(group, false);
}

// --- prayer flags --------------------------------------------------------------

/** Lungta: blue sky, white air, red fire, green water, yellow earth — in that order. */
const LUNGTA = [0x2b5fb8, 0xf6f4ee, 0xd23a2e, 0x2f9a4a, 0xf2c230];
const flagGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1.2, 2, 1);
  g.translate(0.5, -0.6, 0);
  return g;
})();
const flagMats = LUNGTA.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }),
);

/**
 * A string of prayer flags from `a` to `b`, sagging by `sag`, that flutters in
 * the wind. Returns a group with a `tick` on userData.
 */
export function prayerFlags(a: THREE.Vector3, b: THREE.Vector3, sag: number, count = 14, size = 1): THREE.Group {
  const group = new THREE.Group();
  const point = (t: number): THREE.Vector3 =>
    new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0));

  const ropePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) ropePts.push(point(i / 20));
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 30, 0.012, 3),
    mat(0x6b5b4a, 1),
  );
  group.add(rope);

  const flags: THREE.Mesh[] = [];
  const w = (a.distanceTo(b) / count) * 0.78;
  const along = new THREE.Vector3().subVectors(b, a).normalize();
  const side = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, along).normalize();
  const basis = new THREE.Matrix4().makeBasis(along, up, side);
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);

  for (let i = 0; i < count; i++) {
    const t = (i + 0.11) / count;
    const pivot = new THREE.Group();
    pivot.position.copy(point(t));
    pivot.quaternion.copy(q);
    const flag = new THREE.Mesh(flagGeo, flagMats[i % LUNGTA.length]);
    flag.scale.set(w, w * size * 1.1, 1);
    flag.castShadow = true;
    pivot.add(flag);
    group.add(pivot);
    flags.push(flag);
  }

  group.userData.tick = ((_dt: number, t: number) => {
    flags.forEach((f, i) => {
      f.rotation.x = Math.sin(t * 3.2 + i * 0.7) * 0.45 + 0.35;
    });
  }) satisfies Tick;
  return group;
}

/** A tall pole with a vertical prayer flag (darchor). */
export function darchor(color: number): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 6), mat(0x8a6a44, 0.9));
  pole.position.y = 1.1;
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.85 }));
  flag.scale.set(0.5, 1.4, 1);
  flag.rotation.z = 0;
  const pivot = new THREE.Group();
  pivot.position.y = 2.15;
  pivot.add(flag);
  group.add(pole, pivot);
  group.userData.tick = ((_dt: number, t: number) => {
    pivot.rotation.y = Math.sin(t * 1.7 + color) * 0.4;
    flag.scale.x = 0.5 + Math.sin(t * 5 + color) * 0.04;
  }) satisfies Tick;
  return shadowed(group, false);
}
