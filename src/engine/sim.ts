/**
 * Headless rules check. Plays whole games with the autoplayer and asserts the
 * invariants that matter, then replays one game to prove determinism.
 *
 *   npm run sim
 */

import boardFile from '../data/board.full.json' with { type: 'json' };
import nepalmandal from '../data/decks/nepalmandal.json' with { type: 'json' };
import chitwan from '../data/decks/chitwan.json' with { type: 'json' };
import lumbini from '../data/decks/lumbini.json' with { type: 'json' };
import pokhara from '../data/decks/pokhara.json' with { type: 'json' };
import himalayan from '../data/decks/himalayan.json' with { type: 'json' };
import eastern from '../data/decks/eastern.json' with { type: 'json' };
import westernterai from '../data/decks/westernterai.json' with { type: 'json' };
import westernhillside from '../data/decks/westernhillside.json' with { type: 'json' };
import mountain from '../data/decks/mountain.json' with { type: 'json' };
import wild from '../data/decks/wild.json' with { type: 'json' };

import { nodeAt } from './board.ts';
import { nextAction } from './autoplay.ts';
import { applyAction, scoreFor } from './reducer.ts';
import { newGame, type BoardFile } from './setup.ts';
import type { DeckFile } from './decks.ts';
import type { Action, GameState } from './types.ts';

const DECK_FILES = [
  nepalmandal, chitwan, lumbini, pokhara, himalayan, eastern, westernterai, westernhillside, mountain, wild,
] as unknown as DeckFile[];
const BOARD = boardFile as unknown as BoardFile;

const MAX_ACTIONS = 20000;

function fresh(seed: number, playerCount: number): GameState {
  return newGame({ seed, playerCount, boardFile: BOARD, deckFiles: DECK_FILES });
}

function check(ok: boolean, message: string): void {
  if (!ok) {
    console.error(`FAIL  ${message}`);
    failures += 1;
  }
}

let failures = 0;

/** Invariants that must hold after every single action. */
function assertInvariants(state: GameState, label: string): void {
  for (const player of state.players) {
    const node = nodeAt(state.board, player.nodeId);

    const gate = node.requiresTicket;
    check(
      !gate || player.tickets.includes(gate),
      `${label}: ${player.name} is on gated node ${node.id} without a ${gate} ticket`,
    );

    check(scoreFor(state, player) >= 0, `${label}: ${player.name} has a negative score`);

    check(
      player.passport.every((id) => state.cards[id] && state.cards[id].toPassport),
      `${label}: ${player.name} has a non-passport card in the passport`,
    );

    check(player.singleDieTurns >= 0, `${label}: ${player.name} has negative bike turns`);
  }

  for (const deck of Object.values(state.decks)) {
    const total = deck.draw.length + deck.discard.length;
    check(total > 0, `${label}: deck ${deck.id} lost every card`);
  }
}

/** Walk the move the engine just queued and confirm it never skips a checkpoint. */
function assertNoCheckpointSkipped(before: GameState, after: GameState, label: string): void {
  const path = after.pendingPath;
  if (path.length < 2) return;
  if (before.phase === 'resolve-card') return; // wild cards move past checkpoints by design

  const passedCheckpoint = path
    .slice(0, -1)
    .some((id) => nodeAt(after.board, id).kind === 'checkpoint');
  check(!passedCheckpoint, `${label}: a move ran straight through a checkpoint`);
}

function playGame(seed: number, playerCount: number): { state: GameState; actions: Action[] } {
  let state = fresh(seed, playerCount);
  const actions: Action[] = [];

  for (let i = 0; i < MAX_ACTIONS && state.phase !== 'game-over'; i++) {
    const action = nextAction(state);
    if (!action) break;

    const before = state;
    state = applyAction(state, action);
    actions.push(action);

    check(state !== before || action.type === 'MOVE_COMPLETE', `seed ${seed}: ${action.type} was a no-op`);
    assertInvariants(state, `seed ${seed} after ${action.type}`);
    assertNoCheckpointSkipped(before, state, `seed ${seed}`);
  }

  return { state, actions };
}

// --- run ---------------------------------------------------------------------

const games = 60;
let finished = 0;
let totalTurns = 0;

for (let seed = 1; seed <= games; seed++) {
  const playerCount = 2 + (seed % 3);
  const { state } = playGame(seed, playerCount);

  if (state.phase === 'game-over') {
    finished += 1;
    totalTurns += state.turn;
    check(state.winnerId !== null, `seed ${seed}: game over with no winner`);
    check(
      state.players.every((p) => p.finished),
      `seed ${seed}: game over while someone was still travelling`,
    );
  } else {
    check(false, `seed ${seed}: did not finish within ${MAX_ACTIONS} actions (phase ${state.phase})`);
  }
}

// Determinism: same seed, same action log, same final state.
const first = playGame(7, 3);
const second = playGame(7, 3);
check(
  JSON.stringify(first.state) === JSON.stringify(second.state),
  'replay with the same seed diverged',
);
check(
  JSON.stringify(first.actions) === JSON.stringify(second.actions),
  'replay produced a different action log',
);

// A Get Together feeds the whole table: everybody still travelling collects it.
{
  let state = fresh(11, 3);
  const feast = Object.values(state.cards).find((c) => c.minigame?.type === 'feast')!;
  check(Boolean(feast), 'no Get Together card to test the feast rule with');

  state = {
    ...state,
    phase: 'card-minigame',
    drawnCardId: feast.id,
    pendingMinigame: { source: 'card', spec: feast.minigame!, cardId: feast.id },
  };
  state = applyAction(state, { type: 'PLAY_MINIGAME' });
  state = applyAction(state, { type: 'RESOLVE_CARD' });

  check(
    state.players.every((p) => p.passport.includes(feast.id)),
    'a Get Together did not reach every traveler at the table',
  );
}

// A duel is decided against the opponent's roll, not a fixed target.
{
  let state = fresh(5, 2);
  const duel = Object.values(state.cards).find((c) => c.minigame?.opponents === 'one')!;
  check(Boolean(duel), 'no one-on-one duel card to test with');

  state = {
    ...state,
    phase: 'card-minigame',
    drawnCardId: duel.id,
    pendingMinigame: { source: 'card', spec: duel.minigame!, cardId: duel.id },
  };
  state = applyAction(state, { type: 'PLAY_MINIGAME' });

  check(state.minigameRivals.length === 1, 'a one-on-one duel did not roll for an opponent');
  check(
    state.minigameWon === (state.minigameRoll!.total >= state.minigameRivals[0].total),
    'duel outcome did not follow the two rolls',
  );
}

// Hire a Bike must buy exactly five single-die rolls, then hand the second
// die back — the turn the card is drawn on must not eat one of them.
{
  let state = fresh(3, 1 + 1);
  const bike = Object.values(state.cards).find((c) => c.effect === 'hire-a-bike')!;
  check(Boolean(bike), 'no Hire a Bike card in the wild deck');

  state = {
    ...state,
    players: state.players.map((p, i) => (i === 0 ? { ...p, singleDieTurns: 5 } : p)),
  };

  const halved: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    // Spin, then skip straight back to this player's next spin.
    state = applyAction({ ...state, phase: 'await-roll' }, { type: 'ROLL' });
    const roll = state.lastRoll!;
    halved.push(Boolean(roll.bike));
    check(roll.dice[0] >= 1 && roll.dice[0] <= 8, `spin ${roll.dice[0]} is off the 1-8 wheel`);
    check(roll.total === (roll.bike ? Math.ceil(roll.dice[0] / 2) : roll.dice[0]), 'spin total does not match the wheel');
    state = { ...state, currentPlayerIndex: 0 };
  }

  check(
    JSON.stringify(halved) === JSON.stringify([true, true, true, true, true, false]),
    `Hire a Bike halved spins ${halved.join(',')}, expected five then none`,
  );
}

// A played mini-game is decided by the reported scores, not a die.
{
  let state = fresh(8, 3);
  const duel = Object.values(state.cards).find((c) => c.minigame?.opponents === 'one')!;
  state = {
    ...state,
    phase: 'card-minigame',
    drawnCardId: duel.id,
    pendingMinigame: { source: 'card', spec: duel.minigame!, cardId: duel.id },
  };
  const rival = state.players[1].id;
  const cursor = state.rngCursor;
  const lost = applyAction(state, {
    type: 'PLAY_MINIGAME',
    result: { game: 'Test', score: 10, passed: true, rivals: [{ playerId: rival, score: 12 }] },
  });
  check(lost.minigameWon === false, 'a reported duel score did not decide the duel');
  check(lost.rngCursor === cursor, 'a played mini-game should not consume randomness');

  const tour = Object.values(state.cards).find((c) => c.category === 'travel-tour')!;
  const solo = applyAction(
    { ...state, drawnCardId: tour.id, pendingMinigame: { source: 'card', spec: tour.minigame!, cardId: tour.id } },
    { type: 'PLAY_MINIGAME', result: { game: 'Test', score: 3, passed: true, target: 2 } },
  );
  check(solo.minigameWon === true && solo.phase === 'resolve-card', 'a passed solo mini-game was not won');
}

const label = failures === 0 ? 'PASS' : 'FAIL';
console.log(
  `${label}  ${games} games, ${finished} finished, avg ${(totalTurns / Math.max(finished, 1)).toFixed(1)} turns, ${failures} failure(s)`,
);

process.exit(failures === 0 ? 0 : 1);
