/**
 * Plays whole online games against a running server, with bot clients, and
 * checks that every client's copy of the game stays identical to the
 * server's. Start the server first (`npm run server`), then `npm run netsim`.
 */

import WebSocket from 'ws';
import { aiMove } from '../src/fun/baghchal.ts';
import type { FunPublic } from '../src/fun/chautari.ts';
import { nextAction } from '../src/engine/autoplay.ts';
import { applyAction, current } from '../src/engine/reducer.ts';
import type { GameState } from '../src/engine/types.ts';
import { checksum, type ServerMessage } from '../src/net/protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const PLAYERS = Number(process.env.PLAYERS ?? 3);

type Bot = { ws: WebSocket; seat: number; state: GameState | null; drift: number; code?: string; fun: FunPublic | null; sentPly: number; scored: number };

function connect(): Promise<Bot> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const bot: Bot = { ws, seat: -1, state: null, drift: 0, fun: null, sentPly: -1, scored: -1 };
    ws.on('open', () => resolve(bot));
    ws.on('message', (data) => onMessage(bot, JSON.parse(String(data)) as ServerMessage));
  });
}

let finished = 0;
let minigames = 0;

/** The Chautari games the host calls between turns, in order, before getting on with the journey. */
const FUN_PLAN = ['stack', 'baghchal', 'tug'];
let funCalled = 0;
let funDone = 0;
let funMedals = 0;
const funNotes: string[] = [];

function onMessage(bot: Bot, msg: ServerMessage): void {
  switch (msg.t) {
    case 'joined':
      bot.seat = msg.seat;
      bot.code = msg.code;
      break;
    case 'snapshot':
      bot.state = msg.state;
      act(bot);
      break;
    case 'action': {
      if (!bot.state) return;
      bot.state = applyAction(bot.state, msg.action);
      if (checksum(bot.state) !== msg.check) bot.drift++;
      if (bot.state.phase === 'game-over' && bot.seat === 0) finished++;
      act(bot);
      break;
    }
    case 'fun': {
      bot.fun = msg.fun;
      playFun(bot);
      if (msg.fun?.stage === 'done' && bot.seat === 0) {
        funDone++;
        funMedals += msg.fun.participants.length > 1 ? (msg.fun.winners?.length ?? 0) : 0;
        funNotes.push(`${msg.fun.game}: ${msg.fun.winners?.length ? `seat ${msg.fun.winners.join('+')} won` : 'no winner'}${msg.fun.note ? ` (${msg.fun.note})` : ''}`);
      }
      if (msg.fun?.stage === 'done') act(bot);
      break;
    }
    case 'mg-begin':
      if (msg.participants.includes(bot.seat)) {
        if (bot.seat === msg.participants[0]) minigames++;
        setTimeout(() => bot.ws.send(JSON.stringify({ t: 'mg-score', score: Math.floor(Math.random() * 60), summary: 'bot' })), 5);
      }
      break;
    default:
      break;
  }
}

/** A Chautari match is on: join it, and play our part. */
function playFun(bot: Bot): void {
  const fun = bot.fun;
  if (!fun || !fun.participants.includes(bot.seat)) return;
  const say = (m: object): void => {
    setTimeout(() => bot.ws.send(JSON.stringify(m)), 1);
  };
  if (fun.stage === 'ready' && !fun.ready.includes(bot.seat) && !fun.out.includes(bot.seat)) {
    say({ t: 'fun-ready', join: true });
  } else if (fun.stage === 'play') {
    if (fun.game === 'stack' && bot.scored !== fun.id) {
      bot.scored = fun.id;
      say({ t: 'fun-score', score: 3 + bot.seat * 2, summary: 'bot' });
    } else if (fun.bagh && fun.sides && fun.sides[fun.bagh.turn] === bot.seat && bot.sentPly !== fun.bagh.plies) {
      bot.sentPly = fun.bagh.plies;
      const move = aiMove(fun.bagh, Math.random);
      if (move) say({ t: 'fun-move', move });
    } else if (fun.tug) {
      // Seat 0 pulls a little harder, so somebody wins.
      say({ t: 'fun-input', n: bot.seat === fun.tug.pullers[0] ? 2 : 1 });
    }
  }
}

/** If it's this bot's turn, do what a player would. */
function act(bot: Bot): void {
  const state = bot.state;
  if (!state || state.phase === 'game-over' || current(state).id !== bot.seat) return;
  if (state.phase === 'moving') return; // the server chains these
  if (bot.fun && bot.fun.stage !== 'done') return; // the journey waits for the Chautari
  // Before rolling, the host calls a few friendly games at the Chautari.
  if (bot.seat === 0 && state.phase === 'await-roll' && funCalled < FUN_PLAN.length && funCalled === funDone) {
    const game = FUN_PLAN[funCalled++];
    const everyone = state.players.map((p) => p.id);
    const participants = game === 'stack' ? everyone : [0, 1];
    setTimeout(() => bot.ws.send(JSON.stringify({ t: 'fun-open', game, participants })), 1);
    return;
  }
  const next = nextAction(state);
  if (next) setTimeout(() => bot.ws.send(JSON.stringify({ t: 'action', action: next })), 1);
}

const host = await connect();
host.ws.send(JSON.stringify({ t: 'create', name: 'Host' }));
await new Promise((r) => setTimeout(r, 150));
const bots = [host];
for (let i = 1; i < PLAYERS; i++) {
  const b = await connect();
  b.ws.send(JSON.stringify({ t: 'join', code: host.code, name: `Guest${i}` }));
  bots.push(b);
}
await new Promise((r) => setTimeout(r, 200));
host.ws.send(JSON.stringify({ t: 'start' }));

const started = Date.now();
while (finished === 0 && Date.now() - started < 120_000) await new Promise((r) => setTimeout(r, 100));

const drift = bots.reduce((n, b) => n + b.drift, 0);
const turns = host.state?.turn ?? 0;
// Every client must agree on the medals, and they must match what the matches awarded.
const medalViews = bots.map((b) => (b.state?.players ?? []).map((p) => p.medals ?? 0).join(','));
const medalTotal = (host.state?.players ?? []).reduce((n, p) => n + (p.medals ?? 0), 0);
const medalsOk = new Set(medalViews).size === 1 && medalTotal === funMedals;
const funOk = funDone === FUN_PLAN.length;
const ok = finished === 1 && drift === 0 && medalsOk && funOk;
console.log(
  `${ok ? 'PASS' : 'FAIL'}  online game with ${PLAYERS} clients: ${finished ? 'finished' : 'did NOT finish'} in ${turns} turns, ` +
    `${minigames} mini-games played over the wire, ${drift} checksum mismatch(es)`,
);
console.log(
  `      Chautari: ${funDone}/${FUN_PLAN.length} friendly games finished, medals ${medalViews.join(' | ')} (expected total ${funMedals})${medalsOk ? '' : '  ← MISMATCH'}`,
);
for (const note of funNotes) console.log(`        · ${note}`);
for (const b of bots) b.ws.close();
process.exit(ok ? 0 : 1);
