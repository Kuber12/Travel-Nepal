/**
 * Game construction: raw JSON in, a ready GameState out.
 */

import { buildDecks, type DeckFile } from './decks.ts';
import type { Board, BoardNode, GameState, HatStyle } from './types.ts';

/** The traveler standees from the box. */
export const TRAVELERS = [
  { name: 'Backpacker', color: '#2b5fa8', hat: 'sunhat' },
  { name: 'Wanderer', color: '#d4556b', hat: 'topi' },
  { name: 'Sightseer', color: '#e8a435', hat: 'cap' },
  { name: 'Explorer', color: '#2f8f5b', hat: 'beanie' },
] as const satisfies ReadonlyArray<{ name: string; color: string; hat: HatStyle }>;

/** Colours a traveler can pick at the start, beyond the four from the box. */
export const TRAVELER_COLORS = [
  '#2b5fa8', '#d4556b', '#e8a435', '#2f8f5b', '#7e4fc4', '#1f9aa8', '#c8342f', '#3b3f4a',
] as const;

export const HAT_STYLES: readonly HatStyle[] = ['sunhat', 'topi', 'cap', 'beanie'];

/** Who sits down to play: everything about a traveler that is chosen, not dealt. */
export type TravelerSetup = {
  name: string;
  color: string;
  hat?: HatStyle;
  bot?: boolean;
};

export type BoardFile = {
  id: string;
  startNode: string;
  nodes: BoardNode[];
};

export function toBoard(file: BoardFile): Board {
  const nodes: Record<string, BoardNode> = {};
  for (const node of file.nodes) nodes[node.id] = node;
  return { id: file.id, startNode: file.startNode, nodes };
}

export type NewGameOptions = {
  seed?: number;
  playerCount?: number;
  /** Names, colours and hats, in turn order. Overrides `playerCount`. */
  travelers?: TravelerSetup[];
  boardFile: BoardFile;
  deckFiles: DeckFile[];
};

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const wanted = opts.travelers?.length ?? opts.playerCount ?? 2;
  const playerCount = Math.min(Math.max(wanted, 2), TRAVELERS.length);

  const board = toBoard(opts.boardFile);
  const rng = { seed, cursor: 0 };
  const { decks, cards } = buildDecks(rng, opts.deckFiles);

  return {
    seed,
    rngCursor: rng.cursor,
    board,
    decks,
    cards,
    players: Array.from({ length: playerCount }, (_, i) => {
      const chosen = opts.travelers?.[i];
      return {
        id: i,
        name: chosen?.name || TRAVELERS[i].name,
        color: chosen?.color || TRAVELERS[i].color,
        hat: chosen?.hat ?? TRAVELERS[i].hat,
        ...(chosen?.bot ? { bot: true } : {}),
        medals: 0,
        nodeId: board.startNode,
        tickets: [],
        passport: [],
        singleDieTurns: 0,
        finished: false,
      };
    }),
    currentPlayerIndex: 0,
    turn: 1,
    phase: 'await-roll',
    lastRoll: null,
    pendingPath: [],
    branchOptions: [],
    pendingSteps: 0,
    drawnCardId: null,
    pendingMinigame: null,
    minigameWon: null,
    minigameRoll: null,
    minigameRivals: [],
    log: [],
    winnerId: null,
  };
}
