/**
 * The side panel: whose turn it is, what they can do now, the scoreboard from
 * the box lid, and a running travel log.
 */

import { nodeAt } from '../engine/board.ts';
import { counterOffer } from '../engine/autoplay.ts';
import { current, scoreFor } from '../engine/reducer.ts';
import type { Action, GameState } from '../engine/types.ts';
import { SECTION_LABEL, tripName } from '../render/palette.ts';
import { avatar } from './avatar.ts';
import { ticketStub, tripsOf } from './tickets.ts';
import { countUp } from './cardview.ts';

/** Extra context when playing online. */
export type HudContext = {
  /** Replaces the prompt, e.g. "Waiting for Wanderer…". */
  note?: string;
  /** This device's traveler. */
  me?: number;
  /** Travelers who have dropped off. */
  away?: number[];
  /** The room code, shown at the top. */
  room?: string;
  /** The Chautari button: shown between turns, for friendly games. */
  chautari?: { enabled: boolean; open: () => void };
};

export type Hud = {
  render(state: GameState, busy: boolean, ctx?: HudContext): void;
};

/** What the primary button says and does, per phase. */
function primaryFor(state: GameState): { label: string; action: Action } | null {
  switch (state.phase) {
    case 'await-roll':
      return { label: current(state).singleDieTurns > 0 ? 'Spin (on the bike — half)' : 'Spin the prayer wheel', action: { type: 'ROLL' } };
    case 'checkpoint-minigame':
      return { label: 'Play for a ticket', action: { type: 'PLAY_MINIGAME' } };
    case 'card-minigame':
      return { label: 'Play the mini-game', action: { type: 'PLAY_MINIGAME' } };
    case 'await-draw':
      return { label: 'Draw a card', action: { type: 'DRAW_CARD' } };
    case 'end-turn':
      return { label: 'End turn', action: { type: 'END_TURN' } };
    default:
      return null;
  }
}

function promptFor(state: GameState): string {
  const player = current(state);
  const node = nodeAt(state.board, player.nodeId);
  const where = node.label ?? SECTION_LABEL[node.section];

  switch (state.phase) {
    case 'await-roll':
      return player.singleDieTurns > 0
        ? `At ${where}. On a hired bike — your spin is halved for ${player.singleDieTurns} more turn(s).`
        : `At ${where}. Spin the prayer wheel to travel 1 to 8 steps.`;
    case 'moving':
      return 'Travelling…';
    case 'await-branch':
      return 'The road splits. Choose which way to go — click a glowing tile or a button below.';
    case 'ticket-counter': {
      const offer = counterOffer(state);
      return offer
        ? `${where}. This counter sells the ${tripName(offer)} ticket — buy it to open that trip, or travel on.`
        : `${where}. You already hold every ticket this counter sells — travel on.`;
    }
    case 'checkpoint-minigame': {
      const reward = state.pendingMinigame?.ticketReward;
      const have = reward && player.tickets.includes(reward);
      return reward
        ? `${where} — everyone stops here, whatever they spun. Win the mini-game for the ${tripName(reward)} ticket${have ? ' (you already hold it)' : ''}.`
        : `${where} — everyone stops here, whatever they spun. Win the mini-game to earn an entry ticket.`;
    }
    case 'await-draw':
      return `Stopped in ${SECTION_LABEL[node.section]}. Draw from this section's deck.`;
    case 'card-minigame':
      return 'This card comes with a mini-game. Play it to collect the points.';
    case 'resolve-card':
      return 'Read the card, then add it to your passport.';
    case 'end-turn':
      return 'Turn complete.';
    case 'game-over':
      return 'Every traveler has flown home.';
    default:
      return '';
  }
}

export function createHud(
  root: HTMLElement,
  dispatch: (action: Action) => void,
  onPickPlayer: (playerId: number) => void = () => {},
): Hud {
  const shown = new Map<number, number>();
  return {
    render(state, busy, ctx = {}) {
      const active = current(state);
      const primary = primaryFor(state);

      root.replaceChildren();

      if (ctx.room) {
        const room = el('div', 'hud-room');
        room.append(el('span', '', `Room ${ctx.room}`));
        const me = state.players.find((p) => p.id === ctx.me);
        if (me) {
          const you = el('span', 'hud-you');
          you.append(swatch(me.color), text(`You are ${me.name}`));
          room.append(you);
        }
        root.append(room);
      }

      // --- whose turn ---
      const turn = el('div', 'hud-turn');
      turn.append(
        avatar(active.color, active.hat, 30),
        text(`${active.name} · turn ${state.turn}`),
      );
      root.append(turn);

      root.append(el('div', `hud-prompt${ctx.note ? ' waiting' : ''}`, ctx.note ?? promptFor(state)));

      // --- actions ---
      const actions = el('div', 'hud-actions');

      if (primary) {
        actions.append(button(primary.label, () => dispatch(primary.action), busy));
      }

      if (state.phase === 'await-branch') {
        for (const nodeId of state.branchOptions) {
          const node = nodeAt(state.board, nodeId);
          const gate = node.requiresTicket;
          const locked = Boolean(gate) && !active.tickets.includes(gate!);
          const label = node.label ?? SECTION_LABEL[node.section];
          actions.append(
            button(
              locked ? `${label} 🔒` : label,
              () => dispatch({ type: 'CHOOSE_BRANCH', nodeId }),
              busy || locked,
              'ghost',
            ),
          );
        }
      }

      if (state.phase === 'ticket-counter') {
        const offer = counterOffer(state);
        if (offer) {
          actions.append(
            button(`Buy the ${tripName(offer)} ticket`, () =>
              dispatch({ type: 'CLAIM_COUNTER_TICKET', section: offer }), busy),
          );
        }
        actions.append(
          button('Travel on', () => dispatch({ type: 'SKIP_COUNTER' }), busy, 'ghost'),
        );
      }

      // The ticket on offer here, so you can see exactly where it takes you.
      if (state.phase === 'ticket-counter' || state.phase === 'checkpoint-minigame') {
        const offer = state.phase === 'ticket-counter' ? counterOffer(state) : state.pendingMinigame?.ticketReward;
        if (offer) {
          const preview = el('div', 'hud-ticket');
          preview.append(ticketStub(offer, { size: 'big' }));
          root.append(preview);
        }
      }

      if (actions.childElementCount > 0) root.append(actions);

      // --- the Chautari: friendly games between turns ---
      if (ctx.chautari && (state.phase === 'await-roll' || state.phase === 'game-over')) {
        const fun = button('🌳 Chautari — friendly games', ctx.chautari.open, !ctx.chautari.enabled, 'ghost hud-chautari');
        fun.title = 'Play each other for medals between turns — just for fun, never part of the score';
        root.append(fun);
      }

      // --- scoreboard ---
      root.append(el('p', 'section-title', 'Scoreboard'));
      const players = el('div', 'players');

      for (const player of state.players) {
        const row = el('div', `player${player.id === active.id ? ' active' : ''}`);

        const names = el('div');
        names.append(el('span', 'name', player.id === ctx.me ? `${player.name} (you)` : player.name));
        if (ctx.away?.includes(player.id)) names.append(el('span', 'away', 'away'));

        const bits: string[] = [`${player.passport.length} card(s)`];
        if (player.singleDieTurns > 0) bits.push(`🚲 ${player.singleDieTurns}`);
        if (player.finished) bits.push('flown home');
        if (player.bot) bits.push('🤖 computer');
        names.append(el('span', 'meta', bits.join(' · ')));
        if (player.medals) {
          const medals = el('span', 'medals', `🏅 ${player.medals}`);
          medals.title = 'Chautari medals — just for fun, not part of the score';
          names.append(medals);
        }
        // Tickets held, as little coloured tickets.
        if (player.tickets.length > 0) {
          const held = el('span', 'hud-tickets');
          for (const trip of tripsOf(state.board)) {
            if (player.tickets.includes(trip)) held.append(ticketStub(trip, { size: 'chip' }));
          }
          names.append(held);
        }

        const score = scoreFor(state, player);
        const scoreEl = el('span', 'score', String(shown.get(player.id) ?? score));
        countUp(scoreEl, shown.get(player.id) ?? score, score);
        shown.set(player.id, score);
        row.title = `Show ${player.name}'s cards`;
        row.addEventListener('click', () => onPickPlayer(player.id));
        row.append(avatar(player.color, player.hat, 30), names, scoreEl);
        players.append(row);
      }
      root.append(players);

      // --- log, newest first ---
      const log = el('div', 'log');
      for (const entry of state.log.slice(-40)) {
        const line = el('div');
        const who = state.players.find((p) => p.id === entry.playerId);
        line.append(el('b', '', `${who?.name ?? '?'}: `), text(entry.text));
        log.append(line);
      }
      root.append(log);
    },
  };
}

// --- tiny DOM helpers --------------------------------------------------------

function el(tag: string, className = '', content = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

function swatch(color: string): HTMLElement {
  const node = el('span', 'swatch');
  node.style.background = color;
  return node;
}

function button(
  label: string,
  onClick: () => void,
  disabled = false,
  variant = '',
): HTMLButtonElement {
  const node = document.createElement('button');
  node.textContent = label;
  node.disabled = disabled;
  if (variant) node.className = variant;
  node.addEventListener('click', onClick);
  return node;
}
