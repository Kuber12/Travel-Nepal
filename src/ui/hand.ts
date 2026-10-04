/**
 * The hand: a fan of the passport cards along the bottom of the screen, with
 * a running score counter. Hover lifts a card; click opens it in the viewer,
 * where it can be tilted, read, and paged through like cards held in a hand.
 *
 * A freshly collected card flies from the table into the hand.
 */

import { current, scoreFor } from '../engine/reducer.ts';
import type { Card, GameState } from '../engine/types.ts';
import { countUp, renderCard } from './cardview.ts';

export type HandView = {
  render(state: GameState): void;
  /** Show another traveler's passport until the turn changes. */
  view(playerId: number): void;
  /** Online: whose passport to show by default (this device's traveler). */
  setHome(playerId: number): void;
};

type Flight = { cardId: string; from: DOMRect; source: HTMLElement };
let pendingFlight: Flight | null = null;

/** Called by the drawn-card overlay just before the card goes into the passport. */
export function queueFlight(cardId: string, source: HTMLElement): void {
  pendingFlight = { cardId, from: source.getBoundingClientRect(), source: source.cloneNode(true) as HTMLElement };
}

export function createHand(root: HTMLElement, viewerRoot: HTMLElement): HandView {
  let viewing: number | null = null;
  let home: number | null = null;
  let lastActive: number | null = null;
  let lastKey = '';
  let latest: GameState | null = null;
  const shownScore = new Map<number, number>();

  const header = document.createElement('div');
  header.className = 'hand-head';
  const fan = document.createElement('div');
  fan.className = 'hand-fan';
  root.append(header, fan);

  const viewer = createViewer(viewerRoot);

  // Re-fan on resize so the spacing fits the new width.
  window.addEventListener('resize', () => {
    lastKey = '';
    if (latest) render(latest);
  });

  function render(state: GameState): void {
    latest = state;
    const turnHolder = current(state).id;
    const active = home ?? turnHolder;
    if (turnHolder !== lastActive) {
      viewing = null;
      lastActive = turnHolder;
    }
    const player = state.players.find((p) => p.id === (viewing ?? active)) ?? current(state);
    const cards = player.passport.map((id) => state.cards[id]).filter(Boolean);

    // --- header: whose passport, and the score counter ---
    const score = scoreFor(state, player);
    const key = `${player.id}|${player.passport.join(',')}`;
    if (key !== lastKey) {
      header.replaceChildren();
      const who = document.createElement('div');
      who.className = 'hand-who';
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = player.color;
      who.append(dot, document.createTextNode(`${player.name}'s passport`));
      if (player.id !== active) {
        const back = document.createElement('button');
        back.className = 'hand-back';
        back.textContent = home === null ? 'Back to current turn' : 'Back to my passport';
        back.addEventListener('click', () => {
          viewing = null;
          if (latest) render(latest);
        });
        who.append(back);
      }

      const counter = document.createElement('div');
      counter.className = 'score-counter';
      const num = document.createElement('span');
      num.className = 'score-num';
      const label = document.createElement('span');
      label.className = 'score-label';
      label.textContent = `pts · ${cards.length} card${cards.length === 1 ? '' : 's'}`;
      counter.append(num, label);
      header.append(who, counter);

      const before = shownScore.get(player.id) ?? 0;
      const samePlayer = lastKey.startsWith(`${player.id}|`);
      if (samePlayer && score > before) {
        countUp(num, before, score, 1100);
        popGain(counter, score - before);
        counter.classList.add('bump');
        setTimeout(() => counter.classList.remove('bump'), 700);
      } else {
        num.textContent = String(score);
      }
      shownScore.set(player.id, score);

      buildFan(cards, player.color);
      lastKey = key;
    }
  }

  function buildFan(cards: Card[], _color: string): void {
    fan.replaceChildren();
    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hand-empty';
      empty.textContent = 'No cards yet — stop in a section and draw one.';
      fan.append(empty);
      pendingFlight = null;
      return;
    }

    const n = cards.length;
    const mid = (n - 1) / 2;
    const width = Math.max(fan.clientWidth, 320);
    const spacing = Math.min(84, (width - 220) / Math.max(n - 1, 1));
    const step = Math.min(7, 44 / n);

    const els: HTMLElement[] = [];
    cards.forEach((card, i) => {
      const el = renderCard(card, 'mini');
      const off = i - mid;
      const angle = off * step;
      const x = off * spacing;
      const y = Math.abs(off) * Math.abs(off) * (step * 0.22);
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.style.setProperty('--r', `${angle}deg`);
      el.style.zIndex = String(i + 1);
      el.tabIndex = 0;
      el.title = card.title;
      el.addEventListener('click', () => viewer.open(cards, i));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') viewer.open(cards, i);
      });
      fan.append(el);
      els.push(el);
    });

    // Play out the flight of a just-collected card into its slot.
    const flight = pendingFlight;
    pendingFlight = null;
    if (flight) {
      let idx = -1;
      cards.forEach((c, i) => {
        if (c.id === flight.cardId) idx = i;
      });
      if (idx >= 0) fly(flight, els[idx]);
    }
  }

  return {
    render,
    view(playerId) {
      viewing = playerId;
      if (latest) render(latest);
    },
    setHome(playerId) {
      home = playerId;
      lastKey = '';
      if (latest) render(latest);
    },
  };
}

function popGain(anchor: HTMLElement, amount: number): void {
  const pop = document.createElement('span');
  pop.className = 'score-pop';
  pop.textContent = `+${amount}`;
  anchor.append(pop);
  setTimeout(() => pop.remove(), 1400);
}

function fly(flight: Flight, target: HTMLElement): void {
  const ghost = flight.source;
  ghost.classList.add('flying');
  const from = flight.from;
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '60',
    transformOrigin: 'top left',
  });
  document.body.append(ghost);
  target.style.visibility = 'hidden';

  requestAnimationFrame(() => {
    const to = target.getBoundingClientRect();
    const scale = to.width / from.width;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const angle = target.style.getPropertyValue('--r') || '0deg';
    const anim = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.35 - 80}px) scale(${(1 + scale) / 2}) rotate(-8deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${angle})`, opacity: 1 },
      ],
      { duration: 750, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    );
    anim.onfinish = () => {
      ghost.remove();
      target.style.visibility = '';
      target.classList.add('landed');
      setTimeout(() => target.classList.remove('landed'), 600);
    };
  });
}

// --- the viewer ----------------------------------------------------------------

function createViewer(root: HTMLElement): { open(cards: Card[], index: number): void } {
  let cards: Card[] = [];
  let index = 0;

  function close(): void {
    root.classList.remove('open');
    root.replaceChildren();
    window.removeEventListener('keydown', onKey, true);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function go(delta: number): void {
    if (cards.length < 2) return;
    index = (index + delta + cards.length) % cards.length;
    draw(delta > 0 ? 'next' : 'prev');
  }

  function draw(direction: 'next' | 'prev' | 'open'): void {
    root.replaceChildren();
    const stage = document.createElement('div');
    stage.className = 'viewer-stage';

    const card = renderCard(cards[index], 'full');
    card.classList.add('viewer-card', `enter-${direction}`);
    tilt(card);

    const nav = document.createElement('div');
    nav.className = 'viewer-nav';
    const prev = navButton('‹', () => go(-1), cards.length < 2);
    const next = navButton('›', () => go(1), cards.length < 2);
    const count = document.createElement('span');
    count.textContent = `${index + 1} / ${cards.length}`;
    const done = navButton('Close', close, false);
    done.classList.add('viewer-close');
    nav.append(prev, count, next, done);

    stage.append(card, nav);
    root.append(stage);
  }

  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return {
    open(list, i) {
      cards = list;
      index = i;
      root.classList.add('open');
      window.addEventListener('keydown', onKey, true);
      draw('open');
    },
  };
}

function navButton(label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Tilt the card toward the pointer, with a moving glare — like turning it in your hand. */
export function tilt(card: HTMLElement): void {
  const inner = card.querySelector<HTMLElement>('.tc-inner');
  if (!inner) return;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    inner.style.transform = `rotateY(${px * 18}deg) rotateX(${-py * 14}deg)`;
    inner.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    inner.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
    inner.classList.add('lit');
  });
  card.addEventListener('pointerleave', () => {
    inner.style.transform = '';
    inner.classList.remove('lit');
  });
}
