/**
 * An automatic player. Given any state, it names the one action a UI would
 * eventually dispatch for that phase. Used by the headless simulation and by
 * the "auto" button in the HUD.
 */

import { nodeAt } from './board.ts';
import { current } from './reducer.ts';
import type { Action, GameState, SectionId } from './types.ts';

export function nextAction(state: GameState): Action | null {
  switch (state.phase) {
    case 'await-roll':
      return { type: 'ROLL' };
    case 'moving':
      return { type: 'MOVE_COMPLETE' };
    case 'await-branch': {
      const player = current(state);
      // Prefer the scenic detour when the ticket is in hand — unless this
      // traveler already has a card from that trip. Some trips loop back to
      // their own junction, so without that check a bot could circle forever.
      const open = state.branchOptions.filter((id) => {
        const gate = nodeAt(state.board, id).requiresTicket;
        return !gate || player.tickets.includes(gate);
      });
      const gated = open.find((id) => {
        const gate = nodeAt(state.board, id).requiresTicket;
        if (!gate) return false;
        return !player.passport.some((cardId) => state.cards[cardId]?.deck === gate);
      });
      const ungated = open.find((id) => !nodeAt(state.board, id).requiresTicket);
      return { type: 'CHOOSE_BRANCH', nodeId: gated ?? ungated ?? open[0] ?? state.branchOptions[0] };
    }
    case 'ticket-counter': {
      const section = counterOffer(state);
      return section
        ? { type: 'CLAIM_COUNTER_TICKET', section }
        : { type: 'SKIP_COUNTER' };
    }
    case 'checkpoint-minigame':
    case 'card-minigame':
      return { type: 'PLAY_MINIGAME' };
    case 'await-draw':
      return { type: 'DRAW_CARD' };
    case 'resolve-card':
      return { type: 'RESOLVE_CARD' };
    case 'end-turn':
      return { type: 'END_TURN' };
    case 'game-over':
      return null;
    default:
      return null;
  }
}

/**
 * Which ticket the counter sells. A red ticket square names its trip
 * (`ticketReward` on the node); a plain counter sells the first entry ticket
 * the traveler is still missing.
 */
export function counterOffer(state: GameState): SectionId | null {
  const player = current(state);
  const printed = nodeAt(state.board, player.nodeId).ticketReward;
  if (printed) return player.tickets.includes(printed) ? null : printed;
  const gates = new Set<SectionId>();
  for (const node of Object.values(state.board.nodes)) {
    if (node.requiresTicket) gates.add(node.requiresTicket);
  }
  for (const gate of gates) {
    if (!player.tickets.includes(gate)) return gate;
  }
  return null;
}
