/**
 * Wiring: engine state in, 3D and DOM out, player input back through one
 * `dispatch`.
 *
 * On one device, `dispatch` applies actions to the local state directly.
 * Online, the server owns the state: input goes up the socket as a request,
 * and every action — ours and everyone else's — comes back down and is played
 * out through the very same reducer and animations, in order.
 */

import * as THREE from 'three';
import './style.css';

import boardFile from './data/board.full.json' with { type: 'json' };
import nepalmandal from './data/decks/nepalmandal.json' with { type: 'json' };
import chitwan from './data/decks/chitwan.json' with { type: 'json' };
import lumbini from './data/decks/lumbini.json' with { type: 'json' };
import pokhara from './data/decks/pokhara.json' with { type: 'json' };
import himalayan from './data/decks/himalayan.json' with { type: 'json' };
import eastern from './data/decks/eastern.json' with { type: 'json' };
import westernterai from './data/decks/westernterai.json' with { type: 'json' };
import westernhillside from './data/decks/westernhillside.json' with { type: 'json' };
import mountain from './data/decks/mountain.json' with { type: 'json' };
import wild from './data/decks/wild.json' with { type: 'json' };

import type { DeckFile } from './engine/decks.ts';
import { nextAction } from './engine/autoplay.ts';
import { applyAction, current } from './engine/reducer.ts';
import { newGame, type BoardFile } from './engine/setup.ts';
import type { Action, GameState } from './engine/types.ts';

import { buildBoard } from './render/board3d.ts';
import { buildDice } from './render/dice3d.ts';
import { buildSpinner } from './render/spinner3d.ts';
import { buildEnvironment } from './render/environment.ts';
import { buildPawns } from './render/pawn.ts';
import { buildScenery } from './render/scenery.ts';
import { createStage } from './render/scene.ts';
import { createOverlay } from './ui/cardmodal.ts';
import { createHand } from './ui/hand.ts';
import { closeMinigame, minigameRunning, playMinigame, playOwnRound, showResult, showWaiting } from './ui/minigames/host.ts';
import { runLobby, setRoomParam } from './ui/lobby.ts';
import { forgetSeat, type NetClient } from './net/client.ts';
import { checksum, type ServerMessage } from './net/protocol.ts';
import { createHud } from './ui/hud.ts';

const DECK_FILES = [
  nepalmandal, chitwan, lumbini, pokhara, himalayan, eastern, westernterai, westernhillside, mountain, wild,
] as unknown as DeckFile[];
const BOARD = boardFile as unknown as BoardFile;

/** ?seed=123 replays an identical game — handy for debugging and for demos. */
const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const playersParam = params.get('players');
/** ?auto=1 lets the travelers play themselves — a demo, and a way to smoke-test the flow. */
const autoPlay = params.get('auto') === '1';

/** The board never changes, so the world can be built before anyone joins. */
const BOARD_STATE = newGame({ seed: 1, playerCount: 2, boardFile: BOARD, deckFiles: DECK_FILES }).board;

// --- the world (built once, shown behind the start screen) -------------------

const stage = createStage(document.getElementById('stage')!);

const board = buildBoard(BOARD_STATE);
stage.scene.add(board.group);
stage.frame(board.bounds);

const environment = buildEnvironment(board.bounds);
stage.scene.add(environment.group);

const scenery = buildScenery(BOARD_STATE);
stage.scene.add(scenery.group);

let elapsed = 0;
stage.onFrame((dt) => {
  elapsed += dt;
  environment.update(dt, elapsed);
  scenery.update(dt);
  board.update(dt);
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- a game ----------------------------------------------------------------------

type Online = { net: NetClient; seq: number };

function startGame(initial: GameState, online: Online | null): void {
  let state = initial;
  const net = online?.net ?? null;
  const me = net ? net.seat : null;

  const pawns = buildPawns(state.players, board);
  stage.scene.add(pawns.group);

  const dice = buildDice();
  stage.scene.add(dice.group);

  /** The Maane prayer-wheel spinner — what moves you, 1 to 8. */
  const spinner = buildSpinner();
  stage.scene.add(spinner.group);

  stage.onFrame((dt) => {
    pawns.update(dt);
    dice.update(dt);
    spinner.update(dt);
  });

  for (const player of state.players) pawns.place(player.id, player.nodeId);

  // --- ui ----------------------------------------------------------------------

  const minigameRoot = document.getElementById('minigame')!;
  const hand = createHand(document.getElementById('hand')!, document.getElementById('viewer')!);
  if (me !== null) hand.setHome(me);
  const hud = createHud(
    document.getElementById('hud')!,
    (action) => void dispatch(action),
    (playerId) => hand.view(playerId),
  );
  const overlay = createOverlay(document.getElementById('overlay')!, (action) => void dispatch(action));

  /** True while an animation is playing; input is locked so state can't race it. */
  let busy = false;
  /** Online: travelers who have dropped off. */
  let away: number[] = [];

  const myTurn = (): boolean => me === null || current(state).id === me;

  function render(): void {
    const turnHolder = current(state);
    let note: string | undefined;
    if (net && !net.connected) note = 'Connection lost — reconnecting to the room…';
    else if (net && !myTurn() && state.phase !== 'game-over') {
      note = away.includes(turnHolder.id)
        ? `${turnHolder.name} has dropped off. If they don't come back soon, the game plays their turn for them.`
        : `Waiting for ${turnHolder.name}…`;
    }
    hud.render(state, busy || !myTurn(), net ? { note, me: me!, away, room: net.code } : {});
    overlay.render(state, busy, net && !myTurn() ? turnHolder.name : undefined);
    hand.render(state);

    pawns.setActive(turnHolder.id);
    board.setHighlight(state.phase === 'await-branch' && myTurn() ? state.branchOptions : []);
  }

  // --- the dispatch chokepoint -----------------------------------------------

  /**
   * Player input lands here. Locally: apply the action, then play out whatever
   * the new state implies before giving control back. Online: ask the server,
   * which answers with the action for everyone.
   */
  async function dispatch(action: Action): Promise<void> {
    if (busy) return;

    if (net) {
      if (!myTurn() || minigameRunning() || queue.length > 0) return;
      net.send({ t: 'action', action });
      return;
    }

    // A mini-game people actually play: run it, then send the scores along.
    if (
      action.type === 'PLAY_MINIGAME' &&
      !action.result &&
      !autoPlay &&
      state.pendingMinigame &&
      state.pendingMinigame.spec.type !== 'feast'
    ) {
      busy = true;
      render();
      let result;
      try {
        result = await playMinigame(minigameRoot, state);
      } finally {
        busy = false;
      }
      return dispatch({ type: 'PLAY_MINIGAME', result });
    }

    const previous = state;
    state = applyAction(state, action);
    if (state === previous) return;

    busy = true;
    render();

    try {
      await playOut(action, previous);
    } finally {
      busy = false;
    }

    render();

    if (autoPlay) {
      const next = nextAction(state);
      if (next) {
        await wait(450);
        void dispatch(next);
      }
    }
  }

  async function playOut(action: Action, previous: GameState): Promise<void> {
    const mover = current(previous);

    switch (action.type) {
      case 'ROLL': {
        if (state.lastRoll) {
          stage.focusOn(board.worldPos(mover.nodeId));
          await spinBeside(mover.nodeId, state.lastRoll.dice[0]);
        }
        spinner.hide();
        await walkPawn(mover.id);
        await finish({ type: 'MOVE_COMPLETE' });
        break;
      }

      case 'CHOOSE_BRANCH': {
        await walkPawn(mover.id);
        await finish({ type: 'MOVE_COMPLETE' });
        break;
      }

      case 'PLAY_MINIGAME': {
        // Only the unplayed fallback rolls dice; a played game has no faces to show.
        if (state.minigameRoll && state.minigameRoll.dice.length > 0) {
          await rollDiceBeside(mover.nodeId, state.minigameRoll.dice, 520);
        }
        dice.hide();
        break;
      }

      case 'RESOLVE_CARD': {
        // A wild card may have moved the pawn; play that out, then end the turn.
        if (state.pendingPath.length > 0) {
          await walkPawn(mover.id);
          await finish({ type: 'END_TURN' });
        }
        break;
      }

      default:
        break;
    }
  }

  /** Throw the dice on the board next to the traveler who is rolling. */
  async function rollDiceBeside(nodeId: string, values: number[], linger = 320): Promise<void> {
    const at = board.standPos(nodeId);
    // Offset toward the camera so the dice never land under a pawn or a temple.
    dice.group.position.set(at.x, at.y + 0.9, at.z - 2.6);
    await dice.roll(values);
    await wait(linger);
  }

  /** Spin the prayer wheel next to the traveler, number turned toward the camera. */
  async function spinBeside(nodeId: string, value: number): Promise<void> {
    const at = board.standPos(nodeId);
    // Offset toward the camera so the wheel never stands inside a pawn or a temple.
    const toCam = stage.camera.position.clone().sub(at).setY(0).normalize();
    spinner.group.position.set(at.x + toCam.x * 2.4, at.y + 1.25, at.z + toCam.z * 2.4);
    spinner.faceToward(stage.camera.position);
    await spinner.roll([value]);
    await wait(650);
  }

  /** Hop the pawn along whatever path the reducer queued, then clear it. */
  async function walkPawn(playerId: number): Promise<void> {
    const path = state.pendingPath;
    if (path.length === 0) return;
    stage.focusOn(board.worldPos(path[path.length - 1]));
    await pawns.move(playerId, path);
    await wait(140);
  }

  /**
   * Continue the chain without re-entering the busy guard. Online, the server
   * sends these follow-ups itself, so they arrive through the queue instead.
   */
  async function finish(action: Action): Promise<void> {
    if (net) return;
    const previous = state;
    state = applyAction(state, action);
    if (state !== previous) {
      render();
      await playOut(action, previous);
    }
  }

  // --- online: everything the server says, played out in order ------------------

  const queue: ServerMessage[] = [];
  let draining = false;
  let seq = online?.seq ?? 0;
  let ownRound: Promise<void> | null = null;
  let progress: Array<{ seat: number; score: number; summary: string }> = [];

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const msg = queue.shift()!;
        await handle(msg);
      }
    } finally {
      draining = false;
      render();
    }
  }

  async function handle(msg: ServerMessage): Promise<void> {
    if (!net) return;
    switch (msg.t) {
      case 'action': {
        if (msg.seq !== seq + 1) {
          net.send({ t: 'resync' });
          return;
        }
        seq = msg.seq;
        const isResult = msg.action.type === 'PLAY_MINIGAME' && msg.action.result;
        // Let my own round finish on screen before the results replace it.
        if (isResult && ownRound) await ownRound;
        const previous = state;
        state = applyAction(state, msg.action);
        if (checksum(state) !== msg.check) {
          net.send({ t: 'resync' });
          return;
        }
        if (isResult && msg.action.type === 'PLAY_MINIGAME' && msg.action.result) {
          ownRound = null;
          progress = [];
          await showResult(minigameRoot, previous, msg.action.result);
        }
        busy = true;
        render();
        try {
          await playOut(msg.action, previous);
        } finally {
          busy = false;
        }
        if (state.phase === 'game-over') {
          // The game is done: a refresh should go back to the start screen.
          forgetSeat();
          setRoomParam(null);
        }
        render();
        return;
      }

      case 'snapshot': {
        seq = msg.seq;
        state = msg.state;
        spinner.hide();
        dice.hide();
        closeMinigame(minigameRoot);
        for (const player of state.players) pawns.place(player.id, player.nodeId);
        render();
        return;
      }

      case 'mg-begin': {
        progress = [];
        if (msg.participants.includes(me!)) {
          if (!ownRound) {
            ownRound = playOwnRound(minigameRoot, state, me!).then((r) => {
              net.send({ t: 'mg-score', score: r.score, summary: r.summary });
              showWaiting(minigameRoot, state, progress);
            });
          }
        } else {
          showWaiting(minigameRoot, state, progress);
        }
        return;
      }

      case 'mg-progress': {
        progress = msg.done;
        if (!minigameRunning()) showWaiting(minigameRoot, state, progress);
        return;
      }

      default:
        return;
    }
  }

  if (net) {
    net.on((msg) => {
      if (msg.t === 'lobby') {
        away = msg.players.filter((p) => !p.connected).map((p) => p.seat);
        render();
        return;
      }
      if (msg.t === 'action' || msg.t === 'snapshot' || msg.t === 'mg-begin' || msg.t === 'mg-progress') {
        // Everything waits its turn behind running animations, so the local
        // state is always caught up before a mini-game reads it.
        queue.push(msg);
        void drain();
      }
    });
    net.onStatus(() => render());
  }

  // --- clicking a glowing tile to choose a branch ------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  stage.renderer.domElement.addEventListener('pointerdown', (event) => {
    if (busy || state.phase !== 'await-branch' || !myTurn()) return;

    const rect = stage.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, stage.camera);
    const hit = raycaster.intersectObjects(board.pickables(), false)[0];
    const nodeId = hit?.object.userData.nodeId as string | undefined;
    if (nodeId) void dispatch({ type: 'CHOOSE_BRANCH', nodeId });
  });

  // --- keyboard: space is the primary action ----------------------------------

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || busy || minigameRunning() || !myTurn()) return;
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
    event.preventDefault();

    switch (state.phase) {
      case 'await-roll':
        void dispatch({ type: 'ROLL' });
        break;
      case 'checkpoint-minigame':
      case 'card-minigame':
        void dispatch({ type: 'PLAY_MINIGAME' });
        break;
      case 'await-draw':
        void dispatch({ type: 'DRAW_CARD' });
        break;
      case 'resolve-card':
        void dispatch({ type: 'RESOLVE_CARD' });
        break;
      case 'end-turn':
        void dispatch({ type: 'END_TURN' });
        break;
      default:
        break;
    }
  });

  render();

  if (autoPlay && !net) {
    const opening = nextAction(state);
    if (opening) void dispatch(opening);
  }

  /** A read-only snapshot for debugging from the browser console. */
  (window as unknown as Record<string, unknown>).travelNepal = () => ({
    phase: state.phase,
    turn: state.turn,
    busy,
    online: net ? { room: net.code, seat: me, seq } : null,
    winnerId: state.winnerId,
    players: state.players.map((p) => ({
      name: p.name,
      node: p.nodeId,
      cards: p.passport.length,
      tickets: p.tickets,
      finished: p.finished,
    })),
    log: state.log.slice(-6).map((e) => e.text),
  });
}

// --- start: straight in for demo/debug URLs, otherwise the start screen ---------------

function localGame(players: number): GameState {
  return newGame({
    seed: seedParam ? Number(seedParam) : undefined,
    playerCount: players,
    boardFile: BOARD,
    deckFiles: DECK_FILES,
  });
}

if (autoPlay || seedParam || playersParam) {
  startGame(localGame(playersParam ? Number(playersParam) : 2), null);
} else {
  void runLobby(document.getElementById('lobby')!).then((choice) => {
    if (choice.kind === 'local') startGame(localGame(choice.players), null);
    else startGame(choice.state, { net: choice.net, seq: choice.seq });
  });
}
