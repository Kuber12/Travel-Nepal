/**
 * Board graph traversal. Pure functions over a Board — no game state, no
 * randomness, no rendering.
 */

import type { Board, BoardNode, SectionId } from './types.ts';

export function nodeAt(board: Board, id: string): BoardNode {
  const n = board.nodes[id];
  if (!n) throw new Error(`Unknown board node: ${id}`);
  return n;
}

export type WalkStop =
  /** Used up every step without hitting anything special. */
  | 'exhausted'
  /** Checkpoint: a hard stop regardless of steps left (printed rule). */
  | 'checkpoint'
  /** Road splits and steps remain — the player must pick a branch. */
  | 'junction'
  /** Next node needs an entry ticket the player does not hold. */
  | 'blocked'
  /** End of the line. */
  | 'terminus';

export type WalkResult = {
  /** Nodes visited, in order, NOT including the node walked from. */
  path: string[];
  /** Where the walk ended up. Equals `from` when path is empty. */
  endNodeId: string;
  reason: WalkStop;
  stepsRemaining: number;
  /** Populated when reason is 'junction'. */
  options: string[];
};

/**
 * Advance `steps` nodes from `from`.
 *
 * Halts early on a checkpoint, at a ticket gate the player cannot pass, or at
 * a junction that still has steps left to spend. Callers resume a junction
 * walk by dispatching CHOOSE_BRANCH, which walks again from the chosen node
 * with `stepsRemaining` — so a player standing on a junction at the start of
 * a turn and one who walks into it mid-move take the same code path.
 */
export function walk(
  board: Board,
  from: string,
  steps: number,
  tickets: readonly SectionId[],
): WalkResult {
  const path: string[] = [];
  let current = from;
  let remaining = steps;

  const res = (reason: WalkStop, options: string[] = []): WalkResult => ({
    path,
    endNodeId: current,
    reason,
    stepsRemaining: remaining,
    options,
  });

  while (remaining > 0) {
    const node = nodeAt(board, current);

    if (node.next.length === 0) return res('terminus');

    // Standing on a split with road left to travel: the player chooses.
    if (node.next.length > 1) return res('junction', node.next);

    const nextNode = nodeAt(board, node.next[0]);

    if (nextNode.requiresTicket && !tickets.includes(nextNode.requiresTicket)) {
      return res('blocked');
    }

    path.push(nextNode.id);
    current = nextNode.id;
    remaining -= 1;

    // Checkpoints are the brakes of this game: a hard stop, steps forfeited.
    if (nextNode.kind === 'checkpoint') return res('checkpoint');
    if (nextNode.kind === 'terminus') return res('terminus');
  }

  return res('exhausted');
}

/** Reverse-edge index, built on demand and cached per board object. */
const predecessorCache = new WeakMap<Board, Record<string, string[]>>();

export function predecessors(board: Board, id: string): string[] {
  let index = predecessorCache.get(board);
  if (!index) {
    index = {};
    for (const node of Object.values(board.nodes)) {
      for (const next of node.next) {
        (index[next] ||= []).push(node.id);
      }
    }
    predecessorCache.set(board, index);
  }
  return index[id] ?? [];
}

/**
 * Walk backwards `steps` nodes (Extend Vacation). Ignores checkpoints and
 * ticket gates — the player is retracing ground they have already covered.
 * Takes the first predecessor at any merge; stops at the start of the board.
 */
export function walkBack(board: Board, from: string, steps: number): string[] {
  const path: string[] = [];
  let current = from;
  for (let i = 0; i < steps; i++) {
    const prev = predecessors(board, current)[0];
    if (!prev) break;
    path.push(prev);
    current = prev;
  }
  return path;
}

/**
 * Walk forward `steps` ignoring checkpoints and junction choices, taking the
 * first branch at every split (Home Sick / Duty Call). Still respects ticket
 * gates, so the card can never push a player into a section they can't enter.
 */
export function walkForce(
  board: Board,
  from: string,
  steps: number,
  tickets: readonly SectionId[],
): string[] {
  const path: string[] = [];
  let current = from;
  for (let i = 0; i < steps; i++) {
    const node = nodeAt(board, current);
    const nextId = node.next[0];
    if (!nextId) break;
    const nextNode = nodeAt(board, nextId);
    if (nextNode.requiresTicket && !tickets.includes(nextNode.requiresTicket)) break;
    path.push(nextId);
    current = nextId;
  }
  return path;
}

/** Every sub-section reachable by taking one of a junction's branches. */
export function branchSections(board: Board, junctionId: string): SectionId[] {
  const out: SectionId[] = [];
  for (const nextId of nodeAt(board, junctionId).next) {
    const gate = nodeAt(board, nextId).requiresTicket;
    if (gate && !out.includes(gate)) out.push(gate);
  }
  return out;
}
