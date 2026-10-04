/**
 * Deck construction and drawing. Pure — all randomness comes in through an
 * RngHandle supplied by the caller.
 */

import { shuffle, type RngHandle } from './rng.ts';
import type { Card, Deck, DeckId } from './types.ts';

/** Shape of the JSON deck files in src/data/decks. */
export type DeckFile = {
  id: DeckId;
  cards: Array<Omit<Card, 'deck'>>;
};

export type BuiltDecks = {
  decks: Record<string, Deck>;
  cards: Record<string, Card>;
};

/** Turn raw deck files into a shuffled draw pile plus a flat card lookup. */
export function buildDecks(rng: RngHandle, files: DeckFile[]): BuiltDecks {
  const decks: Record<string, Deck> = {};
  const cards: Record<string, Card> = {};

  for (const file of files) {
    for (const raw of file.cards) {
      const card: Card = { ...raw, deck: file.id } as Card;
      if (cards[card.id]) throw new Error(`Duplicate card id: ${card.id}`);
      cards[card.id] = card;
    }
    decks[file.id] = {
      id: file.id,
      draw: shuffle(rng, file.cards.map((c) => c.id)),
      discard: [],
    };
  }

  return { decks, cards };
}

export type DrawResult = { deck: Deck; cardId: string | null };

/**
 * Draw the top card of a deck, reshuffling the discard pile back in when the
 * draw pile runs dry. Returns a new Deck — never mutates the one passed in.
 */
export function drawCard(rng: RngHandle, deck: Deck): DrawResult {
  let draw = deck.draw;
  let discard = deck.discard;

  if (draw.length === 0) {
    if (discard.length === 0) return { deck, cardId: null };
    draw = shuffle(rng, discard);
    discard = [];
  }

  const next = draw[draw.length - 1];
  return {
    deck: { ...deck, draw: draw.slice(0, -1), discard },
    cardId: next,
  };
}

/** Put a resolved card face-up under its deck. */
export function discardCard(deck: Deck, cardId: string): Deck {
  return { ...deck, discard: [...deck.discard, cardId] };
}
