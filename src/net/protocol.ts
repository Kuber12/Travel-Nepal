/**
 * The wire protocol between the browser and the multiplayer server. Plain
 * JSON over one WebSocket. The server owns the game: clients send what they
 * want to do, the server checks it is their turn, applies it with the same
 * reducer, and broadcasts the action so every screen plays it out.
 */

import type { Action, GameState } from '../engine/types.ts';

export type LobbyPlayer = {
  seat: number;
  name: string;
  color: string;
  connected: boolean;
  host: boolean;
};

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'mg-score'; score: number; summary: string }
  | { t: 'resync' }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'joined'; code: string; seat: number; token: string; host: boolean }
  | { t: 'lobby'; code: string; players: LobbyPlayer[]; started: boolean }
  | { t: 'snapshot'; state: GameState; seq: number }
  | { t: 'action'; action: Action; seq: number; check: string; by: number | null }
  | { t: 'mg-begin'; participants: number[]; seq: number }
  | { t: 'mg-progress'; done: Array<{ seat: number; score: number; summary: string }> }
  | { t: 'error'; message: string };

/** A cheap fingerprint of the state, to catch a client that drifted. */
export function checksum(state: GameState): string {
  const p = state.players.map((x) => `${x.nodeId}.${x.passport.length}.${x.tickets.length}`).join('|');
  return `${state.turn}:${state.phase}:${state.rngCursor}:${state.currentPlayerIndex}:${p}`;
}
