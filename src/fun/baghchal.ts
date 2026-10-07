/**
 * Bagh-Chal — "move the tigers" — Nepal's own board game, as pure rules.
 *
 * A 5×5 grid of points joined by lines: every point links to its neighbours
 * across and down, and the points where (row + col) is even also link
 * diagonally. Four tigers start on the corners; twenty goats wait off-board.
 *
 *  - Goats move first. Until all twenty are on the board, a goat's turn is to
 *    place one on any empty point; after that, goats step along a line.
 *  - Tigers step along a line, or capture by jumping straight over an
 *    adjacent goat to the empty point beyond it.
 *  - Tigers win once they have captured five goats. Goats win by hemming
 *    every tiger in so none can move. A long game with neither is a draw.
 *
 * No DOM and no Math.random here — the multiplayer server referees online
 * games with this exact module, and the AI takes its randomness as an input.
 */

export type Side = 'T' | 'G';
export type Piece = Side | null;

export type BaghMove = {
  /** Point moved from; null when a goat is placed. */
  from: number | null;
  to: number;
  /** The point of the goat jumped over, for a tiger's capture. */
  capture?: number;
};

export type BaghState = {
  /** 25 points, row-major: index = row * 5 + col. */
  board: Piece[];
  turn: Side;
  /** Goats placed so far (0–20). */
  placed: number;
  captured: number;
  /** Moves made, both sides. */
  plies: number;
  winner: Side | 'draw' | null;
  last: BaghMove | null;
};

export const GOATS = 20;
export const TIGER_WIN_CAPTURES = 5;
/** Moves after the last goat lands before an undecided game is called a draw. */
export const DRAW_AFTER_PLIES = 120;

const SIZE = 5;

function rc(p: number): [number, number] {
  return [Math.floor(p / SIZE), p % SIZE];
}

function at(r: number, c: number): number {
  return r * SIZE + c;
}

function inside(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/** Directions a piece on point p may travel along. */
function directions(p: number): Array<[number, number]> {
  const [r, c] = rc(p);
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  if ((r + c) % 2 === 0) dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  return dirs;
}

/** For each point: the neighbours along a line, and the jump landing beyond each. */
const LINKS: Array<Array<{ to: number; beyond: number | null }>> = Array.from({ length: SIZE * SIZE }, (_, p) => {
  const [r, c] = rc(p);
  return directions(p)
    .filter(([dr, dc]) => inside(r + dr, c + dc))
    .map(([dr, dc]) => ({
      to: at(r + dr, c + dc),
      beyond: inside(r + 2 * dr, c + 2 * dc) ? at(r + 2 * dr, c + 2 * dc) : null,
    }));
});

/** Every line on the board, once each — for drawing it. */
export function boardLines(): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  for (let p = 0; p < SIZE * SIZE; p++) {
    for (const { to } of LINKS[p]) if (to > p) lines.push([p, to]);
  }
  return lines;
}

export function pointRC(p: number): [number, number] {
  return rc(p);
}

export function newBagh(): BaghState {
  const board: Piece[] = Array(SIZE * SIZE).fill(null);
  for (const p of [at(0, 0), at(0, 4), at(4, 0), at(4, 4)]) board[p] = 'T';
  return { board, turn: 'G', placed: 0, captured: 0, plies: 0, winner: null, last: null };
}

function tigerMoves(board: Piece[], p: number): BaghMove[] {
  const moves: BaghMove[] = [];
  for (const { to, beyond } of LINKS[p]) {
    if (board[to] === null) moves.push({ from: p, to });
    else if (board[to] === 'G' && beyond !== null && board[beyond] === null) moves.push({ from: p, to: beyond, capture: to });
  }
  return moves;
}

/** Every move the side to play may make. */
export function legalMoves(s: BaghState): BaghMove[] {
  if (s.winner) return [];
  const moves: BaghMove[] = [];
  if (s.turn === 'G') {
    if (s.placed < GOATS) {
      s.board.forEach((piece, p) => {
        if (piece === null) moves.push({ from: null, to: p });
      });
    } else {
      s.board.forEach((piece, p) => {
        if (piece !== 'G') return;
        for (const { to } of LINKS[p]) if (s.board[to] === null) moves.push({ from: p, to });
      });
    }
  } else {
    s.board.forEach((piece, p) => {
      if (piece === 'T') moves.push(...tigerMoves(s.board, p));
    });
  }
  return moves;
}

function sameMove(a: BaghMove, b: BaghMove): boolean {
  return a.from === b.from && a.to === b.to;
}

/** Tigers with somewhere to go. Zero means the goats have won. */
export function tigerMobility(board: Piece[]): number {
  let n = 0;
  board.forEach((piece, p) => {
    if (piece === 'T') n += tigerMoves(board, p).length;
  });
  return n;
}

/**
 * Play a move. An illegal move (wrong side, occupied point, no such line)
 * returns the state unchanged — the server relies on that.
 */
export function applyBagh(s: BaghState, move: BaghMove): BaghState {
  const legal = legalMoves(s).find((m) => sameMove(m, move));
  if (!legal) return s;
  const board = [...s.board];
  if (legal.from !== null) board[legal.from] = null;
  board[legal.to] = s.turn;
  if (legal.capture !== undefined) board[legal.capture] = null;

  const next: BaghState = {
    board,
    turn: s.turn === 'G' ? 'T' : 'G',
    placed: s.turn === 'G' && legal.from === null ? s.placed + 1 : s.placed,
    captured: s.captured + (legal.capture !== undefined ? 1 : 0),
    plies: s.plies + 1,
    winner: null,
    last: legal,
  };

  if (next.captured >= TIGER_WIN_CAPTURES) next.winner = 'T';
  else if (tigerMobility(board) === 0) next.winner = 'G';
  else if (next.turn === 'G' && legalMoves(next).length === 0) next.winner = 'T'; // goats can't move: stalemated
  else if (next.placed >= GOATS && next.plies >= GOATS * 2 + DRAW_AFTER_PLIES) next.winner = 'draw';
  return next;
}

/** Goats on the board that a tiger could take right now. */
function goatsInDanger(board: Piece[]): number {
  const seen = new Set<number>();
  board.forEach((piece, p) => {
    if (piece !== 'T') return;
    for (const m of tigerMoves(board, p)) if (m.capture !== undefined) seen.add(m.capture);
  });
  return seen.size;
}

/**
 * A computer opponent: greedy with one move of look-ahead, plus a little
 * randomness so it doesn't play the same game twice.
 *  - Tigers take a goat whenever they can, otherwise go where they keep the
 *    most room and threaten the most goats.
 *  - Goats never offer a free capture if they can help it, and squeeze the
 *    tigers' room to move.
 */
export function aiMove(s: BaghState, rnd: () => number): BaghMove | null {
  const moves = legalMoves(s);
  if (moves.length === 0) return null;
  let best: BaghMove = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = applyBagh(s, m);
    let score: number;
    if (s.turn === 'T') {
      if (after.winner === 'T') score = 10_000;
      else {
        score = (m.capture !== undefined ? 400 : 0) + goatsInDanger(after.board) * 60 + tigerMobility(after.board) * 6;
        // A tiger walking into a corner of goats is a tiger lost.
        const replies = legalMoves(after);
        const worst = Math.min(...replies.map((r) => tigerMobility(applyBagh(after, r).board)), 99);
        score += Math.min(worst, 8) * 10;
      }
    } else {
      if (after.winner === 'G') score = 10_000;
      else {
        const danger = goatsInDanger(after.board);
        score = -danger * 300 - tigerMobility(after.board) * 12;
        // Edges and corners are safe ground for a goat; the centre is not.
        const [r, c] = rc(m.to);
        if (r === 0 || r === 4 || c === 0 || c === 4) score += 14;
        // Stay with the herd.
        score += LINKS[m.to].filter(({ to }) => after.board[to] === 'G').length * 6;
      }
    }
    score += rnd() * 9;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
