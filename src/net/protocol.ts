/**
 * The wire protocol between the browser and the multiplayer server. Plain
 * JSON over one WebSocket. The server owns the game: clients send what they
 * want to do, the server checks it is their turn, applies it with the same
 * reducer, and broadcasts the action so every screen plays it out.
 */

import type { Action, GameState, HatStyle } from '../engine/types.ts';
import type { FunClientMessage, FunPublic } from '../fun/chautari.ts';

export type LobbyPlayer = {
  seat: number;
  name: string;
  color: string;
  hat: HatStyle;
  connected: boolean;
  host: boolean;
};

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  /** Before the game starts: the colour and hat this traveler wants to wear. */
  | { t: 'look'; color: string; hat: HatStyle }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'mg-score'; score: number; summary: string }
  | { t: 'resync' }
  | { t: 'leave' }
  /** The Chautari: friendly games between turns (see src/fun/chautari.ts). */
  | FunClientMessage;

export type ServerMessage =
  | { t: 'joined'; code: string; seat: number; token: string; host: boolean }
  | { t: 'lobby'; code: string; players: LobbyPlayer[]; started: boolean }
  | { t: 'snapshot'; state: GameState; seq: number }
  | { t: 'action'; action: Action; seq: number; check: string; by: number | null }
  | { t: 'mg-begin'; participants: number[]; seq: number }
  | { t: 'mg-progress'; done: Array<{ seat: number; score: number; summary: string }> }
  /** The room's Chautari match changed (null: there is none). */
  | { t: 'fun'; fun: FunPublic | null }
  | { t: 'error'; message: string };

/** A cheap fingerprint of the state, to catch a client that drifted. */
export function checksum(state: GameState): string {
  const p = state.players.map((x) => `${x.nodeId}.${x.passport.length}.${x.tickets.length}.${x.medals ?? 0}`).join('|');
  return `${state.turn}:${state.phase}:${state.rngCursor}:${state.currentPlayerIndex}:${p}`;
}
