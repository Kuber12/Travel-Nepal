/**
 * Game construction: raw JSON in, a ready GameState out.
 */

import { buildDecks, type DeckFile } from './decks.ts';
import type { Board, BoardNode, GameState } from './types.ts';

/** The traveler standees from the box. */
export const TRAVELERS = [
  { name: 'Backpacker', color: '#2b5fa8' },
  { name: 'Wanderer', color: '#d4556b' },
  { name: 'Sightseer', color: '#e8a435' },
  { name: 'Explorer', color: '#2f8f5b' },
] as const;

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
  boardFile: BoardFile;
  deckFiles: DeckFile[];
};

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const playerCount = Math.min(Math.max(opts.playerCount ?? 2, 2), TRAVELERS.length);

  const board = toBoard(opts.boardFile);
  const rng = { seed, cursor: 0 };
  const { decks, cards } = buildDecks(rng, opts.deckFiles);

  return {
    seed,
    rngCursor: rng.cursor,
    board,
    decks,
    cards,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: i,
      name: TRAVELERS[i].name,
      color: TRAVELERS[i].color,
      nodeId: board.startNode,
      tickets: [],
      passport: [],
      singleDieTurns: 0,
      finished: false,
    })),
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
