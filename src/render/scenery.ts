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
import type { Board } from '../engine/types.ts';
import { circlingPlane, flock, paragliders, smoke } from './life.ts';
import { seeded } from './noise.ts';
import {
  airport, bodhiTree, boat, chorten, darchor, elephant, house, hut, pagoda, peak, pillar, pine,
  prayerFlags, prayerWheels, rhino, rhododendron, shikhara, stupa, suspensionBridge, teaRow, tent,
  terrace, tree, water, whiteTemple, type Tick,
} from './props.ts';

const BOARD_Y = 0.4;

export type SceneryView = {
  group: THREE.Group;
  update(dt: number): void;
};

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
 * A printed region panel: the tinted picture area of the board with its name
 * plate, like the photo panels on the cardboard original.
 */
function panel(width: number, depth: number, color: number, label: string): THREE.Group {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 1, map: paperGrain() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.012;
  ground.receiveShadow = true;
  group.add(ground);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(40, 40, 52, 0.88)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 88, 26);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 256, 50, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const plateWidth = Math.min(width * 0.85, 6.2);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(plateWidth, plateWidth * (96 / 512)),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  // Lie flat, readable from the south: the camera looks north (+z) so
  // screen-right is -x; this rotation puts the text the right way round.
  plate.rotation.set(-Math.PI / 2, 0, Math.PI);
  plate.position.set(0, 0.05, -depth / 2 + plateWidth * 0.14);
  group.add(plate);
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

export function buildScenery(_board: Board): SceneryView {
  const group = new THREE.Group();
  const ticks: Tick[] = [];

  const collect = (object: THREE.Object3D): void => {
    object.traverse((o) => {
      if (typeof o.userData.tick === 'function') ticks.push(o.userData.tick as Tick);
    });
  };

  /** Place at photo coordinates. */
  const at = <T extends THREE.Object3D>(object: T, x: number, y: number, rotY = 0): T => {
    const [wx, wz] = px(x, y);
    object.position.set(wx, BOARD_Y + object.position.y, wz);
    object.rotation.y = rotY;
    group.add(object);
    collect(object);
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
  region(712, 728, 884, 822, 0xe9b7c4, 'Nepal Mandal');
  region(680, 858, 842, 986, 0x9cc79a, 'Chitwan');
  region(918, 765, 1026, 902, 0xa9d39a, 'Eastern Trip');
  region(328, 798, 505, 866, 0xd9d2c4, 'Lumbini');
  region(372, 942, 600, 1012, 0xb8d79c, 'Western Terai Trip');
  region(334, 592, 438, 722, 0xa8cf8e, 'Western Hillside Trip');
  region(502, 688, 676, 782, 0x9fc9dc, 'Pokhara');
  region(498, 570, 682, 618, 0xc9c1e6, 'Himalayan Village Trip');
  region(758, 548, 994, 624, 0xc8d6ea, 'Mountain Expedition');
  region(930, 650, 1062, 728, 0xe2e0d8, 'Airport');

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
  at(terrace(2.4, 5), 972, 860, 0.4);
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
  at(terrace(1.9, 6), 385, 680, 0.2);
  at(pagoda(2, 0.5), 405, 620, 0.3);
  at(house(0.55), 352, 615, 0.6);
  at(house(0.5), 352, 655, -0.2);
  for (const [x, y] of [[420, 655], [345, 700], [425, 700]]) at(rhododendron(0.6, rnd), x, y, rnd() * 3);

  // --- Pokhara: Phewa Lake, Tal Barahi on its island, doongas, paragliders ---
  at(water(10.0, 4.6), 590, 738);
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.9, 0.12, 14),
    new THREE.MeshStandardMaterial({ color: 0x6f9440, roughness: 1 }),
  );
  island.position.y = 0.06;
  island.receiveShadow = true;
  at(island, 600, 735);
  at(pagoda(2, 0.42), 600, 735, 0.2);
  at(boat(0xc8402e, 0), 545, 752, 0.5);
  at(boat(0x2b5fa8, 1.7), 650, 718, -0.4);
  at(boat(0xe8a435, 3.1), 560, 712, 1.2);
  at(boat(0x2f9a4a, 4.4), 625, 760, 2.2);
  life(paragliders(world(590, 728)));

  // --- Himalayan Village: stone houses with smoke, a chorten, rhododendrons, a ridge ---
  const village: [number, number][] = [[520, 600], [548, 590], [600, 598], [632, 588], [660, 602]];
  village.forEach(([x, y], i) => {
    const h = at(house(0.45 + rnd() * 0.1, 0x6a5f58), x, y, rnd() * 0.6 - 0.3);
    if (i % 2 === 0) {
      const chimney = (h.userData.chimney as THREE.Vector3).clone().applyEuler(h.rotation).add(h.position);
      life(smoke(chimney, i + 3));
    }
  });
  at(peak(2.4, 0.95, 7), 575, 582);
  at(chorten(0.6), 615, 610);
  at(rhododendron(0.45, rnd), 505, 585);
  flags(560, 596, 0.25, 575, 582, 2.2, 0.15, 7);
  flags(575, 582, 2.2, 592, 596, 0.25, 0.15, 7);

  // --- Mountain Expedition: the massif, base camp, flags strung from the summit ---
  const massif: [number, number, number, number][] = [
    [875, 578, 5.4, 2.0],
    [815, 580, 3.6, 1.4],
    [935, 580, 3.8, 1.4],
    [780, 575, 2.6, 1.0],
    [972, 578, 2.4, 0.9],
  ];
  massif.forEach(([x, y, h, r], i) => at(peak(h, r, i + 21), x, y, i));
  at(tent(0xe8452c), 845, 602, 0.3);
  at(tent(0xf2c230), 856, 607, -0.2);
  at(tent(0x2b8fd8), 905, 604, 0.5);
  for (const x of [795, 955]) at(pine(0.55), x, 606);
  flags(850, 600, 0.35, 875, 578, 5.0, 0.3, 12);
  flags(875, 578, 5.0, 905, 600, 0.35, 0.3, 12);

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

  // --- in the sky ---
  life(flock(world(700, 760, 11), 15));
  life(circlingPlane(world(680, 700, 19), 34));

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      for (const tick of ticks) tick(dt, t);
    },
  };
}
