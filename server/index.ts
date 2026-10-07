/**
 * Travel Nepal multiplayer server.
 *
 * One process does two jobs: it serves the built game (dist/) over HTTP, and
 * it runs game rooms over a WebSocket at /ws. Each room holds the one true
 * GameState. Clients send the action they want; the server checks it is that
 * traveler's turn, applies it with the same pure reducer the browser uses,
 * and broadcasts the action so every screen animates it identically.
 *
 *   npm run online        build the game, then serve it + rooms on :8787
 *   npm run server        rooms only (use with `npm run dev`, which proxies /ws)
 *
 * Mini-games: the active traveler asks to play; the server tells every
 * participant to play their own round on their own device, collects the
 * scores, judges them, and applies PLAY_MINIGAME with the result.
 *
 * If the traveler whose turn it is drops off, the server waits a little,
 * then plays for them (the same autoplayer the demo uses) until they return.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import boardFile from '../src/data/board.full.json' with { type: 'json' };
import nepalmandal from '../src/data/decks/nepalmandal.json' with { type: 'json' };
import chitwan from '../src/data/decks/chitwan.json' with { type: 'json' };
import lumbini from '../src/data/decks/lumbini.json' with { type: 'json' };
import pokhara from '../src/data/decks/pokhara.json' with { type: 'json' };
import himalayan from '../src/data/decks/himalayan.json' with { type: 'json' };
import eastern from '../src/data/decks/eastern.json' with { type: 'json' };
import westernterai from '../src/data/decks/westernterai.json' with { type: 'json' };
import westernhillside from '../src/data/decks/westernhillside.json' with { type: 'json' };
import mountain from '../src/data/decks/mountain.json' with { type: 'json' };
import wild from '../src/data/decks/wild.json' with { type: 'json' };

import { nextAction } from '../src/engine/autoplay.ts';
import type { DeckFile } from '../src/engine/decks.ts';
import { applyAction, current } from '../src/engine/reducer.ts';
import { HAT_STYLES, newGame, TRAVELER_COLORS, TRAVELERS, type BoardFile } from '../src/engine/setup.ts';
import type { Action, GameState, HatStyle } from '../src/engine/types.ts';
import { checksum, type ClientMessage, type LobbyPlayer, type ServerMessage } from '../src/net/protocol.ts';
import { judge, participantsFor } from '../src/ui/minigames/pick.ts';
import { aiMove, applyBagh, newBagh, type BaghMove } from '../src/fun/baghchal.ts';
import { funGame, raceWinners, type FunPublic } from '../src/fun/chautari.ts';
import { newTug, pullTug, TUG_MAX_TAPS_PER_SECOND, type TugState } from '../src/fun/tug.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DECKS = [
  nepalmandal, chitwan, lumbini, pokhara, himalayan, eastern, westernterai, westernhillside, mountain, wild,
] as unknown as DeckFile[];
const BOARD = boardFile as unknown as BoardFile;

/** How long a disconnected traveler's turn waits before the server plays it. */
const AWAY_GRACE_MS = 20_000;
/** Gap between moves when the server is playing for someone. */
const BOT_STEP_MS = 1_600;
/** Longest a mini-game round waits for scores. */
const MINIGAME_LIMIT_MS = 150_000;
/** Empty rooms are kept this long, so a refresh doesn't lose the game. */
const ROOM_TTL_MS = 30 * 60_000;
/** Chautari: how long invited players have to join a friendly game. */
const FUN_READY_MS = 25_000;
/** Chautari: longest a score race waits for everyone's round. */
const FUN_RACE_MS = 150_000;
/** Chautari: a Bagh-Chal move left this long is played by the computer. */
const FUN_MOVE_MS = 45_000;
/** Chautari: an absent Bagh-Chal player's move is played after this pause. */
const FUN_AWAY_MOVE_MS = 3_000;
/** Chautari: the "3, 2, 1" before a tug of war. */
const FUN_TUG_COUNTDOWN_MS = 3_000;

// --- rooms -------------------------------------------------------------------

type Seat = {
  seat: number;
  name: string;
  color: string;
  hat: HatStyle;
  token: string;
  socket: WebSocket | null;
  awaySince: number | null;
};

type Room = {
  code: string;
  seats: Seat[];
  hostSeat: number;
  state: GameState | null;
  seq: number;
  minigame: { scores: Map<number, number>; summaries: Map<number, string>; participants: number[]; deadline: number } | null;
  emptySince: number | null;
  /** When the autopilot last moved for an absent traveler. */
  botAt: number;
  /** The Chautari match being played, if any. The journey waits while it runs. */
  fun: FunRoom | null;
  funCount: number;
};

/** The server's side of a Chautari match: the public state plus timers and the live rope. */
type FunRoom = {
  pub: FunPublic;
  /** Ready: join deadline. Race: last call for scores. Bagh-Chal: this move's deadline. */
  deadline: number;
  /** Tug of war: the rope, the taps waiting to be applied, and when it last moved. */
  tug: TugState | null;
  taps: [number, number];
  tugAt: number;
  rnd: () => number;
};

const rooms = new Map<string, Room>();

function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(code)) return code;
  }
}

function send(socket: WebSocket | null, msg: ServerMessage): void {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage): void {
  const text = JSON.stringify(msg);
  for (const s of room.seats) if (s.socket && s.socket.readyState === s.socket.OPEN) s.socket.send(text);
}

function lobbyOf(room: Room): LobbyPlayer[] {
  return room.seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    color: s.color,
    hat: s.hat,
    connected: Boolean(s.socket),
    host: s.seat === room.hostSeat,
  }));
}

function sendLobby(room: Room): void {
  broadcast(room, { t: 'lobby', code: room.code, players: lobbyOf(room), started: Boolean(room.state) });
}

/** A new traveler's look: the box colour for their seat, or the first one nobody is wearing. */
function freshLook(room: Room, index: number): { color: string; hat: HatStyle } {
  const worn = room.seats.map((s) => s.color);
  const color = worn.includes(TRAVELERS[index].color)
    ? TRAVELER_COLORS.find((c) => !worn.includes(c)) ?? TRAVELERS[index].color
    : TRAVELERS[index].color;
  return { color, hat: TRAVELERS[index].hat };
}

function cleanName(raw: unknown, fallback: string): string {
  const name = String(raw ?? '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 16);
  return name || fallback;
}

// --- applying actions --------------------------------------------------------

/** Apply an action, broadcast it, and run the automatic follow-ups. */
function commit(room: Room, action: Action, by: number | null): boolean {
  if (!room.state) return false;
  const before = room.state;
  const after = applyAction(before, action);
  if (after === before) return false;
  room.state = after;
  room.seq++;
  broadcast(room, { t: 'action', action, seq: room.seq, check: checksum(after), by });

  // The same chain the browser runs after an animation: a move resolves on
  // arrival; a wild card that moved you ends the turn.
  if ((action.type === 'ROLL' || action.type === 'CHOOSE_BRANCH') && after.phase === 'moving') {
    commit(room, { type: 'MOVE_COMPLETE' }, null);
  } else if (action.type === 'RESOLVE_CARD' && after.phase === 'moving') {
    commit(room, { type: 'END_TURN' }, null);
  }
  return true;
}

function handleAction(room: Room, seat: number, action: Action): void {
  const state = room.state;
  if (!state || room.minigame || room.fun) return; // the journey waits for the Chautari
  if (current(state).id !== seat) return; // not your turn
  if (action.type === 'MOVE_COMPLETE') return; // the server chains these itself
  if (action.type === 'CHAUTARI_RESULT') return; // only the server hands out medals

  if (action.type === 'PLAY_MINIGAME') {
    const pending = state.pendingMinigame;
    if (!pending) return;
    if (pending.spec.type === 'feast') {
      commit(room, { type: 'PLAY_MINIGAME' }, seat);
      return;
    }
    beginMinigame(room);
    return;
  }

  commit(room, action, seat);
}

// --- mini-games --------------------------------------------------------------

function beginMinigame(room: Room): void {
  const participants = participantsFor(room.state!);
  room.minigame = {
    scores: new Map(),
    summaries: new Map(),
    participants,
    deadline: Date.now() + MINIGAME_LIMIT_MS,
  };
  broadcast(room, { t: 'mg-begin', participants, seq: room.seq });
  checkMinigame(room);
}

function postScore(room: Room, seat: number, score: number, summary: string): void {
  const mg = room.minigame;
  if (!mg || !mg.participants.includes(seat) || mg.scores.has(seat)) return;
  mg.scores.set(seat, Math.max(0, Math.round(Number(score) || 0)));
  mg.summaries.set(seat, String(summary ?? '').slice(0, 80));
  checkMinigame(room);
}

/** Settle the round once everyone still here has posted, or time is up. */
function checkMinigame(room: Room): void {
  const mg = room.minigame;
  if (!mg) return;
  const timedOut = Date.now() > mg.deadline;
  for (const p of mg.participants) {
    const seat = room.seats[p];
    // Absent travelers can't play: they score nothing.
    if (!mg.scores.has(p) && (timedOut || !seat?.socket)) {
      mg.scores.set(p, 0);
      mg.summaries.set(p, seat?.socket ? 'ran out of time' : 'not here');
    }
  }
  broadcast(room, {
    t: 'mg-progress',
    done: [...mg.scores].map(([seat, score]) => ({ seat, score, summary: mg.summaries.get(seat) ?? '' })),
  });
  if (mg.participants.every((p) => mg.scores.has(p))) {
    const result = judge(room.state!, mg.scores);
    room.minigame = null;
    commit(room, { type: 'PLAY_MINIGAME', result }, current(room.state!).id);
  }
}


// --- the Chautari: friendly games between turns ------------------------------------

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function sendFun(room: Room): void {
  broadcast(room, { t: 'fun', fun: room.fun ? room.fun.pub : null });
}

function openFun(room: Room, seat: number, gameId: string, wanted: unknown): void {
  const state = room.state;
  if (!state || room.minigame || room.fun) return;
  if (state.phase !== 'await-roll' && state.phase !== 'game-over') return;
  const game = funGame(String(gameId));
  if (!game || !Array.isArray(wanted)) return;
  const participants = [...new Set(wanted.map(Number))].filter(
    (p) => Number.isInteger(p) && room.seats[p]?.socket && state.players.some((pl) => pl.id === p),
  );
  if (participants.length < game.min || participants.length > game.max || participants.length !== wanted.length) {
    const s = room.seats[seat];
    send(s?.socket ?? null, { t: 'error', message: 'Those travelers can’t all play right now.' });
    return;
  }
  room.funCount++;
  room.fun = {
    pub: {
      id: room.funCount,
      game: game.id,
      host: seat,
      seed: Math.floor(Math.random() * 0x7fffffff),
      participants,
      stage: 'ready',
      ready: participants.includes(seat) ? [seat] : [],
      out: [],
      scores: [],
    },
    deadline: Date.now() + FUN_READY_MS,
    tug: null,
    taps: [0, 0],
    tugAt: 0,
    rnd: seeded(room.funCount * 7919 + Date.now()),
  };
  checkReady(room);
}

/** Everyone has answered (or the clock ran out): start, or call it off. */
function checkReady(room: Room): void {
  const fun = room.fun;
  if (!fun || fun.pub.stage !== 'ready') return;
  const pub = fun.pub;
  const timedOut = Date.now() > fun.deadline;
  for (const p of pub.participants) {
    const answered = pub.ready.includes(p) || pub.out.includes(p);
    if (!answered && (timedOut || !room.seats[p]?.socket)) pub.out.push(p);
  }
  if (!pub.participants.every((p) => pub.ready.includes(p) || pub.out.includes(p))) {
    sendFun(room);
    return;
  }
  const game = funGame(pub.game)!;
  const players = pub.participants.filter((p) => pub.ready.includes(p));
  if (players.length < game.min || (game.kind !== 'race' && players.length < 2)) {
    const missing = pub.out.map((p) => room.seats[p]?.name ?? '?').join(' & ');
    finishFun(room, [], missing ? `${missing} sat this one out.` : 'Called off.');
    return;
  }
  pub.participants = players;
  pub.stage = 'play';
  if (game.kind === 'race') {
    fun.deadline = Date.now() + FUN_RACE_MS;
  } else if (game.kind === 'baghchal') {
    pub.bagh = newBagh();
    pub.sides = { T: players[0], G: players[1] };
    fun.deadline = Date.now() + FUN_MOVE_MS;
  } else {
    fun.tug = newTug();
    fun.tugAt = Date.now() + FUN_TUG_COUNTDOWN_MS;
    pub.tug = { pos: 0, t: -FUN_TUG_COUNTDOWN_MS / 1000, pullers: [players[0], players[1]] };
  }
  sendFun(room);
}

/** The match is over: tell everyone, hand out medals through the game itself, and let the journey go on. */
function finishFun(room: Room, winners: number[], note?: string): void {
  const fun = room.fun;
  if (!fun) return;
  fun.pub.stage = 'done';
  fun.pub.winners = winners;
  if (note) fun.pub.note = note;
  sendFun(room);
  room.fun = null;
  const game = funGame(fun.pub.game);
  if (winners.length > 0 && fun.pub.participants.length > 1 && game) {
    commit(room, { type: 'CHAUTARI_RESULT', game: game.title, winners }, null);
  }
}

function funReady(room: Room, seat: number, join: boolean): void {
  const pub = room.fun?.pub;
  if (!pub || pub.stage !== 'ready' || !pub.participants.includes(seat)) return;
  if (pub.ready.includes(seat) || pub.out.includes(seat)) return;
  (join ? pub.ready : pub.out).push(seat);
  checkReady(room);
}

function funScore(room: Room, seat: number, score: unknown, summary: unknown): void {
  const pub = room.fun?.pub;
  if (!pub || pub.stage !== 'play' || funGame(pub.game)?.kind !== 'race') return;
  if (!pub.participants.includes(seat) || pub.scores.some((s) => s.seat === seat)) return;
  pub.scores.push({ seat, score: Math.max(0, Math.min(100_000, Math.round(Number(score) || 0))), summary: String(summary ?? '').slice(0, 80) });
  checkRace(room);
}

function checkRace(room: Room): void {
  const fun = room.fun;
  if (!fun || fun.pub.stage !== 'play') return;
  const pub = fun.pub;
  const timedOut = Date.now() > fun.deadline;
  for (const p of pub.participants) {
    if (!pub.scores.some((s) => s.seat === p) && (timedOut || !room.seats[p]?.socket)) {
      pub.scores.push({ seat: p, score: 0, summary: room.seats[p]?.socket ? 'ran out of time' : 'not here' });
    }
  }
  if (pub.participants.every((p) => pub.scores.some((s) => s.seat === p))) {
    finishFun(room, raceWinners(pub.scores));
  } else {
    sendFun(room);
  }
}

function funMove(room: Room, seat: number, move: BaghMove | null): void {
  const fun = room.fun;
  const pub = fun?.pub;
  if (!fun || !pub || pub.stage !== 'play' || !pub.bagh || !pub.sides) return;
  const side = pub.bagh.turn;
  if (pub.sides[side] !== seat) return; // not your move
  playBagh(room, move);
}

/** Apply a Bagh-Chal move (the computer's, when `move` is null) and check for a winner. */
function playBagh(room: Room, move: BaghMove | null): void {
  const fun = room.fun!;
  const pub = fun.pub;
  const before = pub.bagh!;
  // Moves arrive as JSON: insist on numbers, since legality is checked by strict equality.
  const chosen = move
    ? { from: move.from === null || move.from === undefined ? null : Number(move.from), to: Number(move.to) }
    : aiMove(before, fun.rnd);
  if (!chosen) return;
  const after = applyBagh(before, chosen);
  if (after === before) return; // illegal
  pub.bagh = after;
  fun.deadline = Date.now() + FUN_MOVE_MS;
  if (after.winner) {
    const winners = after.winner === 'T' ? [pub.sides!.T] : after.winner === 'G' ? [pub.sides!.G] : [];
    const note = after.winner === 'T'
      ? after.captured >= 5 ? 'The tigers caught five goats.' : 'The goats were left with nowhere to go.'
      : after.winner === 'G' ? 'The goats hemmed in every tiger.' : 'Nobody could break through — a draw.';
    finishFun(room, winners, note);
    return;
  }
  sendFun(room);
}

function funInput(room: Room, seat: number, n: unknown): void {
  const fun = room.fun;
  if (!fun || !fun.tug || !fun.pub.tug || fun.pub.stage !== 'play') return;
  const side = fun.pub.tug.pullers.indexOf(seat);
  if (side < 0 || Date.now() < fun.tugAt) return; // not a puller, or still counting down
  fun.taps[side] += Math.max(0, Math.min(8, Math.floor(Number(n) || 0)));
}

function funCancel(room: Room, seat: number): void {
  const fun = room.fun;
  if (!fun) return;
  const pub = fun.pub;
  if (pub.stage === 'ready' && seat === pub.host) {
    finishFun(room, [], `${room.seats[seat]?.name ?? 'The host'} called it off.`);
  } else if (pub.stage === 'play' && pub.sides && (pub.sides.T === seat || pub.sides.G === seat)) {
    // Resigning a Bagh-Chal game hands it to the other side.
    const other = pub.sides.T === seat ? pub.sides.G : pub.sides.T;
    finishFun(room, [other], `${room.seats[seat]?.name ?? 'A player'} resigned.`);
  }
}

/** Timers: join deadlines, late scores, idle Bagh-Chal players, and the live tug-of-war rope. */
function funTick(room: Room): void {
  const fun = room.fun;
  if (!fun) return;
  const now = Date.now();
  const pub = fun.pub;
  if (pub.stage === 'ready') {
    if (now > fun.deadline || pub.participants.some((p) => !room.seats[p]?.socket)) checkReady(room);
    return;
  }
  const kind = funGame(pub.game)?.kind;
  if (kind === 'race') {
    if (now > fun.deadline || pub.participants.some((p) => !room.seats[p]?.socket)) checkRace(room);
  } else if (kind === 'baghchal') {
    const toMove = pub.sides![pub.bagh!.turn];
    const away = !room.seats[toMove]?.socket;
    if (now > fun.deadline || (away && now > fun.deadline - FUN_MOVE_MS + FUN_AWAY_MOVE_MS)) playBagh(room, null);
  } else if (kind === 'tug' && fun.tug && pub.tug) {
    if (now < fun.tugAt) {
      pub.tug.t = (now - fun.tugAt) / 1000;
      sendFun(room);
      return;
    }
    const dt = Math.min(0.25, (now - Math.max(fun.tugAt, now - 250)) / 1000) || 0.1;
    // Nobody honestly taps faster than this.
    const cap = Math.ceil(TUG_MAX_TAPS_PER_SECOND * dt) + 1;
    const [l, r] = fun.taps.map((n) => Math.min(n, cap));
    fun.taps = [0, 0];
    fun.tug = pullTug(fun.tug, l, r, dt);
    fun.tugAt = now;
    pub.tug.pos = fun.tug.pos;
    pub.tug.t = fun.tug.t;
    if (fun.tug.winner !== null) {
      const [left, right] = pub.tug.pullers;
      const w = fun.tug.winner;
      const name = (p: number): string => room.seats[p]?.name ?? '?';
      finishFun(room, w === 0 ? [left] : w === 1 ? [right] : [], w === 'draw' ? 'Dead level when the whistle blew!' : `${name(w === 0 ? left : right)} dragged the rope over the line.`);
    } else {
      sendFun(room);
    }
  }
}

setInterval(() => {
  for (const room of rooms.values()) if (room.fun) funTick(room);
}, 100);

// --- the away-player autopilot --------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // Forget rooms nobody has been in for a while.
    if (room.seats.every((s) => !s.socket)) {
      room.emptySince ??= now;
      if (now - room.emptySince > ROOM_TTL_MS) rooms.delete(room.code);
      continue;
    }
    room.emptySince = null;

    if (room.minigame) {
      checkMinigame(room);
      continue;
    }
    if (room.fun) continue; // the journey waits while the Chautari plays
    const state = room.state;
    if (!state || state.phase === 'game-over') continue;
    const seat = room.seats[current(state).id];
    if (seat.socket || !seat.awaySince || now - seat.awaySince < AWAY_GRACE_MS) continue;
    if (now - room.botAt < BOT_STEP_MS) continue;
    room.botAt = now;
    const next = nextAction(state);
    if (next) commit(room, next, null);
  }
}, 500);

// --- connections ---------------------------------------------------------------

type Ctx = { room: Room | null; me: Seat | null };

function onMessage(socket: WebSocket, ctx: Ctx, msg: ClientMessage): void {
  const mySeat = ctx.me?.seat ?? -1;
  switch (msg.t) {
    case 'create': {
      const room: Room = {
        code: newCode(),
        seats: [],
        hostSeat: 0,
        state: null,
        seq: 0,
        minigame: null,
        emptySince: null,
        botAt: 0,
        fun: null,
        funCount: 0,
      };
      rooms.set(room.code, room);
      const seat: Seat = { seat: 0, name: cleanName(msg.name, TRAVELERS[0].name), ...freshLook(room, 0), token: randomBytes(12).toString('hex'), socket, awaySince: null };
      room.seats.push(seat);
      ctx.room = room;
      ctx.me = seat;
      send(socket, { t: 'joined', code: room.code, seat: 0, token: seat.token, host: true });
      sendLobby(room);
      return;
    }

    case 'join': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
      if (!room) return send(socket, { t: 'error', message: 'No room with that code.' });
      if (room.state) return send(socket, { t: 'error', message: 'That game has already started.' });
      if (room.seats.length >= TRAVELERS.length) return send(socket, { t: 'error', message: 'That room is full (4 travelers).' });
      const index = room.seats.length;
      const seat: Seat = { seat: index, name: cleanName(msg.name, TRAVELERS[index].name), ...freshLook(room, index), token: randomBytes(12).toString('hex'), socket, awaySince: null };
      room.seats.push(seat);
      ctx.room = room;
      ctx.me = seat;
      send(socket, { t: 'joined', code: room.code, seat: index, token: seat.token, host: false });
      sendLobby(room);
      return;
    }

    case 'rejoin': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      const seat = room?.seats.find((s) => s.token === msg.token);
      if (!room || !seat) return send(socket, { t: 'error', message: 'That game is no longer available.' });
      if (seat.socket && seat.socket !== socket) seat.socket.close();
      seat.socket = socket;
      seat.awaySince = null;
      ctx.room = room;
      ctx.me = seat;
      send(socket, { t: 'joined', code: room.code, seat: seat.seat, token: seat.token, host: seat.seat === room.hostSeat });
      sendLobby(room);
      if (room.state) {
        send(socket, { t: 'snapshot', state: room.state, seq: room.seq });
        if (room.minigame) {
          send(socket, { t: 'mg-begin', participants: room.minigame.participants, seq: room.seq });
          checkMinigame(room);
        }
        send(socket, { t: 'fun', fun: room.fun ? room.fun.pub : null });
      }
      return;
    }

    case 'look': {
      const room = ctx.room;
      const me = ctx.me;
      if (!room || !me || room.state) return;
      const color = String(msg.color ?? '');
      const hat = String(msg.hat ?? '') as HatStyle;
      if (!(TRAVELER_COLORS as readonly string[]).includes(color) || !HAT_STYLES.includes(hat)) return;
      if (room.seats.some((s) => s !== me && s.color === color)) {
        return send(socket, { t: 'error', message: 'Someone else is wearing that colour.' });
      }
      me.color = color;
      me.hat = hat;
      sendLobby(room);
      return;
    }

    case 'start': {
      const room = ctx.room;
      if (!room || room.state || mySeat !== room.hostSeat) return;
      if (room.seats.length < 2) return send(socket, { t: 'error', message: 'Wait for at least one more traveler.' });
      const state = newGame({ playerCount: room.seats.length, boardFile: BOARD, deckFiles: DECKS });
      room.state = {
        ...state,
        players: state.players.map((p, i) => ({ ...p, name: room.seats[i].name, color: room.seats[i].color, hat: room.seats[i].hat })),
      };
      room.seq = 0;
      sendLobby(room);
      broadcast(room, { t: 'snapshot', state: room.state, seq: room.seq });
      return;
    }

    case 'action': {
      if (ctx.room) handleAction(ctx.room, mySeat, msg.action);
      return;
    }

    case 'mg-score': {
      if (ctx.room) postScore(ctx.room, mySeat, msg.score, msg.summary);
      return;
    }

    case 'fun-open': {
      if (ctx.room && ctx.me) openFun(ctx.room, mySeat, msg.game, msg.participants);
      return;
    }

    case 'fun-ready': {
      if (ctx.room) funReady(ctx.room, mySeat, Boolean(msg.join));
      return;
    }

    case 'fun-score': {
      if (ctx.room) funScore(ctx.room, mySeat, msg.score, msg.summary);
      return;
    }

    case 'fun-move': {
      if (ctx.room && msg.move && typeof msg.move === 'object') funMove(ctx.room, mySeat, msg.move);
      return;
    }

    case 'fun-input': {
      if (ctx.room) funInput(ctx.room, mySeat, msg.n);
      return;
    }

    case 'fun-cancel': {
      if (ctx.room) funCancel(ctx.room, mySeat);
      return;
    }

    case 'resync': {
      if (ctx.room?.state) send(socket, { t: 'snapshot', state: ctx.room.state, seq: ctx.room.seq });
      return;
    }

    case 'leave': {
      socket.close();
      return;
    }
  }
}

// --- http: serve the built game ------------------------------------------------------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Travel Nepal room server is running. Build the game with `npm run build`, or use `npm run dev` for development.');
    return;
  }
  // A malformed escape (e.g. "/%E0%A4%A") makes decodeURIComponent throw; on a
  // public host that must be a 400, not a crash that takes every room down.
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (socket) => {
  const ctx: Ctx = { room: null, me: null };
  // Keep idle connections alive through proxies.
  const ping = setInterval(() => socket.readyState === socket.OPEN && socket.ping(), 25_000);

  socket.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    try {
      onMessage(socket, ctx, msg);
    } catch (err) {
      console.error('message failed', err);
      send(socket, { t: 'error', message: 'Something went wrong on the server.' });
    }
  });

  socket.on('close', () => {
    clearInterval(ping);
    const room = ctx.room;
    const seat = ctx.me;
    if (!room || !seat) return;
    if (seat.socket === socket) {
      seat.socket = null;
      seat.awaySince = Date.now();
      // Before the game starts, leaving frees the seat.
      if (!room.state) {
        const wasHost = seat.seat === room.hostSeat;
        room.seats.splice(room.seats.indexOf(seat), 1);
        room.seats.forEach((s, i) => (s.seat = i));
        if (room.seats.length === 0) rooms.delete(room.code);
        else if (wasHost || room.hostSeat >= room.seats.length) room.hostSeat = 0;
        for (const s of room.seats) send(s.socket, { t: 'joined', code: room.code, seat: s.seat, token: s.token, host: s.seat === room.hostSeat });
      }
      sendLobby(room);
      if (room.minigame) checkMinigame(room);
      if (room.fun) funTick(room);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Travel Nepal server on http://localhost:${PORT}  (rooms at ws://localhost:${PORT}/ws)`);
});
