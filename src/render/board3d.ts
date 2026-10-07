/**
 * The board itself: base, road bed, travel tiles and the markers that make a
 * checkpoint, junction or ticket counter readable at a glance.
 */

import * as THREE from 'three';
import { ASHTAMANGALA, DEVANAGARI_DIGITS, drawMedallion } from './ashtamangala.ts';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { nodeAt } from '../engine/board.ts';
import type { Board, BoardNode, SectionId } from '../engine/types.ts';
import { BOARD_BASE, SECTION_COLOR, TILE_COLOR, TRIP_ICON, TRIP_LABEL, TRIP_SHORT } from './palette.ts';
import { bake } from './bake.ts';
import { pagodaRoof } from './props.ts';

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

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const hex = (c: THREE.Color): string => `#${c.getHexString()}`;
  // Dark tiles (checkpoints, ticket counters) get light lettering.
  const dark = base.r * 0.3 + base.g * 0.59 + base.b * 0.11 < 0.45;

  // A printed card face: lighter in the middle, a hair darker at the edges.
  const face = ctx.createRadialGradient(size * 0.45, size * 0.4, size * 0.1, size / 2, size / 2, size * 0.75);
  face.addColorStop(0, hex(base.clone().offsetHSL(0, -0.04, 0.07)));
  face.addColorStop(1, hex(base.clone().offsetHSL(0, 0.02, -0.06)));
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, size, size);

  // The camera looks north across the board, so a tile's top face is seen
  // rotated half a turn; draw the letter upside down to read upright.
  ctx.translate(size, size);
  ctx.rotate(Math.PI);

  // A double inner border and four corner studs, like the printed squares.
  const ink = dark ? 'rgba(255, 245, 225, 0.55)' : 'rgba(110, 72, 24, 0.42)';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(16, 16, size - 32, size - 32, 18);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(28, 28, size - 56, size - 56, 12);
  ctx.stroke();
  ctx.fillStyle = ink;
  for (const [x, y] of [[42, 42], [size - 42, 42], [42, size - 42], [size - 42, size - 42]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The ring the letter sits in.
  ctx.strokeStyle = dark ? 'rgba(255, 245, 225, 0.4)' : 'rgba(120, 85, 30, 0.32)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.33, 0, Math.PI * 2);
  ctx.stroke();

  // The letter, embossed: a highlight below-right, then the ink.
  ctx.font = `bold ${size * 0.5}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 250, 230, 0.6)';
  ctx.fillText(letter, size / 2 + 3, size / 2 + size * 0.035 + 3);
  ctx.fillStyle = dark ? 'rgba(255, 248, 232, 0.92)' : 'rgba(92, 58, 18, 0.72)';
  ctx.fillText(letter, size / 2, size / 2 + size * 0.035);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  letterTextures.set(key, texture);
  return texture;
}

/**
 * The printed top of the board: cream card with a dhaka-weave border, corner
 * mandalas and the title along the near edge. Drawn as the camera sees it
 * (north up), then turned half a turn — the same trick as the tile letters.
 */
function boardFace(width: number, depth: number, box: THREE.Box3): THREE.Texture {
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
  /** Photo-pixel position (see tools/gen_board.py) → this canvas, north up. */
  const P = (x: number, y: number): [number, number] => [
    (box.max.x - (680 - x) * 0.063) * scale,
    (box.max.z - (775 - y) * 0.063) * scale,
  ];
  const pu = 0.063 * scale; // canvas px per photo px

  // The ground between the roads, painted as Nepal's own geography from south
  // to north: the flat green Terai with its rice paddies, the middle hills cut
  // into terraces with the odd golden mustard field, then alpine pasture,
  // scree and snow under the Himalaya along the top edge.
  {
    const ix = u * 1.3;
    const iw = W - u * 2.6;
    const ih = H - u * 2.6;
    let sd = 11;
    const r = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    /** Canvas y of a photo y (the canvas is drawn north-up). */
    const cy = (y: number): number => P(0, y)[1];
    const inBand = (y0: number, y1: number): [number, number] => [ix + r() * iw, cy(y0) + r() * (cy(y1) - cy(y0))];

    const ground = g.createLinearGradient(0, cy(440), 0, cy(1110));
    ground.addColorStop(0, '#e4ebee'); // snow at the top edge
    ground.addColorStop(0.06, '#c3cbbf'); // scree
    ground.addColorStop(0.13, '#a9bd83'); // alpine pasture
    ground.addColorStop(0.28, '#8dba5c'); // forested middle hills
    ground.addColorStop(0.55, '#93c35d');
    ground.addColorStop(0.75, '#8cc653'); // the Terai, lush and flat
    ground.addColorStop(1, '#82c04c');
    g.fillStyle = ground;
    g.fillRect(ix, ix, iw, ih);

    // Watercolour washes, coloured for the band they fall in.
    for (let i = 0; i < 360; i++) {
      const [x, y] = [ix + r() * iw, ix + r() * ih];
      const north = (y - cy(440)) / (cy(1110) - cy(440));
      g.fillStyle =
        north < 0.12
          ? ['rgba(255, 255, 255, 0.16)', 'rgba(140, 145, 150, 0.12)'][i % 2]
          : north < 0.5
            ? ['rgba(70, 120, 50, 0.13)', 'rgba(170, 200, 100, 0.13)', 'rgba(110, 150, 70, 0.1)'][i % 3]
            : ['rgba(120, 190, 70, 0.14)', 'rgba(70, 130, 50, 0.1)', 'rgba(190, 215, 110, 0.12)'][i % 3];
      g.beginPath();
      g.ellipse(x, y, u * (0.8 + r() * 3.5), u * (0.5 + r() * 2), r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }

    // Middle hills: terraces, drawn as nested wobbly contours.
    for (let k = 0; k < 46; k++) {
      const [cx, cyy] = inBand(560, 880);
      const rings = 5 + Math.floor(r() * 5);
      const rr = u * (1.2 + r() * 2.4);
      const tilt = r() * Math.PI;
      const golden = r() < 0.16;
      for (let ring = rings; ring > 0; ring--) {
        const rad = (rr * ring) / rings;
        g.fillStyle = golden && ring % 2 === 0
          ? 'rgba(226, 194, 58, 0.22)'
          : ring % 2 === 0 ? 'rgba(150, 205, 90, 0.18)' : 'rgba(90, 150, 60, 0.14)';
        g.beginPath();
        for (let a = 0; a <= 28; a++) {
          const t = (a / 28) * Math.PI * 2;
          const wob = 1 + Math.sin(t * 3 + k) * 0.12 + Math.sin(t * 5 + ring) * 0.06;
          const px0 = cx + Math.cos(t + tilt) * rad * wob;
          const py0 = cyy + Math.sin(t + tilt) * rad * wob * 0.62;
          if (a === 0) g.moveTo(px0, py0);
          else g.lineTo(px0, py0);
        }
        g.fill();
      }
    }

    // The Terai: rice paddies in neat grids, some flooded and shining.
    for (let k = 0; k < 70; k++) {
      const [cx, cyy] = inBand(860, 1100);
      g.save();
      g.translate(cx, cyy);
      g.rotate((r() - 0.5) * 0.5);
      const cols = 2 + Math.floor(r() * 3);
      const rows = 2 + Math.floor(r() * 3);
      const cw = u * (0.5 + r() * 0.5);
      const ch = u * (0.35 + r() * 0.35);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const flooded = r() < 0.3;
          g.fillStyle = flooded ? 'rgba(150, 205, 210, 0.42)' : r() < 0.15 ? 'rgba(226, 200, 80, 0.32)' : 'rgba(150, 215, 80, 0.34)';
          g.fillRect(i * cw, j * ch, cw - u * 0.06, ch - u * 0.06);
        }
      }
      g.strokeStyle = 'rgba(235, 240, 200, 0.35)';
      g.lineWidth = u * 0.04;
      g.strokeRect(-u * 0.03, -u * 0.03, cols * cw, rows * ch);
      g.restore();
    }

    // Alpine north: scree, boulders and streaks of old snow under the range.
    for (let k = 0; k < 120; k++) {
      const [x, y] = inBand(446, 560);
      g.fillStyle = k % 3 === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(120, 125, 130, 0.14)';
      g.beginPath();
      g.ellipse(x, y, u * (0.3 + r() * 1.4), u * (0.1 + r() * 0.3), (r() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }

    // The rivers that tie the country together, running from the snows down
    // through the hills and out across the Terai — Karnali in the west, the
    // Seti through Phewa Lake to the Narayani in Chitwan, Koshi in the east.
    const rivers: [number, number][][] = [
      [[420, 446], [446, 560], [400, 640], [392, 760], [338, 860], [420, 930], [486, 980], [520, 1088]],
      [[586, 446], [592, 530], [584, 610], [578, 700], [560, 776], [566, 830], [626, 870], [690, 930], [760, 978], [842, 990], [880, 1088]],
      [[1052, 446], [1060, 560], [1066, 690], [1004, 770], [962, 846], [972, 952], [1006, 1088]],
    ];
    for (const river of rivers) {
      const path = (): void => {
        g.beginPath();
        river.forEach(([x, y], i) => {
          const [cx, cyy] = P(x, y);
          if (i === 0) g.moveTo(cx, cyy);
          else {
            const [px0, py0] = P(river[i - 1][0], river[i - 1][1]);
            g.quadraticCurveTo(px0, py0, (px0 + cx) / 2, (py0 + cyy) / 2);
          }
        });
        const [lx, ly] = P(river[river.length - 1][0], river[river.length - 1][1]);
        g.lineTo(lx, ly);
      };
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(200, 190, 140, 0.9)'; // shingle banks
      g.lineWidth = 16 * pu;
      path();
      g.stroke();
      g.strokeStyle = '#4c9fc6';
      g.lineWidth = 10 * pu;
      path();
      g.stroke();
      g.strokeStyle = 'rgba(225, 245, 250, 0.5)'; // a glint down the middle
      g.lineWidth = 2.5 * pu;
      path();
      g.stroke();
    }

    // A little paper grain, so it still reads as a printed board.
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(60, 70, 40, ${0.02 + r() * 0.03})`;
      g.fillRect(ix + r() * iw, ix + r() * ih, u * 0.25 * r(), u * 0.02);
    }
  }

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

  // --- Maane Chowk panel on the east side: header, the spinner's legend of the
  //     eight auspicious symbols, and the spaces the card decks sit on ---
  {
    const [x0, y0] = P(1086, 470);
    const [x1, y1] = P(1240, 1108);
    g.fillStyle = '#f7efdc';
    g.beginPath();
    g.roundRect(x0, y0, x1 - x0, y1 - y0, u * 0.5);
    g.fill();
    g.strokeStyle = '#8e2f3f';
    g.lineWidth = u * 0.12;
    g.stroke();
    g.strokeStyle = '#d9a327';
    g.lineWidth = u * 0.05;
    g.beginPath();
    g.roundRect(x0 + u * 0.2, y0 + u * 0.2, x1 - x0 - u * 0.4, y1 - y0 - u * 0.4, u * 0.4);
    g.stroke();

    const cx = (x0 + x1) / 2;
    // The chowk's paving under the shrine.
    const [, sy] = P(1162, 770);
    g.fillStyle = '#d9cdb5';
    g.beginPath();
    g.arc(cx, sy, 40 * pu, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(110, 90, 60, 0.35)';
    g.lineWidth = u * 0.04;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 12 * pu, sy + Math.sin(a) * 12 * pu);
      g.lineTo(cx + Math.cos(a) * 40 * pu, sy + Math.sin(a) * 40 * pu);
      g.stroke();
    }

    // Header.
    const [, hy] = P(1162, 492);
    g.fillStyle = '#8e2f3f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${u * 0.62}px Georgia, serif`;
    g.fillText('MAANE CHOWK', cx, hy);
    g.fillStyle = 'rgba(110, 90, 70, 0.95)';
    g.font = `italic ${u * 0.32}px Georgia, serif`;
    g.fillText('Spin the prayer wheel · move 1 to 8', cx, hy + u * 0.5);

    // Legend: two columns of four medallions with names.
    const grounds = ['#a8223a', '#1d4f96', '#25784a', '#6b2a8a'];
    for (let i = 0; i < 8; i++) {
      const col = i < 4 ? 0 : 1;
      const row = i % 4;
      const [mx, my] = P(col === 0 ? 1104 : 1180, 548 + row * 42);
      const rr = 15 * pu;
      drawMedallion(g, i, mx, my, rr, grounds[i % 4], DEVANAGARI_DIGITS[i + 1]);
      g.textAlign = 'left';
      g.fillStyle = '#4a2a1a';
      g.font = `bold ${u * 0.34}px Georgia, serif`;
      g.fillText(`${i + 1} ${ASHTAMANGALA[i].name}`, mx + rr + u * 0.15, my - u * 0.16, 52 * pu);
      g.fillStyle = 'rgba(100, 80, 60, 0.9)';
      g.font = `italic ${u * 0.26}px Georgia, serif`;
      g.fillText(ASHTAMANGALA[i].meaning, mx + rr + u * 0.15, my + u * 0.22, 52 * pu);
    }

    // Deck spaces: outlined card slots the decks sit on.
    g.textAlign = 'center';
    const [, dy] = P(1162, 862);
    g.fillStyle = '#8e2f3f';
    g.font = `800 ${u * 0.4}px Georgia, serif`;
    g.fillText('CARD DECKS', cx, dy);
    g.strokeStyle = 'rgba(142, 47, 63, 0.45)';
    g.setLineDash([u * 0.15, u * 0.1]);
    g.lineWidth = u * 0.05;
    for (const [px, py] of DECK_SLOTS) {
      const [qx, qy] = P(px, py);
      g.strokeRect(qx - u * 0.6, qy - u * 0.82, u * 1.2, u * 1.64);
    }
    g.setLineDash([]);
  }

  // --- the eight auspicious symbols down the west margin ---
  for (let i = 0; i < 8; i++) {
    const [mx, my] = P(250, 560 + i * 62);
    drawMedallion(g, i, mx, my, 13 * pu, ['#8e2f3f', '#1f3b6e', '#2f6b45', '#5a2a7a'][i % 4]);
  }

  // --- the printed slogans, flanking the title on the near edge (the north
  //     edge belongs to the Himalaya now) ---
  {
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(142, 47, 63, 0.85)';
    g.font = `800 ${u * 0.42}px Georgia, serif`;
    g.textAlign = 'left';
    const ly = H - u * 2.45;
    g.fillText('WELCOME TO THE LIFETIME', u * 3.6, ly);
    g.fillText('EXPERIENCE OF NEPAL', u * 3.6, ly + u * 0.55);
    g.textAlign = 'right';
    const [rx] = P(1062, 466);
    g.fillText('A COMPLETE ADVENTURE &', rx, ly);
    g.fillText('A JOURNEY LIKE NEVER BEFORE', rx, ly + u * 0.55);
  }

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

/** A painted sign face: lettering on a coloured board, drawn once per text. */
const signCache = new Map<string, THREE.Texture>();
function signTexture(text: string, bg: string, fg: string): THREE.Texture {
  const key = `${text}|${bg}|${fg}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = fg;
  g.lineWidth = 4;
  g.strokeRect(5, 5, 246, 54);
  g.fillStyle = fg;
  g.font = 'bold 36px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  signCache.set(key, t);
  return t;
}

/** A booth's rooftop banner: the trip's colour and emblem, and where the ticket takes you. */
const bannerCache = new Map<string, THREE.Texture>();
function bannerTexture(icon: string, lines: string[], bg: string): THREE.Texture {
  const key = `${icon}|${lines.join('/')}|${bg}`;
  const hit = bannerCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.roundRect(4, 4, 312, 192, 22);
  g.fillStyle = bg;
  g.fill();
  g.strokeStyle = '#f2d27a';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.92)';
  g.beginPath();
  g.arc(62, 100, 46, 0, Math.PI * 2);
  g.fill();
  g.font = '58px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 62, 104);
  g.fillStyle = '#fff8e6';
  g.textAlign = 'left';
  const size = lines.length > 1 ? 40 : 48;
  g.font = `bold ${size}px Georgia, serif`;
  lines.forEach((line, i) => g.fillText(line, 122, 100 + (i - (lines.length - 1) / 2) * (size + 6), 160));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  bannerCache.set(key, t);
  return t;
}

/** Nepal's flag: two stacked crimson pennants edged in blue, the moon above, the sun below. */
let flagTex: THREE.Texture | null = null;
function nepalFlagTexture(): THREE.Texture {
  if (flagTex) return flagTex;
  const W = 300;
  const H = 420;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Shape space (0..0.75 across, 0..1.05 up) to canvas, y flipped.
  const X = (x: number): number => (x / 0.75) * W;
  const Y = (y: number): number => H - (y / 1.05) * H;
  const outline: [number, number][] = [[0, 0], [0.75, 0], [0.24, 0.5], [0.72, 0.5], [0, 1.05]];
  g.fillStyle = '#1f3b8a';
  g.fillRect(0, 0, W, H);
  g.beginPath();
  outline.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
  g.closePath();
  g.save();
  g.clip();
  g.fillStyle = '#c8102e';
  g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = '#1f3b8a';
  g.lineWidth = 22;
  g.lineJoin = 'miter';
  g.stroke();
  g.fillStyle = '#ffffff';
  // The moon: a crescent with its rays, in the upper pennant.
  g.beginPath();
  g.arc(X(0.17), Y(0.74), 30, 0, Math.PI);
  g.arc(X(0.17), Y(0.74) - 8, 22, Math.PI, 0, true);
  g.fill();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + (i / 7) * Math.PI;
    g.beginPath();
    g.arc(X(0.17) + Math.cos(a) * 18, Y(0.74) - 6 + Math.sin(a) * 18, 4, 0, Math.PI * 2);
    g.fill();
  }
  // The sun, in the lower pennant.
  const sx = X(0.17);
  const sy = Y(0.22);
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 === 0 ? 34 : 24;
    g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  flagTex = new THREE.CanvasTexture(c);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  // ShapeGeometry UVs are the shape's own coordinates; map them onto the canvas.
  flagTex.repeat.set(1 / 0.75, 1 / 1.05);
  return flagTex;
}

function nepalFlag(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.75, 0);
  shape.lineTo(0.24, 0.5);
  shape.lineTo(0.72, 0.5);
  shape.lineTo(0, 1.05);
  shape.lineTo(0, 0);
  const cloth = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ map: nepalFlagTexture(), side: THREE.DoubleSide, roughness: 0.8 }),
  );
  cloth.castShadow = true;
  group.add(cloth);
  group.scale.setScalar(scale);
  return group;
}

/** The marker that sits on top of a special tile. */
function markerFor(node: BoardNode): THREE.Object3D | null {
  const shadow = <T extends THREE.Object3D>(o: T): T => {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = true;
    });
    return o;
  };
  switch (node.kind) {
    case 'checkpoint': {
      // A checkpoint: a striped boom across the road, a STOP sign, and the
      // sentry post with its flag.
      const group = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
      for (const x of [-0.58, 0.58]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.78, 12), postMat);
        post.position.set(x, 0.39, 0.5);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xc2342f, roughness: 0.5 }));
        band.position.set(x, 0.62, 0.5);
        group.add(post, band);
      }
      const boom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.32, 12),
        new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.4 }),
      );
      boom.rotation.z = Math.PI / 2;
      boom.position.set(0, 0.7, 0.5);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.6 }));
      weight.position.set(0.68, 0.7, 0.5);
      group.add(boom, weight);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.35, metalness: 0.7 }),
      );
      pole.position.set(0.5, 0.6, -0.45);
      const sign = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.05, 8),
        new THREE.MeshStandardMaterial({ map: stopTexture(), roughness: 0.45 }),
      );
      sign.position.set(0.5, 1.3, -0.47);
      sign.rotation.x = -Math.PI / 2;
      // The sentry post.
      const hut = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.44), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 }));
      walls.position.y = 0.29;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.6 }));
      stripe.position.y = 0.42;
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: 0x9fd0ea, roughness: 0.1, metalness: 0.3 }));
      window.position.set(0, 0.3, -0.225);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.5, flatShading: true }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.69;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }));
      mast.position.set(0.12, 0.95, 0);
      const flag = nepalFlag(0.2);
      flag.position.set(0.13, 0.96, 0);
      hut.add(walls, stripe, window, roof, mast, flag);
      hut.position.set(-0.42, 0, -0.38);
      // A lamp that blinks on top of the barrier post.
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1.4, 0.6) }),
      );
      lamp.position.set(-0.58, 0.84, 0.5);
      lamp.userData.blink = true;
      group.add(pole, sign, hut, lamp);
      return shadow(group);
    }

    case 'ticket-counter': {
      // A little Newar-style ticket booth: brick plinth, whitewashed walls, a
      // carved wooden window with its counter, a sign, and a two-tier roof.
      const group = new THREE.Group();
      const brick = new THREE.MeshStandardMaterial({ color: 0xa4523a, roughness: 0.9 });
      const plaster = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.8 });
      const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.6 });
      const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.12, 0.88, 2, 0.03), brick);
      plinth.position.y = 0.06;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.62, 0.68), plaster);
      body.position.y = 0.43;
      const dado = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.7), brick);
      dado.position.y = 0.2;
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.02), new THREE.MeshStandardMaterial({ color: 0x24160c, roughness: 0.9 }));
      hole.position.set(0, 0.5, -0.341);
      const frameParts: [number, number, number, number][] = [
        [0.56, 0.05, 0, 0.64], [0.56, 0.05, 0, 0.36], [0.05, 0.3, -0.255, 0.5], [0.05, 0.3, 0.255, 0.5],
      ];
      for (const [w, h, x, y] of frameParts) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), wood);
        f.position.set(x, y, -0.35);
        group.add(f);
      }
      // Lattice bars across the upper half of the window.
      for (let i = -2; i <= 2; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.02), wood);
        bar.position.set(i * 0.08, 0.57, -0.352);
        group.add(bar);
      }
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.16), wood);
      counter.position.set(0, 0.36, -0.42);
      // Where the ticket takes you: a red ticket square sells one trip, printed
      // on it; a town's counter sells whichever trip ticket you're missing.
      const trip = node.ticketReward;
      const place = (node.label ?? 'Ticket counter').replace(/ Ticket Counter$/, '').replace(/^Ticket: /, '');
      const tripColour = trip ? `#${new THREE.Color(SECTION_COLOR[trip]).offsetHSL(0, 0.05, -0.18).getHexString()}` : '#5e2f9e';
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.2),
        new THREE.MeshStandardMaterial({
          map: signTexture(trip ? (TRIP_SHORT[trip] ?? place).toUpperCase() : `${place.toUpperCase()} TICKETS`, tripColour, '#fff3c4'),
          roughness: 0.5,
        }),
      );
      sign.position.set(0, 0.81, -0.356);
      sign.rotation.y = Math.PI;
      const roofLow = pagodaRoof(0.72, 0.3, 0x4a3a30);
      roofLow.position.y = 0.88;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.76), new THREE.MeshStandardMaterial({ color: 0xe2b23a, roughness: 0.3, metalness: 0.8 }));
      trim.position.y = 0.75;
      const roofHigh = pagodaRoof(0.42, 0.26, 0x4a3a30);
      roofHigh.position.y = 1.16;
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0xe2b23a, roughness: 0.25, metalness: 0.85 }));
      finial.position.y = 1.38;
      group.add(plinth, body, dado, hole, counter, sign, roofLow, trim, roofHigh, finial);

      // A banner on a mast behind the roof, readable from across the board.
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.3, 8), wood);
      mast.position.set(0, 1.5, 0.3);
      const bannerMat = new THREE.MeshStandardMaterial({
        map: bannerTexture(trip ? TRIP_ICON[trip] ?? '🎫' : '🎫', trip ? (TRIP_LABEL[trip] ?? place).split(' ').slice(0, 2) : [place, 'All trips'], tripColour),
        roughness: 0.7,
      });
      // Two faces back to back, so the lettering reads from either side.
      for (const facing of [Math.PI, 0]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), bannerMat);
        banner.rotation.y = facing;
        banner.position.set(0, 1.86, 0.3 + (facing ? -0.025 : 0.025));
        group.add(banner);
      }
      group.add(mast);
      return shadow(group);
    }

    case 'junction': {
      // A carved signpost with two painted arrow boards.
      const group = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.75 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 1.45, 10), wood);
      post.position.y = 0.72;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe2b23a, roughness: 0.3, metalness: 0.8 }));
      cap.position.y = 1.48;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 }));
      foot.position.y = 0.05;
      group.add(post, cap, foot);
      const arrow = (len: number): THREE.Shape => {
        const sh = new THREE.Shape();
        sh.moveTo(0, -0.1);
        sh.lineTo(len - 0.16, -0.1);
        sh.lineTo(len, 0);
        sh.lineTo(len - 0.16, 0.1);
        sh.lineTo(0, 0.1);
        sh.closePath();
        return sh;
      };
      const boards: [number, number, number][] = [[1, 1.22, 0xf08a3c], [-1, 0.94, 0xf4ead2]];
      for (const [dir, y, color] of boards) {
        const geo = new THREE.ExtrudeGeometry(arrow(0.78), { depth: 0.045, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
        geo.translate(0.04, 0, -0.022);
        const board = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
        board.position.y = y;
        board.scale.x = dir;
        group.add(board);
      }
      return shadow(group);
    }

    case 'start': {
      // Control tower + a windsock-ish mast for the airport.
      const group = new THREE.Group();
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.36, 1.5, 14),
        new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
      );
      tower.position.y = 0.75;
      const cab = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.38, 0.4, 14),
        new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.2, metalness: 0.3 }),
      );
      cab.position.y = 1.65;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.44, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }));
      top.position.y = 1.88;
      group.add(tower, cab, top);
      return shadow(group);
    }

    case 'terminus': {
      // Departures: Nepal's flag, the only one in the world that isn't a rectangle.
      const flag = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 1.5, 10),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.35, metalness: 0.6 }),
      );
      post.position.y = 0.75;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe2b23a, roughness: 0.3, metalness: 0.8 }));
      knob.position.y = 1.52;
      const cloth = nepalFlag(0.82);
      cloth.position.set(0.04, 0.6, 0);
      cloth.rotation.y = Math.PI;
      flag.add(post, knob, cloth);
      return shadow(flag);
    }

    default:
      return null;
  }
}

/** World x of the board's east edge grows by this much, for the Maane Chowk panel. */
export const EAST_PANEL = 9;

/**
 * Card slots in the Maane Chowk panel, in photo pixels: two columns of five.
 * Shared with the scenery, which stands the decks on them.
 */
export const DECK_SLOTS: [number, number][] = [0, 1, 2, 3, 4].flatMap((r) => [
  [1130, 900 + r * 40] as [number, number],
  [1194, 900 + r * 40] as [number, number],
]);

/** The board's footprint (top surface, inside the wooden frame). */
export function boardBox(board: Board): THREE.Box3 {
  const box = new THREE.Box3();
  for (const node of Object.values(board.nodes)) box.expandByPoint(nodeVec(node));
  box.expandByScalar(4.6);
  // A little extra on the near edge for the printed title.
  box.min.z -= 2.2;
  // Room on the east (screen-right, world −x) for the Maane Chowk.
  box.min.x -= EAST_PANEL;
  return box;
}

export function buildBoard(board: Board): BoardView {
  const group = new THREE.Group();
  const nodes = Object.values(board.nodes);

  // --- base slab, sized to the node cloud ---
  const box = boardBox(board);

  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  const card = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: boardFace(size.x, size.z, box) });
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
      color: new THREE.Color(TILE_COLOR[node.kind]).multiplyScalar(0.78),
      roughness: 0.6,
    });
    const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.55 });

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
      bake(marker);
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
