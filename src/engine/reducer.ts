/**
 * The rules of Travel Nepal.
 *
 * Every mutation of the game goes through `applyAction`. Nothing here touches
 * the DOM, three.js, or Math.random — which is what lets the same function run
 * on a server later and keeps replays byte-identical.
 */

import { branchSections, nodeAt, walk, walkBack, walkForce } from './board.ts';
import { discardCard, drawCard } from './decks.ts';
import { rollDie, type RngHandle } from './rng.ts';
import type {
  Action,
  Card,
  GameState,
  MinigameSpec,
  Player,
  RollResult,
  SectionId,
} from './types.ts';

/** The Maane — the eight-sided prayer-wheel spinner — moves you 1 to 8. */
const SPINNER_SIDES = 8;
/** The Ashtamangal die, kept for mini-games nobody plays by hand. */
const ASHTAMANGAL_SIDES = 8;

/** One stop in five draws from the wild deck instead of the section deck. */
const WILD_DRAW_IN = 5;

const HOMESICK_STEPS = 10;
const EXTEND_VACATION_STEPS = 10;
const HIRE_A_BIKE_ROLLS = 5;

/** Default target for a checkpoint dice-off when the node doesn't set one. */
const CHECKPOINT_TARGET = 5;

// --- small immutable helpers -------------------------------------------------

function rngOf(state: GameState): RngHandle {
  return { seed: state.seed, cursor: state.rngCursor };
}

function withRng(state: GameState, rng: RngHandle): GameState {
  return { ...state, rngCursor: rng.cursor };
}

function updatePlayer(
  state: GameState,
  id: number,
  patch: (p: Player) => Player,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? patch(p) : p)),
  };
}

function log(state: GameState, text: string): GameState {
  const player = current(state);
  return {
    ...state,
    log: [...state.log, { turn: state.turn, playerId: player.id, text }],
  };
}

export function current(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/** The trip a section's ticket opens, by the name printed on the board ("Eastern Trip"). */
function tripLabel(state: GameState, section: SectionId): string {
  const gate = Object.values(state.board.nodes).find((n) => n.requiresTicket === section && n.label);
  return gate?.label ?? section;
}

function grantTicket(state: GameState, playerId: number, section: SectionId): GameState {
  const player = state.players.find((p) => p.id === playerId)!;
  if (player.tickets.includes(section)) return state;
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    tickets: [...p.tickets, section],
  }));
}

// --- dice --------------------------------------------------------------------

/**
 * Movement: one spin of the Maane prayer wheel, 1 to 8. On a hired bike the
 * spin is halved (rounded up), so you travel slower and see more of Nepal.
 */
function rollMovement(rng: RngHandle, player: Player): RollResult {
  const spin = rollDie(rng, SPINNER_SIDES);
  const bike = player.singleDieTurns > 0;
  return { dice: [spin], total: bike ? Math.ceil(spin / 2) : spin, bike };
}

function rollMinigame(rng: RngHandle): RollResult {
  const dice = [rollDie(rng, ASHTAMANGAL_SIDES)];
  return { dice, total: dice[0] };
}

/** Who the active player is up against: nobody, the next traveler, or everyone. */
export function rivalsFor(state: GameState, spec: MinigameSpec): Player[] {
  if (!spec.opponents || spec.type === 'feast') return [];

  const others = state.players.filter(
    (p) => p.id !== current(state).id && !p.finished,
  );
  return spec.opponents === 'one' ? others.slice(0, 1) : others;
}

function minigameSummary(
  state: GameState,
  spec: MinigameSpec,
  total: number,
  rivals: Array<{ playerId: number; total: number }>,
  target: number,
  won: boolean,
): string {
  if (spec.type === 'feast') return 'A feast for everyone at the table.';

  if (rivals.length > 0) {
    const scores = rivals
      .map((r) => `${state.players.find((p) => p.id === r.playerId)?.name ?? '?'} ${r.total}`)
      .join(', ');
    return won
        ? `duel won with ${total} against ${scores}.`
      : `duel lost with ${total} against ${scores}.`;
  }

  return won
    ? `mini-game won with ${total} (needed ${target}).`
    : `mini-game lost with ${total} (needed ${target}).`;
}

// --- movement ----------------------------------------------------------------

/**
 * Run a walk result into state: queue the path for the renderer and park the
 * machine in 'moving'. Arrival effects are applied on MOVE_COMPLETE so the
 * animation and the rules stay in step.
 */
function beginMove(state: GameState, from: string, steps: number): GameState {
  const player = current(state);
  const result = walk(state.board, from, steps, player.tickets);

  const next: GameState = {
    ...state,
    phase: 'moving',
    pendingPath: result.path,
    branchOptions: result.reason === 'junction' ? result.options : [],
    // Stash the unspent steps on the junction so CHOOSE_BRANCH can resume.
    pendingSteps: result.reason === 'junction' ? result.stepsRemaining : 0,
  };

  const moved = updatePlayer(next, player.id, (p) => ({
    ...p,
    nodeId: result.endNodeId,
    finished: p.finished || nodeAt(state.board, result.endNodeId).kind === 'terminus',
  }));

  if (result.reason === 'blocked') {
    return log(moved, 'Stopped at the gate — no entry ticket for that section.');
  }
  return moved;
}

// --- arrival resolution ------------------------------------------------------

/** Decide the phase the player lands in, once the pawn has finished moving. */
function resolveArrival(state: GameState): GameState {
  const player = current(state);
  const node = nodeAt(state.board, player.nodeId);

  // A junction still holding unspent steps: the player picks a road.
  if (state.branchOptions.length > 0) {
    return { ...state, phase: 'await-branch' };
  }

  if (node.kind === 'terminus') {
    return log({ ...state, phase: 'end-turn' }, 'Reached the end of the journey.');
  }

  // Stopping on a junction earns the entry ticket outright (printed rule).
  if (node.kind === 'junction') {
    const sections = branchSections(state.board, node.id);
    let next = state;
    for (const section of sections) {
      next = grantTicket(next, player.id, section);
    }
    const fresh = sections.filter((section) => !player.tickets.includes(section));
    if (fresh.length > 0) {
      next = log(next, `Stopped at the junction — got the ${fresh.map((x) => tripLabel(state, x)).join(' & ')} ticket.`);
    }
    return { ...next, phase: 'await-draw' };
  }

  if (node.kind === 'checkpoint') {
    return {
      ...state,
      phase: 'checkpoint-minigame',
      minigameWon: null,
      minigameRoll: null,
      pendingMinigame: {
        source: 'checkpoint',
        spec: { type: 'dice-off', target: CHECKPOINT_TARGET },
        ticketReward: node.ticketReward,
      },
    };
  }

  if (node.kind === 'ticket-counter') {
    return { ...state, phase: 'ticket-counter' };
  }

  if (node.kind === 'start') {
    return { ...state, phase: 'end-turn' };
  }

  return { ...state, phase: 'await-draw' };
}

// --- cards -------------------------------------------------------------------

/** Which deck this stop draws from; roughly one stop in five turns up a wild. */
function deckForNode(state: GameState, rng: RngHandle): string {
  const section = nodeAt(state.board, current(state).nodeId).section;
  const roll = rollDie(rng, WILD_DRAW_IN);
  if (roll === 1 && state.decks['wild']) return 'wild';
  return state.decks[section] ? section : 'wild';
}

function applyCard(state: GameState, card: Card): GameState {
  const player = current(state);

  if (card.effect) return applyWildEffect(state, card);

  // A card with a mini-game only pays out when the mini-game was won.
  const won = state.pendingMinigame?.source === 'card' ? state.minigameWon !== false : true;
  if (!won) {
    return log(state, `${card.title}: no luck this time, no points.`);
  }

  const points = card.minigame?.rewardPoints ?? card.points;
  if (!card.toPassport) return log(state, `${card.title} (+${points}).`);

  // A Get Together invites the whole table, so everybody still travelling
  // collects it — the card is a shared moment, not a private souvenir.
  if (card.minigame?.type === 'feast') {
    const shared = {
      ...state,
      players: state.players.map((p) =>
        p.finished ? p : { ...p, passport: [...p.passport, card.id] },
      ),
    };
    return log(shared, `${card.title} — everyone at the table collects (+${points}).`);
  }

  const next = updatePlayer(state, player.id, (p) => ({
    ...p,
    passport: [...p.passport, card.id],
  }));
  return log(next, `${card.title} collected (+${points}).`);
}

function applyWildEffect(state: GameState, card: Card): GameState {
  const player = current(state);

  switch (card.effect) {
    case 'hire-a-bike':
      return log(
        updatePlayer(state, player.id, (p) => ({ ...p, singleDieTurns: HIRE_A_BIKE_ROLLS })),
        `Hire a Bike — your next ${HIRE_A_BIKE_ROLLS} spins are halved.`,
      );

    case 'homesick': {
      const path = walkForce(state.board, player.nodeId, HOMESICK_STEPS, player.tickets);
      const dest = path.length ? path[path.length - 1] : player.nodeId;
      const moved = updatePlayer(state, player.id, (p) => ({
        ...p,
        nodeId: dest,
        finished: p.finished || nodeAt(state.board, dest).kind === 'terminus',
      }));
      return log({ ...moved, pendingPath: path }, 'Called home — ten steps forward.');
    }

    case 'extend-vacation': {
      const path = walkBack(state.board, player.nodeId, EXTEND_VACATION_STEPS);
      const dest = path.length ? path[path.length - 1] : player.nodeId;
      const moved = updatePlayer(state, player.id, (p) => ({ ...p, nodeId: dest }));
      return log({ ...moved, pendingPath: path }, 'Vacation extended — ten steps back.');
    }

    default:
      return state;
  }
}

// --- scoring -----------------------------------------------------------------

export function scoreFor(state: GameState, player: Player): number {
  return player.passport.reduce((sum, id) => sum + (state.cards[id]?.points ?? 0), 0);
}

/** Highest score wins; ties broken by number of cards collected. */
export function winnerOf(state: GameState): number | null {
  const ranked = [...state.players].sort((a, b) => {
    const diff = scoreFor(state, b) - scoreFor(state, a);
    return diff !== 0 ? diff : b.passport.length - a.passport.length;
  });
  return ranked.length ? ranked[0].id : null;
}

// --- the reducer -------------------------------------------------------------

export function applyAction(state: GameState, action: Action): GameState {
  const rng = rngOf(state);
  const player = current(state);

  switch (action.type) {
    case 'ROLL': {
      if (state.phase !== 'await-roll') return state;
      const roll = rollMovement(rng, player);

      // Hire a Bike buys five single-die ROLLS, so it is spent here rather than
      // at end of turn — otherwise the turn it is drawn on would eat one.
      const spent = updatePlayer(withRng(state, rng), player.id, (p) => ({
        ...p,
        singleDieTurns: Math.max(0, p.singleDieTurns - 1),
      }));

      const rolled = log(
        { ...spent, lastRoll: roll, minigameRoll: null, minigameRivals: [], minigameWon: null, minigamePlayed: null },
        roll.bike ? `Spun ${roll.dice[0]} — on the bike, ${roll.total}.` : `Spun ${roll.total}.`,
      );
      return beginMove(rolled, player.nodeId, roll.total);
    }

    case 'MOVE_COMPLETE': {
      if (state.phase !== 'moving') return state;
      return resolveArrival({ ...state, pendingPath: [] });
    }

    case 'CHOOSE_BRANCH': {
      if (state.phase !== 'await-branch') return state;
      if (!state.branchOptions.includes(action.nodeId)) return state;

      const target = nodeAt(state.board, action.nodeId);
      if (target.requiresTicket && !player.tickets.includes(target.requiresTicket)) {
        return log(state, 'That road needs an entry ticket you do not hold.');
      }

      const remaining = state.pendingSteps;
      const onward = walk(state.board, action.nodeId, Math.max(remaining - 1, 0), player.tickets);
      const path = [action.nodeId, ...onward.path];

      const moved = updatePlayer(
        {
          ...state,
          phase: 'moving',
          pendingPath: path,
          branchOptions: onward.reason === 'junction' ? onward.options : [],
          pendingSteps: onward.reason === 'junction' ? onward.stepsRemaining : 0,
        },
        player.id,
        (p) => ({
          ...p,
          nodeId: onward.endNodeId,
          finished: p.finished || nodeAt(state.board, onward.endNodeId).kind === 'terminus',
        }),
      );
      return log(moved, `Took the road to ${target.label ?? target.section}.`);
    }

    case 'CLAIM_COUNTER_TICKET': {
      if (state.phase !== 'ticket-counter') return state;
      const granted = grantTicket(state, player.id, action.section);
      return { ...log(granted, `Bought the ${tripLabel(state, action.section)} ticket at the counter.`), phase: 'await-draw' };
    }

    case 'SKIP_COUNTER': {
      if (state.phase !== 'ticket-counter') return state;
      return { ...state, phase: 'await-draw' };
    }

    case 'PLAY_MINIGAME': {
      if (state.phase !== 'checkpoint-minigame' && state.phase !== 'card-minigame') return state;
      const pending = state.pendingMinigame;
      if (!pending) return state;

      const played = action.result;
      const duelists = rivalsFor(state, pending.spec);
      let roll: RollResult;
      let rivals: Array<{ playerId: number; total: number }>;
      let target = pending.spec.target ?? CHECKPOINT_TARGET;
      let won: boolean;

      if (played && pending.spec.type !== 'feast') {
        // Somebody played it: take the scores they reported.
        roll = { dice: [], total: played.score };
        rivals = duelists.map((rival) => ({
          playerId: rival.id,
          total: played.rivals?.find((r) => r.playerId === rival.id)?.score ?? 0,
        }));
        if (played.target !== undefined) target = played.target;
        won = rivals.length > 0 ? rivals.every((r) => played.score >= r.total) : played.passed;
      } else {
        // Nobody at the keyboard: settle it with the Ashtamangal die. A duel
        // card names its opponents; everything else rolls against a target.
        // A feast is nobody's contest — it always goes ahead.
        roll = rollMinigame(rng);
        rivals = duelists.map((rival) => ({ playerId: rival.id, total: rollMinigame(rng).total }));
        won =
          pending.spec.type === 'feast'
            ? true
            : rivals.length > 0
              ? rivals.every((rival) => roll.total >= rival.total)
              : roll.total >= target;
      }

      let next: GameState = {
        ...withRng(state, rng),
        minigameRoll: roll,
        minigameRivals: rivals,
        minigameWon: won,
        minigamePlayed: played ? { game: played.game, target: played.target } : null,
      };

      const newTicket = won && pending.ticketReward && !player.tickets.includes(pending.ticketReward);
      if (won && pending.ticketReward) {
        next = grantTicket(next, player.id, pending.ticketReward);
      }

      next = log(
        next,
        (played ? `${played.game}: ` : '') +
          minigameSummary(state, pending.spec, roll.total, rivals, target, won) +
          (newTicket ? ` Won the ${tripLabel(state, pending.ticketReward!)} ticket.` : ''),
      );

      // A checkpoint mini-game is followed by the usual card draw; a card's own
      // mini-game instead decides whether that card pays out.
      return { ...next, phase: pending.source === 'checkpoint' ? 'await-draw' : 'resolve-card' };
    }

    case 'DRAW_CARD': {
      if (state.phase !== 'await-draw') return state;

      const deckId = deckForNode(state, rng);
      const deck = state.decks[deckId];
      if (!deck) return { ...withRng(state, rng), phase: 'end-turn' };

      const { deck: nextDeck, cardId } = drawCard(rng, deck);
      if (!cardId) return { ...withRng(state, rng), phase: 'end-turn' };

      const card = state.cards[cardId];
      const drawn: GameState = {
        ...withRng(state, rng),
        decks: { ...state.decks, [deckId]: nextDeck },
        drawnCardId: cardId,
        minigameWon: null,
        minigameRoll: null,
        minigameRivals: [],
        pendingMinigame: card.minigame
          ? { source: 'card', spec: card.minigame, cardId: card.id }
          : null,
      };

      return {
        ...log(drawn, `Drew ${card.title}.`),
        phase: card.minigame ? 'card-minigame' : 'resolve-card',
      };
    }

    case 'RESOLVE_CARD': {
      if (state.phase !== 'resolve-card') return state;
      const cardId = state.drawnCardId;
      if (!cardId) return { ...state, phase: 'end-turn' };

      const card = state.cards[cardId];
      const applied = applyCard(state, card);
      const deck = applied.decks[card.deck];

      return {
        ...applied,
        decks: deck ? { ...applied.decks, [card.deck]: discardCard(deck, cardId) } : applied.decks,
        drawnCardId: null,
        pendingMinigame: null,
        // A wild card may have moved the pawn; let the renderer play it out.
        phase: applied.pendingPath.length > 0 ? 'moving' : 'end-turn',
      };
    }

    case 'END_TURN': {
      if (state.phase !== 'end-turn' && state.phase !== 'moving') return state;

      if (state.players.every((p) => p.finished)) {
        return {
          ...state,
          phase: 'game-over',
          pendingPath: [],
          winnerId: winnerOf(state),
        };
      }

      // Skip anyone who has already flown home.
      let index = state.currentPlayerIndex;
      do {
        index = (index + 1) % state.players.length;
      } while (state.players[index].finished);

      return {
        ...state,
        currentPlayerIndex: index,
        turn: state.turn + 1,
        phase: 'await-roll',
        pendingPath: [],
        branchOptions: [],
        pendingSteps: 0,
        lastRoll: null,
        minigameRoll: null,
        minigameRivals: [],
        minigameWon: null,
        minigamePlayed: null,
        drawnCardId: null,
        pendingMinigame: null,
      };
    }

    case 'CHAUTARI_RESULT': {
      // Friendly games are played between turns (or once the journey is
      // over), so a medal can never land in the middle of a move or a card.
      if (state.phase !== 'await-roll' && state.phase !== 'game-over') return state;
      const winners = state.players.filter((p) => action.winners.includes(p.id));
      const game = String(action.game).slice(0, 40);
      if (winners.length === 0) return log(state, `Chautari · ${game}: a friendly draw.`);
      const awarded = {
        ...state,
        players: state.players.map((p) =>
          action.winners.includes(p.id) ? { ...p, medals: (p.medals ?? 0) + 1 } : p,
        ),
      };
      const names = winners.map((p) => p.name).join(' & ');
      return log(awarded, `Chautari · ${game}: ${names} won a medal 🏅 (just for fun).`);
    }

    default:
      return state;
  }
}
