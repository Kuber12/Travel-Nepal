/**
 * Runs a mini-game for the current situation: picks the game that fits the
 * card (or checkpoint), shows the intro, lets each traveler play, and reports
 * the scores.
 *
 * Two ways to play:
 *  - On one device (`playMinigame`): duelists take turns at the keyboard
 *    (hot-seat), and the result goes straight to the reducer.
 *  - Online (`playOwnRound` + `showWaiting` + `showResult`): every participant
 *    plays their own round on their own device at the same time; the server
 *    collects the scores and judges them.
 */

import { current } from '../../engine/reducer.ts';
import type { Card, GameState, MinigameResult, Player } from '../../engine/types.ts';
import { renderCard } from '../cardview.ts';
import { GAMES, type MiniGame } from './games.ts';
import { difficultyFor, judge, participantsFor, pickFor, type Pick } from './pick.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function waitClick(b: HTMLButtonElement): Promise<void> {
  return new Promise((resolve) => {
    const key = (e: KeyboardEvent): void => {
      if (e.code === 'Enter') {
        e.preventDefault();
        done();
      }
    };
    const done = (): void => {
      window.removeEventListener('keydown', key, true);
      b.removeEventListener('click', done);
      resolve();
    };
    b.addEventListener('click', done);
    window.addEventListener('keydown', key, true);
  });
}

function swatch(color: string): HTMLSpanElement {
  const dot = el('span', 'swatch');
  dot.style.background = color;
  return dot;
}

let running = false;

/** True while a mini-game owns the keyboard. */
export function minigameRunning(): boolean {
  return running;
}

type Round = {
  pick: Pick;
  game: MiniGame;
  difficulty: 0 | 1 | 2;
  card: Card | undefined;
  players: Player[];
  duel: boolean;
  target: number;
  title: string;
};

function roundFor(state: GameState): Round {
  const pending = state.pendingMinigame!;
  const pick = pickFor(state);
  const game = GAMES[pick.game];
  const difficulty = difficultyFor(state);
  const card = pending.cardId ? state.cards[pending.cardId] : undefined;
  const players = participantsFor(state).map((id) => state.players.find((p) => p.id === id)!);
  return {
    pick,
    game,
    difficulty,
    card,
    players,
    duel: players.length > 1,
    target: game.target(difficulty),
    title: pick.theme?.title ?? (card ? card.title : game.title),
  };
}

function openPanel(root: HTMLElement): HTMLElement {
  root.classList.add('open');
  let panel = root.querySelector<HTMLElement>('.mg-panel');
  if (!panel) {
    panel = el('div', 'mg-panel');
    root.replaceChildren(panel);
  }
  return panel;
}

function closePanel(root: HTMLElement): void {
  root.classList.remove('open');
  root.replaceChildren();
}

/** The intro: what the game is, how to play, who's in it, and what wins. */
function renderIntro(panel: HTMLElement, state: GameState, r: Round, online: boolean): void {
  const pending = state.pendingMinigame!;
  const me = r.players[0];
  panel.replaceChildren();
  const head = el('div', 'mg-head');
  head.append(el('div', 'mg-icon', r.game.icon));
  const words = el('div');
  words.append(
    el('div', 'mg-kicker', pending.source === 'checkpoint' ? 'Checkpoint mini-game' : r.duel ? `Duel · ${r.game.title}` : `Mini-game · ${r.game.title}`),
    el('h2', 'mg-title', r.title),
  );
  head.append(words);
  panel.append(head);

  const body = el('div', 'mg-intro');
  if (r.card) {
    const mini = renderCard(r.card, 'mini');
    mini.classList.add('mg-card');
    body.append(mini);
  }
  const text = el('div', 'mg-intro-text');
  text.append(el('p', 'mg-how', r.game.how));
  if (r.duel) {
    text.append(
      el(
        'p',
        'mg-goal',
        online
          ? `${r.players.map((p) => p.name).join(' vs ')} — everyone plays the same round on their own screen. ${me.name} needs the best score to win the card.`
          : `${r.players.map((p) => p.name).join(' vs ')} — everyone plays the same round. ${me.name} needs the best score to win the card.`,
      ),
    );
  } else {
    text.append(
      el(
        'p',
        'mg-goal',
        pending.source === 'checkpoint'
          ? `Score ${r.target} ${r.game.unit} or more to earn the entry ticket.`
          : `Score ${r.target} ${r.game.unit} or more to collect this card.`,
      ),
    );
  }
  const chips = el('div', 'mg-players');
  for (const p of r.players) {
    const chip = el('span', 'mg-chip');
    chip.append(swatch(p.color), document.createTextNode(p.name));
    chips.append(chip);
  }
  text.append(chips);
  body.append(text);
  panel.append(body);
}

/** One traveler's round of the game. */
async function playOne(panel: HTMLElement, state: GameState, r: Round, p: Player, index: number): Promise<{ score: number; summary: string }> {
  panel.replaceChildren();
  const top = el('div', 'mg-playing');
  top.append(swatch(p.color), document.createTextNode(`${p.name} · ${r.title}`));
  const stage = el('div', 'mg-stage');
  panel.append(top, stage);
  const result = await r.game.play(stage, {
    difficulty: r.difficulty,
    playerName: p.name,
    playerColor: p.color,
    card: r.card,
    pool: Object.values(state.cards),
    theme: r.pick.theme ?? {},
    // Different rounds for each player, same across a replay of the action.
    seed: state.rngCursor * 31 + index * 977 + state.turn,
  });
  await new Promise((res) => setTimeout(res, 500));
  return result;
}

/** The scoreboard at the end of a round. */
function renderResult(
  panel: HTMLElement,
  r: Round,
  scores: Array<{ player: Player; score: number; summary: string }>,
  passed: boolean,
): HTMLButtonElement {
  const me = r.players[0];
  panel.replaceChildren();
  const res = el('div', `mg-result ${passed ? 'win' : 'lose'}`);
  res.append(el('div', 'mg-result-icon', passed ? '🏆' : '🙏'));
  const best = [...scores].sort((a, b) => b.score - a.score)[0];
  res.append(
    el(
      'h2',
      '',
      r.duel
        ? passed
          ? `${me.name} wins the duel!`
          : `${best.player.name} wins the duel`
        : passed
          ? `${me.name} did it!`
          : 'Not this time',
    ),
  );
  const table = el('div', 'mg-scores');
  for (const s of [...scores].sort((a, b) => b.score - a.score)) {
    const row = el('div', 'mg-score-row');
    row.append(swatch(s.player.color), el('span', 'mg-score-name', s.player.name), el('span', 'mg-score-sum', s.summary), el('b', '', `${s.score} ${r.game.unit}`));
    table.append(row);
  }
  res.append(table);
  if (!r.duel) res.append(el('p', 'mg-goal', `Needed ${r.target} ${r.game.unit}.`));
  const cont = el('button', '', 'Continue');
  res.append(cont);
  panel.append(res);
  return cont;
}

// --- on one device ---------------------------------------------------------------

/** Play the pending mini-game with real people at one screen. Resolves with the scores. */
export async function playMinigame(root: HTMLElement, state: GameState): Promise<MinigameResult> {
  running = true;
  try {
    const r = roundFor(state);
    const panel = openPanel(root);
    renderIntro(panel, state, r, false);
    const go = el('button', '', r.duel ? 'Start the duel' : "Let's play");
    const foot = el('div', 'mg-foot');
    foot.append(go);
    panel.append(foot);
    await waitClick(go);

    const scores: Array<{ player: Player; score: number; summary: string }> = [];
    for (let i = 0; i < r.players.length; i++) {
      const p = r.players[i];
      if (r.duel) {
        panel.replaceChildren();
        const ready = el('div', 'mg-ready');
        const dot = el('span', 'mg-ready-dot');
        dot.style.background = p.color;
        ready.append(
          dot,
          el('h2', '', `${p.name}, you're up`),
          el('p', '', i === 0 ? 'Show them how it’s done.' : `Score to beat: ${Math.max(...scores.map((s) => s.score))} ${r.game.unit}.`),
        );
        const b = el('button', '', `Ready, ${p.name}!`);
        ready.append(b);
        panel.append(ready);
        await waitClick(b);
      }
      scores.push({ player: p, ...(await playOne(panel, state, r, p, i)) });
    }

    const result = judge(state, new Map(scores.map((s) => [s.player.id, s.score])));
    result.game = r.game.title;
    await waitClick(renderResult(panel, r, scores, result.passed));
    return result;
  } finally {
    running = false;
    closePanel(root);
  }
}

// --- online ---------------------------------------------------------------------

/**
 * Play my own round of the pending mini-game. Resolves with my score; the
 * panel stays open on a "waiting for the others" screen afterwards.
 */
export async function playOwnRound(root: HTMLElement, state: GameState, seat: number): Promise<{ score: number; summary: string }> {
  running = true;
  try {
    const r = roundFor(state);
    const me = r.players.find((p) => p.id === seat)!;
    const panel = openPanel(root);
    renderIntro(panel, state, r, true);
    const go = el('button', '', "I'm ready — play!");
    const foot = el('div', 'mg-foot');
    foot.append(go);
    panel.append(foot);
    await waitClick(go);
    return await playOne(panel, state, r, me, r.players.indexOf(me));
  } finally {
    running = false;
  }
}

/** The screen everyone sees while scores come in. */
export function showWaiting(
  root: HTMLElement,
  state: GameState,
  done: Array<{ seat: number; score: number; summary: string }>,
): void {
  if (running) return; // don't interrupt someone mid-game
  const r = roundFor(state);
  const panel = openPanel(root);
  panel.replaceChildren();
  const head = el('div', 'mg-head');
  head.append(el('div', 'mg-icon', r.game.icon));
  const words = el('div');
  words.append(el('div', 'mg-kicker', r.duel ? `Duel · ${r.game.title}` : `${current(state).name} is playing`), el('h2', 'mg-title', r.title));
  head.append(words);
  panel.append(head);
  const list = el('div', 'mg-scores');
  for (const p of r.players) {
    const posted = done.find((d) => d.seat === p.id);
    const row = el('div', 'mg-score-row');
    row.append(
      swatch(p.color),
      el('span', 'mg-score-name', p.name),
      el('span', 'mg-score-sum', posted ? posted.summary : 'playing…'),
      el('b', posted ? '' : 'mg-pending', posted ? `${posted.score} ${r.game.unit}` : '⏳'),
    );
    list.append(row);
  }
  panel.append(list);
  if (!r.duel) panel.append(el('p', 'mg-goal', `Needs ${r.target} ${r.game.unit}.`));
}

/** Show the judged result of an online round; resolves when dismissed (or after a while). */
export async function showResult(root: HTMLElement, before: GameState, result: MinigameResult): Promise<void> {
  const r = roundFor(before);
  const panel = openPanel(root);
  const scoreOf = (id: number): number => (id === r.players[0].id ? result.score : result.rivals?.find((x) => x.playerId === id)?.score ?? 0);
  const scores = r.players.map((p) => ({ player: p, score: scoreOf(p.id), summary: '' }));
  const cont = renderResult(panel, r, scores, result.passed);
  await Promise.race([waitClick(cont), new Promise((res) => setTimeout(res, 6000))]);
  closePanel(root);
}

/** Close any mini-game panel (e.g. after a resync). */
export function closeMinigame(root: HTMLElement): void {
  if (!running) closePanel(root);
}
