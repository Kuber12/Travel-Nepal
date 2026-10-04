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
import { newGame, TRAVELERS, type BoardFile } from '../src/engine/setup.ts';
import type { Action, GameState } from '../src/engine/types.ts';
import { checksum, type ClientMessage, type LobbyPlayer, type ServerMessage } from '../src/net/protocol.ts';
import { judge, participantsFor } from '../src/ui/minigames/pick.ts';

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

// --- rooms -------------------------------------------------------------------

type Seat = {
  seat: number;
  name: string;
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
    color: TRAVELERS[s.seat].color,
    connected: Boolean(s.socket),
    host: s.seat === room.hostSeat,
  }));
}

function sendLobby(room: Room): void {
  broadcast(room, { t: 'lobby', code: room.code, players: lobbyOf(room), started: Boolean(room.state) });
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
  if (!state || room.minigame) return;
  if (current(state).id !== seat) return; // not your turn
  if (action.type === 'MOVE_COMPLETE') return; // the server chains these itself

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
      };
      rooms.set(room.code, room);
      const seat: Seat = { seat: 0, name: cleanName(msg.name, TRAVELERS[0].name), token: randomBytes(12).toString('hex'), socket, awaySince: null };
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
      const seat: Seat = { seat: index, name: cleanName(msg.name, TRAVELERS[index].name), token: randomBytes(12).toString('hex'), socket, awaySince: null };
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
      }
      return;
    }

    case 'start': {
      const room = ctx.room;
      if (!room || room.state || mySeat !== room.hostSeat) return;
      if (room.seats.length < 2) return send(socket, { t: 'error', message: 'Wait for at least one more traveler.' });
      const state = newGame({ playerCount: room.seats.length, boardFile: BOARD, deckFiles: DECKS });
      room.state = {
        ...state,
        players: state.players.map((p, i) => ({ ...p, name: room.seats[i].name })),
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
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
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
    }
  });
});

http.listen(PORT, () => {
  console.log(`Travel Nepal server on http://localhost:${PORT}  (rooms at ws://localhost:${PORT}/ws)`);
});
