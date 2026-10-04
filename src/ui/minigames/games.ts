/**
 * The mini-games. Each one is a small, self-contained interactive round that
 * builds its own UI inside a host element, runs for a few seconds, and
 * resolves with a score. They know nothing about the rules — the host turns
 * scores into a result for the reducer.
 *
 *   gate      Checkpoint Stamp — stop the swinging stamp on the permit box.
 *   climb     Summit Sprint    — alternate ← → as fast as you can to climb.
 *   catch     Catch!           — move the basket/plate to catch the good things.
 *   snapshot  Snapshot         — frame the moving subject and take the photo.
 *   flags     Prayer Flags     — repeat the colour sequence as it grows.
 *   match     Pair Up          — find the matching picture pairs.
 *   quiz      Guide's Quiz     — answer the guide's questions about Nepal.
 */

import type { Card } from '../../engine/types.ts';
import { SECTION_LABEL } from '../../render/palette.ts';
import { cardArt } from '../cardart.ts';

import { GAME_TARGETS, type Difficulty, type GameTheme } from './pick.ts';

export type { Difficulty, GameTheme };

export type GameContext = {
  difficulty: Difficulty;
  playerName: string;
  playerColor: string;
  card?: Card;
  /** Cards to draw pictures and questions from. */
  pool: Card[];
  theme: GameTheme;
  seed: number;
};

export type GameRun = { score: number; summary: string };

export type MiniGame = {
  id: string;
  title: string;
  icon: string;
  how: string;
  unit: string;
  target(d: Difficulty): number;
  play(host: HTMLElement, ctx: GameContext): Promise<GameRun>;
};

// --- shared helpers ----------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** A big 3-2-1 before a timed game starts. */
async function countdown(host: HTMLElement): Promise<void> {
  const c = el('div', 'mg-countdown');
  host.append(c);
  for (const n of ['3', '2', '1', 'Go!']) {
    c.textContent = n;
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
    await wait(n === 'Go!' ? 450 : 650);
  }
  c.remove();
}

/** A shrinking timer bar plus a live score readout. */
function hudBar(host: HTMLElement, unit: string): { setTime(f: number): void; setScore(n: number): void } {
  const bar = el('div', 'mg-bar');
  const fill = el('div', 'mg-bar-fill');
  bar.append(fill);
  const score = el('div', 'mg-score', `0 ${unit}`);
  const wrap = el('div', 'mg-hudbar');
  wrap.append(bar, score);
  host.append(wrap);
  return {
    setTime(f) {
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
      fill.classList.toggle('low', f < 0.25);
    },
    setScore(n) {
      score.textContent = `${n} ${unit}`;
    },
  };
}

function canvas(host: HTMLElement, w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = el('canvas', 'mg-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  host.append(c);
  return { c, g };
}

/** Run `frame(dt, elapsed)` each animation frame until it returns false. */
function loop(frame: (dt: number, t: number) => boolean): Promise<void> {
  return new Promise((resolve) => {
    let last = performance.now();
    const start = last;
    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (frame(dt, (now - start) / 1000)) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function sky(g: CanvasRenderingContext2D, w: number, h: number, top = '#7fc0e8', bottom = '#eaf4f4'): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

// --- gate: Checkpoint Stamp --------------------------------------------------------------

const gate: MiniGame = {
  id: 'gate',
  title: 'Checkpoint Stamp',
  icon: '🛂',
  how: 'The stamp swings across your permit. Press Space or click to bring it down inside the gold box. Three stamps — closer to the centre scores more.',
  unit: 'pts',
  target: (d) => GAME_TARGETS.gate[d],
  async play(host, ctx) {
    const W = 520;
    const H = 220;
    const { c, g } = canvas(host, W, H);
    const hud = hudBar(host, 'pts');
    const hint = el('div', 'mg-hint', 'Space / click to stamp');
    host.append(hint);

    let score = 0;
    const marks: { x: number; ok: boolean }[] = [];
    const half = [70, 52, 38][ctx.difficulty];
    const drawPermit = (x: number, centre: number): void => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#fbf6e9';
      g.fillRect(20, 60, W - 40, 130);
      g.strokeStyle = '#d9cfb8';
      g.lineWidth = 2;
      g.strokeRect(20, 60, W - 40, 130);
      g.fillStyle = '#8e2f3f';
      g.font = 'bold 14px Georgia, serif';
      g.textAlign = 'left';
      g.fillText('ENTRY PERMIT · NEPAL', 34, 84);
      // Target box.
      g.fillStyle = 'rgba(217, 163, 39, 0.25)';
      g.fillRect(centre - half, 100, half * 2, 76);
      g.strokeStyle = '#d9a327';
      g.lineWidth = 3;
      g.strokeRect(centre - half, 100, half * 2, 76);
      g.fillStyle = '#d9a327';
      g.fillRect(centre - 1, 100, 2, 76);
      for (const m of marks) stampMark(g, m.x, 138, m.ok);
      // The stamp.
      g.fillStyle = '#5b3420';
      g.fillRect(x - 6, 8, 12, 34);
      g.fillStyle = '#8e2f3f';
      g.fillRect(x - 26, 40, 52, 16);
    };
    drawPermit(W / 2, W / 2 - 80);
    await countdown(host);
    for (let attempt = 0; attempt < 3; attempt++) {
      const speed = 1.6 + attempt * 0.45 + ctx.difficulty * 0.35;
      const centre = W / 2 + (attempt - 1) * 80;
      let pressed = false;
      const press = (e: Event): void => {
        if (e instanceof KeyboardEvent && e.code !== 'Space') return;
        e.preventDefault();
        pressed = true;
      };
      window.addEventListener('keydown', press);
      c.addEventListener('pointerdown', press);
      let x = 40;
      await loop((_dt, t) => {
        x = W / 2 + Math.sin(t * speed * 1.7 + attempt) * (W / 2 - 40);
        drawPermit(x, centre);
        hud.setTime(1 - attempt / 3);
        return !pressed;
      });
      window.removeEventListener('keydown', press);
      c.removeEventListener('pointerdown', press);
      const off = Math.abs(x - centre);
      const ok = off <= half;
      const pts = ok ? Math.round(50 + 50 * (1 - off / half)) : 0;
      marks.push({ x, ok });
      score += pts;
      hud.setScore(score);
      stampMark(g, x, 138, ok);
      flash(host, ok ? `+${pts}` : 'Missed!', ok);
      await wait(650);
    }
    hint.remove();
    return { score, summary: `${marks.filter((m) => m.ok).length} of 3 stamps in the box` };
  },
};

function stampMark(g: CanvasRenderingContext2D, x: number, y: number, ok: boolean): void {
  g.save();
  g.translate(x, y);
  g.rotate(-0.12);
  g.strokeStyle = ok ? 'rgba(178, 40, 58, 0.85)' : 'rgba(90, 90, 90, 0.5)';
  g.lineWidth = 3;
  g.strokeRect(-30, -20, 60, 40);
  g.fillStyle = g.strokeStyle;
  g.font = 'bold 13px Arial';
  g.textAlign = 'center';
  g.fillText(ok ? 'PASSED' : 'VOID', 0, 5);
  g.restore();
}

function flash(host: HTMLElement, text: string, good: boolean): void {
  const f = el('div', `mg-flash ${good ? 'good' : 'bad'}`, text);
  host.append(f);
  setTimeout(() => f.remove(), 900);
}

// --- climb: Summit Sprint ----------------------------------------------------------------

const climb: MiniGame = {
  id: 'climb',
  title: 'Summit Sprint',
  icon: '🏔️',
  how: 'Alternate the ← and → keys (or tap the two buttons in turn) as fast as you can. Each step takes you higher. Eight seconds!',
  unit: 'steps',
  target: (d) => GAME_TARGETS.climb[d],
  async play(host, ctx) {
    const W = 520;
    const H = 280;
    const { g } = canvas(host, W, H);
    const hud = hudBar(host, 'steps');
    const pads = el('div', 'mg-pads');
    const left = el('button', 'mg-pad', '←');
    const right = el('button', 'mg-pad', '→');
    pads.append(left, right);
    host.append(pads);

    const climber = ctx.theme.climber ?? '🧗';
    const goal = ctx.theme.goal ?? '🚩';
    let steps = 0;
    let expect: 'L' | 'R' | null = null;
    let running = false;
    const press = (side: 'L' | 'R'): void => {
      if (!running) return;
      if (expect === null || side === expect) {
        steps++;
        expect = side === 'L' ? 'R' : 'L';
        hud.setScore(steps);
        (side === 'L' ? left : right).classList.add('hit');
        setTimeout(() => (side === 'L' ? left : right).classList.remove('hit'), 80);
      }
    };
    const key = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') press('L');
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') press('R');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    left.addEventListener('pointerdown', () => press('L'));
    right.addEventListener('pointerdown', () => press('R'));

    const draw = (t: number): void => {
      sky(g, W, H);
      // The mountain face.
      g.fillStyle = '#7d8696';
      g.beginPath();
      g.moveTo(60, H);
      g.lineTo(W / 2, 30);
      g.lineTo(W - 60, H);
      g.fill();
      g.fillStyle = '#f8fbff';
      g.beginPath();
      g.moveTo(W / 2 - 52, 100);
      g.lineTo(W / 2, 30);
      g.lineTo(W / 2 + 52, 100);
      g.lineTo(W / 2 + 20, 92);
      g.lineTo(W / 2, 104);
      g.lineTo(W / 2 - 22, 90);
      g.fill();
      // Rungs every few steps.
      const top = 50;
      const bottom = H - 30;
      const max = 56;
      for (let i = 0; i <= max; i += 4) {
        const y = bottom - ((bottom - top) * i) / max;
        g.fillStyle = i % 8 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
        g.fillRect(W / 2 - 40, y, 80, 2);
      }
      // Target line.
      const ty = bottom - ((bottom - top) * climb.target(ctx.difficulty)) / max;
      g.strokeStyle = '#d9a327';
      g.setLineDash([6, 5]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W / 2 - 80, ty);
      g.lineTo(W / 2 + 80, ty);
      g.stroke();
      g.setLineDash([]);
      g.font = '26px serif';
      g.textAlign = 'center';
      g.fillText(goal, W / 2 + 100, ty + 8);
      const y = bottom - ((bottom - top) * Math.min(steps, max)) / max;
      g.font = '38px serif';
      g.fillText(climber, W / 2 + Math.sin(t * 20) * (running ? 2 : 0), y + 10);
    };

    draw(0);
    await countdown(host);
    running = true;
    const DURATION = 8;
    await loop((_dt, t) => {
      hud.setTime(1 - t / DURATION);
      draw(t);
      return t < DURATION;
    });
    running = false;
    window.removeEventListener('keydown', key);
    pads.remove();
    return { score: steps, summary: `${steps} steps in 8 seconds` };
  },
};

// --- catch -------------------------------------------------------------------------------

const catchGame: MiniGame = {
  id: 'catch',
  title: 'Catch!',
  icon: '🧺',
  how: 'Move with the mouse or ← → keys. Catch the good things, dodge the bad ones (they cost 2). Twenty seconds.',
  unit: 'pts',
  target: (d) => GAME_TARGETS.catch[d],
  async play(host, ctx) {
    const W = 520;
    const H = 320;
    const { c, g } = canvas(host, W, H);
    const hud = hudBar(host, 'pts');
    const good = ctx.theme.good ?? ['🥟'];
    const bad = ctx.theme.bad ?? ['🌶️'];
    const catcher = ctx.theme.catcher ?? '🧺';
    const rnd = seeded(ctx.seed);

    let px = W / 2;
    let keyDir = 0;
    let score = 0;
    const items: { x: number; y: number; v: number; e: string; good: boolean; rot: number }[] = [];
    const pops: { x: number; y: number; t: number; text: string; good: boolean }[] = [];

    const move = (e: PointerEvent): void => {
      const r = c.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * W;
    };
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'ArrowLeft') keyDir = -1;
      else if (e.code === 'ArrowRight') keyDir = 1;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      if ((e.code === 'ArrowLeft' && keyDir < 0) || (e.code === 'ArrowRight' && keyDir > 0)) keyDir = 0;
    };
    c.addEventListener('pointermove', move);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    await countdown(host);
    const DURATION = 20;
    let spawn = 0;
    await loop((dt, t) => {
      px = Math.max(30, Math.min(W - 30, px + keyDir * 420 * dt));
      spawn -= dt;
      const rate = 0.55 - t * 0.012 - ctx.difficulty * 0.05;
      if (spawn <= 0) {
        spawn = rate;
        const isGood = rnd() > 0.28;
        items.push({
          x: 30 + rnd() * (W - 60),
          y: -20,
          v: 130 + rnd() * 70 + t * 6 + ctx.difficulty * 25,
          e: (isGood ? good : bad)[Math.floor(rnd() * (isGood ? good : bad).length)],
          good: isGood,
          rot: rnd() * 6,
        });
      }

      sky(g, W, H, '#cfe7f4', '#f6efdc');
      g.fillStyle = '#8fb35c';
      g.fillRect(0, H - 26, W, 26);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.v * dt;
        it.rot += dt * 2;
        g.save();
        g.translate(it.x, it.y);
        g.rotate(Math.sin(it.rot) * 0.3);
        g.font = '30px serif';
        g.fillText(it.e, 0, 0);
        g.restore();
        if (it.y > H - 62 && it.y < H - 26 && Math.abs(it.x - px) < 38) {
          score = Math.max(0, score + (it.good ? 1 : -2));
          pops.push({ x: it.x, y: it.y, t: 0, text: it.good ? '+1' : '−2', good: it.good });
          items.splice(i, 1);
          hud.setScore(score);
        } else if (it.y > H + 20) {
          items.splice(i, 1);
        }
      }
      g.font = '46px serif';
      g.fillText(catcher, px, H - 44);
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.t += dt;
        g.globalAlpha = Math.max(0, 1 - p.t);
        g.fillStyle = p.good ? '#2f8a4a' : '#c8342f';
        g.font = 'bold 20px Arial';
        g.fillText(p.text, p.x, p.y - p.t * 40);
        g.globalAlpha = 1;
        if (p.t > 1) pops.splice(i, 1);
      }
      hud.setTime(1 - t / DURATION);
      return t < DURATION;
    });
    c.removeEventListener('pointermove', move);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    return { score, summary: `${score} caught` };
  },
};

// --- snapshot -------------------------------------------------------------------------------

const snapshot: MiniGame = {
  id: 'snapshot',
  title: 'Snapshot',
  icon: '📷',
  how: 'Your subject is on the move. Click or press Space when it is inside the viewfinder — the closer to the centre, the better the photo. Three shots.',
  unit: 'pts',
  target: (d) => GAME_TARGETS.snapshot[d],
  async play(host, ctx) {
    const W = 520;
    const H = 320;
    const { c, g } = canvas(host, W, H);
    const hud = hudBar(host, 'pts');
    const subject = ctx.theme.subject ?? '🦏';
    const bg = new Image();
    if (ctx.card) bg.src = cardArt(ctx.card);
    const rnd = seeded(ctx.seed);
    const R = 62;
    const cx = W / 2;
    const cy = H / 2;
    const speed = 0.9 + ctx.difficulty * 0.35;
    const phase = rnd() * 10;

    let shot = false;
    const fire = (e: Event): void => {
      if (e instanceof KeyboardEvent && e.code !== 'Space') return;
      e.preventDefault();
      shot = true;
    };
    window.addEventListener('keydown', fire);
    c.addEventListener('pointerdown', fire);

    const posAt = (t: number): [number, number] => [
      cx + Math.sin(t * speed * 1.3 + phase) * (W * 0.42) + Math.sin(t * 3.1) * 14,
      cy + Math.sin(t * speed * 1.9 + phase * 2) * (H * 0.32),
    ];
    const drawScene = (sx: number, sy: number): void => {
      if (bg.complete && bg.naturalWidth) {
        g.filter = 'blur(2px) saturate(0.9)';
        g.drawImage(bg, 0, 0, W, H);
        g.filter = 'none';
      } else sky(g, W, H, '#9fcfd9', '#a7c46a');
      g.font = '54px serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(subject, sx, sy);
      // Viewfinder.
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 12, cy);
      g.lineTo(cx + 12, cy);
      g.moveTo(cx, cy - 12);
      g.lineTo(cx, cy + 12);
      g.stroke();
      for (const [x, y, dx, dy] of [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]]) {
        g.beginPath();
        g.moveTo(x, y + dy * 26);
        g.lineTo(x, y);
        g.lineTo(x + dx * 26, y);
        g.stroke();
      }
    };

    drawScene(...posAt(0));
    await countdown(host);
    let score = 0;
    let total = 0;
    const thumbs = el('div', 'mg-thumbs');
    host.append(thumbs);
    for (let s = 0; s < 3; s++) {
      shot = false;
      let sx = 0;
      let sy = 0;
      let clock = s * 3.7;
      await loop((dt) => {
        clock += dt;
        [sx, sy] = posAt(clock);
        drawScene(sx, sy);
        hud.setTime(1 - s / 3);
        return !shot && clock < s * 3.7 + 7;
      });
      const d = Math.hypot(sx - cx, sy - cy);
      const pts = d <= R ? Math.round(100 * (1 - d / R) ** 0.7) : 0;
      score += pts;
      total++;
      hud.setScore(score);
      // Shutter flash and a polaroid thumbnail.
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(0, 0, W, H);
      const thumb = el('div', 'mg-thumb');
      const tc = document.createElement('canvas');
      tc.width = 120;
      tc.height = 90;
      const tg = tc.getContext('2d')!;
      if (bg.complete && bg.naturalWidth) tg.drawImage(bg, cx - R * 1.6 - 0, cy - R * 1.2, R * 3.2, R * 2.4, 0, 0, 120, 90);
      tg.font = '40px serif';
      tg.textAlign = 'center';
      tg.textBaseline = 'middle';
      tg.fillText(subject, 60 + (sx - cx) * (120 / (R * 3.2)), 45 + (sy - cy) * (90 / (R * 2.4)));
      thumb.append(tc, el('span', '', pts ? `${pts}` : 'blurry'));
      thumbs.append(thumb);
      flash(host, pts >= 80 ? 'Perfect shot!' : pts ? `+${pts}` : 'Missed it!', pts > 0);
      await wait(600);
    }
    window.removeEventListener('keydown', fire);
    c.removeEventListener('pointerdown', fire);
    return { score, summary: `${total} photos, ${score} points` };
  },
};

// --- flags: Prayer Flag Memory ----------------------------------------------------------------

const LUNGTA = [
  { name: 'Sky', color: '#2b5fb8', key: '1' },
  { name: 'Air', color: '#f6f4ee', key: '2' },
  { name: 'Fire', color: '#d23a2e', key: '3' },
  { name: 'Water', color: '#2f9a4a', key: '4' },
  { name: 'Earth', color: '#f2c230', key: '5' },
];

const flags: MiniGame = {
  id: 'flags',
  title: 'Prayer Flag Memory',
  icon: '🎏',
  how: 'Watch the flags light up, then repeat the sequence by clicking them (or keys 1–5). It grows by one each round — one mistake and the round ends.',
  unit: 'flags',
  target: (d) => GAME_TARGETS.flags[d],
  async play(host, ctx) {
    const rnd = seeded(ctx.seed);
    const row = el('div', 'mg-flags');
    const status = el('div', 'mg-hint', 'Watch…');
    const hud = hudBar(host, ctx.theme.steps ?? 'flags');
    const buttons = LUNGTA.map((f, i) => {
      const b = el('button', 'mg-flag');
      b.style.setProperty('--flag', f.color);
      b.append(el('span', 'mg-flag-cloth'), el('span', 'mg-flag-key', String(i + 1)));
      row.append(b);
      return b;
    });
    host.append(row, status);
    hud.setTime(1);

    const light = async (i: number, ms: number): Promise<void> => {
      buttons[i].classList.add('lit');
      await wait(ms);
      buttons[i].classList.remove('lit');
    };

    const seq: number[] = [];
    let best = 0;
    for (let len = 3; len <= 10; len++) {
      while (seq.length < len) seq.push(Math.floor(rnd() * 5));
      status.textContent = 'Watch…';
      row.classList.add('watching');
      await wait(500);
      const gap = Math.max(240, 520 - len * 30 - ctx.difficulty * 40);
      for (const i of seq) {
        await light(i, gap);
        await wait(140);
      }
      row.classList.remove('watching');
      status.textContent = `Your turn — ${len} ${ctx.theme.steps ?? 'flags'}`;
      const ok = await new Promise<boolean>((resolve) => {
        let at = 0;
        const pick = (i: number): void => {
          void light(i, 180);
          if (i !== seq[at]) return finish(false);
          at++;
          if (at === seq.length) finish(true);
        };
        const clicks = buttons.map((b, i) => {
          const h = (): void => pick(i);
          b.addEventListener('click', h);
          return h;
        });
        const key = (e: KeyboardEvent): void => {
          const n = Number(e.key);
          if (n >= 1 && n <= 5) {
            e.preventDefault();
            pick(n - 1);
          }
        };
        window.addEventListener('keydown', key);
        function finish(result: boolean): void {
          buttons.forEach((b, i) => b.removeEventListener('click', clicks[i]));
          window.removeEventListener('keydown', key);
          resolve(result);
        }
      });
      if (!ok) {
        flash(host, 'Wrong flag!', false);
        await wait(700);
        break;
      }
      best = len;
      hud.setScore(best);
      flash(host, `${len} in a row!`, true);
      await wait(600);
    }
    return { score: best, summary: `remembered ${best} in a row` };
  },
};

// --- match: Pair Up ----------------------------------------------------------------------------

const match: MiniGame = {
  id: 'match',
  title: 'Pair Up',
  icon: '🃏',
  how: 'Flip two tiles at a time to find the six matching pairs before the time runs out. Pairs score 10, seconds left are a bonus.',
  unit: 'pts',
  target: (d) => GAME_TARGETS.match[d],
  async play(host, ctx) {
    const rnd = seeded(ctx.seed);
    const pool = shuffle(ctx.pool.filter((c) => c.deck !== 'wild'), rnd).slice(0, 6);
    const hud = hudBar(host, 'pts');
    const grid = el('div', 'mg-grid');
    host.append(grid);
    const tiles = shuffle([...pool, ...pool], rnd).map((card) => {
      const t = el('button', 'mg-tile');
      const face = el('div', 'mg-tile-face');
      const img = document.createElement('img');
      img.src = cardArt(card);
      img.alt = '';
      face.append(img);
      t.append(el('div', 'mg-tile-back'), face);
      t.dataset.id = card.id;
      grid.append(t);
      return t;
    });
    await countdown(host);

    const DURATION = 35;
    let pairs = 0;
    let open: HTMLButtonElement[] = [];
    let lock = false;
    const onClick = async (t: HTMLButtonElement): Promise<void> => {
      if (lock || t.classList.contains('up') || t.classList.contains('done')) return;
      t.classList.add('up');
      open.push(t);
      if (open.length < 2) return;
      lock = true;
      const [a, b] = open;
      if (a.dataset.id === b.dataset.id) {
        a.classList.add('done');
        b.classList.add('done');
        pairs++;
        hud.setScore(pairs * 10);
      } else {
        await wait(650);
        a.classList.remove('up');
        b.classList.remove('up');
      }
      open = [];
      lock = false;
    };
    tiles.forEach((t) => t.addEventListener('click', () => void onClick(t)));
    let left = DURATION;
    await loop((_dt, t) => {
      left = Math.max(0, DURATION - t);
      hud.setTime(left / DURATION);
      return left > 0 && pairs < pool.length;
    });
    const bonus = pairs === pool.length ? Math.round(left) : 0;
    const score = pairs * 10 + bonus;
    hud.setScore(score);
    return { score, summary: `${pairs} of ${pool.length} pairs${bonus ? `, ${bonus}s to spare` : ''}` };
  },
};

// --- quiz: Guide's Quiz ----------------------------------------------------------------------

type Question = { prompt: string; image?: string; options: string[]; answer: number };

/**
 * Questions are generated from the decks themselves, so every answer is
 * whatever the card says — no separate fact list to drift out of date.
 */
function makeQuestions(ctx: GameContext, rnd: () => number): Question[] {
  const facts = ctx.pool.filter((c) => c.category === 'photograph' || c.category === 'souvenir');
  const home = ctx.card?.deck && ctx.card.deck !== 'wild' ? ctx.card.deck : null;
  const local = home ? facts.filter((c) => c.deck === home) : facts;
  const questions: Question[] = [];
  const used = new Set<string>();

  const pick = (list: Card[]): Card => {
    const fresh = list.filter((c) => !used.has(c.id));
    const c = (fresh.length ? fresh : list)[Math.floor(rnd() * (fresh.length ? fresh : list).length)];
    used.add(c.id);
    return c;
  };
  const optionsFor = (right: Card, from: Card[]): { options: string[]; answer: number } => {
    const wrong = shuffle(from.filter((c) => c.title !== right.title), rnd).slice(0, 3).map((c) => c.title);
    const options = shuffle([right.title, ...wrong], rnd);
    return { options, answer: options.indexOf(right.title) };
  };

  // 1. Name the picture.
  {
    const right = pick(local.length ? local : facts);
    questions.push({ prompt: 'Your guide points ahead. What are you looking at?', image: cardArt(right), ...optionsFor(right, facts) });
  }
  // 2. Which place does this describe?
  {
    const right = pick(local.length > 1 ? local : facts);
    const words = right.title.split(/\s+/).filter((w) => w.length > 3);
    let blurb = right.blurb;
    for (const w of words) blurb = blurb.replace(new RegExp(w.replace(/[^\w]/g, ''), 'gi'), '▢▢▢');
    questions.push({ prompt: `“${blurb}”`, ...optionsFor(right, facts) });
  }
  // 3. Which of these is in a given region?
  {
    const decks = [...new Set(facts.map((c) => c.deck))];
    const region = home ?? decks[Math.floor(rnd() * decks.length)];
    const inRegion = facts.filter((c) => c.deck === region);
    const right = pick(inRegion);
    const elsewhere = facts.filter((c) => c.deck !== region);
    questions.push({
      prompt: `Which of these would you find in ${SECTION_LABEL[region as keyof typeof SECTION_LABEL] ?? region}?`,
      ...optionsFor(right, elsewhere),
    });
  }
  return questions;
}

const quiz: MiniGame = {
  id: 'quiz',
  title: "Guide's Quiz",
  icon: '🧭',
  how: 'Your guide asks three questions about Nepal. Pick the right answer — 100 points each, plus a bonus for answering quickly.',
  unit: 'pts',
  target: (d) => GAME_TARGETS.quiz[d],
  async play(host, ctx) {
    const rnd = seeded(ctx.seed);
    const qs = makeQuestions(ctx, rnd);
    const hud = hudBar(host, 'pts');
    const box = el('div', 'mg-quiz');
    host.append(box);
    let score = 0;
    let right = 0;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      box.replaceChildren();
      box.append(el('div', 'mg-q-count', `Question ${i + 1} of ${qs.length}`));
      if (q.image) {
        const img = document.createElement('img');
        img.className = 'mg-q-img';
        img.src = q.image;
        box.append(img);
      }
      box.append(el('div', 'mg-q-prompt', q.prompt));
      const opts = el('div', 'mg-q-opts');
      box.append(opts);
      const LIMIT = 12;
      const start = performance.now();
      const chosen = await new Promise<number>((resolve) => {
        let done = false;
        const buttons = q.options.map((o, k) => {
          const b = el('button', 'mg-q-opt');
          b.append(el('span', 'mg-q-key', String(k + 1)), document.createTextNode(o));
          b.addEventListener('click', () => finish(k));
          opts.append(b);
          return b;
        });
        const key = (e: KeyboardEvent): void => {
          const n = Number(e.key);
          if (n >= 1 && n <= q.options.length) {
            e.preventDefault();
            finish(n - 1);
          }
        };
        window.addEventListener('keydown', key);
        void loop(() => {
          const f = 1 - (performance.now() - start) / 1000 / LIMIT;
          hud.setTime(f);
          if (f <= 0) finish(-1);
          return !done;
        });
        function finish(k: number): void {
          if (done) return;
          done = true;
          window.removeEventListener('keydown', key);
          buttons.forEach((b, j) => {
            b.disabled = true;
            if (j === q.answer) b.classList.add('right');
            else if (j === k) b.classList.add('wrong');
          });
          resolve(k);
        }
      });
      const secs = (performance.now() - start) / 1000;
      if (chosen === q.answer) {
        const bonus = Math.max(0, Math.round(30 * (1 - secs / LIMIT)));
        score += 100 + bonus;
        right++;
        flash(host, `Correct! +${100 + bonus}`, true);
      } else {
        flash(host, chosen < 0 ? "Time's up!" : 'Not quite!', false);
      }
      hud.setScore(score);
      await wait(1300);
    }
    return { score, summary: `${right} of ${qs.length} right` };
  },
};

export const GAMES: Record<string, MiniGame> = { gate, climb, catch: catchGame, snapshot, flags, match, quiz };
