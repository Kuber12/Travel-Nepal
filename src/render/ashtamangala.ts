/**
 * The Ashtamangala — the eight auspicious symbols — drawn as flat 2D marks on
 * a canvas. Used on the faces of the Maane spinner, on its legend printed on
 * the board, and on the medallions round the border.
 *
 * Each symbol is drawn centred on (0, 0) inside a circle of radius 1; callers
 * translate and scale the context first. Strokes use a line width of ~0.07 in
 * that unit space, so they stay crisp at any size.
 */

export type Symbol = {
  /** Sanskrit name, as it is known in Nepal. */
  name: string;
  /** English gloss. */
  meaning: string;
};

/** In spinner order: face 1 is the conch, face 8 the dharma wheel. */
export const ASHTAMANGALA: Symbol[] = [
  { name: 'Shankha', meaning: 'White Conch' },
  { name: 'Shrivatsa', meaning: 'Endless Knot' },
  { name: 'Padma', meaning: 'Lotus' },
  { name: 'Dhvaja', meaning: 'Victory Banner' },
  { name: 'Kalasha', meaning: 'Treasure Vase' },
  { name: 'Chhatra', meaning: 'Parasol' },
  { name: 'Matsya', meaning: 'Golden Fish' },
  { name: 'Dharmachakra', meaning: 'Dharma Wheel' },
];

export const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/**
 * Draw symbol `index` (0–7) at (x, y) with radius `r`. `fill` is the body
 * colour, `line` the engraving colour.
 */
export function drawSymbol(
  g: CanvasRenderingContext2D,
  index: number,
  x: number,
  y: number,
  r: number,
  fill = '#f2c94c',
  line = '#6b3a10',
): void {
  g.save();
  g.translate(x, y);
  g.scale(r, r);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = fill;
  g.strokeStyle = line;
  g.lineWidth = 0.07;
  DRAW[((index % 8) + 8) % 8](g, fill, line);
  g.restore();
}

type Draw = (g: CanvasRenderingContext2D, fill: string, line: string) => void;

const both = (g: CanvasRenderingContext2D): void => {
  g.fill();
  g.stroke();
};

const DRAW: Draw[] = [
  // 1. Shankha — a right-turning white conch, tip up, ribbon below.
  (g) => {
    g.beginPath();
    g.moveTo(0.05, -0.92);
    g.bezierCurveTo(0.42, -0.7, 0.62, -0.2, 0.52, 0.22);
    g.bezierCurveTo(0.44, 0.58, 0.18, 0.78, -0.08, 0.8);
    g.bezierCurveTo(-0.42, 0.78, -0.6, 0.48, -0.5, 0.1);
    g.bezierCurveTo(-0.4, -0.3, -0.22, -0.62, 0.05, -0.92);
    g.closePath();
    both(g);
    // The whorl.
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 3.2 + 1.2;
      const rr = 0.36 * (1 - t * 0.85);
      const px = Math.cos(a) * rr - 0.02;
      const py = Math.sin(a) * rr * 0.9 + 0.22;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    // Ridges up the spire.
    for (const k of [-0.62, -0.42, -0.24]) {
      g.beginPath();
      g.moveTo(-0.2 - k * 0.15, k);
      g.quadraticCurveTo(0.08, k + 0.08, 0.32 + k * 0.1, k + 0.02);
      g.stroke();
    }
  },

  // 2. Shrivatsa — the endless knot, an interlaced diamond lattice with corner loops.
  (g, fill, line) => {
    const s = 0.52;
    g.save();
    g.rotate(Math.PI / 4);
    // Corner loops.
    for (const [cx, cy] of [[-s, -s], [s, -s], [s, s], [-s, s]]) {
      g.beginPath();
      g.arc(cx * 1.05, cy * 1.05, 0.2, 0, Math.PI * 2);
      g.lineWidth = 0.16;
      g.strokeStyle = fill;
      g.stroke();
    }
    // The lattice: 3 bands each way, drawn as fat strokes with a dark edge.
    const bands = [-s, 0, s];
    const band = (x0: number, y0: number, x1: number, y1: number): void => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineWidth = 0.2;
      g.strokeStyle = line;
      g.stroke();
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineWidth = 0.12;
      g.strokeStyle = fill;
      g.stroke();
    };
    for (const b of bands) band(-s, b, s, b);
    for (const b of bands) band(b, -s, b, s);
    g.restore();
  },

  // 3. Padma — an open lotus: five petals on a curved base.
  (g) => {
    const petal = (angle: number, len: number, wid: number): void => {
      g.save();
      g.translate(0, 0.42);
      g.rotate(angle);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(wid, -len * 0.35, wid * 0.6, -len * 0.85, 0, -len);
      g.bezierCurveTo(-wid * 0.6, -len * 0.85, -wid, -len * 0.35, 0, 0);
      both(g);
      g.beginPath();
      g.moveTo(0, -len * 0.15);
      g.lineTo(0, -len * 0.75);
      g.stroke();
      g.restore();
    };
    petal(-1.15, 0.85, 0.3);
    petal(1.15, 0.85, 0.3);
    petal(-0.58, 1.05, 0.34);
    petal(0.58, 1.05, 0.34);
    petal(0, 1.25, 0.36);
    g.beginPath();
    g.moveTo(-0.72, 0.5);
    g.quadraticCurveTo(0, 0.95, 0.72, 0.5);
    g.quadraticCurveTo(0, 0.7, -0.72, 0.5);
    both(g);
  },

  // 4. Dhvaja — the victory banner: a tiered cylindrical standard on a pole.
  (g) => {
    g.beginPath();
    g.rect(-0.05, -0.95, 0.1, 1.9);
    both(g);
    // Finial.
    g.beginPath();
    g.arc(0, -0.86, 0.1, 0, Math.PI * 2);
    both(g);
    // Canopy.
    g.beginPath();
    g.moveTo(-0.38, -0.6);
    g.quadraticCurveTo(0, -0.86, 0.38, -0.6);
    g.closePath();
    both(g);
    // Three tiers of banner, scalloped hems.
    for (let i = 0; i < 3; i++) {
      const y0 = -0.6 + i * 0.36;
      const y1 = y0 + 0.32;
      const w = 0.4 + i * 0.03;
      g.beginPath();
      g.moveTo(-w, y0);
      g.lineTo(w, y0);
      g.lineTo(w, y1);
      for (let k = 0; k < 4; k++) {
        const xa = w - (k + 1) * ((w * 2) / 4);
        g.quadraticCurveTo(xa + w / 4, y1 + 0.12, xa, y1);
      }
      g.closePath();
      both(g);
    }
  },

  // 5. Kalasha — the treasure vase: round belly, narrow neck, jewelled lid.
  (g) => {
    g.beginPath();
    g.moveTo(-0.22, -0.28);
    g.bezierCurveTo(-0.75, -0.2, -0.75, 0.62, -0.2, 0.72);
    g.lineTo(-0.3, 0.9);
    g.lineTo(0.3, 0.9);
    g.lineTo(0.2, 0.72);
    g.bezierCurveTo(0.75, 0.62, 0.75, -0.2, 0.22, -0.28);
    g.closePath();
    both(g);
    // Neck and lip.
    g.beginPath();
    g.rect(-0.18, -0.48, 0.36, 0.2);
    both(g);
    g.beginPath();
    g.ellipse(0, -0.5, 0.34, 0.08, 0, 0, Math.PI * 2);
    both(g);
    // Lid with a flaming jewel.
    g.beginPath();
    g.moveTo(-0.2, -0.56);
    g.quadraticCurveTo(0, -0.8, 0.2, -0.56);
    both(g);
    g.beginPath();
    g.moveTo(0, -0.98);
    g.quadraticCurveTo(0.14, -0.82, 0, -0.72);
    g.quadraticCurveTo(-0.14, -0.82, 0, -0.98);
    both(g);
    // Belly band.
    g.beginPath();
    g.moveTo(-0.6, 0.18);
    g.quadraticCurveTo(0, 0.32, 0.6, 0.18);
    g.stroke();
  },

  // 6. Chhatra — the parasol: domed canopy with a fringe, on a staff.
  (g) => {
    g.beginPath();
    g.rect(-0.05, -0.55, 0.1, 1.45);
    both(g);
    g.beginPath();
    g.moveTo(-0.85, -0.05);
    g.bezierCurveTo(-0.8, -0.72, 0.8, -0.72, 0.85, -0.05);
    g.closePath();
    both(g);
    // Fringe.
    for (let i = 0; i < 7; i++) {
      const x = -0.75 + i * 0.25;
      g.beginPath();
      g.moveTo(x - 0.1, -0.05);
      g.lineTo(x, 0.22);
      g.lineTo(x + 0.1, -0.05);
      both(g);
    }
    // Ribs and the finial.
    for (const x of [-0.42, 0, 0.42]) {
      g.beginPath();
      g.moveTo(0, -0.56);
      g.quadraticCurveTo(x * 0.9, -0.4, x * 1.2, -0.06);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, -0.66, 0.11, 0, Math.PI * 2);
    both(g);
  },

  // 7. Matsya — a pair of golden fish, standing nose to nose.
  (g) => {
    const fish = (dir: number): void => {
      g.save();
      g.scale(dir, 1);
      g.translate(0.26, 0);
      g.beginPath();
      g.moveTo(0, -0.82);
      g.bezierCurveTo(0.36, -0.6, 0.36, 0.3, 0.06, 0.52);
      g.lineTo(0.3, 0.9);
      g.lineTo(-0.06, 0.72);
      g.lineTo(-0.3, 0.9);
      g.lineTo(-0.06, 0.52);
      g.bezierCurveTo(-0.3, 0.3, -0.3, -0.6, 0, -0.82);
      g.closePath();
      both(g);
      g.beginPath();
      g.arc(0.02, -0.5, 0.05, 0, Math.PI * 2);
      g.stroke();
      // Scales.
      for (const y of [-0.2, 0.05, 0.3]) {
        g.beginPath();
        g.arc(0.02, y, 0.14, 0.3, Math.PI - 0.3);
        g.stroke();
      }
      g.restore();
    };
    fish(1);
    fish(-1);
  },

  // 8. Dharmachakra — the eight-spoked wheel of the dharma.
  (g) => {
    g.beginPath();
    g.arc(0, 0, 0.8, 0, Math.PI * 2);
    g.arc(0, 0, 0.62, 0, Math.PI * 2, true);
    both(g);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(-0.05, -0.18);
      g.lineTo(-0.035, -0.62);
      g.lineTo(0.035, -0.62);
      g.lineTo(0.05, -0.18);
      g.closePath();
      both(g);
      // Knobs round the rim.
      g.beginPath();
      g.arc(0, -0.9, 0.08, 0, Math.PI * 2);
      both(g);
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 0.2, 0, Math.PI * 2);
    both(g);
    g.beginPath();
    g.arc(0, 0, 0.07, 0, Math.PI * 2);
    g.stroke();
  },
];

/**
 * A round medallion: coloured disc, gold ring, the symbol, and optionally a
 * numeral at the bottom. Used for the printed legend and border.
 */
export function drawMedallion(
  g: CanvasRenderingContext2D,
  index: number,
  x: number,
  y: number,
  r: number,
  ground: string,
  numeral?: string,
): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = ground;
  g.fill();
  g.lineWidth = r * 0.12;
  g.strokeStyle = '#d9a327';
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.86, 0, Math.PI * 2);
  g.lineWidth = r * 0.03;
  g.strokeStyle = 'rgba(255, 240, 200, 0.7)';
  g.stroke();
  g.restore();
  drawSymbol(g, index, x, numeral ? y - r * 0.12 : y, r * (numeral ? 0.55 : 0.66));
  if (numeral) {
    g.save();
    g.fillStyle = '#fff4d6';
    g.font = `bold ${r * 0.42}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(numeral, x, y + r * 0.62);
    g.restore();
  }
}
