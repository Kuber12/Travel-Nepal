/**
 * Entry tickets, drawn as tickets: a coloured stub with the trip's emblem, a
 * perforation, and the destination. Used for the wallet beside the passport,
 * the scoreboard, the ticket counter, and the pop-up when one is earned.
 */

import type { Board, Player, SectionId } from '../engine/types.ts';
import { hexColor, SECTION_COLOR, TRIP_ICON, TRIP_SHORT, tripName } from '../render/palette.ts';

/** The trips a ticket opens, in the order the board reaches them. */
export function tripsOf(board: Board): SectionId[] {
  const trips: SectionId[] = [];
  for (const node of Object.values(board.nodes)) {
    if (node.requiresTicket && !trips.includes(node.requiresTicket)) trips.push(node.requiresTicket);
  }
  return trips;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export type TicketSize = 'chip' | 'stub' | 'big';

/** A ticket for `section`. Not `held` draws an empty outline: a ticket still to get. */
export function ticketStub(section: SectionId, opts: { held?: boolean; size?: TicketSize } = {}): HTMLElement {
  const held = opts.held ?? true;
  const size = opts.size ?? 'stub';
  const colour = hexColor(SECTION_COLOR[section]);
  const icon = TRIP_ICON[section] ?? '🎫';
  if (size === 'chip') {
    const chip = el('span', `ticket-chip${held ? '' : ' missing'}`);
    chip.style.setProperty('--trip', colour);
    chip.append(el('span', 'ticket-chip-icon', icon), el('span', '', TRIP_SHORT[section] ?? tripName(section)));
    chip.title = `${held ? 'Holds' : 'No'} ticket: ${tripName(section)}`;
    return chip;
  }
  const t = el('div', `ticket ${size}${held ? ' held' : ' missing'}`);
  t.style.setProperty('--trip', colour);
  t.title = held ? `Entry ticket: ${tripName(section)}` : `No ticket yet for the ${tripName(section)}`;
  const end = el('div', 'ticket-end');
  end.append(el('span', 'ticket-icon', held ? icon : '🔒'));
  const body = el('div', 'ticket-body');
  body.append(
    el('span', 'ticket-kicker', held ? 'Entry ticket' : 'Not yet'),
    el('span', 'ticket-name', size === 'big' ? tripName(section) : TRIP_SHORT[section] ?? tripName(section)),
  );
  if (size === 'big') body.append(el('span', 'ticket-fine', 'Admit one traveler · Travel Nepal'));
  t.append(end, body);
  return t;
}

/** Every trip's ticket, held ones in colour and the rest as outlines. */
export function ticketWallet(board: Board, player: Player, size: TicketSize = 'stub'): HTMLElement {
  const wallet = el('div', `ticket-wallet ${size}`);
  for (const trip of tripsOf(board)) wallet.append(ticketStub(trip, { held: player.tickets.includes(trip), size }));
  return wallet;
}

// --- the pop-up when a ticket is earned ------------------------------------------------

let layer: HTMLElement | null = null;
let queue = Promise.resolve();

/**
 * A ticket slides in with the traveler's name, then flies down into the
 * wallet beside the passport. Several queue up and play in turn.
 */
export function celebrateTicket(player: Player, section: SectionId, how: string): void {
  queue = queue.then(() => playTicket(player, section, how));
}

function playTicket(player: Player, section: SectionId, how: string): Promise<void> {
  if (!layer) {
    layer = el('div', 'ticket-toasts');
    document.body.append(layer);
  }
  const card = el('div', 'ticket-toast');
  const head = el('div', 'ticket-toast-head');
  const dot = el('span', 'swatch');
  dot.style.background = player.color;
  head.append(dot, document.createTextNode(`${player.name} ${how}`));
  card.append(head, ticketStub(section, { size: 'big' }));
  layer.append(card);
  return new Promise((resolve) => {
    setTimeout(() => {
      // Fly toward the wallet in the bottom-left corner.
      const wallet = document.querySelector('.hand-head .ticket-wallet');
      const to = wallet?.getBoundingClientRect();
      const from = card.getBoundingClientRect();
      if (to) {
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        card.style.setProperty('--fly', `translate(${dx}px, ${dy}px) scale(0.25)`);
      }
      card.classList.add('leaving');
      setTimeout(() => {
        card.remove();
        resolve();
      }, 650);
    }, 2100);
  });
}
