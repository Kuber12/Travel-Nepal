/**
 * The drawn card, and the end-of-game scoreboard, as overlays.
 */

import { scoreFor } from '../engine/reducer.ts';
import type { Action, Card, GameState } from '../engine/types.ts';
import { renderCard } from './cardview.ts';
import { queueFlight, tilt } from './hand.ts';

export type Overlay = {
  /** `waiting` names the traveler whose card it is, when it isn't yours to play. */
  render(state: GameState, busy: boolean, waiting?: string): void;
};

export function createOverlay(root: HTMLElement, dispatch: (action: Action) => void): Overlay {
  return {
    render(state, busy, waiting) {
      if (state.phase === 'game-over') {
        root.replaceChildren(scoreboard(state));
        root.classList.add('open');
        return;
      }

      const cardId = state.drawnCardId;
      const showing = cardId && (state.phase === 'resolve-card' || state.phase === 'card-minigame');

      if (!showing) {
        root.classList.remove('open');
        root.replaceChildren();
        delete root.dataset.key;
        delete root.dataset.cardId;
        return;
      }

      // Don't re-deal the same card on every render — only when it changes.
      const key = `${cardId}|${state.phase}|${state.minigameWon}|${busy}|${waiting ?? ''}`;
      if (root.dataset.key === key) return;
      const fresh = root.dataset.cardId !== cardId;
      root.dataset.key = key;
      root.dataset.cardId = cardId;
      root.replaceChildren(cardFace(state, state.cards[cardId], busy || Boolean(waiting), dispatch, fresh, waiting));
      root.classList.add('open');
    },
  };
}

function cardFace(
  state: GameState,
  card: Card,
  busy: boolean,
  dispatch: (action: Action) => void,
  fresh: boolean,
  waiting?: string,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'drawn';

  const face = renderCard(card, 'full');
  face.classList.add('drawn-card');
  if (fresh) face.classList.add('deal');
  tilt(face);
  wrap.append(face);

  if (state.minigameWon !== null && state.phase === 'resolve-card') {
    wrap.append(tag('div', `card-result ${state.minigameWon ? 'win' : 'lose'}`, minigameText(state)));
  }

  const foot = document.createElement('div');
  foot.className = 'card-foot';

  if (waiting) {
    foot.append(tag('div', 'card-waiting', `${waiting} is reading this card…`));
  } else if (state.phase === 'card-minigame') {
    foot.append(actionButton('Play the mini-game', () => dispatch({ type: 'PLAY_MINIGAME' }), busy));
  } else {
    const lost = state.minigameWon === false;
    const collects = !card.effect && card.toPassport && !lost;
    const label = card.effect ? 'Apply the card' : lost ? 'Discard the card' : 'Into the passport';
    foot.append(
      actionButton(label, () => {
        if (collects) queueFlight(card.id, face);
        dispatch({ type: 'RESOLVE_CARD' });
      }, busy),
    );
  }

  wrap.append(foot);
  return wrap;
}

/** How the mini-game went, phrased for whichever kind it was. */
function minigameText(state: GameState): string {
  const total = state.minigameRoll?.total ?? 0;
  const spec = state.pendingMinigame?.spec;
  const played = state.minigamePlayed;
  const did = played ? 'scored' : 'rolled';

  if (spec?.type === 'feast') {
    return 'Everyone at the table collects this one.';
  }

  if (state.minigameRivals.length > 0) {
    const scores = state.minigameRivals
      .map((r) => `${state.players.find((p) => p.id === r.playerId)?.name ?? '?'} ${did} ${r.total}`)
      .join(', ');
    return state.minigameWon
      ? `You ${did} ${total}; ${scores}. The card is yours.`
      : `You ${did} ${total}; ${scores}. Beaten this time.`;
  }

  const target = played?.target ?? spec?.target;
  return state.minigameWon
    ? `Won it — ${did} ${total}${target ? ` against ${target}` : ''}. The card is yours.`
    : `${did === 'scored' ? 'Scored' : 'Rolled'} ${total}${target ? `, needed ${target}` : ''}. No points this time.`;
}

function scoreboard(state: GameState): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'scoreboard';

  const ranked = [...state.players].sort(
    (a, b) => scoreFor(state, b) - scoreFor(state, a) || b.passport.length - a.passport.length,
  );

  wrap.append(
    tag('h2', '', 'Vacation over'),
    tag('p', '', 'Scores from the passport, highest first. Ties go to the bigger collection.'),
  );

  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const label of ['Traveler', 'Cards', 'Tickets', 'Score']) {
    head.append(tag('th', '', label));
  }
  table.append(head);

  for (const player of ranked) {
    const row = document.createElement('tr');
    if (player.id === state.winnerId) row.className = 'winner';
    row.append(
      tag('td', '', player.id === state.winnerId ? `★ ${player.name}` : player.name),
      tag('td', '', String(player.passport.length)),
      tag('td', '', String(player.tickets.length)),
      tag('td', '', String(scoreFor(state, player))),
    );
    table.append(row);
  }

  wrap.append(table);

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  foot.append(actionButton('New journey', () => window.location.reload(), false));
  wrap.append(foot);

  return wrap;
}

function tag(name: string, className: string, content: string): HTMLElement {
  const node = document.createElement(name);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

function actionButton(label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const node = document.createElement('button');
  node.textContent = label;
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}
