/**
 * Plays whole online games against a running server, with bot clients, and
 * checks that every client's copy of the game stays identical to the
 * server's. Start the server first (`npm run server`), then `npm run netsim`.
 */

import WebSocket from 'ws';
import { nextAction } from '../src/engine/autoplay.ts';
import { applyAction, current } from '../src/engine/reducer.ts';
import type { GameState } from '../src/engine/types.ts';
import { checksum, type ServerMessage } from '../src/net/protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const PLAYERS = Number(process.env.PLAYERS ?? 3);

type Bot = { ws: WebSocket; seat: number; state: GameState | null; drift: number; code?: string };

function connect(): Promise<Bot> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const bot: Bot = { ws, seat: -1, state: null, drift: 0 };
    ws.on('open', () => resolve(bot));
    ws.on('message', (data) => onMessage(bot, JSON.parse(String(data)) as ServerMessage));
  });
}

let finished = 0;
let minigames = 0;

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

/** If it's this bot's turn, do what a player would. */
function act(bot: Bot): void {
  const state = bot.state;
  if (!state || state.phase === 'game-over' || current(state).id !== bot.seat) return;
  if (state.phase === 'moving') return; // the server chains these
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
while (finished === 0 && Date.now() - started < 60_000) await new Promise((r) => setTimeout(r, 100));

const drift = bots.reduce((n, b) => n + b.drift, 0);
const turns = host.state?.turn ?? 0;
const ok = finished === 1 && drift === 0;
console.log(
  `${ok ? 'PASS' : 'FAIL'}  online game with ${PLAYERS} clients: ${finished ? 'finished' : 'did NOT finish'} in ${turns} turns, ` +
    `${minigames} mini-games played over the wire, ${drift} checksum mismatch(es)`,
);
for (const b of bots) b.ws.close();
process.exit(ok ? 0 : 1);
