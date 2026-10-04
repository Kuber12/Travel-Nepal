/**
 * The board itself: base, road bed, travel tiles and the markers that make a
 * checkpoint, junction or ticket counter readable at a glance.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { nodeAt } from '../engine/board.ts';
import type { Board, BoardNode, SectionId } from '../engine/types.ts';
import { BOARD_BASE, SECTION_COLOR, TILE_COLOR } from './palette.ts';

/** The letter stamped on each travel tile, as on the printed board. */
const SECTION_LETTER: Record<SectionId, string> = {
  airport: 'A',
  nepalmandal: 'N',
  chitwan: 'C',
  lumbini: 'L',
  pokhara: 'P',
  himalayan: 'H',
  eastern: 'E',
  westernterai: 'W',
  westernhillside: 'W',
  mountain: 'M',
};

const TILE_SIZE = 1.5;
const TILE_HEIGHT = 0.26;
const BOARD_Y = 0.4;

export type BoardView = {
  group: THREE.Group;
  /** World-space extent of the board slab, for framing the camera. */
  bounds: THREE.Box3;
  /** Centre of a node's tile, in world space. */
  worldPos(nodeId: string): THREE.Vector3;
  /** Top surface of a node's tile — where a pawn stands. */
  standPos(nodeId: string): THREE.Vector3;
  /** Pulse these tiles to show the player their options. */
  setHighlight(nodeIds: string[]): void;
  /** Tiles that can be clicked, for the raycaster. */
  pickables(): THREE.Object3D[];
  update(dt: number): void;
};

/** Cached canvas texture of a single letter, drawn once per section. */
const letterTextures = new Map<string, THREE.Texture>();

function letterTexture(letter: string, color: number): THREE.Texture {
  const key = `${letter}-${color}`;
  const cached = letterTextures.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);

  // The camera looks north across the board, so a tile's top face is seen
  // rotated half a turn; draw the letter upside down to read upright.
  ctx.translate(size, size);
  ctx.rotate(Math.PI);

  ctx.fillStyle = 'rgba(90, 60, 20, 0.55)';
  ctx.font = `bold ${size * 0.58}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + size * 0.03);

  // A thin inner ring, echoing the printed tile.
  ctx.strokeStyle = 'rgba(120, 85, 30, 0.35)';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  letterTextures.set(key, texture);
  return texture;
}

/**
 * The printed top of the board: cream card with a dhaka-weave border, corner
 * mandalas and the title along the near edge. Drawn as the camera sees it
 * (north up), then turned half a turn — the same trick as the tile letters.
 */
function boardFace(width: number, depth: number): THREE.Texture {
  const scale = 40; // px per world unit
  const W = Math.round(width * scale);
  const H = Math.round(depth * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.translate(W, H);
  g.rotate(Math.PI);

  // Card, with a faint warm vignette.
  const bg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, '#fbf6e9');
  bg.addColorStop(1, '#efe4c9');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const u = scale;
  // Outer maroon band.
  g.fillStyle = '#8e2f3f';
  g.fillRect(0, 0, W, u * 1.1);
  g.fillRect(0, H - u * 1.1, W, u * 1.1);
  g.fillRect(0, 0, u * 1.1, H);
  g.fillRect(W - u * 1.1, 0, u * 1.1, H);

  // Dhaka weave: alternating triangles inside the band.
  const tri = u * 0.55;
  const colours = ['#d9a327', '#1f3b6e', '#f4ead2', '#c8342f'];
  const strip = (x0: number, y0: number, len: number, horizontal: boolean): void => {
    const n = Math.floor(len / tri);
    for (let i = 0; i < n; i++) {
      g.fillStyle = colours[i % colours.length];
      g.beginPath();
      if (horizontal) {
        const x = x0 + i * tri;
        const up = i % 2 === 0;
        g.moveTo(x, y0 + (up ? tri : 0));
        g.lineTo(x + tri / 2, y0 + (up ? 0 : tri));
        g.lineTo(x + tri, y0 + (up ? tri : 0));
      } else {
        const y = y0 + i * tri;
        const right = i % 2 === 0;
        g.moveTo(x0 + (right ? 0 : tri), y);
        g.lineTo(x0 + (right ? tri : 0), y + tri / 2);
        g.lineTo(x0 + (right ? 0 : tri), y + tri);
      }
      g.fill();
    }
  };
  const inset = u * 0.28;
  strip(inset, inset, W - inset * 2, true);
  strip(inset, H - inset - tri, W - inset * 2, true);
  strip(inset, inset + tri, H - inset * 2 - tri * 2, false);
  strip(W - inset - tri, inset + tri, H - inset * 2 - tri * 2, false);

  // Thin gold rule inside the band.
  g.strokeStyle = '#d9a327';
  g.lineWidth = u * 0.08;
  g.strokeRect(u * 1.3, u * 1.3, W - u * 2.6, H - u * 2.6);

  // Corner mandalas.
  const mandala = (cx: number, cy: number, r: number): void => {
    g.save();
    g.translate(cx, cy);
    for (let ring = 3; ring > 0; ring--) {
      g.fillStyle = ['#8e2f3f', '#d9a327', '#1f3b6e'][ring - 1];
      g.beginPath();
      const petals = 8 * ring;
      for (let i = 0; i <= petals * 2; i++) {
        const a = (i / (petals * 2)) * Math.PI * 2;
        const rr = (r * ring) / 3 * (i % 2 === 0 ? 1 : 0.78);
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.fill();
    }
    g.fillStyle = '#fbf6e9';
    g.beginPath();
    g.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const m = u * 2.4;
  mandala(m, m, u * 0.9);
  mandala(W - m, m, u * 0.9);
  mandala(m, H - m, u * 0.9);
  mandala(W - m, H - m, u * 0.9);

  // The title, along the near (south) edge.
  g.fillStyle = 'rgba(142, 47, 63, 0.9)';
  g.font = `800 ${u * 1.5}px Georgia, 'Times New Roman', serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('T R A V E L    N E P A L', W / 2, H - u * 2.55);
  g.fillStyle = 'rgba(125, 110, 92, 0.85)';
  g.font = `600 ${u * 0.55}px Georgia, serif`;
  g.fillText('A COMPLETE REALITY TRAVEL ADVENTURE', W / 2, H - u * 1.55);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

let stripes: THREE.Texture | null = null;
function stripeTexture(): THREE.Texture {
  if (stripes) return stripes;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#c2342f';
    g.fillRect(i * 16, 0, 16, 16);
  }
  stripes = new THREE.CanvasTexture(c);
  stripes.colorSpace = THREE.SRGBColorSpace;
  return stripes;
}

let stop: THREE.Texture | null = null;
function stopTexture(): THREE.Texture {
  if (stop) return stop;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c2342f';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56);
  }
  g.closePath();
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('STOP', 64, 66);
  stop = new THREE.CanvasTexture(c);
  stop.colorSpace = THREE.SRGBColorSpace;
  // The cylinder cap's UVs come out a quarter-turn off once the sign stands up.
  stop.center.set(0.5, 0.5);
  stop.rotation = -Math.PI / 2;
  return stop;
}

function nodeVec(node: BoardNode): THREE.Vector3 {
  return new THREE.Vector3(node.pos[0], BOARD_Y + node.pos[1], node.pos[2]);
}

/** Half-width of the painted road, and of its darker border. */
const ROAD_HALF = TILE_SIZE * 0.66;
const BORDER_HALF = ROAD_HALF + 0.12;
const ROAD_TOP = BOARD_Y - 0.03;
/** Samples per edge — enough that corners read as curves. */
const ROAD_SAMPLES = 14;

/**
 * Direction of travel through a node, used for both the road curve and the
 * tile's heading. Taken across the node (previous → next) so neighbouring
 * curve segments share a tangent and the road bends without a kink.
 */
function headingAt(board: Board, preds: Map<string, string[]>, id: string, via?: string, from?: string): THREE.Vector3 {
  const node = nodeAt(board, id);
  const before = from ?? preds.get(id)?.[0];
  const after = via ?? node.next[0];
  const a = before ? nodeVec(nodeAt(board, before)) : nodeVec(node);
  const b = after ? nodeVec(nodeAt(board, after)) : nodeVec(node);
  const t = b.sub(a);
  t.y = 0;
  return t.lengthSq() > 1e-6 ? t.normalize() : new THREE.Vector3(1, 0, 0);
}

/**
 * The whole road network as one smooth ribbon mesh: every edge is a cubic
 * Hermite curve between its two tiles, coloured by the section it enters,
 * laid over a slightly wider dark border so the road reads as printed.
 */
function buildRoads(board: Board): THREE.Group {
  const nodes = Object.values(board.nodes);
  const preds = new Map<string, string[]>();
  for (const n of nodes) for (const t of n.next) preds.set(t, [...(preds.get(t) ?? []), n.id]);

  const top: number[] = [];
  const topCol: number[] = [];
  const under: number[] = [];
  const idx: number[] = [];
  const underIdx: number[] = [];
  const colour = new THREE.Color();
  const sectionOrder = Object.keys(SECTION_COLOR);

  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  for (const node of nodes) {
    for (const nextId of node.next) {
      const next = nodeAt(board, nextId);
      const a = nodeVec(node);
      const b = nodeVec(next);
      const len = a.distanceTo(b);
      // On a branch, the curve leaves along the branch itself, not the main road.
      const tA = headingAt(board, preds, node.id, node.next.length > 1 ? nextId : undefined).multiplyScalar(len);
      const tB = headingAt(board, preds, nextId, undefined, (preds.get(nextId)?.length ?? 0) > 1 ? node.id : undefined).multiplyScalar(len);
      colour.set(SECTION_COLOR[next.section]);
      // A hair of height per section keeps overlapping branches from z-fighting.
      const lift = sectionOrder.indexOf(next.section) * 0.0015;

      const base = top.length / 3;
      const ubase = under.length / 3;
      for (let i = 0; i <= ROAD_SAMPLES; i++) {
        const t = i / ROAD_SAMPLES;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        p.set(0, 0, 0).addScaledVector(a, h00).addScaledVector(tA, h10).addScaledVector(b, h01).addScaledVector(tB, h11);
        // Derivative of the Hermite basis for the tangent.
        const d00 = 6 * t2 - 6 * t;
        const d10 = 3 * t2 - 4 * t + 1;
        const d01 = -6 * t2 + 6 * t;
        const d11 = 3 * t2 - 2 * t;
        tan.set(0, 0, 0).addScaledVector(a, d00).addScaledVector(tA, d10).addScaledVector(b, d01).addScaledVector(tB, d11);
        tan.y = 0;
        tan.normalize();
        side.crossVectors(UP, tan).normalize();

        for (const s of [-1, 1]) {
          top.push(p.x + side.x * ROAD_HALF * s, ROAD_TOP + lift, p.z + side.z * ROAD_HALF * s);
          topCol.push(colour.r, colour.g, colour.b);
          under.push(p.x + side.x * BORDER_HALF * s, ROAD_TOP - 0.025, p.z + side.z * BORDER_HALF * s);
        }
        if (i > 0) {
          const k = base + i * 2;
          idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
          const u = ubase + i * 2;
          underIdx.push(u - 2, u - 1, u, u - 1, u + 1, u);
        }
      }
    }
  }

  const group = new THREE.Group();

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(topCol, 3));
  topGeo.setIndex(idx);
  topGeo.computeVertexNormals();
  const road = new THREE.Mesh(
    topGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  );
  road.receiveShadow = true;

  const underGeo = new THREE.BufferGeometry();
  underGeo.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
  underGeo.setIndex(underIdx);
  underGeo.computeVertexNormals();
  const border = new THREE.Mesh(
    underGeo,
    new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 1, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  border.receiveShadow = true;

  // Round pads under every tile fill the joints where branches meet.
  const padGeo = new THREE.CircleGeometry(ROAD_HALF, 28);
  padGeo.rotateX(-Math.PI / 2);
  const padMats = new Map<number, THREE.MeshStandardMaterial>();
  for (const node of nodes) {
    if (node.next.length < 2 && (preds.get(node.id)?.length ?? 0) < 2 && node.next.length > 0 && preds.has(node.id)) continue;
    const c = SECTION_COLOR[node.section];
    let m = padMats.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
      padMats.set(c, m);
    }
    const pad = new THREE.Mesh(padGeo, m);
    pad.position.copy(nodeVec(node)).setY(ROAD_TOP + 0.02);
    pad.receiveShadow = true;
    group.add(pad);
  }

  group.add(border, road);
  return group;
}

/** Turn a tile to follow the road, snapped so its letter never leans past 45°. */
function tileYaw(heading: THREE.Vector3): number {
  let r = -Math.atan2(heading.z, heading.x);
  const q = Math.PI / 2;
  r = r - Math.round(r / q) * q;
  return r;
}

/** The marker that sits on top of a special tile. */
function markerFor(node: BoardNode): THREE.Object3D | null {
  switch (node.kind) {
    case 'checkpoint': {
      // A checkpoint barrier: striped boom between two posts, and a stop sign.
      const group = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
      for (const x of [-0.55, 0.55]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), postMat);
        post.position.set(x, 0.375, 0.5);
        post.castShadow = true;
        group.add(post);
      }
      const boom = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.1, 0.1),
        new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5 }),
      );
      boom.position.set(0, 0.68, 0.5);
      boom.castShadow = true;
      group.add(boom);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.6 }),
      );
      pole.position.set(0.5, 0.6, -0.45);
      pole.castShadow = true;
      const sign = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.06, 8),
        new THREE.MeshStandardMaterial({ map: stopTexture(), roughness: 0.5 }),
      );
      sign.position.set(0.5, 1.3, -0.45);
      sign.rotation.x = -Math.PI / 2;
      sign.castShadow = true;
      // A lamp that blinks on top of the post.
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1.4, 0.6) }),
      );
      lamp.position.set(-0.55, 0.82, 0.5);
      lamp.userData.blink = true;
      group.add(pole, sign, lamp);
      return group;
    }

    case 'ticket-counter': {
      // A small booth with a striped awning.
      const group = new THREE.Group();
      const booth = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.9, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x7e4fc4, roughness: 0.7 }),
      );
      booth.position.y = 0.45;
      booth.castShadow = true;

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.95, 0.5, 4),
        new THREE.MeshStandardMaterial({ color: 0xf2d35e, roughness: 0.6 }),
      );
      roof.position.y = 1.15;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;

      group.add(booth, roof);
      return group;
    }

    case 'junction': {
      // A forked signpost.
      const group = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }),
      );
      post.position.y = 0.65;
      post.castShadow = true;
      group.add(post);

      for (const [i, dir] of [-1, 1].entries()) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.22, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xf08a3c, roughness: 0.6 }),
        );
        arm.position.set(dir * 0.45, 1.2 - i * 0.3, 0);
        arm.castShadow = true;
        group.add(arm);
      }
      return group;
    }

    case 'start': {
      // Control tower + a windsock-ish mast for the airport.
      const group = new THREE.Group();
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.36, 1.5, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
      );
      tower.position.y = 0.75;
      tower.castShadow = true;

      const cab = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.35 }),
      );
      cab.position.y = 1.65;
      cab.castShadow = true;

      group.add(tower, cab);
      return group;
    }

    case 'terminus': {
      const flag = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 }),
      );
      post.position.y = 0.7;
      post.castShadow = true;

      // Nepal's double-pennon flag, roughly.
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.75, 0.32);
      shape.lineTo(0.2, 0.52);
      shape.lineTo(0.72, 0.84);
      shape.lineTo(0, 1.05);
      shape.lineTo(0, 0);
      const cloth = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({
          color: 0xc8102e,
          side: THREE.DoubleSide,
          roughness: 0.8,
        }),
      );
      cloth.position.set(0.03, 0.75, 0);
      flag.add(post, cloth);
      return flag;
    }

    default:
      return null;
  }
}

export function buildBoard(board: Board): BoardView {
  const group = new THREE.Group();
  const nodes = Object.values(board.nodes);

  // --- base slab, sized to the node cloud ---
  const box = new THREE.Box3();
  for (const node of nodes) box.expandByPoint(nodeVec(node));
  box.expandByScalar(4.6);
  // A little extra on the near edge for the printed title.
  box.min.z -= 2.2;

  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  const card = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: boardFace(size.x, size.z) });
  const edge = new THREE.MeshStandardMaterial({ color: BOARD_BASE, roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(size.x, 0.7, size.z), [edge, edge, card, edge, edge, edge]);
  base.position.set(centre.x, BOARD_Y - 0.42, centre.z);
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  // A lacquered wooden frame, so the board reads as a physical object.
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a3b22, roughness: 0.45, metalness: 0.05 });
  const rail = 0.7;
  const railH = 0.62;
  const railY = BOARD_Y - 0.5;
  for (const [w, d, x, z] of [
    [size.x + rail * 2, rail, centre.x, box.min.z - rail / 2],
    [size.x + rail * 2, rail, centre.x, box.max.z + rail / 2],
    [rail, size.z, box.min.x - rail / 2, centre.z],
    [rail, size.z, box.max.x + rail / 2, centre.z],
  ]) {
    const piece = new THREE.Mesh(new RoundedBoxGeometry(w, railH, d, 2, 0.12), wood);
    piece.position.set(x, railY + 0.24, z);
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);
  }
  // Brass corner caps.
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, roughness: 0.3, metalness: 0.9 });
  for (const x of [box.min.x - rail / 2, box.max.x + rail / 2]) {
    for (const z of [box.min.z - rail / 2, box.max.z + rail / 2]) {
      const cap = new THREE.Mesh(new RoundedBoxGeometry(rail * 1.15, railH + 0.06, rail * 1.15, 2, 0.1), brass);
      cap.position.set(x, railY + 0.27, z);
      cap.castShadow = true;
      group.add(cap);
    }
  }
  box.expandByScalar(rail);

  // --- road bed: one smooth ribbon through every tile ---
  group.add(buildRoads(board));
  const predsForTiles = new Map<string, string[]>();
  for (const n of nodes) for (const t of n.next) predsForTiles.set(t, [...(predsForTiles.get(t) ?? []), n.id]);

  // --- tiles ---
  const tileGeometry = new RoundedBoxGeometry(TILE_SIZE * 0.96, TILE_HEIGHT, TILE_SIZE * 0.96, 3, 0.07);
  const tiles = new Map<string, THREE.Mesh>();
  const highlights = new Map<string, THREE.Object3D>();
  const blinkers: THREE.Object3D[] = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 3.4, 1.4), transparent: true, opacity: 0 });
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.TorusGeometry(TILE_SIZE * 0.72, 0.07, 8, 36);
  const beamGeo = new THREE.CylinderGeometry(TILE_SIZE * 0.62, TILE_SIZE * 0.7, 4, 24, 1, true);
  beamGeo.translate(0, 2, 0);

  for (const node of nodes) {
    const top = letterTexture(SECTION_LETTER[node.section], TILE_COLOR[node.kind]);
    const sideMat = new THREE.MeshStandardMaterial({
      color: TILE_COLOR[node.kind],
      roughness: 0.75,
    });
    const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.75 });

    // BoxGeometry material order is +x, -x, +y, -y, +z, -z — only +y gets the letter.
    const tile = new THREE.Mesh(tileGeometry, [
      sideMat,
      sideMat,
      topMat,
      sideMat,
      sideMat,
      sideMat,
    ]);
    tile.position.copy(nodeVec(node));
    tile.rotation.y = tileYaw(headingAt(board, predsForTiles, node.id));
    tile.castShadow = true;
    tile.receiveShadow = true;
    tile.userData.nodeId = node.id;
    group.add(tile);
    tiles.set(node.id, tile);

    const marker = markerFor(node);
    if (marker) {
      marker.position.copy(nodeVec(node)).setY(BOARD_Y + TILE_HEIGHT / 2);
      group.add(marker);
      marker.traverse((o) => {
        if (o.userData.blink) blinkers.push(o);
      });
    }

    // A glowing ring and a soft beam of light, shown only while the tile is a live choice.
    const ring = new THREE.Group();
    const torus = new THREE.Mesh(ringGeo, ringMat);
    torus.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    ring.add(torus, beam);
    ring.position.copy(nodeVec(node)).setY(BOARD_Y + TILE_HEIGHT);
    ring.visible = false;
    group.add(ring);
    highlights.set(node.id, ring);
  }

  let highlighted: string[] = [];
  let pulse = 0;

  return {
    group,
    bounds: box,

    worldPos(nodeId) {
      return nodeVec(nodeAt(board, nodeId));
    },

    standPos(nodeId) {
      return nodeVec(nodeAt(board, nodeId)).setY(BOARD_Y + TILE_HEIGHT / 2);
    },

    setHighlight(nodeIds) {
      for (const id of highlighted) {
        const ring = highlights.get(id);
        if (ring) ring.visible = false;
      }
      highlighted = nodeIds;
      for (const id of highlighted) {
        const ring = highlights.get(id);
        if (ring) ring.visible = true;
      }
    },

    pickables() {
      return highlighted
        .map((id) => tiles.get(id))
        .filter((t): t is THREE.Mesh => Boolean(t));
    },

    update(dt) {
      pulse += dt * 3;
      const blinkOn = Math.sin(pulse * 1.3) > 0;
      for (const b of blinkers) b.visible = blinkOn;

      if (highlighted.length === 0) return;
      ringMat.opacity = 0.65 + Math.sin(pulse) * 0.35;
      beamMat.opacity = 0.16 + Math.sin(pulse) * 0.08;
      for (const id of highlighted) {
        const ring = highlights.get(id);
        if (ring) {
          ring.rotation.y += dt * 0.8;
          ring.children[0].scale.setScalar(1 + Math.sin(pulse) * 0.06);
        }
      }
    },
  };
}
