/**
 * Card illustrations, painted in code: one picture per card in the decks,
 * in a flat travel-poster style that matches the board — layered ranges,
 * gold-roofed temples, jungle, lakes, festivals and souvenirs.
 *
 * Each card id has a recipe below; anything without one falls back to a
 * scene for its section and category. A card can also carry its own artwork
 * via an `image` URL in the deck JSON, which takes precedence.
 *
 * Pure canvas 2D, cached as data URLs — no network, no image files.
 */

import type { Card, DeckId } from '../engine/types.ts';

export const ART_W = 480;
export const ART_H = 340;

type G = CanvasRenderingContext2D;
type Rnd = () => number;
type Mood = 'day' | 'sunrise' | 'dusk' | 'night' | 'mist' | 'warm' | 'jungle';

const cache = new Map<string, string>();

/** The picture for a card, as a URL usable in an <img>. */
export function cardArt(card: Card): string {
  const custom = (card as Card & { image?: string }).image;
  if (custom) return custom;
  let url = cache.get(card.id);
  if (!url) {
    url = paint(card);
    cache.set(card.id, url);
  }
  return url;
}

function paint(card: Card): string {
  const canvas = document.createElement('canvas');
  canvas.width = ART_W;
  canvas.height = ART_H;
  const g = canvas.getContext('2d')!;
  const rnd = seeded(hash(card.id));
  const recipe = RECIPES[card.id] ?? fallback(card);
  recipe(g, rnd);
  finish(g, rnd);
  return canvas.toDataURL('image/jpeg', 0.9);
}

// --- tiny utilities ------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(seed: number): Rnd {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function poly(g: G, pts: number[], fill: string | CanvasGradient): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function rect(g: G, x: number, y: number, w: number, h: number, fill: string | CanvasGradient): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}

function circle(g: G, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function ellipse(g: G, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function vgrad(g: G, y0: number, y1: number, stops: string[]): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(i / Math.max(stops.length - 1, 1), c));
  return gr;
}

function line(g: G, pts: number[], stroke: string, width: number): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

// --- backdrops -------------------------------------------------------------------

const SKIES: Record<Mood, string[]> = {
  day: ['#6fb6e4', '#a9d6f0', '#eef6f6'],
  sunrise: ['#4a5aa8', '#e98b6d', '#fbd59a'],
  dusk: ['#2f2f6b', '#b65f7a', '#f2b07c'],
  night: ['#0b1531', '#1f2e5e', '#3a4d80'],
  mist: ['#bcd0dc', '#dfe7e8', '#f4efe3'],
  warm: ['#5a2414', '#8e3f22', '#c27a3e'],
  jungle: ['#9fcfd9', '#cfe7d6', '#eef3dc'],
};

function sky(g: G, mood: Mood, rnd: Rnd, horizon = ART_H): void {
  rect(g, 0, 0, ART_W, ART_H, vgrad(g, 0, horizon, SKIES[mood]));
  if (mood === 'night') {
    for (let i = 0; i < 70; i++) circle(g, rnd() * ART_W, rnd() * horizon * 0.8, rnd() * 1.4 + 0.3, `rgba(255,255,240,${0.4 + rnd() * 0.6})`);
  }
  if (mood === 'day' || mood === 'mist' || mood === 'jungle') clouds(g, rnd, 3);
}

function sun(g: G, x: number, y: number, r: number, color = '#fff2c4'): void {
  const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
  gr.addColorStop(0, 'rgba(255,240,200,0.75)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  circle(g, x, y, r * 3.2, gr);
  circle(g, x, y, r, color);
}

function moon(g: G, x: number, y: number, r: number): void {
  circle(g, x, y, r * 2.4, 'rgba(255,250,220,0.08)');
  circle(g, x, y, r, '#f6f0d6');
}

function clouds(g: G, rnd: Rnd, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * ART_W;
    const y = 30 + rnd() * 70;
    const s = 0.6 + rnd() * 0.7;
    g.globalAlpha = 0.75;
    for (let k = 0; k < 4; k++) ellipse(g, x + (k - 1.5) * 22 * s, y + (k % 2) * -6 * s, 26 * s, 14 * s, '#ffffff');
    g.globalAlpha = 1;
  }
}

/** A mountain range: jagged peaks with snowcaps. */
function range(g: G, rnd: Rnd, baseY: number, peaks: [number, number][], rock: string, snow = true, snowLine = 0.45): void {
  for (const [x, h] of peaks) {
    const w = h * (0.9 + rnd() * 0.5);
    const top = baseY - h;
    const lx = x - w;
    const rx = x + w * (0.85 + rnd() * 0.3);
    // Two-tone rock: lit left face, shaded right face.
    poly(g, [lx, baseY, x, top, x + w * 0.08, baseY], rock);
    poly(g, [x, top, rx, baseY, x + w * 0.08, baseY], shade(rock, -0.18));
    if (snow) {
      const sy = top + h * snowLine;
      const pts = [x, top];
      const left = x - (x - lx) * snowLine;
      const right = x + (rx - x) * snowLine;
      pts.push(right, sy);
      const steps = 5;
      for (let i = steps; i >= 0; i--) {
        const px = left + ((right - left) * i) / steps;
        pts.push(px, sy - (i % 2 ? h * 0.08 : -h * 0.04) * (0.6 + rnd() * 0.6));
      }
      pts.push(left, sy);
      poly(g, pts, '#f8fbff');
      poly(g, [x, top, right, sy, x + (right - x) * 0.4, sy + h * 0.03], 'rgba(150,170,200,0.45)');
    }
  }
}

/** A soft rolling silhouette from y down to the bottom. */
function hills(g: G, rnd: Rnd, y: number, amp: number, color: string | CanvasGradient, freq = 1): void {
  const ph = rnd() * 10;
  g.beginPath();
  g.moveTo(0, ART_H);
  for (let x = 0; x <= ART_W; x += 8) {
    const t = (x / ART_W) * Math.PI * 2 * freq;
    g.lineTo(x, y - (Math.sin(t + ph) * 0.6 + Math.sin(t * 2.3 + ph * 2) * 0.4) * amp);
  }
  g.lineTo(ART_W, ART_H);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function ground(g: G, y: number, top: string, bottom: string): void {
  rect(g, 0, y, ART_W, ART_H - y, vgrad(g, y, ART_H, [top, bottom]));
}

function water(g: G, rnd: Rnd, y: number, h: number, top = '#5fb3d0', bottom = '#2c7aa0'): void {
  rect(g, 0, y, ART_W, h, vgrad(g, y, y + h, [top, bottom]));
  g.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const yy = y + 6 + rnd() * (h - 10);
    const xx = rnd() * ART_W;
    line(g, [xx, yy, xx + 14 + rnd() * 30, yy], '#e6f6fb', 1.6);
  }
  g.globalAlpha = 1;
}

/** A row of broadleaf canopies. */
function forest(g: G, rnd: Rnd, baseY: number, n: number, color = '#2f7a3e', size = 22): void {
  for (let i = 0; i < n; i++) {
    const x = (i / n) * ART_W + rnd() * (ART_W / n);
    const r = size * (0.7 + rnd() * 0.6);
    rect(g, x - 2, baseY - r * 0.6, 4, r * 0.8, '#5b3b24');
    circle(g, x, baseY - r * 1.1, r, shade(color, (rnd() - 0.5) * 0.2));
    circle(g, x - r * 0.5, baseY - r * 0.75, r * 0.7, shade(color, -0.1));
    circle(g, x + r * 0.45, baseY - r * 0.8, r * 0.65, shade(color, 0.08));
  }
}

function pines(g: G, rnd: Rnd, baseY: number, n: number, color = '#2f5d3a', size = 26): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * ART_W;
    const h = size * (0.7 + rnd() * 0.7);
    const y = baseY + rnd() * 10;
    poly(g, [x - h * 0.3, y, x, y - h, x + h * 0.3, y], shade(color, (rnd() - 0.5) * 0.25));
  }
}

function grass(g: G, rnd: Rnd, y0: number, y1: number, n: number, color = '#5f9a3e'): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * ART_W;
    const y = y0 + rnd() * (y1 - y0);
    const h = 6 + rnd() * 14;
    line(g, [x, y, x - 3, y - h], color, 1.6);
    line(g, [x, y, x + 3, y - h * 0.8], shade(color, 0.1), 1.6);
  }
}

function birds(g: G, rnd: Rnd, n: number, x0 = 0, y0 = 30, w = ART_W, h = 80, color = '#2c2a2e'): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w;
    const y = y0 + rnd() * h;
    const s = 4 + rnd() * 5;
    g.beginPath();
    g.moveTo(x - s, y - s * 0.4);
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.4);
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.stroke();
  }
}

/** Lungta prayer flags along a sagging string. */
const LUNGTA = ['#2b5fb8', '#f6f4ee', '#d23a2e', '#2f9a4a', '#f2c230'];
function flags(g: G, x1: number, y1: number, x2: number, y2: number, n = 12, sag = 18, size = 14): void {
  const pt = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * sag];
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const [x, y] = pt(i / 20);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = 'rgba(80,60,40,0.8)';
  g.lineWidth = 1.2;
  g.stroke();
  for (let i = 0; i < n; i++) {
    const [x, y] = pt((i + 0.5) / n);
    poly(g, [x - size * 0.4, y, x + size * 0.4, y, x + size * 0.45, y + size, x - size * 0.35, y + size * 0.95], LUNGTA[i % 5]);
  }
}

/** Darken (negative) or lighten (positive) a hex colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255);
  const gg = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0')}`;
}

// --- architecture --------------------------------------------------------------------

function stupa(g: G, x: number, y: number, s: number, white = '#fbf8f1', eyes = true): void {
  // Stepped plinth.
  for (let i = 0; i < 3; i++) rect(g, x - (110 - i * 16) * s, y - (i + 1) * 9 * s, (220 - i * 32) * s, 9 * s, shade('#efe8d6', -i * 0.04));
  const dy = y - 27 * s;
  g.beginPath();
  g.ellipse(x, dy, 70 * s, 52 * s, 0, Math.PI, 0);
  g.fillStyle = white;
  g.fill();
  g.beginPath();
  g.ellipse(x + 18 * s, dy, 52 * s, 50 * s, 0, Math.PI * 1.5, 0);
  g.fillStyle = 'rgba(160,150,130,0.18)';
  g.fill();
  // Harmika with the eyes.
  const hy = dy - 52 * s;
  rect(g, x - 22 * s, hy - 28 * s, 44 * s, 28 * s, '#e8c255');
  if (eyes) {
    for (const ex of [-10, 10]) {
      ellipse(g, x + ex * s, hy - 15 * s, 6.5 * s, 3 * s, '#ffffff');
      circle(g, x + ex * s, hy - 15 * s, 2.2 * s, '#1e2a55');
      line(g, [x + (ex - 7) * s, hy - 20 * s, x + ex * s, hy - 22 * s, x + (ex + 7) * s, hy - 20 * s], '#1e2a55', 1.4 * s);
    }
    line(g, [x - 1 * s, hy - 10 * s, x + 2 * s, hy - 7 * s, x - 1 * s, hy - 4 * s], '#1e2a55', 1.4 * s);
  }
  // Thirteen-step spire.
  for (let i = 0; i < 9; i++) {
    const w = (19 - i * 1.6) * s;
    rect(g, x - w, hy - 28 * s - (i + 1) * 7 * s, w * 2, 6 * s, i % 2 ? '#d9a327' : '#e8b53c');
  }
  const ty = hy - 28 * s - 63 * s;
  poly(g, [x - 16 * s, ty, x + 16 * s, ty, x, ty - 12 * s], '#d9a327');
  line(g, [x, ty - 12 * s, x, ty - 26 * s], '#d9a327', 3 * s);
  circle(g, x, ty - 27 * s, 3.5 * s, '#f0cd62');
}

function pagodaRoof(g: G, x: number, y: number, w: number, h: number, color: string): void {
  g.beginPath();
  g.moveTo(x - w, y + h * 0.15);
  g.quadraticCurveTo(x - w * 0.55, y + h * 0.05, x - w * 0.3, y - h);
  g.lineTo(x + w * 0.3, y - h);
  g.quadraticCurveTo(x + w * 0.55, y + h * 0.05, x + w, y + h * 0.15);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  rect(g, x - w * 0.85, y, w * 1.7, 3, '#e8b53c');
}

function pagoda(g: G, x: number, y: number, s: number, tiers = 3, roof = '#4a3a30', wall = '#7a2e1f'): void {
  for (let i = 0; i < 4; i++) rect(g, x - (80 - i * 12) * s, y - (i + 1) * 10 * s, (160 - i * 24) * s, 10 * s, i % 2 ? '#c0754a' : '#a95a37');
  let by = y - 40 * s;
  for (let i = 0; i < tiers; i++) {
    const w = (44 - i * 9) * s;
    const h = (34 - i * 3) * s;
    rect(g, x - w, by - h, w * 2, h, wall);
    for (let k = -2; k <= 2; k++) rect(g, x + k * w * 0.36 - 3 * s, by - h * 0.75, 6 * s, h * 0.5, '#3a1d14');
    pagodaRoof(g, x, by - h, w * 1.75, 18 * s, roof);
    by -= h + 18 * s;
  }
  poly(g, [x - 7 * s, by, x + 7 * s, by, x, by - 28 * s], '#e2b23a');
  circle(g, x, by - 2 * s, 5 * s, '#e2b23a');
}

function shikhara(g: G, x: number, y: number, s: number, stone = '#c9b28c'): void {
  rect(g, x - 60 * s, y - 24 * s, 120 * s, 24 * s, shade(stone, -0.1));
  rect(g, x - 46 * s, y - 56 * s, 92 * s, 32 * s, stone);
  for (let k = -3; k <= 3; k++) rect(g, x + k * 12 * s - 3 * s, y - 52 * s, 6 * s, 24 * s, shade(stone, -0.35));
  g.beginPath();
  g.moveTo(x - 32 * s, y - 56 * s);
  g.quadraticCurveTo(x - 26 * s, y - 130 * s, x, y - 160 * s);
  g.quadraticCurveTo(x + 26 * s, y - 130 * s, x + 32 * s, y - 56 * s);
  g.fillStyle = stone;
  g.fill();
  for (const dx of [-44, 44]) poly(g, [x + dx * s - 9 * s, y - 56 * s, x + dx * s, y - 92 * s, x + dx * s + 9 * s, y - 56 * s], shade(stone, -0.06));
  circle(g, x, y - 164 * s, 6 * s, '#e2b23a');
}

function house(g: G, x: number, y: number, s: number, wall = '#f1ece0', roof = '#5a5550', band = '#a8442e'): void {
  rect(g, x - 30 * s, y - 34 * s, 60 * s, 34 * s, wall);
  rect(g, x - 30 * s, y - 12 * s, 60 * s, 12 * s, band);
  poly(g, [x - 38 * s, y - 34 * s, x, y - 58 * s, x + 38 * s, y - 34 * s], roof);
  rect(g, x - 18 * s, y - 28 * s, 10 * s, 10 * s, '#4a2a1a');
  rect(g, x + 8 * s, y - 28 * s, 10 * s, 10 * s, '#4a2a1a');
}

function palace(g: G, x: number, y: number, s: number, wall = '#f4efe2'): void {
  rect(g, x - 110 * s, y - 60 * s, 220 * s, 60 * s, wall);
  rect(g, x - 40 * s, y - 100 * s, 80 * s, 40 * s, wall);
  for (let k = -4; k <= 4; k++) {
    g.beginPath();
    g.arc(x + k * 24 * s, y - 30 * s, 8 * s, Math.PI, 0);
    g.lineTo(x + k * 24 * s + 8 * s, y - 14 * s);
    g.lineTo(x + k * 24 * s - 8 * s, y - 14 * s);
    g.fillStyle = '#9fb7c8';
    g.fill();
  }
  rect(g, x - 116 * s, y - 64 * s, 232 * s, 6 * s, '#d9cfb8');
  poly(g, [x - 46 * s, y - 100 * s, x, y - 124 * s, x + 46 * s, y - 100 * s], '#c8a24c');
}

function whiteTemple(g: G, x: number, y: number, s: number): void {
  rect(g, x - 90 * s, y - 50 * s, 180 * s, 50 * s, '#f7f5ef');
  rect(g, x - 90 * s, y - 50 * s, 180 * s, 6 * s, '#e6e0d0');
  rect(g, x - 45 * s, y - 90 * s, 90 * s, 40 * s, '#f7f5ef');
  poly(g, [x - 16 * s, y - 90 * s, x + 16 * s, y - 90 * s, x, y - 118 * s], '#e2b23a');
  rect(g, x - 14 * s, y - 34 * s, 28 * s, 34 * s, '#8e3f2a');
}

function pillar(g: G, x: number, y: number, s: number): void {
  rect(g, x - 9 * s, y - 150 * s, 18 * s, 150 * s, vgradX(g, x - 9 * s, x + 9 * s, ['#e0caa0', '#b39a6a']));
  rect(g, x - 14 * s, y - 158 * s, 28 * s, 10 * s, '#a88f60');
  g.strokeStyle = '#7a6a50';
  g.lineWidth = 3 * s;
  g.strokeRect(x - 34 * s, y - 26 * s, 68 * s, 26 * s);
  for (let k = -3; k <= 3; k++) line(g, [x + k * 10 * s, y - 26 * s, x + k * 10 * s, y], '#7a6a50', 2 * s);
}

function vgradX(g: G, x0: number, x1: number, stops: string[]): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((c, i) => gr.addColorStop(i / Math.max(stops.length - 1, 1), c));
  return gr;
}

// --- people & animals -------------------------------------------------------------------

function person(g: G, x: number, y: number, s: number, body: string, opts: { arms?: 'up' | 'out' | 'down'; hat?: string; skirt?: boolean; stick?: boolean } = {}): void {
  const skin = '#c98f63';
  line(g, [x - 5 * s, y, x - 4 * s, y - 26 * s], '#3b3f4a', 6 * s);
  line(g, [x + 5 * s, y, x + 4 * s, y - 26 * s], '#3b3f4a', 6 * s);
  if (opts.skirt) poly(g, [x - 16 * s, y - 4 * s, x + 16 * s, y - 4 * s, x + 9 * s, y - 32 * s, x - 9 * s, y - 32 * s], body);
  g.beginPath();
  g.roundRect(x - 11 * s, y - 60 * s, 22 * s, 34 * s, 8 * s);
  g.fillStyle = body;
  g.fill();
  const arm = opts.arms ?? 'down';
  const ay = y - 54 * s;
  const ends: Record<string, number[]> = {
    up: [x - 22 * s, ay - 22 * s, x + 22 * s, ay - 22 * s],
    out: [x - 28 * s, ay + 2 * s, x + 28 * s, ay + 2 * s],
    down: [x - 14 * s, ay + 26 * s, x + 14 * s, ay + 26 * s],
  };
  const e = ends[arm];
  line(g, [x - 9 * s, ay, e[0], e[1]], body, 6 * s);
  line(g, [x + 9 * s, ay, e[2], e[3]], body, 6 * s);
  if (opts.stick) line(g, [e[2] - 6 * s, e[3] + 12 * s, e[2] + 10 * s, e[3] - 22 * s], '#7a5a34', 3 * s);
  circle(g, x, y - 70 * s, 10 * s, skin);
  if (opts.hat) poly(g, [x - 11 * s, y - 74 * s, x + 11 * s, y - 74 * s, x + 8 * s, y - 86 * s, x - 6 * s, y - 84 * s], opts.hat);
}

function sitter(g: G, x: number, y: number, s: number, robe = '#b8452b'): void {
  ellipse(g, x, y - 8 * s, 34 * s, 12 * s, robe);
  poly(g, [x - 22 * s, y - 8 * s, x + 22 * s, y - 8 * s, x + 14 * s, y - 52 * s, x - 14 * s, y - 52 * s], robe);
  circle(g, x, y - 62 * s, 11 * s, '#c98f63');
  ellipse(g, x, y - 20 * s, 10 * s, 5 * s, '#c98f63');
}

function rhino(g: G, x: number, y: number, s: number): void {
  const c = '#8c8f93';
  ellipse(g, x, y - 40 * s, 62 * s, 32 * s, c);
  ellipse(g, x + 6 * s, y - 50 * s, 40 * s, 18 * s, shade(c, 0.1));
  for (const lx of [-40, -18, 22, 42]) rect(g, x + lx * s - 8 * s, y - 24 * s, 16 * s, 24 * s, shade(c, -0.12));
  poly(g, [x + 50 * s, y - 58 * s, x + 96 * s, y - 40 * s, x + 92 * s, y - 20 * s, x + 50 * s, y - 24 * s], c);
  poly(g, [x + 84 * s, y - 42 * s, x + 96 * s, y - 70 * s, x + 94 * s, y - 40 * s], '#d8d2c4');
  poly(g, [x + 56 * s, y - 56 * s, x + 60 * s, y - 70 * s, x + 66 * s, y - 56 * s], c);
  circle(g, x + 72 * s, y - 44 * s, 2.4 * s, '#222');
  line(g, [x - 30 * s, y - 64 * s, x - 10 * s, y - 70 * s, x + 20 * s, y - 64 * s], shade(c, -0.15), 2 * s);
}

function tiger(g: G, x: number, y: number, s: number): void {
  const c = '#e08a2c';
  ellipse(g, x, y - 34 * s, 60 * s, 22 * s, c);
  for (const lx of [-40, -22, 26, 44]) rect(g, x + lx * s - 6 * s, y - 20 * s, 12 * s, 20 * s, c);
  circle(g, x + 64 * s, y - 42 * s, 20 * s, c);
  ellipse(g, x + 76 * s, y - 34 * s, 10 * s, 7 * s, '#f6e6c8');
  for (const ex of [52, 74]) circle(g, x + ex * s, y - 60 * s, 6 * s, c);
  circle(g, x + 70 * s, y - 46 * s, 2.4 * s, '#222');
  g.beginPath();
  g.moveTo(x - 58 * s, y - 38 * s);
  g.quadraticCurveTo(x - 90 * s, y - 40 * s, x - 86 * s, y - 70 * s);
  g.strokeStyle = c;
  g.lineWidth = 7 * s;
  g.stroke();
  for (let k = -4; k <= 4; k++) line(g, [x + k * 12 * s, y - 54 * s, x + k * 12 * s + 4 * s, y - 34 * s], '#2a1a10', 3.5 * s);
  line(g, [x + 58 * s, y - 56 * s, x + 62 * s, y - 50 * s], '#2a1a10', 2.5 * s);
}

function gharial(g: G, x: number, y: number, s: number): void {
  const c = '#5f6b3a';
  ellipse(g, x, y, 70 * s, 12 * s, c);
  poly(g, [x + 60 * s, y - 4 * s, x + 140 * s, y, x + 140 * s, y + 4 * s, x + 60 * s, y + 6 * s], c);
  circle(g, x + 140 * s, y + 1 * s, 6 * s, shade(c, -0.1));
  poly(g, [x - 66 * s, y, x - 150 * s, y + 6 * s, x - 66 * s, y + 8 * s], c);
  for (let k = -5; k <= 5; k++) poly(g, [x + k * 12 * s - 4 * s, y - 9 * s, x + k * 12 * s, y - 16 * s, x + k * 12 * s + 4 * s, y - 9 * s], shade(c, -0.2));
  circle(g, x + 62 * s, y - 8 * s, 3 * s, '#e8d27a');
}

function elephant(g: G, x: number, y: number, s: number, saddle = true): void {
  const c = '#7d7b7a';
  ellipse(g, x, y - 66 * s, 64 * s, 44 * s, c);
  for (const lx of [-40, -16, 22, 44]) rect(g, x + lx * s - 10 * s, y - 34 * s, 20 * s, 34 * s, shade(c, -0.1));
  circle(g, x + 60 * s, y - 80 * s, 30 * s, c);
  ellipse(g, x + 44 * s, y - 78 * s, 20 * s, 26 * s, shade(c, -0.12));
  g.beginPath();
  g.moveTo(x + 84 * s, y - 72 * s);
  g.quadraticCurveTo(x + 98 * s, y - 30 * s, x + 86 * s, y - 8 * s);
  g.strokeStyle = c;
  g.lineWidth = 12 * s;
  g.stroke();
  circle(g, x + 70 * s, y - 88 * s, 2.6 * s, '#222');
  if (saddle) {
    rect(g, x - 34 * s, y - 112 * s, 60 * s, 12 * s, '#b2283a');
    rect(g, x - 34 * s, y - 102 * s, 60 * s, 4 * s, '#e2b23a');
  }
}

function deer(g: G, x: number, y: number, s: number, c = '#b07a44'): void {
  ellipse(g, x, y - 40 * s, 34 * s, 14 * s, c);
  for (const lx of [-24, -14, 16, 26]) line(g, [x + lx * s, y - 32 * s, x + lx * s, y], c, 4 * s);
  line(g, [x + 26 * s, y - 46 * s, x + 38 * s, y - 70 * s], c, 7 * s);
  ellipse(g, x + 44 * s, y - 72 * s, 10 * s, 6 * s, c);
  line(g, [x + 38 * s, y - 76 * s, x + 32 * s, y - 100 * s, x + 26 * s, y - 106 * s], '#6b4a2a', 2.5 * s);
  line(g, [x + 42 * s, y - 78 * s, x + 46 * s, y - 102 * s, x + 54 * s, y - 108 * s], '#6b4a2a', 2.5 * s);
}

// --- transport ---------------------------------------------------------------------

function boat(g: G, x: number, y: number, s: number, color = '#c8402e'): void {
  g.beginPath();
  g.moveTo(x - 60 * s, y - 12 * s);
  g.quadraticCurveTo(x, y + 14 * s, x + 60 * s, y - 12 * s);
  g.lineTo(x + 50 * s, y - 2 * s);
  g.quadraticCurveTo(x, y + 18 * s, x - 50 * s, y - 2 * s);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  line(g, [x - 60 * s, y - 12 * s, x + 60 * s, y - 12 * s], shade(color, 0.3), 3 * s);
}

function jeep(g: G, x: number, y: number, s: number): void {
  rect(g, x - 70 * s, y - 50 * s, 140 * s, 34 * s, '#4f6b3a');
  rect(g, x - 40 * s, y - 80 * s, 70 * s, 30 * s, '#5d7a46');
  rect(g, x - 34 * s, y - 76 * s, 26 * s, 20 * s, '#a9d6f0');
  rect(g, x - 2 * s, y - 76 * s, 26 * s, 20 * s, '#a9d6f0');
  for (const wx of [-42, 42]) {
    circle(g, x + wx * s, y - 14 * s, 17 * s, '#222');
    circle(g, x + wx * s, y - 14 * s, 7 * s, '#888');
  }
  rect(g, x + 64 * s, y - 46 * s, 8 * s, 14 * s, '#f2c230');
}

function bike(g: G, x: number, y: number, s: number, color = '#c8342f'): void {
  for (const wx of [-36, 36]) {
    g.beginPath();
    g.arc(x + wx * s, y - 24 * s, 22 * s, 0, Math.PI * 2);
    g.strokeStyle = '#222';
    g.lineWidth = 4 * s;
    g.stroke();
  }
  line(g, [x - 36 * s, y - 24 * s, x - 6 * s, y - 24 * s, x + 18 * s, y - 56 * s, x - 14 * s, y - 56 * s, x - 36 * s, y - 24 * s], color, 5 * s);
  line(g, [x - 6 * s, y - 24 * s, x - 14 * s, y - 60 * s], color, 5 * s);
  line(g, [x + 18 * s, y - 56 * s, x + 36 * s, y - 24 * s], color, 5 * s);
  line(g, [x + 14 * s, y - 64 * s, x + 26 * s, y - 64 * s], '#222', 4 * s);
  line(g, [x - 22 * s, y - 62 * s, x - 8 * s, y - 62 * s], '#222', 5 * s);
}

function helicopter(g: G, x: number, y: number, s: number): void {
  ellipse(g, x, y, 46 * s, 24 * s, '#c8342f');
  ellipse(g, x + 18 * s, y - 4 * s, 20 * s, 14 * s, '#a9d6f0');
  rect(g, x - 110 * s, y - 6 * s, 70 * s, 8 * s, '#c8342f');
  poly(g, [x - 112 * s, y - 2 * s, x - 120 * s, y - 24 * s, x - 102 * s, y - 2 * s], '#c8342f');
  line(g, [x - 90 * s, y - 34 * s, x + 90 * s, y - 34 * s], '#333', 3 * s);
  line(g, [x, y - 24 * s, x, y - 34 * s], '#333', 4 * s);
  line(g, [x - 30 * s, y + 30 * s, x + 30 * s, y + 30 * s], '#333', 3 * s);
}

function glider(g: G, x: number, y: number, s: number, c1 = '#e8452c', c2 = '#f2c230'): void {
  g.beginPath();
  g.ellipse(x, y, 70 * s, 22 * s, 0, Math.PI, 0);
  g.fillStyle = c1;
  g.fill();
  g.beginPath();
  g.ellipse(x, y, 70 * s, 22 * s, 0, Math.PI * 1.35, Math.PI * 1.65);
  g.lineTo(x, y);
  g.fillStyle = c2;
  g.fill();
  for (const dx of [-60, -25, 25, 60]) line(g, [x + dx * s, y, x, y + 60 * s], 'rgba(40,40,40,0.6)', 1);
  person(g, x, y + 90 * s, 0.38 * s * 2, '#333344', { arms: 'out' });
}

function plane(g: G, x: number, y: number, s: number): void {
  ellipse(g, x, y, 90 * s, 14 * s, '#f6f6f6');
  poly(g, [x - 10 * s, y, x + 30 * s, y, x - 30 * s, y + 60 * s, x - 50 * s, y + 60 * s], '#e4e4e4');
  poly(g, [x - 10 * s, y, x + 30 * s, y, x - 30 * s, y - 50 * s, x - 46 * s, y - 50 * s], '#ececec');
  poly(g, [x - 76 * s, y, x - 92 * s, y - 40 * s, x - 76 * s, y - 40 * s, x - 60 * s, y], '#c8102e');
  for (let k = -4; k <= 5; k++) circle(g, x + k * 12 * s, y - 3 * s, 2.5 * s, '#3a6aa8');
}

function raft(g: G, x: number, y: number, s: number): void {
  ellipse(g, x, y, 70 * s, 16 * s, '#e8452c');
  ellipse(g, x, y - 4 * s, 56 * s, 9 * s, '#c8342f');
  for (const dx of [-36, -12, 12, 36]) {
    circle(g, x + dx * s, y - 22 * s, 8 * s, '#f2c230');
    rect(g, x + dx * s - 8 * s, y - 16 * s, 16 * s, 14 * s, '#2b5fb8');
    line(g, [x + dx * s + 8 * s, y - 12 * s, x + dx * s + 20 * s, y + 14 * s], '#5b3b24', 3 * s);
  }
}

// --- objects ---------------------------------------------------------------------------

function cloth(g: G, rnd: Rnd, base: string): void {
  rect(g, 0, 0, ART_W, ART_H, base);
  g.globalAlpha = 0.08;
  for (let y = 0; y < ART_H; y += 6) line(g, [0, y + rnd() * 2, ART_W, y + rnd() * 2], '#000', 1);
  g.globalAlpha = 1;
}

function table(g: G, rnd: Rnd, y: number, wood = '#8a5a34'): void {
  rect(g, 0, y, ART_W, ART_H - y, vgrad(g, y, ART_H, [shade(wood, 0.1), shade(wood, -0.25)]));
  g.globalAlpha = 0.15;
  for (let i = 0; i < 12; i++) {
    const yy = y + rnd() * (ART_H - y);
    line(g, [0, yy, ART_W, yy + rnd() * 6 - 3], '#2a160a', 1.5);
  }
  g.globalAlpha = 1;
}

function plate(g: G, x: number, y: number, r: number, metal = true): void {
  ellipse(g, x, y + 6, r * 1.05, r * 0.36, 'rgba(0,0,0,0.25)');
  ellipse(g, x, y, r, r * 0.34, metal ? '#d8d0bc' : '#f4efe4');
  ellipse(g, x, y - 2, r * 0.82, r * 0.26, metal ? '#c4b99e' : '#e9e1d0');
}

function bowl(g: G, x: number, y: number, r: number, fill: string): void {
  g.beginPath();
  g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI);
  g.fillStyle = '#c8a24c';
  g.fill();
  ellipse(g, x, y, r, r * 0.3, fill);
}

function momo(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - 18 * s, y);
  g.quadraticCurveTo(x - 20 * s, y - 22 * s, x, y - 26 * s);
  g.quadraticCurveTo(x + 20 * s, y - 22 * s, x + 18 * s, y);
  g.closePath();
  g.fillStyle = '#f6efe0';
  g.fill();
  for (const dx of [-8, 0, 8]) line(g, [x + dx * s, y - 24 * s, x + dx * 0.6 * s, y - 12 * s], '#d8ccb4', 1.5 * s);
}

function khukuri(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - 120 * s, y - 10 * s);
  g.quadraticCurveTo(x - 10 * s, y - 40 * s, x + 70 * s, y + 20 * s);
  g.quadraticCurveTo(x + 20 * s, y + 6 * s, x - 120 * s, y + 4 * s);
  g.closePath();
  g.fillStyle = vgrad(g, y - 40 * s, y + 20 * s, ['#f2f4f6', '#9aa3ab']);
  g.fill();
  poly(g, [x - 112 * s, y - 2 * s, x - 104 * s, y + 6 * s, x - 108 * s, y + 10 * s], '#6b7178');
  g.beginPath();
  g.roundRect(x - 190 * s, y - 12 * s, 76 * s, 22 * s, 8 * s);
  g.fillStyle = '#5b3420';
  g.fill();
  rect(g, x - 120 * s, y - 14 * s, 8 * s, 26 * s, '#d9a84a');
  rect(g, x - 186 * s, y - 12 * s, 6 * s, 22 * s, '#d9a84a');
}

function mandala(g: G, x: number, y: number, r: number): void {
  const cols = ['#8e2f3f', '#d9a327', '#1f3b6e', '#2f9a4a', '#f4ead2'];
  for (let ring = 5; ring > 0; ring--) {
    const rr = (r * ring) / 5;
    const petals = 6 + ring * 3;
    g.beginPath();
    for (let i = 0; i <= petals * 2; i++) {
      const a = (i / (petals * 2)) * Math.PI * 2;
      const k = i % 2 === 0 ? 1 : 0.8;
      g.lineTo(x + Math.cos(a) * rr * k, y + Math.sin(a) * rr * k);
    }
    g.fillStyle = cols[ring % cols.length];
    g.fill();
  }
  circle(g, x, y, r * 0.12, '#f0cd62');
}

function karuwa(g: G, x: number, y: number, s: number): void {
  const brass = vgradX(g, x - 50 * s, x + 50 * s, ['#8a5a1c', '#f2cf6a', '#b07a2a']);
  g.beginPath();
  g.moveTo(x - 30 * s, y);
  g.bezierCurveTo(x - 70 * s, y - 40 * s, x - 60 * s, y - 100 * s, x - 18 * s, y - 110 * s);
  g.lineTo(x + 18 * s, y - 110 * s);
  g.bezierCurveTo(x + 60 * s, y - 100 * s, x + 70 * s, y - 40 * s, x + 30 * s, y);
  g.closePath();
  g.fillStyle = brass;
  g.fill();
  rect(g, x - 20 * s, y - 128 * s, 40 * s, 20 * s, brass);
  ellipse(g, x, y - 128 * s, 26 * s, 6 * s, '#f2cf6a');
  g.beginPath();
  g.moveTo(x + 46 * s, y - 64 * s);
  g.quadraticCurveTo(x + 90 * s, y - 80 * s, x + 96 * s, y - 112 * s);
  g.strokeStyle = '#c8962e';
  g.lineWidth = 8 * s;
  g.stroke();
  line(g, [x - 50 * s, y - 50 * s, x + 50 * s, y - 50 * s], 'rgba(90,50,10,0.35)', 2 * s);
}

function topi(g: G, x: number, y: number, s: number): void {
  const w = 80 * s;
  const h = 95 * s;
  g.save();
  g.beginPath();
  g.moveTo(x - w, y);
  g.lineTo(x - w * 0.86, y - h);
  g.quadraticCurveTo(x, y - h * 1.35, x + w * 0.9, y - h * 0.86);
  g.lineTo(x + w, y);
  g.closePath();
  g.clip();
  rect(g, x - w, y - h * 1.4, w * 2, h * 1.4, '#f4ead2');
  const cols = ['#c8342f', '#1f3b6e', '#2f9a4a', '#d9a327', '#111'];
  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < 10; j++) {
      const cx = x - w + i * 13 * s;
      const cy = y - j * 14 * s;
      poly(g, [cx, cy, cx + 6.5 * s, cy - 10 * s, cx + 13 * s, cy], cols[(i + j * 2) % cols.length]);
    }
  }
  g.restore();
  rect(g, x - w, y - 8 * s, w * 2, 8 * s, '#1a1a1a');
}

function shawl(g: G, x: number, y: number, s: number, c1: string, c2: string): void {
  g.beginPath();
  g.moveTo(x - 150 * s, y - 120 * s);
  g.quadraticCurveTo(x, y - 160 * s, x + 150 * s, y - 120 * s);
  g.quadraticCurveTo(x + 130 * s, y - 20 * s, x + 160 * s, y + 40 * s);
  g.lineTo(x - 160 * s, y + 40 * s);
  g.quadraticCurveTo(x - 130 * s, y - 20 * s, x - 150 * s, y - 120 * s);
  g.closePath();
  g.fillStyle = c1;
  g.fill();
  for (let k = -3; k <= 3; k++) {
    g.beginPath();
    g.moveTo(x + k * 40 * s, y - 140 * s);
    g.quadraticCurveTo(x + k * 44 * s + 10 * s, y - 50 * s, x + k * 46 * s, y + 40 * s);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 6 * s;
    g.stroke();
  }
  for (const yy of [y - 100 * s, y + 10 * s]) rect(g, x - 160 * s, yy, 320 * s, 12 * s, c2);
  for (let k = -15; k <= 15; k++) line(g, [x + k * 10 * s, y + 40 * s, x + k * 10 * s, y + 56 * s], c2, 2 * s);
}

function mask(g: G, x: number, y: number, s: number): void {
  ellipse(g, x, y, 70 * s, 92 * s, '#c8342f');
  ellipse(g, x, y + 4 * s, 58 * s, 78 * s, '#f2c230');
  for (const ex of [-24, 24]) {
    ellipse(g, x + ex * s, y - 18 * s, 15 * s, 10 * s, '#fff');
    circle(g, x + ex * s, y - 18 * s, 6 * s, '#111');
    line(g, [x + (ex - 18) * s, y - 38 * s, x + (ex + 16) * s, y - 32 * s], '#111', 5 * s);
  }
  poly(g, [x - 8 * s, y - 6 * s, x + 8 * s, y - 6 * s, x, y + 18 * s], '#d27a2a');
  g.beginPath();
  g.arc(x, y + 30 * s, 26 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokeStyle = '#8e1f1f';
  g.lineWidth = 7 * s;
  g.stroke();
  for (let k = -3; k <= 3; k++) poly(g, [x + k * 16 * s - 8 * s, y - 84 * s, x + k * 16 * s, y - 112 * s, x + k * 16 * s + 8 * s, y - 84 * s], k % 2 ? '#2f9a4a' : '#1f3b6e');
}

function beads(g: G, x: number, y: number, r: number): void {
  for (let i = 0; i < 54; i++) {
    const a = (i / 54) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.78;
    circle(g, px, py, 7, '#7a4a24');
    circle(g, px - 2, py - 2, 2.4, 'rgba(255,230,190,0.6)');
  }
  for (let i = 0; i < 5; i++) circle(g, x, y + r * 0.78 + 12 + i * 12, 7, '#7a4a24');
  poly(g, [x - 10, y + r * 0.78 + 70, x + 10, y + r * 0.78 + 70, x + 16, y + r * 0.78 + 110, x - 16, y + r * 0.78 + 110], '#c8342f');
}

function basket(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - 90 * s, y - 110 * s);
  g.lineTo(x + 90 * s, y - 110 * s);
  g.lineTo(x + 66 * s, y);
  g.lineTo(x - 66 * s, y);
  g.closePath();
  g.fillStyle = '#d9b46a';
  g.fill();
  for (let k = 0; k < 9; k++) {
    const yy = y - k * 12 * s;
    line(g, [x - (66 + k * 2.6) * s, yy, x + (66 + k * 2.6) * s, yy], k % 3 === 1 ? '#c8342f' : '#a9843f', 3 * s);
  }
  ellipse(g, x, y - 110 * s, 90 * s, 14 * s, '#b8914a');
  ellipse(g, x, y - 110 * s, 78 * s, 9 * s, '#6b4a24');
}

function teacup(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - 50 * s, y - 60 * s);
  g.quadraticCurveTo(x - 46 * s, y, x, y);
  g.quadraticCurveTo(x + 46 * s, y, x + 50 * s, y - 60 * s);
  g.closePath();
  g.fillStyle = '#f6f2ea';
  g.fill();
  ellipse(g, x, y - 60 * s, 50 * s, 12 * s, '#c87a2a');
  g.beginPath();
  g.arc(x + 54 * s, y - 34 * s, 14 * s, -1.2, 1.2);
  g.strokeStyle = '#f6f2ea';
  g.lineWidth = 7 * s;
  g.stroke();
  for (const dx of [-14, 6, 24]) {
    g.beginPath();
    g.moveTo(x + dx * s, y - 76 * s);
    g.bezierCurveTo(x + (dx - 12) * s, y - 96 * s, x + (dx + 12) * s, y - 108 * s, x + dx * s, y - 128 * s);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3 * s;
    g.stroke();
  }
}

function tealeaf(g: G, x: number, y: number, s: number, rot: number): void {
  ellipse(g, x, y, 22 * s, 9 * s, '#3e8d3a', rot);
  line(g, [x - Math.cos(rot) * 20 * s, y - Math.sin(rot) * 20 * s, x + Math.cos(rot) * 20 * s, y + Math.sin(rot) * 20 * s], '#2a6a2a', 1.4 * s);
}

function tongba(g: G, x: number, y: number, s: number): void {
  rect(g, x - 36 * s, y - 110 * s, 72 * s, 110 * s, vgradX(g, x - 36 * s, x + 36 * s, ['#6b3a1c', '#a8683a', '#6b3a1c']));
  for (const yy of [-100, -60, -20]) rect(g, x - 38 * s, y + yy * s, 76 * s, 8 * s, '#d9a84a');
  ellipse(g, x, y - 110 * s, 36 * s, 8 * s, '#e8dcc0');
  line(g, [x + 8 * s, y - 104 * s, x + 30 * s, y - 170 * s], '#c8a24c', 5 * s);
}

function fire(g: G, x: number, y: number, s: number): void {
  for (const [dx, h, c] of [[-14, 50, '#e8452c'], [10, 64, '#f28a3c'], [0, 40, '#f2c230']] as [number, number, string][]) {
    g.beginPath();
    g.moveTo(x + dx * s - 16 * s, y);
    g.quadraticCurveTo(x + dx * s - 10 * s, y - h * 0.6 * s, x + dx * s, y - h * s);
    g.quadraticCurveTo(x + dx * s + 10 * s, y - h * 0.6 * s, x + dx * s + 16 * s, y);
    g.closePath();
    g.fillStyle = c;
    g.fill();
  }
  for (const r of [-0.4, 0.4]) {
    g.save();
    g.translate(x, y + 4 * s);
    g.rotate(r);
    rect(g, -40 * s, -5 * s, 80 * s, 10 * s, '#5b3420');
    g.restore();
  }
}

function tent(g: G, x: number, y: number, s: number, c: string): void {
  poly(g, [x - 40 * s, y, x, y - 46 * s, x + 40 * s, y], c);
  poly(g, [x, y - 46 * s, x + 40 * s, y, x + 54 * s, y - 6 * s, x + 16 * s, y - 50 * s], shade(c, -0.2));
  poly(g, [x - 8 * s, y, x, y - 24 * s, x + 8 * s, y], 'rgba(0,0,0,0.4)');
}

function rhodo(g: G, rnd: Rnd, x: number, y: number, s: number): void {
  rect(g, x - 5 * s, y - 50 * s, 10 * s, 50 * s, '#5b3b24');
  circle(g, x, y - 80 * s, 46 * s, '#2d5a34');
  circle(g, x - 34 * s, y - 64 * s, 30 * s, '#285030');
  circle(g, x + 34 * s, y - 66 * s, 32 * s, '#336a3a');
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 52 * s;
    circle(g, x + Math.cos(a) * r, y - 76 * s + Math.sin(a) * r * 0.7, (5 + rnd() * 4) * s, rnd() > 0.3 ? '#d8283c' : '#f06a7a');
  }
}

function bigTree(g: G, x: number, y: number, s: number): void {
  rect(g, x - 12 * s, y - 90 * s, 24 * s, 90 * s, '#6b4a2f');
  for (const [dx, dy, r] of [[0, -150, 70], [-60, -120, 50], [60, -122, 52], [-30, -180, 50], [34, -182, 48]]) {
    circle(g, x + dx * s, y + dy * s, r * s, shade('#3f8a3a', (dx % 3) * 0.04));
  }
  for (let i = 0; i < 4; i++) line(g, [x - 30 * s + i * 20 * s, y - 70 * s, x - 36 * s + i * 22 * s, y], '#5b3b24', 2 * s);
}

function waterfall(g: G, rnd: Rnd, x: number, top: number, bottom: number, w: number): void {
  rect(g, x - w / 2, top, w, bottom - top, vgrad(g, top, bottom, ['#e6f6fb', '#8fd0e6']));
  g.globalAlpha = 0.6;
  for (let i = 0; i < 18; i++) {
    const xx = x - w / 2 + rnd() * w;
    line(g, [xx, top + rnd() * 20, xx, bottom - rnd() * 20], '#ffffff', 2);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 10; i++) circle(g, x + (rnd() - 0.5) * w * 1.6, bottom + rnd() * 10, 8 + rnd() * 10, 'rgba(255,255,255,0.7)');
}

function steps(g: G, x: number, y: number, n: number, w: number, color = '#d9cfb8'): void {
  for (let i = 0; i < n; i++) rect(g, x - w / 2 + i * 6, y - i * 8, w - i * 12, 8, shade(color, -i * 0.03));
}

function cave(g: G, rnd: Rnd): void {
  rect(g, 0, 0, ART_W, ART_H, '#3a2a20');
  g.beginPath();
  g.ellipse(ART_W / 2, ART_H * 0.62, 150, 120, 0, Math.PI, 0);
  g.lineTo(ART_W / 2 + 150, ART_H);
  g.lineTo(ART_W / 2 - 150, ART_H);
  g.fillStyle = vgrad(g, ART_H * 0.2, ART_H, ['#f6d79a', '#b8743a']);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const x = 60 + rnd() * 360;
    poly(g, [x - 10, 0, x + 10, 0, x, 40 + rnd() * 80], '#4a362a');
  }
  for (let i = 0; i < 6; i++) {
    const x = 90 + rnd() * 300;
    poly(g, [x - 12, ART_H, x + 12, ART_H, x, ART_H - 30 - rnd() * 50], '#5a4232');
  }
}

function footprints(g: G, x: number, y: number, s: number): void {
  for (let i = 0; i < 4; i++) {
    const px = x + i * 70 * s;
    const py = y - (i % 2) * 30 * s;
    ellipse(g, px, py, 18 * s, 15 * s, 'rgba(70,45,25,0.75)');
    for (let k = 0; k < 4; k++) circle(g, px - 15 * s + k * 10 * s, py - 22 * s + Math.abs(k - 1.5) * 4 * s, 6 * s, 'rgba(70,45,25,0.75)');
  }
}

function calendar(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.roundRect(x - 90 * s, y - 110 * s, 180 * s, 150 * s, 10 * s);
  g.fillStyle = '#fbf6e9';
  g.fill();
  rect(g, x - 90 * s, y - 110 * s, 180 * s, 36 * s, '#c8342f');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) rect(g, x - 78 * s + c * 27 * s, y - 64 * s + r * 24 * s, 20 * s, 16 * s, r === 2 && c > 1 ? '#f2c230' : '#e4d8bf');
  for (const dx of [-50, 50]) rect(g, x + dx * s - 4 * s, y - 120 * s, 8 * s, 22 * s, '#555');
}

function suitcase(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.roundRect(x - 80 * s, y - 110 * s, 160 * s, 110 * s, 12 * s);
  g.fillStyle = '#8e2f3f';
  g.fill();
  rect(g, x - 30 * s, y - 128 * s, 60 * s, 10 * s, '#3a2a20');
  for (const dx of [-50, 50]) rect(g, x + dx * s - 6 * s, y - 110 * s, 12 * s, 110 * s, '#6d2130');
  circle(g, x - 30 * s, y - 60 * s, 16 * s, '#f2c230');
  circle(g, x + 34 * s, y - 40 * s, 13 * s, '#2b8fd8');
}

// --- finishing -------------------------------------------------------------------

/** Paper grain and a soft inner vignette, so every card looks printed. */
function finish(g: G, rnd: Rnd): void {
  const v = g.createRadialGradient(ART_W / 2, ART_H / 2, ART_H * 0.35, ART_W / 2, ART_H / 2, ART_W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,20,0,0.28)');
  rect(g, 0, 0, ART_W, ART_H, v);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 1500; i++) rect(g, rnd() * ART_W, rnd() * ART_H, 1.5, 1.5, rnd() > 0.5 ? '#fff' : '#000');
  g.globalAlpha = 1;
}

// --- reusable scenes -----------------------------------------------------------------

function himalaya(g: G, rnd: Rnd, mood: Mood = 'day', focus?: [number, number]): void {
  sky(g, mood, rnd, 260);
  if (mood === 'sunrise') sun(g, 380, 210, 22);
  range(g, rnd, 250, [[60, 120], [170, 150], [300, 130], [430, 140]], '#8a9ab0');
  if (focus) range(g, rnd, 260, [focus], '#6f7c8f', true, 0.5);
  hills(g, rnd, 262, 12, '#5e7a5a');
  hills(g, rnd, 300, 10, '#46663f');
}

function valleyTemple(g: G, rnd: Rnd, mood: Mood = 'day'): void {
  sky(g, mood, rnd, 240);
  range(g, rnd, 220, [[80, 70], [220, 90], [370, 80]], '#9aa8bc');
  hills(g, rnd, 230, 14, '#7f9a6a');
  ground(g, 270, '#d8c8a8', '#b8a382');
}

function lake(g: G, rnd: Rnd, mood: Mood = 'day', peak = true): void {
  sky(g, mood, rnd, 190);
  if (peak) range(g, rnd, 180, [[250, 140], [120, 80], [380, 90]], '#8796ab');
  hills(g, rnd, 190, 12, '#4f7a4a');
  water(g, rnd, 200, 140);
}

function jungle(g: G, rnd: Rnd, mood: Mood = 'jungle'): void {
  sky(g, mood, rnd, 200);
  forest(g, rnd, 200, 9, '#3d7a45', 34);
  ground(g, 200, '#a7c46a', '#6f9440');
  grass(g, rnd, 220, 340, 120, '#4f8a35');
}

function terai(g: G, rnd: Rnd, mood: Mood = 'day'): void {
  sky(g, mood, rnd, 220);
  forest(g, rnd, 215, 7, '#3f8a45', 22);
  ground(g, 215, '#c9cf78', '#9fb052');
  grass(g, rnd, 230, 340, 140, '#8a9a3a');
}

function feast(g: G, rnd: Rnd, dishes: (x: number, y: number) => void): void {
  sky(g, 'warm', rnd);
  for (let i = 0; i < 12; i++) circle(g, rnd() * ART_W, rnd() * 150, 2 + rnd() * 3, 'rgba(255,210,120,0.5)');
  table(g, rnd, 180, '#b0703a');
  for (const [x, y] of [[110, 250], [240, 220], [370, 250]]) dishes(x, y);
}

function crowd(g: G, rnd: Rnd, y: number, n: number, colors: string[], opts: Parameters<typeof person>[5] = {}): void {
  for (let i = 0; i < n; i++) {
    const x = 50 + (i * (ART_W - 100)) / Math.max(n - 1, 1) + (rnd() - 0.5) * 10;
    person(g, x, y + (i % 2) * 8, 1.05, colors[i % colors.length], { ...opts, arms: opts.arms ?? (i % 2 ? 'up' : 'out') });
  }
}

// --- the recipes, one per card ------------------------------------------------------------

type Recipe = (g: G, rnd: Rnd) => void;

const RECIPES: Record<string, Recipe> = {
  // Nepal Mandal
  'nm-photo-swayambhu': (g, r) => { valleyTemple(g, r); hills(g, r, 300, 30, '#5f8a4a'); stupa(g, 240, 300, 0.95); flags(g, 40, 120, 240, 120, 12, 30); flags(g, 240, 120, 440, 130, 12, 30); birds(g, r, 6, 300, 30, 150, 50); },
  'nm-photo-durbar': (g, r) => { valleyTemple(g, r); pagoda(g, 110, 320, 0.8, 3); pagoda(g, 360, 320, 0.7, 2, '#3a2a20'); shikhara(g, 240, 320, 0.9); birds(g, r, 10, 140, 230, 200, 60, '#555'); },
  'nm-photo-boudha': (g, r) => { sky(g, 'day', r, 230); hills(g, r, 230, 16, '#8aa07a'); ground(g, 280, '#e8dcc0', '#c8b898'); stupa(g, 240, 320, 1.1); flags(g, 240, 70, 20, 240, 14, 10); flags(g, 240, 70, 460, 240, 14, 10); },
  'nm-photo-pashupati': (g, r) => { sky(g, 'dusk', r, 220); hills(g, r, 200, 18, '#5a4a6a'); water(g, r, 270, 70, '#8a6a7a', '#4a3a5a'); pagoda(g, 240, 270, 0.85, 2, '#d9a327', '#7a2e1f'); steps(g, 100, 270, 5, 120); steps(g, 380, 270, 5, 120); for (const x of [60, 420]) fire(g, x, 262, 0.5); },
  'nm-photo-bhaktapur': (g, r) => { valleyTemple(g, r); pagoda(g, 240, 330, 0.75, 5, '#4a3a30', '#8e3f2a'); house(g, 70, 300, 1.2, '#b5663f', '#5a3a28', '#7a2e1f'); house(g, 410, 300, 1.2, '#b5663f', '#5a3a28', '#7a2e1f'); },
  'nm-photo-patan': (g, r) => { valleyTemple(g, r, 'sunrise'); sun(g, 400, 160, 20); shikhara(g, 150, 320, 1); pagoda(g, 340, 320, 0.8, 3); },
  'nm-souvenir-thangka': (g, r) => { cloth(g, r, '#5a1e1e'); rect(g, 110, 20, 260, 300, '#8e2f3f'); rect(g, 126, 36, 228, 250, '#1f3b6e'); mandala(g, 240, 160, 100); rect(g, 100, 10, 280, 14, '#5b3420'); rect(g, 100, 316, 280, 14, '#5b3420'); },
  'nm-souvenir-khukuri': (g, r) => { cloth(g, r, '#6b2a20'); khukuri(g, 280, 180, 1.2); },
  'nm-together-newarifeast': (g, r) => feast(g, r, (x, y) => { plate(g, x, y, 60, false); bowl(g, x - 20, y - 6, 18, '#e8c87a'); bowl(g, x + 22, y - 4, 16, '#c8342f'); ellipse(g, x, y - 14, 22, 8, '#f4ead2'); }),
  'nm-tour-guide': (g, r) => { valleyTemple(g, r); pagoda(g, 360, 300, 0.6, 3); person(g, 140, 320, 1.4, '#2b5fb8', { arms: 'out', hat: '#1a1a1a' }); person(g, 220, 324, 1.2, '#e8452c'); person(g, 270, 326, 1.15, '#2f9a4a'); },
  'nm-duel-momo': (g, r) => { feast(g, r, (x, y) => { plate(g, x, y, 62); for (let i = 0; i < 6; i++) momo(g, x - 30 + (i % 3) * 30, y + 2 - Math.floor(i / 3) * 14, 0.7); }); },

  // Chitwan
  'cht-photo-rhino': (g, r) => { jungle(g, r); rhino(g, 220, 300, 1.4); birds(g, r, 3, 100, 60, 200, 40); },
  'cht-photo-tiger': (g, r) => { jungle(g, r, 'mist'); grass(g, r, 200, 280, 80, '#c9b46a'); tiger(g, 220, 300, 1.4); grass(g, r, 290, 340, 60, '#b8a35a'); },
  'cht-photo-gharial': (g, r) => { sky(g, 'jungle', r, 180); forest(g, r, 180, 9, '#3d7a45', 26); water(g, r, 180, 160, '#6aa8a0', '#2f6a68'); ellipse(g, 260, 270, 200, 30, '#c9b88a'); gharial(g, 230, 262, 1.2); },
  'cht-photo-canoe': (g, r) => { sky(g, 'mist', r, 190); forest(g, r, 190, 10, '#4a7a50', 28); water(g, r, 190, 150, '#9cc8c8', '#5f9aa0'); boat(g, 240, 260, 1.8, '#6b4a2a'); person(g, 200, 252, 0.8, '#c8342f'); person(g, 290, 252, 0.8, '#2b5fb8', { stick: true, arms: 'out' }); },
  'cht-photo-tharu': (g, r) => { sky(g, 'night', r, 240); moon(g, 400, 60, 22); ground(g, 240, '#5a4a3a', '#2a1e14'); fire(g, 240, 300, 1); crowd(g, r, 290, 6, ['#f2f2f2', '#c8342f'], { stick: true, skirt: true }); },
  'cht-souvenir-tharumask': (g, r) => { cloth(g, r, '#2f5a3a'); mask(g, 240, 180, 1.2); },
  'cht-tour-jeepsafari': (g, r) => { jungle(g, r); rect(g, 0, 270, ART_W, 30, '#c9a46a'); jeep(g, 230, 300, 1.4); deer(g, 420, 250, 0.6); },
  'cht-together-tharufeast': (g, r) => { sky(g, 'dusk', r, 220); house(g, 120, 240, 1.6, '#d9b46a', '#c9a45a', '#8a5a34'); ground(g, 240, '#a8845a', '#6b4a2a'); fire(g, 320, 300, 0.9); crowd(g, r, 330, 4, ['#c8342f', '#f2c230', '#2b5fb8']); },
  'cht-duel-birdcount': (g, r) => { jungle(g, r); birds(g, r, 18, 40, 20, 400, 140, '#2c2a2e'); person(g, 150, 320, 1.4, '#6b8a3a', { arms: 'up', hat: '#4a5a2a' }); person(g, 330, 320, 1.4, '#c8742a', { arms: 'up', hat: '#7a4a1a' }); },

  // Lumbini
  'lum-photo-mayadevi': (g, r) => { sky(g, 'day', r, 240); ground(g, 240, '#d8d0b8', '#b8ac8a'); bigTree(g, 400, 280, 0.7); whiteTemple(g, 220, 290, 1.2); flags(g, 0, 150, 400, 120, 16, 30); },
  'lum-photo-ashoka': (g, r) => { sky(g, 'day', r, 260); ground(g, 260, '#d8d0b8', '#b8ac8a'); whiteTemple(g, 340, 280, 0.8); pillar(g, 160, 300, 1.4); },
  'lum-photo-pond': (g, r) => { sky(g, 'mist', r, 180); whiteTemple(g, 240, 190, 0.7); rect(g, 40, 190, 400, 150, '#d8d0b8'); rect(g, 70, 210, 340, 110, '#3f8fb0'); water(g, r, 214, 102, '#5fb3d0', '#2c7aa0'); for (let i = 0; i < 6; i++) ellipse(g, 110 + i * 55, 260 + (i % 2) * 20, 16, 6, '#3f8a3a'); circle(g, 165, 262, 6, '#f06a9a'); },
  'lum-photo-peace': (g, r) => { sky(g, 'sunrise', r, 240); sun(g, 120, 180, 18); ground(g, 250, '#c8c0a8', '#a89a7a'); stupa(g, 240, 300, 1.1, '#ffffff', false); circle(g, 240, 220, 16, '#e2b23a'); },
  'lum-photo-monastic': (g, r) => { sky(g, 'day', r, 220); hills(g, r, 230, 8, '#8aa07a'); ground(g, 250, '#d8d0b8', '#b8ac8a'); pagoda(g, 120, 300, 0.6, 2, '#c8342f', '#f2c230'); stupa(g, 300, 300, 0.6, '#f6f2e6', false); person(g, 420, 320, 1.1, '#b8452b'); person(g, 450, 324, 1, '#b8452b'); },
  'lum-souvenir-beads': (g, r) => { cloth(g, r, '#6a2a1a'); beads(g, 240, 140, 100); },
  'lum-tour-cycle': (g, r) => { sky(g, 'day', r, 220); bigTree(g, 90, 260, 0.6); stupa(g, 390, 250, 0.4, '#fff', false); ground(g, 250, '#a8c46a', '#7aa04a'); rect(g, 0, 280, ART_W, 26, '#d8c8a0'); bike(g, 240, 300, 1.4, '#2b8fd8'); },
  'lum-together-dalbhat': (g, r) => feast(g, r, (x, y) => { plate(g, x, y, 62); ellipse(g, x - 6, y - 8, 28, 12, '#fbf6ea'); bowl(g, x + 34, y - 8, 14, '#e8c040'); bowl(g, x - 36, y - 6, 12, '#4f8a35'); }),
  'lum-duel-meditation': (g, r) => { sky(g, 'dusk', r, 240); bigTree(g, 240, 260, 0.9); ground(g, 250, '#8a7a5a', '#5a4a3a'); sitter(g, 160, 320, 1.2, '#b8452b'); sitter(g, 320, 320, 1.2, '#d9a327'); },

  // Pokhara
  'pok-photo-phewa': (g, r) => { lake(g, r, 'day'); boat(g, 160, 260, 1.1, '#c8402e'); boat(g, 320, 290, 1, '#2b5fa8'); boat(g, 400, 240, 0.8, '#e8a435'); },
  'pok-photo-barahi': (g, r) => { lake(g, r, 'mist'); ellipse(g, 240, 260, 110, 26, '#5f8a4a'); pagoda(g, 240, 262, 0.6, 2, '#c8342f', '#f6f2ea'); boat(g, 100, 300, 0.9); },
  'pok-photo-sarangkot': (g, r) => { himalaya(g, r, 'sunrise', [240, 190]); poly(g, [234, 70, 240, 54, 252, 72], '#f8fbff'); hills(g, r, 320, 20, '#2f4a2f'); person(g, 120, 330, 0.9, '#c8342f', { arms: 'up' }); },
  'pok-photo-davis': (g, r) => { sky(g, 'jungle', r); rect(g, 0, 80, 170, 260, '#6a5a4a'); rect(g, 310, 80, 170, 260, '#5a4a3a'); forest(g, r, 90, 6, '#3d7a45', 20); waterfall(g, r, 240, 80, 330, 140); },
  'pok-photo-shanti': (g, r) => { lake(g, r, 'day', true); hills(g, r, 200, 40, '#3f6a3a'); stupa(g, 240, 190, 0.6, '#ffffff', false); circle(g, 240, 146, 8, '#e2b23a'); },
  'pok-souvenir-pashmina': (g, r) => { cloth(g, r, '#e8dcc8'); shawl(g, 240, 230, 1.15, '#b8283a', '#e2b23a'); },
  'pok-tour-paragliding': (g, r) => { lake(g, r, 'day'); glider(g, 200, 90, 1); glider(g, 360, 140, 0.6, '#2b8fd8', '#ffffff'); },
  'pok-tour-boating': (g, r) => { lake(g, r, 'sunrise'); sun(g, 120, 160, 18); boat(g, 240, 270, 1.8, '#2f9a4a'); person(g, 210, 262, 0.7, '#f2c230'); person(g, 260, 262, 0.7, '#c8342f', { arms: 'out' }); },
  'pok-duel-zipline': (g, r) => { himalaya(g, r, 'day'); line(g, [0, 60, ART_W, 260], '#333', 2); person(g, 160, 160, 0.9, '#e8452c', { arms: 'up' }); person(g, 320, 230, 0.9, '#2b5fb8', { arms: 'up' }); },

  // Himalayan Village
  'him-photo-ghandruk': (g, r) => { himalaya(g, r, 'day', [300, 180]); for (let i = 0; i < 7; i++) house(g, 60 + i * 60, 300 + (i % 2) * 18, 0.9, '#e8e0d0', '#6a6560'); },
  'him-photo-poonhill': (g, r) => { himalaya(g, r, 'sunrise', [180, 200]); hills(g, r, 300, 20, '#2f3a2f'); crowd(g, r, 330, 5, ['#e8452c', '#2b5fb8', '#f2c230'], { arms: 'up' }); },
  'him-photo-ghorepani': (g, r) => { himalaya(g, r, 'mist'); rhodo(g, r, 120, 330, 1); rhodo(g, r, 340, 340, 1.2); },
  'him-photo-sikles': (g, r) => { himalaya(g, r, 'day'); hills(g, r, 250, 20, '#6f9440'); for (let i = 0; i < 5; i++) hills(g, r, 260 + i * 16, 4, i % 2 ? '#8fb355' : '#7fa64a'); house(g, 160, 300, 1, '#d8d0c0', '#6a6560'); house(g, 300, 290, 0.9, '#d8d0c0', '#6a6560'); },
  'him-souvenir-gurung': (g, r) => { cloth(g, r, '#2a3a4a'); shawl(g, 240, 230, 1.1, '#f4ead2', '#1f3b6e'); },
  'him-tour-homestay': (g, r) => { sky(g, 'dusk', r, 220); range(g, r, 220, [[350, 120]], '#6a6a8a'); ground(g, 230, '#7a8a5a', '#4a5a3a'); house(g, 200, 300, 2.4, '#e8e0d0', '#5a5550'); rect(g, 158, 252, 24, 24, '#f2c230'); rect(g, 218, 252, 24, 24, '#f2c230'); },
  'him-together-rodhi': (g, r) => { sky(g, 'warm', r); fire(g, 240, 290, 1.2); crowd(g, r, 330, 6, ['#2b5fb8', '#c8342f', '#f2c230', '#2f9a4a'], { arms: 'up', skirt: true }); },
  'him-duel-teahouse': (g, r) => { himalaya(g, r, 'day'); line(g, [0, 320, 120, 290, 260, 300, 480, 270], '#c9a46a', 18); house(g, 420, 270, 1, '#f1ece0', '#2b5fb8'); person(g, 160, 296, 1, '#e8452c', { arms: 'out' }); person(g, 230, 302, 1, '#2f9a4a', { arms: 'out' }); },

  // Eastern
  'eas-photo-ilam': (g, r) => { sky(g, 'mist', r, 160); hills(g, r, 160, 20, '#6f9440'); for (let i = 0; i < 8; i++) { hills(g, r, 180 + i * 22, 6, i % 2 ? '#3e8d3a' : '#4f9a45', 1.2); } person(g, 380, 250, 0.9, '#c8342f', { skirt: true }); },
  'eas-photo-kanchenjunga': (g, r) => { sky(g, 'sunrise', r, 260); range(g, r, 260, [[90, 150], [250, 210], [320, 190], [430, 140]], '#d98a6a'); hills(g, r, 280, 14, '#3a4a5a'); },
  'eas-photo-koshi': (g, r) => { sky(g, 'day', r, 180); water(g, r, 180, 160, '#7fb8c8', '#4a8aa0'); grass(g, r, 180, 220, 80, '#8a9a3a'); birds(g, r, 24, 20, 40, 440, 120, '#f6f6f6'); for (const x of [120, 260, 360]) { ellipse(g, x, 260, 16, 10, '#f6f6f6'); line(g, [x, 268, x, 300], '#e8a435', 2); } },
  'eas-photo-antu': (g, r) => { sky(g, 'sunrise', r, 220); sun(g, 240, 220, 34, '#ffe08a'); hills(g, r, 220, 10, '#e8a87a'); hills(g, r, 260, 18, '#7a5a6a'); hills(g, r, 300, 16, '#3a3a4a'); crowd(g, r, 335, 4, ['#222', '#333'], { arms: 'out' }); },
  'eas-photo-pathibhara': (g, r) => { sky(g, 'day', r, 260); range(g, r, 260, [[240, 170]], '#6f7c8f', false); poly(g, [200, 100, 280, 100, 240, 90], '#8a7a6a'); house(g, 240, 104, 0.6, '#c8342f', '#e2b23a'); flags(g, 120, 140, 240, 70, 10, 10); flags(g, 240, 70, 360, 140, 10, 10); hills(g, r, 300, 14, '#4f6a3a'); },
  'eas-souvenir-tea': (g, r) => { table(g, r, 0, '#9a6a3a'); teacup(g, 260, 300, 1.4); for (let i = 0; i < 7; i++) tealeaf(g, 60 + r() * 360, 40 + r() * 110, 1, r() * 3); },
  'eas-tour-teapick': (g, r) => { sky(g, 'day', r, 140); hills(g, r, 140, 18, '#6f9440'); for (let i = 0; i < 8; i++) hills(g, r, 170 + i * 22, 6, i % 2 ? '#3e8d3a' : '#4f9a45', 1.2); person(g, 160, 330, 1.3, '#c8342f', { skirt: true, arms: 'out' }); basket(g, 160, 260, 0.35); person(g, 330, 320, 1.2, '#f2c230', { skirt: true, arms: 'out' }); },
  'eas-together-kinema': (g, r) => feast(g, r, (x, y) => { if (x === 240) { tongba(g, x, y + 10, 0.8); return; } plate(g, x, y, 54); bowl(g, x, y - 6, 26, '#9a6a3a'); }),
  'eas-duel-chhurpi': (g, r) => { table(g, r, 0, '#7a4a2a'); for (let i = 0; i < 9; i++) { const x = 90 + (i % 3) * 150; const y = 90 + Math.floor(i / 3) * 90; rect(g, x - 26, y - 14, 52, 28, '#f4ead2'); rect(g, x - 26, y - 14, 52, 6, '#fffaf0'); line(g, [x - 30, y - 18, x + 30, y - 18], '#c8a24c', 2); } },

  // Mountain Expedition
  'mtn-photo-chooyu': (g, r) => { himalaya(g, r, 'day', [260, 220]); tent(g, 140, 300, 1, '#e8452c'); tent(g, 210, 306, 0.8, '#f2c230'); },
  'mtn-photo-churen': (g, r) => { himalaya(g, r, 'mist', [200, 200]); range(g, r, 250, [[360, 170]], '#7a8a9f'); },
  'mtn-photo-abc-heli': (g, r) => { himalaya(g, r, 'day', [300, 210]); helicopter(g, 170, 120, 1); },
  'mtn-photo-pumori': (g, r) => { himalaya(g, r, 'sunrise', [240, 230]); flags(g, 0, 250, 480, 250, 20, 30); },
  'mtn-photo-amadablam': (g, r) => { sky(g, 'day', r, 260); range(g, r, 250, [[110, 110], [400, 120]], '#8a9ab0'); range(g, r, 270, [[250, 230]], '#6f7c8f', true, 0.6); poly(g, [200, 120, 250, 108, 300, 124, 250, 140], '#f8fbff'); hills(g, r, 280, 14, '#4f6a4a'); chorten(g, 100, 320); },
  'mtn-photo-makalu': (g, r) => { himalaya(g, r, 'dusk', [250, 220]); },
  'mtn-photo-himlung': (g, r) => { himalaya(g, r, 'day', [220, 180]); range(g, r, 260, [[340, 150]], '#7a8a9f'); tent(g, 380, 310, 0.9, '#2b8fd8'); },
  'mtn-photo-baruntse': (g, r) => { himalaya(g, r, 'mist', [260, 200]); person(g, 140, 300, 0.9, '#e8452c', { arms: 'up', hat: '#222' }); line(g, [130, 230, 130, 300], '#555', 2); },
  'mtn-photo-kangtega': (g, r) => { himalaya(g, r, 'sunrise', [200, 190]); range(g, r, 255, [[300, 200]], '#d98a6a'); },
  'mtn-souvenir-prayerflag': (g, r) => { sky(g, 'day', r); range(g, r, 340, [[240, 260]], '#6f7c8f'); for (let k = 0; k < 4; k++) flags(g, -20, 60 + k * 50, 500, 100 + k * 50, 16, 30, 22); },
  'mtn-tour-sherpaguide': (g, r) => { himalaya(g, r, 'day', [300, 200]); person(g, 160, 320, 1.6, '#c8342f', { hat: '#222', arms: 'down' }); rect(g, 150, 190, 46, 60, '#7a5a34'); person(g, 260, 320, 1.4, '#2b5fb8', { arms: 'out' }); },
  'mtn-duel-summitrace': (g, r) => { sky(g, 'day', r); range(g, r, 360, [[240, 300]], '#6f7c8f', true, 0.5); person(g, 200, 160, 0.8, '#e8452c', { arms: 'up' }); person(g, 300, 200, 0.8, '#2b5fb8', { arms: 'up' }); line(g, [240, 60, 240, 30], '#555', 2); poly(g, [240, 30, 270, 38, 240, 46], '#c8102e'); },

  // Western Hillside
  'whl-photo-bandipur': (g, r) => { sky(g, 'day', r, 180); range(g, r, 180, [[240, 90], [380, 70]], '#9aa8bc'); for (let i = 0; i < 6; i++) house(g, 40 + i * 80, 300, 1.25, i % 2 ? '#e8d8c0' : '#c8885a', '#4a3a30', '#7a2e1f'); rect(g, 0, 300, ART_W, 40, '#b8a07a'); crowd(g, r, 335, 3, ['#2b5fb8', '#c8342f', '#2f9a4a'], { arms: 'down' }); },
  'whl-photo-gorkha': (g, r) => { sky(g, 'day', r, 240); hills(g, r, 200, 60, '#5f8a4a'); pagoda(g, 240, 190, 0.5, 2); palace(g, 240, 200, 0.6, '#c8885a'); flags(g, 120, 110, 360, 110, 12, 20); },
  'whl-photo-tansen': (g, r) => { sky(g, 'day', r, 200); hills(g, r, 200, 14, '#7f9a6a'); ground(g, 220, '#a8c48a', '#7aa04a'); palace(g, 240, 300, 1.1); water(g, r, 300, 40, '#6aa8c0', '#3a7aa0'); },
  'whl-photo-rara': (g, r) => { sky(g, 'day', r, 170); range(g, r, 170, [[120, 70], [360, 80]], '#8a9ab0'); hills(g, r, 180, 16, '#3f6a3a'); pines(g, r, 196, 26, '#2f5d3a', 30); water(g, r, 205, 135, '#3f9fd8', '#1f6aa8'); },
  'whl-souvenir-dhaka': (g, r) => { cloth(g, r, '#e8dcc8'); ellipse(g, 240, 285, 150, 22, 'rgba(0,0,0,0.18)'); topi(g, 240, 280, 1.5); },
  'whl-souvenir-karuwa': (g, r) => { table(g, r, 220, '#6b3a1c'); rect(g, 0, 0, ART_W, 220, vgrad(g, 0, 220, ['#3a1e14', '#6b3a22'])); karuwa(g, 220, 300, 1.4); },
  'whl-tour-cave': (g, r) => { cave(g, r); person(g, 240, 320, 1.2, '#f2c230', { arms: 'out', hat: '#e8452c' }); circle(g, 268, 222, 8, '#fff6c4'); },
  'whl-duel-ridge': (g, r) => { sky(g, 'day', r, 240); range(g, r, 240, [[300, 120]], '#8a9ab0'); poly(g, [0, 340, 0, 250, 240, 180, 480, 240, 480, 340], '#5f8a4a'); person(g, 200, 196, 0.9, '#e8452c', { arms: 'out' }); person(g, 290, 206, 0.9, '#2b5fb8', { arms: 'out' }); },

  // Western Terai
  'wtr-photo-bardiya': (g, r) => { terai(g, r); elephant(g, 200, 320, 1.2, false); tiger(g, 400, 300, 0.6); },
  'wtr-photo-karnali': (g, r) => { sky(g, 'day', r, 160); hills(g, r, 170, 60, '#4f7a4a'); poly(g, [0, 230, 480, 200, 480, 300, 0, 340], '#3f8fb0'); water(g, r, 250, 50, '#6ab0d0', '#3a8ab0'); line(g, [60, 180, 420, 180], '#555', 3); for (let k = 0; k < 20; k++) line(g, [60 + k * 18, 180, 60 + k * 18, 196 + Math.sin(k / 19 * Math.PI) * 14], '#555', 1); },
  'wtr-photo-shuklaphanta': (g, r) => { terai(g, r, 'sunrise'); sun(g, 380, 190, 20); for (const x of [120, 230, 330]) deer(g, x, 300 + (x % 3) * 6, 0.9, '#c89a5a'); },
  'wtr-photo-ghodaghodi': (g, r) => { sky(g, 'mist', r, 180); forest(g, r, 180, 8, '#3d7a45', 26); water(g, r, 180, 160, '#6aa8a0', '#2f6a68'); for (let i = 0; i < 12; i++) { ellipse(g, 40 + i * 38, 250 + (i % 3) * 22, 18, 7, '#3f8a3a'); if (i % 3 === 0) circle(g, 40 + i * 38, 244 + (i % 3) * 22, 7, '#f06a9a'); } },
  'wtr-souvenir-basket': (g, r) => { cloth(g, r, '#c9a45a'); basket(g, 240, 300, 1.4); },
  'wtr-tour-tigertrack': (g, r) => { terai(g, r, 'mist'); rect(g, 0, 270, ART_W, 70, '#c9a46a'); footprints(g, 120, 320, 0.9); person(g, 400, 280, 1, '#6b8a3a', { hat: '#4a5a2a', stick: true, arms: 'out' }); },
  'wtr-tour-rafting': (g, r) => { sky(g, 'day', r, 150); hills(g, r, 160, 50, '#4f7a4a'); water(g, r, 200, 140, '#5fb3d0', '#2c7aa0'); for (let i = 0; i < 14; i++) ellipse(g, r() * ART_W, 220 + r() * 100, 20, 5, 'rgba(255,255,255,0.8)'); raft(g, 240, 280, 1.4); },
  'wtr-duel-maghi': (g, r) => { sky(g, 'dusk', r, 230); ground(g, 230, '#a8845a', '#6b4a2a'); crowd(g, r, 320, 5, ['#f6f6f6', '#c8342f', '#f2c230'], { skirt: true, arms: 'up' }); for (let i = 0; i < 20; i++) circle(g, r() * ART_W, r() * 140, 3, ['#f2c230', '#c8342f', '#2b5fb8'][i % 3]); },

  // Wild
  'wild-bike-1': (g, r) => { sky(g, 'day', r, 220); hills(g, r, 220, 20, '#7fa64a'); rect(g, 0, 270, ART_W, 30, '#d8c8a0'); bike(g, 240, 300, 1.6); },
  'wild-bike-2': (g, r) => { sky(g, 'sunrise', r, 220); range(g, r, 220, [[120, 90], [360, 110]], '#8a7a9a'); rect(g, 0, 270, ART_W, 30, '#d8c8a0'); hills(g, r, 300, 8, '#4f6a3a'); bike(g, 240, 300, 1.6, '#2b5fb8'); },
  'wild-homesick-1': (g, r) => { sky(g, 'night', r, 260); moon(g, 380, 70, 26); house(g, 240, 320, 2.6, '#e8d8c0', '#5a4a40'); rect(g, 196, 254, 22, 22, '#f2c230'); rect(g, 262, 254, 22, 22, '#f2c230'); suitcase(g, 380, 330, 0.5); },
  'wild-dutycall-1': (g, r) => { sky(g, 'day', r); plane(g, 240, 150, 1.4); hills(g, r, 320, 14, '#7f9a6a'); },
  'wild-extend-1': (g, r) => { sky(g, 'day', r, 240); range(g, r, 240, [[240, 140]], '#8a9ab0'); hills(g, r, 260, 14, '#6f9440'); calendar(g, 240, 290, 1); },
  'wild-extend-2': (g, r) => { lake(g, r, 'dusk'); calendar(g, 240, 300, 0.9); },
};

/** A small chorten, used in a few mountain scenes. */
function chorten(g: G, x: number, y: number): void {
  rect(g, x - 30, y - 22, 60, 22, '#f6f3ea');
  rect(g, x - 22, y - 36, 44, 14, '#f6f3ea');
  circle(g, x, y - 50, 18, '#f6f3ea');
  poly(g, [x - 8, y - 64, x + 8, y - 64, x, y - 96], '#e2b23a');
  rect(g, x - 31, y - 24, 62, 4, '#b2392c');
}

/** Anything without its own recipe gets its section's landscape. */
function fallback(card: Card): Recipe {
  const bySection: Partial<Record<DeckId, Recipe>> = {
    nepalmandal: (g, r) => { valleyTemple(g, r); pagoda(g, 240, 320, 0.8, 3); },
    chitwan: (g, r) => { jungle(g, r); rhino(g, 220, 300, 1.2); },
    lumbini: (g, r) => { sky(g, 'day', r, 240); ground(g, 240, '#d8d0b8', '#b8ac8a'); whiteTemple(g, 240, 290, 1.1); },
    pokhara: (g, r) => { lake(g, r); boat(g, 240, 270, 1.2); },
    himalayan: (g, r) => { himalaya(g, r); house(g, 240, 310, 1.2); },
    eastern: (g, r) => { sky(g, 'mist', r, 160); for (let i = 0; i < 8; i++) hills(g, r, 170 + i * 22, 6, i % 2 ? '#3e8d3a' : '#4f9a45'); },
    westernterai: (g, r) => { terai(g, r); elephant(g, 240, 320, 1); },
    westernhillside: (g, r) => { sky(g, 'day', r, 200); hills(g, r, 220, 40, '#5f8a4a'); house(g, 240, 300, 1.4); },
    mountain: (g, r) => himalaya(g, r, 'day', [240, 220]),
    airport: (g, r) => { sky(g, 'day', r); plane(g, 240, 160, 1.2); },
    wild: (g, r) => { sky(g, 'dusk', r); mandala(g, 240, 170, 110); },
  };
  return bySection[card.deck] ?? bySection.wild!;
}
