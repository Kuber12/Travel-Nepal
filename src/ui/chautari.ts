/**
 * The Chautari — friendly games between turns. Pick a game, pick who plays,
 * and play: score races for up to four, Bagh-Chal and tug of war for two.
 * Winners get a medal; medals are just for fun and never touch the score.
 *
 * On one device everything runs here: people take turns at the keyboard and
 * computer travelers play themselves. Online, the server runs the match — it
 * starts it, collects scores, referees Bagh-Chal, owns the tug-of-war rope
 * and hands out the medals — and every screen draws what the server says.
 */

import { aiMove, applyBagh, boardLines, GOATS, legalMoves, newBagh, pointRC, TIGER_WIN_CAPTURES, type BaghMove, type BaghState, type Side } from '../fun/baghchal.ts';
import { FUN_GAMES, funGame, raceWinners, type FunGame, type FunPublic } from '../fun/chautari.ts';
import { newTug, pullTug, TUG_GOAL, TUG_TIME, type TugState } from '../fun/tug.ts';
import type { GameState, Player } from '../engine/types.ts';
import type { NetClient } from '../net/client.ts';
import { avatar } from './avatar.ts';
import { GAMES } from './minigames/games.ts';
import { botScore } from './minigames/pick.ts';

export type Chautari = {
  /** True while a Chautari panel is up (or an online match is running). */
  isOpen(): boolean;
  /** Can a new friendly game start right now? */
  canOpen(): boolean;
  openMenu(): void;
  /** Online: the server's view of the room's match (null when there is none). */
  onServer(fun: FunPublic | null): void;
  /** Online: travelers who have dropped off, so they aren't invited. */
  setAway(seats: number[]): void;
};

export type ChautariDeps = {
  root: HTMLElement;
  state: () => GameState;
  /** Something else (a card, a mini-game, an animation) has the table. */
  blocked: () => boolean;
  /** One device: hand out medals. Online the server does this. */
  award: (game: string, winners: number[]) => void;
  net: NetClient | null;
  me: number | null;
  /** Called when the Chautari opens or closes, so the HUD can update. */
  changed: () => void;
};

// --- small DOM helpers ---------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolves on a click, or on Enter while the button is on screen. */
function waitClick(b: HTMLButtonElement): Promise<void> {
  return new Promise((resolve) => {
    const key = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' && b.isConnected) {
        e.preventDefault();
        done();
      }
    };
    const done = (): void => {
      window.removeEventListener('keydown', key, true);
      b.removeEventListener('click', done);
      resolve();
    };
    b.addEventListener('click', done);
    window.addEventListener('keydown', key, true);
  });
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function who(p: Player, size = 26): HTMLElement {
  const chip = el('span', 'ch-who');
  chip.append(avatar(p.color, p.hat, size), el('span', '', p.name));
  if (p.bot) chip.append(el('span', 'ch-bot', '🤖'));
  return chip;
}

// --- Bagh-Chal board ----------------------------------------------------------------------

type BaghView = { root: HTMLElement; update(s: BaghState, canMove: boolean): void };

/** The 5×5 board: lines drawn in SVG, points as buttons, a click-to-move UI. */
function baghBoard(onMove: (m: BaghMove) => void): BaghView {
  const root = el('div', 'bc-board');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.classList.add('bc-lines');
  const xy = (p: number): [number, number] => {
    const [r, c] = pointRC(p);
    return [10 + c * 20, 10 + r * 20];
  };
  for (const [a, b] of boardLines()) {
    const line = document.createElementNS(svgNS, 'line');
    const [x1, y1] = xy(a);
    const [x2, y2] = xy(b);
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    svg.append(line);
  }
  root.append(svg);

  let state: BaghState = newBagh();
  let live = false;
  let picked: number | null = null;
  const points = Array.from({ length: 25 }, (_, p) => {
    const b = el('button', 'bc-point');
    b.type = 'button';
    const [x, y] = xy(p);
    b.style.left = `${x}%`;
    b.style.top = `${y}%`;
    const [r, c] = pointRC(p);
    b.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
    b.addEventListener('click', () => click(p));
    root.append(b);
    return b;
  });

  const moves = (): BaghMove[] => (live ? legalMoves(state) : []);

  function click(p: number): void {
    if (!live) return;
    const legal = moves();
    if (state.turn === 'G' && state.placed < GOATS) {
      const m = legal.find((x) => x.to === p);
      if (m) onMove(m);
      return;
    }
    if (picked !== null) {
      const m = legal.find((x) => x.from === picked && x.to === p);
      if (m) {
        picked = null;
        onMove(m);
        return;
      }
    }
    picked = legal.some((x) => x.from === p) ? p : null;
    paint();
  }

  function paint(): void {
    const legal = moves();
    const targets = new Set(
      state.turn === 'G' && state.placed < GOATS ? legal.map((m) => m.to) : legal.filter((m) => m.from === picked).map((m) => m.to),
    );
    const movable = new Set(legal.map((m) => m.from).filter((f): f is number => f !== null));
    points.forEach((b, p) => {
      const piece = state.board[p];
      b.className = 'bc-point';
      b.textContent = piece === 'T' ? '🐅' : piece === 'G' ? '🐐' : '';
      if (piece === 'T') b.classList.add('tiger');
      if (piece === 'G') b.classList.add('goat');
      if (targets.has(p)) b.classList.add('target');
      if (movable.has(p)) b.classList.add('movable');
      if (picked === p) b.classList.add('picked');
      if (state.last && (state.last.to === p || state.last.from === p)) b.classList.add('last');
      if (state.last?.capture === p) b.classList.add('captured');
      b.disabled = !live || (!targets.has(p) && !movable.has(p));
    });
  }

  return {
    root,
    update(s, canMove) {
      if (s !== state) picked = null;
      state = s;
      live = canMove && !s.winner;
      paint();
    },
  };
}

function baghStatus(s: BaghState, tiger: Player, goat: Player): HTMLElement {
  const box = el('div', 'bc-status');
  const side = s.turn === 'T' ? tiger : goat;
  const turn = el('div', 'bc-turn');
  if (!s.winner) {
    turn.append(el('span', '', s.turn === 'T' ? '🐅 Tigers to move — ' : s.placed < GOATS ? '🐐 Goats: place a goat — ' : '🐐 Goats to move — '), who(side, 22));
  }
  const tally = el('div', 'bc-tally');
  tally.append(
    el('span', '', `🐐 placed ${s.placed}/${GOATS}`),
    el('span', '', `🍖 captured ${s.captured}/${TIGER_WIN_CAPTURES}`),
  );
  box.append(turn, tally);
  return box;
}

function baghVerdict(s: BaghState): string {
  if (s.winner === 'T') return s.captured >= TIGER_WIN_CAPTURES ? 'The tigers caught five goats!' : 'The goats were left with nowhere to go.';
  if (s.winner === 'G') return 'The goats hemmed in every tiger!';
  return 'Nobody could break through — a draw.';
}

// --- tug-of-war arena ------------------------------------------------------------------------

type TugView = { root: HTMLElement; draw(pos: number, t: number): void };

/** A tug-of-war puller seen side-on: feet at (x, y), leaning away from the middle. */
function puller(g: CanvasRenderingContext2D, x: number, y: number, dir: -1 | 1, color: string, lean: number): void {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  g.rotate(lean);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Legs braced, front foot dug in toward the middle.
  g.strokeStyle = '#4a4636';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, -30);
  g.lineTo(-12, 0);
  g.moveTo(0, -30);
  g.lineTo(10, -2);
  g.stroke();
  // Body in the traveler's colour.
  g.strokeStyle = color;
  g.lineWidth = 15;
  g.beginPath();
  g.moveTo(0, -30);
  g.lineTo(0, -62);
  g.stroke();
  // Arms reaching for the rope.
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, -56);
  g.lineTo(-22, -32);
  g.stroke();
  g.fillStyle = '#e8c39e';
  g.beginPath();
  g.arc(-23, -31, 4, 0, Math.PI * 2);
  g.fill();
  // Head, hair and a determined face.
  g.beginPath();
  g.arc(0, -75, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a1f16';
  g.beginPath();
  g.arc(0, -78, 11, Math.PI * 1.05, Math.PI * 1.95);
  g.fill();
  g.beginPath();
  g.arc(-5, -75, 1.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function tugArena(left: Player, right: Player): TugView {
  const W = 520;
  const H = 210;
  const root = el('div', 'tug-arena');
  const c = el('canvas', 'mg-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  root.append(c);
  const span = 170;
  let shown = 0;
  return {
    root,
    draw(pos, t) {
      shown += (pos - shown) * 0.35;
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#bfe2f2');
      sky.addColorStop(1, '#f2ead2');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      // Distant hills and the village green.
      g.fillStyle = '#a8c47a';
      g.beginPath();
      g.moveTo(0, 120);
      for (let x = 0; x <= W; x += 26) g.lineTo(x, 110 - Math.sin(x * 0.018 + 1) * 18);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.fill();
      g.fillStyle = '#7fa64a';
      g.fillRect(0, 150, W, H - 150);
      // The mud in the middle.
      g.fillStyle = '#8a6a44';
      g.beginPath();
      g.ellipse(W / 2, 168, 70, 12, 0, 0, Math.PI * 2);
      g.fill();
      // The two lines.
      for (const [x, p] of [[W / 2 - span, left], [W / 2 + span, right]] as const) {
        g.fillStyle = p.color;
        g.fillRect(x - 3, 140, 6, 40);
      }
      // The rope, with its red ribbon.
      const rx = W / 2 + (shown / TUG_GOAL) * span;
      g.strokeStyle = '#a07a44';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(30, 132);
      g.quadraticCurveTo(W / 2, 140 + Math.sin(t * 9) * 2, W - 30, 132);
      g.stroke();
      g.strokeStyle = 'rgba(80, 50, 20, 0.4)';
      g.lineWidth = 2;
      for (let x = 34; x < W - 30; x += 10) {
        g.beginPath();
        g.moveTo(x, 129);
        g.lineTo(x + 5, 136);
        g.stroke();
      }
      g.fillStyle = '#c8342f';
      g.beginPath();
      g.moveTo(rx, 132);
      g.lineTo(rx - 9, 160);
      g.lineTo(rx + 9, 160);
      g.fill();
      // The pullers, heels dug in, leaning back on the rope.
      const effort = Math.sin(t * 14) * 0.04;
      puller(g, 70 + Math.min(0, shown) * 1.2, 160, -1, left.color, 0.42 + effort);
      puller(g, W - 70 + Math.max(0, shown) * 1.2, 160, 1, right.color, 0.42 - effort);
      g.font = 'bold 15px "Avenir Next", system-ui, sans-serif';
      g.fillStyle = '#2a1f16';
      g.textBaseline = 'alphabetic';
      g.fillText(left.name, 60, 34);
      g.fillText(right.name, W - 60, 34);
      // The clock — or, online, the count-in before the whistle.
      g.font = 'bold 26px Georgia, serif';
      g.fillStyle = '#8e2f3f';
      g.fillText(`${Math.max(0, Math.ceil(TUG_TIME - Math.max(0, t)))}`, W / 2, 40);
      if (t < 0) {
        g.font = 'bold 84px Georgia, serif';
        g.fillStyle = '#8e2f3f';
        g.strokeStyle = '#fff';
        g.lineWidth = 6;
        g.strokeText(String(Math.ceil(-t)), W / 2, 130);
        g.fillText(String(Math.ceil(-t)), W / 2, 130);
      }
    },
  };
}

// --- the Chautari ------------------------------------------------------------------------------

export function createChautari(deps: ChautariDeps): Chautari {
  const { root, net } = deps;
  let open = false;
  /** Online: the match the server last told us about. */
  let match: FunPublic | null = null;
  /** Online: a race round being played on this screen right now. */
  let playingRound: number | null = null;
  /** Online: rounds already played here, so a repeat message can't start one twice. */
  const played = new Set<number>();
  let tugInput: { taps: number; timer: number; key: (e: KeyboardEvent) => void } | null = null;
  let tugView: { id: number; view: TugView; clock: number; raf: number } | null = null;
  let baghView: { id: number; view: BaghView; status: HTMLElement } | null = null;
  /** Online: seats that have dropped off. */
  const awaySeats = new Set<number>();

  const players = (): Player[] => deps.state().players;
  const player = (id: number): Player => players().find((p) => p.id === id)!;

  function shell(kicker: string, title: string, icon = '🌳'): HTMLElement {
    // Only the first screen lifts in; moving between screens must not flicker.
    const steady = open && root.childElementCount > 0;
    if (!open) {
      open = true;
      deps.changed();
    }
    root.classList.add('open');
    root.replaceChildren();
    const panel = el('div', `mg-panel ch-panel${steady ? ' steady' : ''}`);
    const head = el('div', 'mg-head');
    head.append(el('div', 'mg-icon ch-icon', icon));
    const words = el('div');
    words.append(el('div', 'mg-kicker', kicker), el('h2', 'mg-title', title));
    head.append(words);
    panel.append(head);
    root.append(panel);
    return panel;
  }

  function close(): void {
    root.classList.remove('open');
    root.replaceChildren();
    stopTug();
    baghView = null;
    if (open) {
      open = false;
      deps.changed();
    }
  }

  function stopTug(): void {
    if (tugInput) {
      window.clearInterval(tugInput.timer);
      window.removeEventListener('keydown', tugInput.key);
    }
    tugInput = null;
    if (tugView) cancelAnimationFrame(tugView.raf);
    tugView = null;
  }

  function medalStrip(): HTMLElement {
    const strip = el('div', 'ch-medals');
    for (const p of players()) {
      const m = el('span', 'ch-medal');
      m.append(avatar(p.color, p.hat, 24), el('span', '', p.name), el('b', '', `🏅 ${p.medals ?? 0}`));
      strip.append(m);
    }
    return strip;
  }

  // --- menu ---

  function menu(): void {
    const panel = shell('Friendly games · just for fun', 'The Chautari');
    panel.append(
      el('p', 'ch-lede', 'Put your packs down under the pipal tree and play each other. Winners get a medal 🏅 — medals are just for fun and never count toward the score.'),
      medalStrip(),
    );
    const grid = el('div', 'ch-grid');
    for (const game of FUN_GAMES) {
      const tile = el('button', 'ch-game');
      tile.type = 'button';
      tile.append(
        el('span', 'ch-game-icon', game.icon),
        el('span', 'ch-game-title', game.title),
        el('span', 'ch-game-blurb', game.blurb),
        el('span', 'ch-game-count', game.max === 2 ? '2 players · head to head' : `1–${game.max} players`),
      );
      tile.addEventListener('click', () => pickPlayers(game));
      grid.append(tile);
    }
    panel.append(grid);
    const foot = el('div', 'mg-foot');
    foot.append(button('Back to the journey', close, 'ghost'));
    panel.append(foot);
  }

  /** Who plays: everyone ticked, in order. Two-player games show who takes which side. */
  function pickPlayers(game: FunGame): void {
    const panel = shell(game.max === 2 ? 'Head to head' : 'Who’s playing?', game.title, game.icon);
    panel.append(el('p', 'ch-lede', game.blurb));
    const everyone = players().filter((p) => !net || p.id === deps.me || !p.bot);
    const canPlay = (p: Player): boolean => !net || p.id === deps.me || !awaySeats.has(p.id);
    let chosen: number[] = [];
    if (game.max === 2) {
      const first = net ? deps.me! : everyone.find((p) => !p.bot)?.id ?? everyone[0].id;
      const second = everyone.find((p) => p.id !== first && canPlay(p))?.id;
      chosen = second === undefined ? [first] : [first, second];
    } else {
      chosen = everyone.filter(canPlay).map((p) => p.id);
    }
    const error = el('div', 'lobby-error');
    const list = el('div', 'ch-pick');

    const draw = (): void => {
      list.replaceChildren();
      for (const p of everyone) {
        const row = el('label', `ch-pick-row${chosen.includes(p.id) ? ' on' : ''}`);
        const box = el('input');
        box.type = 'checkbox';
        box.checked = chosen.includes(p.id);
        box.disabled = !canPlay(p);
        box.setAttribute('aria-label', `${p.name} plays`);
        box.addEventListener('change', () => {
          if (box.checked) {
            chosen = game.max === 2 && chosen.length >= 2 ? [chosen[0], p.id] : [...chosen, p.id];
          } else chosen = chosen.filter((id) => id !== p.id);
          draw();
        });
        row.append(box, who(p, 30));
        if (!canPlay(p)) row.append(el('span', 'ch-note', 'away'));
        const side = chosen.indexOf(p.id);
        if (game.kind === 'baghchal' && side >= 0) row.append(el('span', 'ch-side', side === 0 ? '🐅 Tigers' : '🐐 Goats'));
        if (game.kind === 'tug' && side >= 0) row.append(el('span', 'ch-side', side === 0 ? '◀ Left end' : 'Right end ▶'));
        list.append(row);
      }
    };
    draw();
    panel.append(list);
    if (game.max === 2) {
      panel.append(
        button('⇄ Swap sides', () => {
          chosen = [...chosen].reverse();
          draw();
        }, 'ghost ch-swap'),
      );
    }
    panel.append(error);
    const foot = el('div', 'mg-foot ch-foot');
    foot.append(
      button('← Games', menu, 'ghost'),
      button('Play!', () => {
        if (chosen.length < game.min) {
          error.textContent = game.max === 2 ? 'Pick two players.' : 'Pick at least one player.';
          return;
        }
        if (net) {
          net.send({ t: 'fun-open', game: game.id, participants: chosen });
          shell('Calling the players…', game.title, game.icon).append(el('p', 'ch-lede mg-pending', 'Asking the room…'));
          return;
        }
        void playLocal(game, chosen.map(player));
      }),
    );
    panel.append(foot);
  }

  // --- one device ---

  async function playLocal(game: FunGame, crew: Player[]): Promise<void> {
    if (game.kind === 'race') await localRace(game, crew);
    else if (game.kind === 'baghchal') await localBagh(game, crew[0], crew[1]);
    else await localTug(game, crew[0], crew[1]);
  }

  /** After a local game: the result, and what next. */
  async function localResult(game: FunGame, crew: Player[], winners: number[], lines: HTMLElement, headline?: string): Promise<void> {
    if (winners.length > 0 && crew.length > 1) deps.award(game.title, winners);
    const panel = shell('Chautari · result', game.title, game.icon);
    const names = winners.map((id) => player(id).name).join(' & ');
    const res = el('div', `mg-result ${winners.length ? 'win' : 'lose'}`);
    res.append(
      el('div', 'mg-result-icon', winners.length ? '🏅' : headline ? '🏳️' : crew.length > 1 ? '🤝' : '🎯'),
      el('h2', '', winners.length ? `${names} ${winners.length > 1 ? 'share' : 'wins'} a medal!` : headline ?? (crew.length > 1 ? 'A friendly draw' : 'Practice round done')),
      lines,
      el('p', 'ch-note', 'Just for fun — medals never count toward the score.'),
    );
    panel.append(res, medalStrip());
    const foot = el('div', 'mg-foot ch-foot');
    foot.append(
      button('Back to the journey', close, 'ghost'),
      button('Other games', menu, 'ghost'),
      button('Play again', () => void playLocal(game, crew)),
    );
    panel.append(foot);
  }

  async function localRace(game: FunGame, crew: Player[]): Promise<void> {
    const play = game.play!;
    const mini = GAMES[play.game];
    // Everyone plays the very same round, so it's a fair race.
    const seed = (Math.random() * 0x7fffffff) | 0;
    const scores: Array<{ player: Player; score: number; summary: string }> = [];
    for (const p of crew) {
      if (p.bot) {
        const panel = shell(`Chautari · ${game.title}`, `🤖 ${p.name} is playing…`, game.icon);
        panel.append(el('p', 'ch-lede mg-pending', '● ● ●'));
        await wait(1300);
        scores.push({ player: p, score: botScore(play.game, 1, seed + p.id * 977), summary: 'computer' });
        continue;
      }
      if (crew.length > 1) {
        const panel = shell(`Chautari · ${game.title}`, `${p.name}, you’re up`, game.icon);
        const ready = el('div', 'mg-ready');
        ready.append(avatar(p.color, p.hat, 72));
        const best = scores.length ? Math.max(...scores.map((s) => s.score)) : null;
        ready.append(el('p', '', best === null ? mini.how : `Score to beat: ${best} ${mini.unit}. ${mini.how}`));
        const go = button(`Ready, ${p.name}!`, () => {});
        ready.append(go);
        panel.append(ready);
        await waitClick(go);
      }
      const panel = shell(`Chautari · ${game.title}`, p.name, game.icon);
      const stage = el('div', 'mg-stage');
      panel.append(stage);
      const run = await mini.play(stage, {
        difficulty: 1,
        playerName: p.name,
        playerColor: p.color,
        pool: Object.values(deps.state().cards),
        theme: play.theme ?? {},
        seed,
      });
      await wait(450);
      scores.push({ player: p, ...run });
    }
    const winners = raceWinners(scores.map((s) => ({ seat: s.player.id, score: s.score })));
    await localResult(game, crew, winners, scoreTable(scores.map((s) => ({ ...s, unit: mini.unit })), winners));
  }

  async function localBagh(game: FunGame, tiger: Player, goat: Player): Promise<void> {
    let s = newBagh();
    const rnd = seeded((Math.random() * 0x7fffffff) | 0);
    const panel = shell(`Chautari · ${game.title}`, `${tiger.name} 🐅 vs 🐐 ${goat.name}`, game.icon);
    let resolveMove: ((m: BaghMove) => void) | null = null;
    const view = baghBoard((m) => resolveMove?.(m));
    const statusSlot = el('div');
    panel.append(statusSlot, view.root, el('p', 'ch-note', 'Click a piece, then where it goes. Goats: click an empty point to place one.'));
    const foot = el('div', 'mg-foot ch-foot');
    let quit = false;
    foot.append(button('Give up', () => {
      quit = true;
      resolveMove?.({ from: null, to: -1 });
    }, 'ghost'));
    panel.append(foot);

    while (!s.winner && !quit) {
      const side: Side = s.turn;
      const mover = side === 'T' ? tiger : goat;
      statusSlot.replaceChildren(baghStatus(s, tiger, goat));
      view.update(s, !mover.bot);
      let move: BaghMove | null;
      if (mover.bot) {
        await wait(650);
        move = aiMove(s, rnd);
      } else {
        move = await new Promise<BaghMove>((r) => (resolveMove = r));
        resolveMove = null;
      }
      if (quit || !move) break;
      s = applyBagh(s, move);
    }
    if (!root.isConnected || !open) return;
    const winners = quit ? [] : s.winner === 'T' ? [tiger.id] : s.winner === 'G' ? [goat.id] : [];
    view.update(s, false);
    statusSlot.replaceChildren(baghStatus(s, tiger, goat));
    await wait(quit ? 0 : 900);
    const lines = el('div', 'ch-lines');
    lines.append(el('p', '', quit ? 'Nobody wins a medal for an unfinished game.' : baghVerdict(s)));
    await localResult(game, [tiger, goat], winners, lines, quit ? 'Game abandoned' : undefined);
  }

  async function localTug(game: FunGame, left: Player, right: Player): Promise<void> {
    const panel = shell(`Chautari · ${game.title}`, `${left.name} vs ${right.name}`, game.icon);
    const arena = tugArena(left, right);
    const keys = el('div', 'tug-keys');
    const padL = button(left.bot ? `🤖 ${left.name}` : `◀ ${left.name} · key A`, () => taps[0]++, 'mg-pad tug-pad');
    const padR = button(right.bot ? `${right.name} 🤖` : `${right.name} · key L ▶`, () => taps[1]++, 'mg-pad tug-pad');
    padL.disabled = Boolean(left.bot);
    padR.disabled = Boolean(right.bot);
    padL.style.setProperty('--pad', left.color);
    padR.style.setProperty('--pad', right.color);
    keys.append(padL, padR);
    panel.append(arena.root, keys, el('p', 'ch-note', left.bot || right.bot ? 'Hammer your key as fast as you can!' : 'Sharing a keyboard: left player hammers A, right player hammers L. On a touch screen, tap your button.'));
    const taps = [0, 0];
    const key = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.code === 'KeyA' && !left.bot) taps[0]++;
      else if (e.code === 'KeyL' && !right.bot) taps[1]++;
      else return;
      e.preventDefault();
    };
    arena.draw(0, 0);
    await countdownIn(panel);
    window.addEventListener('keydown', key);
    let s: TugState = newTug();
    const botRate = [6.5 + Math.random() * 2.5, 6.5 + Math.random() * 2.5];
    const botCarry = [0, 0];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const frame = (now: number): void => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        for (const [i, p] of [[0, left], [1, right]] as const) {
          if (!p.bot) continue;
          botCarry[i] += botRate[i] * dt * (0.8 + Math.random() * 0.4);
          while (botCarry[i] >= 1) {
            taps[i]++;
            botCarry[i]--;
          }
        }
        s = pullTug(s, taps[0], taps[1], dt);
        taps[0] = taps[1] = 0;
        arena.draw(s.pos, s.t);
        if (s.winner !== null || !open) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    window.removeEventListener('keydown', key);
    if (!open) return;
    await wait(700);
    const winners = s.winner === 0 ? [left.id] : s.winner === 1 ? [right.id] : [];
    const lines = el('div', 'ch-lines');
    lines.append(el('p', '', s.winner === 'draw' ? 'Dead level when the whistle blew!' : `${(s.winner === 0 ? left : right).name} dragged the rope over the line.`));
    await localResult(game, [left, right], winners, lines);
  }

  // --- online -------------------------------------------------------------------

  function onServer(fun: FunPublic | null): void {
    const previous = match;
    match = fun;
    if (!fun) {
      // The match is over (its result stays up until dismissed) or was never ours.
      if (previous && previous.stage !== 'done' && playingRound === null) close();
      return;
    }
    if (playingRound !== null && fun.id === playingRound && fun.stage === 'play') return; // mid-round: keep playing
    renderOnline(fun);
  }

  function renderOnline(fun: FunPublic): void {
    const game = funGame(fun.game);
    if (!game) return;
    const me = deps.me!;
    const mine = fun.participants.includes(me);
    if (fun.stage !== 'play') stopTug();
    if (fun.stage !== 'play' || game.kind !== 'baghchal') baghView = null;

    if (fun.stage === 'ready') {
      const panel = shell('Chautari · friendly game', game.title, game.icon);
      panel.append(el('p', 'ch-lede', `${player(fun.host).name} has called a game of ${game.title}. ${game.blurb}`));
      const list = el('div', 'ch-pick');
      fun.participants.forEach((id, i) => {
        const row = el('div', 'ch-pick-row on');
        row.append(who(player(id), 30));
        if (game.kind === 'baghchal') row.append(el('span', 'ch-side', i === 0 ? '🐅 Tigers' : '🐐 Goats'));
        if (game.kind === 'tug') row.append(el('span', 'ch-side', i === 0 ? '◀ Left end' : 'Right end ▶'));
        row.append(el('span', `ch-state${fun.ready.includes(id) ? ' ok' : fun.out.includes(id) ? ' out' : ''}`, fun.ready.includes(id) ? 'ready' : fun.out.includes(id) ? 'sat out' : 'deciding…'));
        list.append(row);
      });
      panel.append(list);
      const foot = el('div', 'mg-foot ch-foot');
      if (mine && !fun.ready.includes(me) && !fun.out.includes(me)) {
        foot.append(
          button('Sit this one out', () => net!.send({ t: 'fun-ready', join: false }), 'ghost'),
          button('Join in!', () => net!.send({ t: 'fun-ready', join: true })),
        );
      } else {
        foot.append(el('span', 'ch-note mg-pending', 'Waiting for everyone to get ready…'));
        if (fun.host === me) foot.append(button('Call it off', () => net!.send({ t: 'fun-cancel' }), 'ghost'));
      }
      panel.append(foot);
      return;
    }

    if (fun.stage === 'play') {
      if (game.kind === 'race') {
        if (mine && !played.has(fun.id)) void playOnlineRound(fun, game);
        else racePanel(fun, game);
      } else if (game.kind === 'baghchal') onlineBagh(fun, game);
      else onlineTug(fun, game);
      return;
    }

    // Done.
    stopTug();
    const panel = shell('Chautari · result', game.title, game.icon);
    const winners = fun.winners ?? [];
    const res = el('div', `mg-result ${winners.length ? 'win' : 'lose'}`);
    const names = winners.map((id) => player(id).name).join(' & ');
    res.append(
      el('div', 'mg-result-icon', winners.length ? '🏅' : '🤝'),
      el('h2', '', winners.length ? `${names} ${winners.length > 1 ? 'share' : 'wins'} a medal!` : fun.note ?? 'No medal this time'),
    );
    if (game.kind === 'race' && fun.scores.length) {
      const mini = GAMES[game.play!.game];
      res.append(scoreTable(fun.scores.map((s) => ({ player: player(s.seat), score: s.score, summary: s.summary, unit: mini.unit })), winners));
    } else if (fun.note && winners.length) res.append(el('p', '', fun.note));
    res.append(el('p', 'ch-note', 'Just for fun — medals never count toward the score.'));
    panel.append(res);
    const foot = el('div', 'mg-foot ch-foot');
    foot.append(button('Back to the journey', close));
    panel.append(foot);
  }

  function racePanel(fun: FunPublic, game: FunGame): void {
    const mini = GAMES[game.play!.game];
    const panel = shell(`Chautari · ${game.title}`, 'Scores coming in…', game.icon);
    const list = el('div', 'mg-scores');
    for (const id of fun.participants) {
      const posted = fun.scores.find((s) => s.seat === id);
      const row = el('div', 'mg-score-row');
      row.append(
        avatar(player(id).color, player(id).hat, 24),
        el('span', 'mg-score-name', player(id).name),
        el('span', 'mg-score-sum', posted ? posted.summary : 'playing…'),
        el('b', posted ? '' : 'mg-pending', posted ? `${posted.score} ${mini.unit}` : '⏳'),
      );
      list.append(row);
    }
    panel.append(list);
  }

  async function playOnlineRound(fun: FunPublic, game: FunGame): Promise<void> {
    played.add(fun.id);
    playingRound = fun.id;
    const mini = GAMES[game.play!.game];
    const me = player(deps.me!);
    try {
      const intro = shell(`Chautari · ${game.title}`, 'Your round', game.icon);
      intro.append(el('p', 'mg-how', mini.how), el('p', 'ch-note', 'Everyone plays the very same round on their own screen. Best score wins the medal.'));
      const go = button("I'm ready — play!", () => {});
      const foot = el('div', 'mg-foot');
      foot.append(go);
      intro.append(foot);
      await waitClick(go);
      const panel = shell(`Chautari · ${game.title}`, me.name, game.icon);
      const stage = el('div', 'mg-stage');
      panel.append(stage);
      const run = await mini.play(stage, {
        difficulty: 1,
        playerName: me.name,
        playerColor: me.color,
        pool: Object.values(deps.state().cards),
        theme: game.play!.theme ?? {},
        seed: fun.seed,
      });
      net!.send({ t: 'fun-score', score: run.score, summary: run.summary });
      await wait(400);
    } finally {
      playingRound = null;
    }
    // Catch up with whatever arrived while we played.
    if (match && match.id === fun.id) renderOnline(match);
    else if (match) renderOnline(match);
  }

  function onlineBagh(fun: FunPublic, game: FunGame): void {
    const s = fun.bagh!;
    const tiger = player(fun.sides!.T);
    const goat = player(fun.sides!.G);
    const mySide: Side | null = fun.sides!.T === deps.me ? 'T' : fun.sides!.G === deps.me ? 'G' : null;
    if (!baghView || baghView.id !== fun.id) {
      const panel = shell(`Chautari · ${game.title}`, `${tiger.name} 🐅 vs 🐐 ${goat.name}`, game.icon);
      const view = baghBoard((m) => net!.send({ t: 'fun-move', move: m }));
      const status = el('div');
      panel.append(status, view.root);
      panel.append(el('p', 'ch-note', mySide ? `You play the ${mySide === 'T' ? 'tigers 🐅' : 'goats 🐐'}. Click a piece, then where it goes.` : 'You’re watching. The whole room sees every move.'));
      if (mySide) {
        // Resigning hands the game (and the medal) to the other side.
        const foot = el('div', 'mg-foot ch-foot');
        foot.append(button('Resign', () => net!.send({ t: 'fun-cancel' }), 'ghost'));
        panel.append(foot);
      }
      baghView = { id: fun.id, view, status };
    }
    baghView.status.replaceChildren(baghStatus(s, tiger, goat));
    baghView.view.update(s, mySide === s.turn);
  }

  function onlineTug(fun: FunPublic, game: FunGame): void {
    const [l, r] = fun.tug!.pullers;
    const left = player(l);
    const right = player(r);
    const mineIndex = fun.tug!.pullers.indexOf(deps.me!);
    if (!tugView || tugView.id !== fun.id) {
      stopTug();
      const panel = shell(`Chautari · ${game.title}`, `${left.name} vs ${right.name}`, game.icon);
      const arena = tugArena(left, right);
      panel.append(arena.root);
      if (mineIndex >= 0) {
        const pad = button(mineIndex === 0 ? '◀ PULL! (Space)' : 'PULL! (Space) ▶', () => tugTap(), 'mg-pad tug-pad tug-big');
        pad.style.setProperty('--pad', player(deps.me!).color);
        panel.append(pad, el('p', 'ch-note', 'Hammer Space (or tap the button) as fast as you can!'));
        const key = (e: KeyboardEvent): void => {
          if (e.repeat || !(e.code === 'Space' || e.code === 'KeyA' || e.code === 'KeyL')) return;
          e.preventDefault();
          tugTap();
        };
        window.addEventListener('keydown', key);
        // Taps go up in small batches; the server owns the rope.
        const timer = window.setInterval(() => {
          if (tugInput && tugInput.taps > 0) {
            net!.send({ t: 'fun-input', n: tugInput.taps });
            tugInput.taps = 0;
          }
        }, 100);
        tugInput = { taps: 0, timer, key };
      } else {
        panel.append(el('p', 'ch-note', 'You’re watching — cheer them on!'));
      }
      const view = { id: fun.id, view: arena, clock: 0, raf: 0 };
      const frame = (): void => {
        if (!tugView || tugView !== view) return;
        arena.draw(match?.tug?.pos ?? 0, match?.tug?.t ?? 0);
        view.raf = requestAnimationFrame(frame);
      };
      tugView = view;
      view.raf = requestAnimationFrame(frame);
    }
  }

  function tugTap(): void {
    if (tugInput) tugInput.taps++;
  }

  // --- shared bits ---

  function scoreTable(rows: Array<{ player: Player; score: number; summary: string; unit: string }>, winners: number[]): HTMLElement {
    const table = el('div', 'mg-scores');
    for (const s of [...rows].sort((a, b) => b.score - a.score)) {
      const row = el('div', `mg-score-row${winners.includes(s.player.id) ? ' ch-winner' : ''}`);
      row.append(
        avatar(s.player.color, s.player.hat, 24),
        el('span', 'mg-score-name', s.player.name),
        el('span', 'mg-score-sum', s.summary),
        el('b', '', `${s.score} ${s.unit}`),
      );
      table.append(row);
    }
    return table;
  }

  async function countdownIn(host: HTMLElement): Promise<void> {
    const c = el('div', 'mg-countdown');
    host.append(c);
    for (const n of ['3', '2', '1', 'Pull!']) {
      c.textContent = n;
      c.classList.remove('pop');
      void c.offsetWidth;
      c.classList.add('pop');
      await wait(n === 'Pull!' ? 450 : 650);
    }
    c.remove();
  }

  return {
    isOpen: () => open || Boolean(match && match.stage !== 'done'),
    canOpen() {
      const s = deps.state();
      if (open || deps.blocked()) return false;
      if (s.phase !== 'await-roll' && s.phase !== 'game-over') return false;
      if (net) return net.connected && !(match && match.stage !== 'done');
      return true;
    },
    openMenu() {
      if (!this.canOpen()) return;
      menu();
    },
    onServer,
    setAway(seats) {
      awaySeats.clear();
      for (const seat of seats) awaySeats.add(seat);
    },
  };
}
