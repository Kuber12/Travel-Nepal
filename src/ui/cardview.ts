/**
 * The playing card itself, as DOM — used at full size for a freshly drawn
 * card and in the viewer, and in miniature in the hand. Everything inside is
 * sized in `em`, so one font-size on the root scales the whole card.
 */

import type { Card, CardCategory } from '../engine/types.ts';
import { SECTION_COLOR, SECTION_LABEL } from '../render/palette.ts';
import { cardArt } from './cardart.ts';

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  photograph: 'Photograph',
  souvenir: 'Souvenir',
  'travel-tour': 'Travel & Tour',
  'get-together': 'Get Together',
  'duel-1v1': 'One on One Dual',
  'duel-2v2': 'Two on Two Dual',
  wild: 'Wild Card',
};

const CATEGORY_ICON: Record<CardCategory, string> = {
  photograph: '📷',
  souvenir: '🎁',
  'travel-tour': '🧭',
  'get-together': '🍲',
  'duel-1v1': '⚔️',
  'duel-2v2': '⚔️',
  wild: '✦',
};

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function accentFor(card: Card): string {
  return card.deck === 'wild' ? '#6b4f9e' : hex(SECTION_COLOR[card.deck]);
}

export type CardSize = 'full' | 'mini';

export function renderCard(card: Card, size: CardSize): HTMLElement {
  const root = document.createElement('div');
  root.className = `tcard ${size}${card.deck === 'wild' ? ' wild' : ''}`;
  root.style.setProperty('--accent', accentFor(card));
  root.dataset.cardId = card.id;

  const inner = div('tc-inner');

  const top = div('tc-top');
  top.append(span('tc-kind', `${CATEGORY_ICON[card.category]} ${CATEGORY_LABEL[card.category]}`));
  if (card.points > 0) {
    const medal = div('tc-points');
    medal.append(span('tc-num', String(card.points)), span('tc-pts', 'pts'));
    top.append(medal);
  }

  const frame = div('tc-art');
  const img = document.createElement('img');
  img.src = cardArt(card);
  img.alt = card.title;
  img.draggable = false;
  frame.append(img);

  const title = div('tc-title', card.title);
  const deck = div('tc-deck', card.deck === 'wild' ? 'Wild' : SECTION_LABEL[card.deck]);

  inner.append(top, frame, title, deck);
  if (size === 'full') inner.append(div('tc-blurb', card.blurb));

  // A sheen layer the viewer moves with the pointer.
  inner.append(div('tc-glare'));
  root.append(inner);
  return root;
}

function div(className: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/** Tick a number up (or down) to its new value. */
export function countUp(el: HTMLElement, from: number, to: number, ms = 900): void {
  if (from === to) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min((now - start) / ms, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
