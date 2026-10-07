/**
 * The 3D placeables for every region of the printed board: Boudhanath and
 * pagodas in Nepal Mandal, sal forest, a rhino and a river bridge in Chitwan,
 * Phewa Lake with doongas and paragliders in Pokhara, the Maya Devi Temple and
 * Bodhi tree in Lumbini, tea terraces in the east, an elephant in the Western
 * Terai, villages with chimney smoke in the hills, base camp in the Mountain
 * Expedition — plus prayer flags everywhere, birds and a mountain flight
 * overhead, and the tinted picture panels and name plates.
 *
 * Positions are authored in the photo's pixel space (see tools/gen_board.py)
 * so props sit where the printed pictures are.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Board } from '../engine/types.ts';
import { egrets, kites, mountainFlight, paragliders, smoke } from './life.ts';
import { seeded } from './noise.ts';
import {
  airport, bodhiTree, boat, chorten, darchor, house, hut, mat, pagoda, pillar, pine,
  prayerFlags, prayerWheels, rhododendron, shikhara, stupa, suspensionBridge, teaRow, tent,
  tree, water, whiteTemple, type Tick,
} from './props.ts';
import { boardBox, DECK_SLOTS, EAST_PANEL } from './board3d.ts';
import { cow, danphe, deer, elephant, gharial, monkey, peacock, redPanda, rhino, tiger, yak } from './fauna.ts';
import { butterLamp, cardDeck, dharahara, maaneChowk, maniStones, wayShrine } from './landmarks.ts';
import { buildMeadow, type Rect } from './meadow.ts';
import { animates, bake } from './bake.ts';
import { roadClearance } from './clearance.ts';
import { massif, ridgeStrip, terracedHill, type StripPeak } from './mountains.ts';

const BOARD_Y = 0.4;

export type SceneryView = {
  group: THREE.Group;
  /** Where the Maane spinner's base stands, on top of its shrine. */
  spinnerHome: THREE.Vector3;
  update(dt: number): void;
};

/** The ten decks, as they sit in the Maane Chowk panel. */
const DECKS: [string, string, string][] = [
  ['N', 'Nepal Mandal', '#b8384f'],
  ['C', 'Chitwan', '#2f7a45'],
  ['L', 'Lumbini', '#c8862a'],
  ['P', 'Pokhara', '#2a7ea0'],
  ['H', 'Himalayan', '#6a5ab0'],
  ['E', 'Eastern', '#3f9a4a'],
  ['W', 'Western Terai', '#b8692e'],
  ['W', 'W. Hillside', '#c2457a'],
  ['M', 'Mountain', '#4a78b8'],
  ['★', 'Wild', '#3a3a48'],
];

let grain: THREE.Texture | null = null;
/** A faint paper grain so the printed panels don't read as flat plastic. */
function paperGrain(): THREE.Texture {
  if (grain) return grain;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const rnd = seeded(5);
  for (let i = 0; i < size * size; i++) {
    const v = 232 + rnd() * 23;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(3, 3);
  grain.colorSpace = THREE.SRGBColorSpace;
  return grain;
}

/**
 * Alpha mask for a region tint: solid inside the picture, fading to nothing
 * over `feather` world units, with a wobbly, hand-painted edge.
 */
function featherMask(width: number, depth: number, feather: number): THREE.Texture {
  const W = 256;
  const H = Math.max(32, Math.round((256 * (depth + feather * 2)) / (width + feather * 2)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const fw = width + feather * 2;
  const fd = depth + feather * 2;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = (i / (W - 1)) * fw - fw / 2;
      const z = (j / (H - 1)) * fd - fd / 2;
      // Distance outside the picture rectangle (0 inside).
      const dx = Math.max(0, Math.abs(x) - width / 2);
      const dz = Math.max(0, Math.abs(z) - depth / 2);
      const wobble = (Math.sin(x * 2.3 + z * 1.1) + Math.sin(z * 3.1 - x * 0.7)) * 0.18;
      const t = Math.min(1, Math.max(0, (Math.hypot(dx, dz) + wobble + 0.25) / feather));
      const a = 1 - t * t * (3 - 2 * t);
      const v = Math.round(a * 255);
      const k = (j * W + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * A printed region panel: the tinted picture area of the board with its name
 * plate, like the photo panels on the cardboard original.
 */
function panel(width: number, depth: number, color: number, label: string): THREE.Group {
  const group = new THREE.Group();
  // The tint fades out softly past the picture's edge, so neighbouring
  // regions blend into the country between them instead of sitting in boxes.
  const feather = 1.6;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width + feather * 2, depth + feather * 2),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      map: paperGrain(),
      alphaMap: featherMask(width, depth, feather),
      transparent: true,
      // A wash over the painted country, not a card stuck on top of it.
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.012;
  ground.receiveShadow = true;
  group.add(ground);

  // The name, on a carved wooden signboard propped up toward the players.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 176;
  const ctx = canvas.getContext('2d')!;
  const face = ctx.createLinearGradient(0, 0, 0, 176);
  face.addColorStop(0, '#fff8e8');
  face.addColorStop(1, '#efe2c4');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, 1024, 176);
  ctx.strokeStyle = '#8e2f3f';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 996, 148);
  ctx.strokeStyle = 'rgba(142, 47, 63, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 968, 120);
  // The region's own colour, as a diamond at each end.
  const accent = `#${new THREE.Color(color).offsetHSL(0, 0.15, -0.18).getHexString()}`;
  for (const x of [70, 954]) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x, 54);
    ctx.lineTo(x + 26, 88);
    ctx.lineTo(x, 122);
    ctx.lineTo(x - 26, 88);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#6d2130';
  ctx.font = 'bold 84px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 512, 94, 800);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const plateWidth = Math.min(width * 0.8, 5.6);
  const plateHeight = plateWidth * (176 / 1024);
  const sign = new THREE.Group();
  const board = new THREE.Mesh(
    new RoundedBoxGeometry(plateWidth + 0.16, plateHeight + 0.16, 0.08, 2, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.55 }),
  );
  board.position.set(0, plateHeight / 2, 0.045);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(plateWidth, plateHeight),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }),
  );
  // A plane faces +z; turn it to face the players, who sit to the south (−z).
  front.rotation.y = Math.PI;
  front.position.set(0, plateHeight / 2, 0);
  sign.add(board, front);
  // Lean it back like a lectern, so it reads from the table.
  sign.rotation.x = 1.05;
  sign.position.set(0, 0.03, -depth / 2 + 0.25);
  sign.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.add(sign);
  return group;
}

/**
 * Board positions are authored in the same pixel space as
 * `tools/gen_board.py` — a photo of the printed board — so a prop sits in the
 * same picture area it occupies on the cardboard original.
 */
const PX = 0.063;
const PX_OX = 680;
const PX_OY = 775;
function px(x: number, y: number): [number, number] {
  return [(PX_OX - x) * PX, (PX_OY - y) * PX];
}
function world(x: number, y: number, h = 0): THREE.Vector3 {
  const [wx, wz] = px(x, y);
  return new THREE.Vector3(wx, BOARD_Y + h, wz);
}

/** Grass tufts scattered over a panel, in one instanced draw. */
function grass(rects: [number, number, number, number, number][], seed: number): THREE.InstancedMesh {
  const geo = new THREE.ConeGeometry(0.07, 0.32, 3);
  geo.translate(0, 0.16, 0);
  const total = rects.reduce((n, r) => n + r[4], 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    total * 3,
  );
  const rnd = seeded(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let k = 0;
  for (const [x0, y0, x1, y1, n] of rects) {
    for (let i = 0; i < n; i++) {
      const base = world(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0));
      // Three blades per tuft, splayed.
      for (let b = 0; b < 3; b++) {
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6));
        const h = 0.6 + rnd() * 0.8;
        s.set(1, h, 1);
        m.compose(base.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12)), q, s);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, c.setHSL(0.24 + rnd() * 0.06, 0.45, 0.32 + rnd() * 0.12));
        k++;
      }
    }
  }
  mesh.count = k;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Phewa Lake: a long, irregular lake (not a rectangle) with a sandy shore,
 * built from the ripple-water material on a hand-drawn outline.
 */
function phewaLake(): THREE.Mesh {
  // Outline in world units around the lake centre; +x is west, +z north.
  const pts: [number, number][] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // Long east-west, a fat western arm, a narrower Lakeside (east) end.
    const rx = 4.3 + Math.cos(a) * 0.5;
    const rz = 2.0 + Math.sin(a * 3) * 0.25 + (Math.cos(a) > 0 ? 0.35 : -0.1);
    pts.push([Math.cos(a) * rx, Math.sin(a) * rz + Math.sin(a * 5) * 0.12]);
  }
  const shape = (scale: number): THREE.Shape => {
    const sh = new THREE.Shape();
    // The mesh lies rotated -90° about x, so shape y is world −z.
    pts.forEach(([x, z], i) => (i === 0 ? sh.moveTo(x * scale, -z * scale) : sh.lineTo(x * scale, -z * scale)));
    sh.closePath();
    return sh;
  };
  const lake = water(1, 1, 0x3f9fc0);
  lake.geometry.dispose();
  lake.geometry = new THREE.ShapeGeometry(shape(1), 6);
  const lm = lake.material as THREE.MeshStandardMaterial;
  if (lm.normalMap) lm.normalMap.repeat.set(0.7, 0.7);
  // A calmer, deeper surface than the rivers — less glare, more lake.
  lm.color.setHex(0x2f86b0);
  lm.roughness = 0.22;
  lm.normalScale.set(0.35, 0.35);
  // Swap the rectangular shore for one that follows the outline.
  const shore = lake.children[0] as THREE.Mesh;
  shore.geometry.dispose();
  shore.geometry = new THREE.ShapeGeometry(shape(1.09), 6);
  return lake;
}

export function buildScenery(board: Board): SceneryView {
  const group = new THREE.Group();
  const ticks: Tick[] = [];

  const collect = (object: THREE.Object3D): void => {
    object.traverse((o) => {
      if (typeof o.userData.tick === 'function') ticks.push(o.userData.tick as Tick);
    });
  };

  /** Place at photo coordinates. Props that don't animate are baked into a few draw calls. */
  const at = <T extends THREE.Object3D>(object: T, x: number, y: number, rotY = 0): T => {
    const [wx, wz] = px(x, y);
    object.position.set(wx, BOARD_Y + object.position.y, wz);
    object.rotation.y = rotY;
    group.add(object);
    if (animates(object)) collect(object);
    if (!animates(object) || object.userData.bakeable) bake(object);
    return object;
  };

  /** A string of prayer flags between two photo points, at given heights. */
  const flags = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, sag = 0.5, count = 12): void => {
    const g = prayerFlags(world(x0, y0, h0), world(x1, y1, h1), sag, count);
    group.add(g);
    collect(g);
  };

  /** A live thing in the sky. */
  const life = (l: { group: THREE.Group; tick: Tick }): void => {
    group.add(l.group);
    ticks.push(l.tick);
  };

  /** A region panel spanning a photo-pixel rectangle. */
  const region = (x0: number, y0: number, x1: number, y1: number, color: number, label: string): void => {
    const g = panel(Math.abs(x1 - x0) * PX, Math.abs(y1 - y0) * PX, color, label);
    at(g, (x0 + x1) / 2, (y0 + y1) / 2);
  };

  // --- picture panels, as printed ---
  region(712, 728, 884, 822, 0xe8c0a8, 'Nepal Mandal');
  region(680, 858, 842, 986, 0x6fb35a, 'Chitwan');
  region(918, 765, 1026, 902, 0x9fd17e, 'Eastern Trip');
  region(328, 798, 505, 866, 0xe6d7a8, 'Lumbini');
  region(372, 942, 600, 1012, 0xcfd383, 'Western Terai Trip');
  region(334, 592, 438, 722, 0xa6d184, 'Western Hillside Trip');
  region(502, 688, 676, 782, 0x9fd3a6, 'Pokhara');
  region(498, 570, 682, 618, 0xc9cbd8, 'Himalayan Village Trip');
  region(758, 548, 994, 624, 0xd9e4ee, 'Mountain Expedition');
  region(930, 650, 1062, 728, 0xdcdcd2, 'Airport');

  const rnd = seeded(90210);

  // --- Nepal Mandal: Boudhanath with its flag lines, pagodas, a shikhara, prayer wheels ---
  const boudha = at(stupa(0.75), 752, 770, 0.3);
  const spire = boudha.position.clone().add(boudha.userData.spireTop as THREE.Vector3);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const g = prayerFlags(
      spire,
      boudha.position.clone().add(new THREE.Vector3(dx * 1.25, 0.12, dz * 1.25)),
      0.25,
      9,
      0.9,
    );
    group.add(g);
    collect(g);
  }
  at(pagoda(3, 0.7), 812, 762, -0.4);
  at(pagoda(2, 0.55, 0x6a2a20), 856, 790, 0.6);
  at(shikhara(0.6), 728, 746, 0.2);
  at(prayerWheels(), 790, 742, 0).scale.setScalar(0.7);

  // --- Chitwan: sal forest, the Rapti with a footbridge, a rhino in the grass ---
  at(water(9.6, 1.0, 0x4f9fb2), 760, 978);
  at(suspensionBridge(1.6), 808, 978, Math.PI / 2);
  for (let i = 0; i < 18; i++) {
    at(tree(0.55 + rnd() * 0.35, rnd), 690 + rnd() * 145, 868 + rnd() * 70, rnd() * Math.PI);
  }
  at(rhino(), 770, 952, 2.5).scale.setScalar(0.8);

  // --- Eastern Trip: tea terraces round the hill ---
  at(terracedHill(2.5, 1.15, 31, 6), 972, 860, 0.4);
  for (let i = 0; i < 4; i++) at(teaRow(4.2), 972, 786 + i * 15);
  at(house(0.6), 1008, 845, 0.3);
  at(darchor(0x2b5fb8), 1012, 870);

  // --- Lumbini: Maya Devi Temple, the Ashoka pillar, the Bodhi tree, the World Peace Pagoda ---
  at(whiteTemple(), 410, 830, 0);
  at(pillar(), 360, 832);
  at(stupa(0.5), 470, 830, 0.2);
  at(bodhiTree(0.7), 345, 810);
  at(water(1.6, 0.9, 0x5fb0c8), 410, 808);
  flags(345, 812, 1.4, 410, 820, 1.2, 0.35, 10);

  // --- Western Terai: grassland, Tharu huts and an elephant ---
  for (let i = 0; i < 8; i++) at(tree(0.5 + rnd() * 0.3, rnd), 385 + rnd() * 200, 950 + rnd() * 18, rnd() * 3);
  at(hut(0.7), 395, 962, 0.4);
  at(hut(0.6), 428, 968, -0.3);
  at(elephant(), 535, 985, 2.8).scale.setScalar(0.75);

  // --- Western Hillside: terraced farmland, a hilltop durbar, rhododendrons ---
  at(terracedHill(2.0, 1.0, 47, 6), 385, 680, 0.2);
  at(pagoda(2, 0.5), 405, 620, 0.3);
  at(house(0.55), 352, 615, 0.6);
  at(house(0.5), 352, 655, -0.2);
  for (const [x, y] of [[420, 655], [345, 700], [425, 700]]) at(rhododendron(0.6, rnd), x, y, rnd() * 3);

  // --- Pokhara: Phewa Lake, Tal Barahi on its island in the middle, Lakeside
  //     along the east shore, Sarangkot above with paragliders, and the World
  //     Peace Stupa on the far hill ---
  at(phewaLake(), 578, 735);
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 0.14, 18),
    new THREE.MeshStandardMaterial({ color: 0x6f9440, roughness: 1 }),
  );
  island.position.y = 0.06;
  island.receiveShadow = true;
  at(island, 580, 735);
  at(pagoda(2, 0.36, 0x8a2a20), 580, 735, 0.6);
  for (const [x, y] of [[571, 742], [589, 742], [571, 728], [589, 728]]) at(tree(0.24, rnd), x, y, rnd() * 3);
  // The ferry jetty from the island toward Lakeside, and the boat on it.
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.28), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }));
  jetty.position.y = 0.08;
  jetty.castShadow = true;
  at(jetty, 593, 738);
  at(boat(0xc8402e, 0), 548, 752, 0.5);
  at(boat(0x2b5fa8, 1.7), 612, 720, -0.4);
  at(boat(0xe8a435, 3.1), 560, 718, 1.2);
  at(boat(0x2f9a4a, 4.4), 618, 752, 2.2);
  at(boat(0xb05ac8, 5.2), 600, 744, 0.1);
  // Lakeside: a promenade with hotels and cafés facing the water.
  const promenade = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 5.6), new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 0.95 }));
  promenade.position.y = 0.02;
  promenade.receiveShadow = true;
  at(promenade, 652, 736);
  const roofs = [0xc8342f, 0x2b5fa8, 0x2f8a4a, 0xe8a435, 0x8a3fc4, 0xc8342f];
  roofs.forEach((roof, i) => {
    at(house(0.42 + (i % 2) * 0.06, roof), 667, 702 + i * 14, Math.PI / 2);
  });
  for (let i = 0; i < 7; i++) at(tree(0.32, rnd), 655, 698 + i * 13, rnd() * 3);
  // Sarangkot ridge on the north shore, Anadu hill with the Peace Stupa to the south-west.
  const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5f8a45, 1));
  ridge.scale.set(2.6, 0.9, 0.75);
  ridge.castShadow = true;
  ridge.receiveShadow = true;
  at(ridge, 545, 699, 0.1);
  for (const [x, y] of [[530, 698], [545, 696], [560, 700]]) at(pine(0.35), x, y);
  const anadu = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6f9a4e, 1));
  anadu.scale.set(1.3, 0.75, 1.1);
  anadu.castShadow = true;
  anadu.receiveShadow = true;
  at(anadu, 516, 768);
  at(stupa(0.32), 516, 768).position.y += 0.7;
  life(paragliders(world(575, 722)));

  // --- Himalayan Village: stone houses with smoke, a chorten, rhododendrons, a ridge ---
  const village: [number, number][] = [[520, 600], [548, 590], [600, 598], [632, 588], [660, 602]];
  village.forEach(([x, y], i) => {
    const h = at(house(0.45 + rnd() * 0.1, 0x6a5f58), x, y, rnd() * 0.6 - 0.3);
    if (i % 2 === 0) {
      const chimney = (h.userData.chimney as THREE.Vector3).clone().applyEuler(h.rotation).add(h.position);
      life(smoke(chimney, i + 3));
    }
  });
  // The village's own snow peak, rising behind the houses.
  at(massif({ height: 2.5, radius: 1.05, seed: 7, spurs: 4, snowline: 0.42, treeline: 0.16, rings: 12, segments: 40 }), 575, 582);
  at(chorten(0.6), 615, 610);
  at(rhododendron(0.45, rnd), 505, 585);
  flags(560, 596, 0.25, 575, 582, 2.2, 0.15, 7);
  flags(575, 582, 2.2, 592, 596, 0.25, 0.15, 7);

  // --- Mountain Expedition: one connected massif, base camp on its moraine,
  //     prayer flags strung from the summit. A mask keeps every slope off the road. ---
  const clear = roadClearance(board);
  const offRoad = (x: number, z: number): number => THREE.MathUtils.smoothstep(clear(x, z), 1.2, 2.4);
  const photoPeak = (x: number, y: number, height: number, radius: number, sharpness = 1.4): StripPeak => {
    const [wx, wz] = px(x, y);
    return { x: wx, z: wz, height, radius, sharpness };
  };
  const [ex0, ez1] = px(758, 548);
  const [ex1, ez0] = px(994, 624);
  const expedition = ridgeStrip({
    x0: Math.min(ex0, ex1),
    x1: Math.max(ex0, ex1),
    // Start north of the region's name plate, so the foothills don't bury it.
    z0: Math.min(ez0, ez1) + 1.1,
    z1: Math.max(ez0, ez1),
    peaks: [
      photoPeak(875, 578, 5.6, 2.4, 1.3),
      photoPeak(815, 580, 3.8, 1.7),
      photoPeak(935, 580, 4.1, 1.8),
      photoPeak(780, 575, 2.8, 1.4),
      photoPeak(972, 578, 2.6, 1.3),
    ],
    ridgeHeight: 1.7,
    fade: 'all',
    mask: offRoad,
    seed: 21,
    snowline: 0.34,
    treeline: 0.1,
    cell: 0.2,
  });
  expedition.position.y = BOARD_Y;
  group.add(expedition);
  const slope = expedition.userData.heightAt as (x: number, z: number) => number;
  /** Place on the massif's slope rather than the flat board. */
  const onSlope = <T extends THREE.Object3D>(object: T, x: number, y: number, rotY = 0): T => {
    const placed = at(object, x, y, rotY);
    const [wx, wz] = px(x, y);
    placed.position.y = BOARD_Y + slope(wx, wz);
    return placed;
  };
  onSlope(tent(0xe8452c), 845, 602, 0.3);
  onSlope(tent(0xf2c230), 856, 607, -0.2);
  onSlope(tent(0x2b8fd8), 905, 604, 0.5);
  for (const x of [795, 955]) onSlope(pine(0.55), x, 608);
  const summit = slope(...px(875, 578));
  const camp = (x: number, y: number): number => slope(...px(x, y)) + 0.35;
  flags(850, 600, camp(850, 600), 875, 578, summit - 0.15, 0.3, 12);
  flags(875, 578, summit - 0.15, 905, 600, camp(905, 600), 0.3, 12);

  // --- the Himalaya along the north edge of the board, west to east as on the
  //     map: Dhaulagiri, Annapurna, Machhapuchhre, Manaslu, Langtang, Everest,
  //     Lhotse, Makalu, Kanchenjunga — joined by a jagged snowy crest ---
  const box0 = boardBox(board);
  const skyline: StripPeak[] = [
    { x: 23.5, z: 19.6, height: 3.9, radius: 2.3 }, // Dhaulagiri
    { x: 14.5, z: 19.8, height: 3.8, radius: 2.4 }, // Annapurna
    { x: 8.6, z: 19.3, height: 3.6, radius: 1.6, sharpness: 2.1 }, // Machhapuchhre, the fishtail
    { x: 1.5, z: 19.9, height: 3.7, radius: 2.3 }, // Manaslu
    { x: -5.5, z: 19.6, height: 3.1, radius: 2.0 }, // Langtang
    { x: -13, z: 20, height: 4.8, radius: 2.6, sharpness: 1.3 }, // Sagarmatha · Everest
    { x: -16.2, z: 19.5, height: 4.1, radius: 1.9 }, // Lhotse
    { x: -20.6, z: 19.8, height: 4.0, radius: 2.1, sharpness: 1.7 }, // Makalu
    { x: -25.2, z: 19.7, height: 4.3, radius: 2.3 }, // Kanchenjunga
  ];
  // Lesser summits in between, so it reads as one range.
  const fill = seeded(8848);
  for (let x = box0.max.x - 2; x > box0.min.x + EAST_PANEL + 2; x -= 2.2) {
    if (skyline.some((p) => Math.abs(p.x - x) < 1.6)) continue;
    skyline.push({ x: x + (fill() - 0.5), z: 19.3 + fill() * 1.2, height: 1.8 + fill() * 1.2, radius: 1.3 + fill() * 0.6 });
  }
  const himalaya = ridgeStrip({
    x0: box0.min.x + EAST_PANEL + 0.4,
    x1: box0.max.x - 0.3,
    z0: 17.0,
    z1: box0.max.z - 0.15,
    peaks: skyline,
    ridgeHeight: 1.5,
    fade: 'all',
    mask: offRoad,
    seed: 8848,
    snowline: 0.27,
    treeline: 0.13,
    cell: 0.24,
  });
  himalaya.position.y = BOARD_Y;
  group.add(himalaya);
  const everest = himalaya.userData.heightAt as (x: number, z: number) => number;
  // Prayer flags streaming off Sagarmatha's summit.
  {
    const top = new THREE.Vector3(-13, BOARD_Y + everest(-13, 20) - 0.1, 20);
    const foot = new THREE.Vector3(-11.2, BOARD_Y + everest(-11.2, 18.6) + 0.25, 18.6);
    const g = prayerFlags(top, foot, 0.25, 10, 0.8);
    group.add(g);
    collect(g);
  }

  // --- Tribhuvan International ---
  at(airport(), 1000, 672, 0);

  // --- grass in the green panels ---
  group.add(
    grass(
      [
        [684, 862, 838, 965, 110],
        [920, 880, 1022, 900, 30],
        [376, 945, 596, 1000, 120],
        [338, 598, 434, 718, 50],
        [330, 800, 500, 845, 30],
      ],
      61,
    ),
  );

  // --- more life in the picture panels ---
  at(dharahara(0.62), 870, 748, 0.2);
  at(monkey(0), 770, 796, -0.6).scale.setScalar(1.3);
  at(monkey(2), 738, 790, 0.9).scale.setScalar(1.2);
  at(monkey(4), 762, 744, 2.4).scale.setScalar(1.1);
  at(cow(0), 840, 812, 0.4).scale.setScalar(0.8);
  at(deer(0), 702, 905, 0.6);
  at(deer(1.7), 722, 925, -0.9).scale.setScalar(0.9);
  at(gharial(), 700, 962, 0.1).scale.setScalar(0.75);
  at(deer(3.1), 562, 958, 2.6).scale.setScalar(0.95);
  at(peacock(), 470, 992, -0.4).scale.setScalar(1.1);
  // A Bengal tiger padding through the Bardiya grass.
  at(tiger(), 452, 966, 2.7).scale.setScalar(0.95);
  // The danphe — the Himalayan monal, Nepal's national bird — by the village chorten.
  at(danphe(), 588, 611, -0.5).scale.setScalar(1.5);
  at(redPanda(), 936, 888, 0.8).scale.setScalar(1.3);
  at(yak(0x2e2622, 0), 930, 614, 0.3).scale.setScalar(0.75);
  at(yak(0x5a4636, 1.3), 952, 609, -0.4).scale.setScalar(0.7);
  at(yak(0xe8e0d0, 2.2), 536, 611, 2.8).scale.setScalar(0.6);
  at(maniStones(3), 690, 606);
  at(wayShrine(0.9), 380, 858, 0.3);
  for (const [x, y, ph] of [[443, 822, 0], [452, 822, 1.3], [461, 822, 2.6]]) at(butterLamp(ph), x, y);

  // --- Maane Chowk: the spinner's shrine, on the east panel ---
  const chowk = at(maaneChowk(), 1162, 770, 0);
  const spinnerHome = chowk.position.clone().add(chowk.userData.home as THREE.Vector3);

  // --- the ten decks, face down on their printed slots ---
  DECK_SLOTS.forEach(([x, y], i) => {
    const [letter, name, colour] = DECKS[i];
    at(cardDeck(letter, name, colour, 10 + (i % 3) * 3), x, y, (i % 2 ? 1 : -1) * 0.03);
  });

  // --- the open ground between the roads: a meadow ---
  const rectPx = (x0: number, y0: number, x1: number, y1: number, pad = 0.15): Rect => {
    const [ax, az] = px(x0, y0);
    const [bx, bz] = px(x1, y1);
    return {
      x0: Math.min(ax, bx) - pad,
      x1: Math.max(ax, bx) + pad,
      z0: Math.min(az, bz) - pad,
      z1: Math.max(az, bz) + pad,
    };
  };
  const box = boardBox(board);
  const area: Rect = {
    x0: box.min.x + EAST_PANEL + 2.2,
    x1: box.max.x - 2.6,
    z0: box.min.z + 4.4,
    // Up into the Himalayan foothills: the woods climb the lower slopes.
    z1: box.max.z - 0.8,
  };
  const exclude: Rect[] = [
    rectPx(712, 728, 884, 822),
    rectPx(680, 858, 842, 986),
    rectPx(918, 765, 1026, 902),
    rectPx(328, 798, 505, 866),
    rectPx(372, 942, 600, 1012),
    rectPx(334, 592, 438, 722),
    rectPx(502, 688, 676, 782),
    rectPx(498, 570, 682, 618),
    rectPx(758, 548, 994, 624),
    rectPx(930, 650, 1062, 728),
    rectPx(1080, 440, 1260, 1140),
  ];
  const slopes = (x: number, z: number): number => Math.max(everest(x, z), slope(x, z));
  const keepClear: Rect[] = [
    // The printed title along the near edge.
    { x0: box.min.x + EAST_PANEL, x1: box.max.x, z0: box.min.z, z1: box.min.z + 3.4 },
    // The eight auspicious symbols down the west margin.
    rectPx(232, 540, 268, 1060),
  ];
  group.add(buildMeadow(board, area, exclude, 23, { ground: slopes, keepClear }));

  // --- in the sky: kites wheeling over Kathmandu, more sharing the Pokhara
  //     thermals with the paragliders, egrets crossing the Terai paddies, and
  //     the dawn mountain flight circling the range ---
  life(kites(world(790, 770, 8), 4, 3.6, 11));
  life(kites(world(575, 722, 9.5), 3, 2.8, 23));
  life(egrets(world(640, 958, 3.2), 7, 13, 3));
  life(mountainFlight(world(680, 700, 19), 34));

  let t = 0;
  return {
    group,
    spinnerHome,
    update(dt) {
      t += dt;
      for (const tick of ticks) tick(dt, t);
    },
  };
}
