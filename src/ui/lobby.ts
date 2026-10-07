/**
 * The start screen, the trip setup, and the online room lobby.
 *
 *  - Play on this device: set up 2–4 travelers — each with a name, a colour
 *    and a hat, played by a person or by the computer — and share one screen.
 *  - Host an online room: get a 4-letter code and an invite link to share.
 *  - Join a room: enter the code (or open the invite link).
 *
 * Resolves once a game is ready to start — locally, or when the room's host
 * presses Start and the server sends the first snapshot.
 */

import { HAT_STYLES, TRAVELER_COLORS, TRAVELERS, type TravelerSetup } from '../engine/setup.ts';
import type { GameState, HatStyle } from '../engine/types.ts';
import { connect, forgetSeat, savedSeat, type NetClient } from '../net/client.ts';
import type { LobbyPlayer, ServerMessage } from '../net/protocol.ts';
import { avatar, HAT_LABEL } from './avatar.ts';

export type LobbyChoice =
  | { kind: 'local'; travelers: TravelerSetup[] }
  | { kind: 'online'; net: NetClient; state: GameState; seq: number };

const NAME_KEY = 'travel-nepal-name';
const SETUP_KEY = 'travel-nepal-setup';
const MAX_TRAVELERS = TRAVELERS.length;

/** Put the room code in the address bar (or take it out), keeping other options like ?quality=low. */
export function setRoomParam(code: string | null): void {
  const params = new URLSearchParams(location.search);
  if (code) params.set('room', code);
  else params.delete('room');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* fine without it */
  }
}

/** Letters, digits, spaces and a little punctuation — the same rule the server applies. */
export function cleanName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 16);
}

type Setup = { travelers: TravelerSetup[]; shuffle: boolean };

function defaultSetup(): Setup {
  const mine = rememberedName();
  return {
    shuffle: false,
    travelers: [0, 1].map((i) => ({
      name: i === 0 ? mine : '',
      color: TRAVELERS[i].color,
      hat: TRAVELERS[i].hat,
    })),
  };
}

/** Last trip's line-up, so a rematch is one click. */
function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return defaultSetup();
    const saved = JSON.parse(raw) as Setup;
    const travelers = (saved.travelers ?? [])
      .slice(0, MAX_TRAVELERS)
      .map((t, i) => ({
        name: cleanName(String(t.name ?? '')),
        color: (TRAVELER_COLORS as readonly string[]).includes(t.color) ? t.color : TRAVELERS[i].color,
        hat: HAT_STYLES.includes(t.hat as HatStyle) ? t.hat : TRAVELERS[i].hat,
        bot: Boolean(t.bot),
      }));
    return travelers.length >= 2 ? { travelers, shuffle: Boolean(saved.shuffle) } : defaultSetup();
  } catch {
    return defaultSetup();
  }
}

function saveSetup(setup: Setup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* fine without it */
  }
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A row of colour dots; colours someone else already wears are greyed out. */
function colorPicker(current: string, taken: string[], pick: (color: string) => void): HTMLElement {
  const row = el('div', 'setup-colors');
  for (const color of TRAVELER_COLORS) {
    const b = el('button', `setup-color${color === current ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--dot', color);
    b.title = taken.includes(color) && color !== current ? 'Taken — picking it swaps colours' : 'Wear this colour';
    if (taken.includes(color) && color !== current) b.classList.add('taken');
    b.setAttribute('aria-label', `Colour ${color}`);
    b.addEventListener('click', () => pick(color));
    row.append(b);
  }
  return row;
}

function hatPicker(current: HatStyle, color: string, pick: (hat: HatStyle) => void): HTMLElement {
  const row = el('div', 'setup-hats');
  for (const hat of HAT_STYLES) {
    const b = el('button', `setup-hat${hat === current ? ' on' : ''}`);
    b.type = 'button';
    b.title = HAT_LABEL[hat];
    b.setAttribute('aria-label', HAT_LABEL[hat]);
    b.append(avatar(color, hat, 30));
    b.addEventListener('click', () => pick(hat));
    row.append(b);
  }
  return row;
}

export function runLobby(root: HTMLElement): Promise<LobbyChoice> {
  return new Promise((resolve) => {
    const params = new URLSearchParams(location.search);
    const invited = (params.get('room') ?? '').toUpperCase().slice(0, 4);
    root.classList.add('open');

    const finish = (choice: LobbyChoice): void => {
      root.classList.remove('open');
      root.replaceChildren();
      resolve(choice);
    };

    // --- the start screen ---
    const start = (error = ''): void => {
      root.replaceChildren();
      const panel = el('div', 'lobby-panel');
      const head = el('div', 'lobby-head');
      head.append(el('h1', '', 'Travel Nepal'), el('p', '', 'A complete reality travel adventure'));
      panel.append(head);

      const name = el('input', 'lobby-input');
      name.placeholder = 'Your name';
      name.maxLength = 16;
      name.value = rememberedName();
      const nameRow = el('label', 'lobby-name');
      nameRow.append(el('span', '', 'Your traveler name'), name);

      const errorBox = el('div', 'lobby-error', error);

      const grid = el('div', 'lobby-grid');

      // Play here.
      const local = el('div', 'lobby-tile');
      local.append(
        el('div', 'lobby-icon', '🎲'),
        el('h3', '', 'Play on this device'),
        el('p', '', 'Pass the screen around — 2 to 4 travelers. Name everyone, pick colours and hats, add computer travelers.'),
      );
      const setupBtn = el('button', '', 'Set up the trip');
      setupBtn.addEventListener('click', () => {
        const who = cleanName(name.value);
        if (who) rememberName(who);
        setup();
      });
      local.append(setupBtn);

      // Host.
      const hostTile = el('div', 'lobby-tile');
      hostTile.append(el('div', 'lobby-icon', '🏠'), el('h3', '', 'Host an online room'), el('p', '', 'Get a room code to share. Friends join from their own devices.'));
      const hostBtn = el('button', '', 'Create a room');
      hostTile.append(hostBtn);

      // Join.
      const joinTile = el('div', 'lobby-tile');
      joinTile.append(el('div', 'lobby-icon', '🔑'), el('h3', '', 'Join a room'), el('p', '', 'Enter the 4-letter code from your host.'));
      const code = el('input', 'lobby-input lobby-code');
      code.placeholder = 'CODE';
      code.maxLength = 4;
      code.value = invited;
      code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '')));
      const joinBtn = el('button', '', 'Join');
      const joinRow = el('div', 'lobby-join');
      joinRow.append(code, joinBtn);
      joinTile.append(joinRow);

      grid.append(local, hostTile, joinTile);
      panel.append(nameRow, grid, errorBox);
      root.append(panel);
      (invited ? name.value ? joinBtn : name : name).focus();
      if (invited) joinTile.classList.add('invited');

      const go = async (kind: 'create' | 'join'): Promise<void> => {
        const who = cleanName(name.value);
        if (!who) {
          errorBox.textContent = 'Pick a name first.';
          name.focus();
          return;
        }
        if (kind === 'join' && code.value.length !== 4) {
          errorBox.textContent = 'Room codes are 4 letters.';
          code.focus();
          return;
        }
        rememberName(who);
        hostBtn.disabled = joinBtn.disabled = true;
        errorBox.textContent = 'Connecting…';
        try {
          const net = await connect(kind === 'create' ? { t: 'create', name: who } : { t: 'join', code: code.value, name: who });
          room(net);
        } catch (err) {
          start((err as Error).message);
        }
      };
      hostBtn.addEventListener('click', () => void go('create'));
      joinBtn.addEventListener('click', () => void go('join'));
      code.addEventListener('keydown', (e) => e.key === 'Enter' && void go('join'));
    };

    // --- the trip setup: who's travelling ---
    const setup = (): void => {
      const trip = loadSetup();

      let drawn = false;
      const draw = (focusIndex = -1): void => {
        root.replaceChildren();
        // Only the first appearance animates; a redraw after a click must not flicker.
        const panel = el('div', `lobby-panel setup-panel${drawn ? ' steady' : ''}`);
        drawn = true;
        const head = el('div', 'lobby-head');
        head.append(el('h1', '', 'Who’s travelling?'), el('p', '', 'Names, colours and hats — the travelers in turn order'));
        panel.append(head);

        const list = el('div', 'setup-list');
        const inputs: HTMLInputElement[] = [];
        trip.travelers.forEach((t, i) => {
          const row = el('div', `setup-row${t.bot ? ' bot' : ''}`);
          const badge = el('div', 'setup-avatar');
          badge.append(avatar(t.color, t.hat ?? 'sunhat', 58));
          badge.append(el('span', 'setup-seat', `${i + 1}`));

          const main = el('div', 'setup-main');
          const top = el('div', 'setup-top');
          const input = el('input', 'lobby-input setup-name');
          input.maxLength = 16;
          input.placeholder = t.bot ? `Computer ${i + 1}` : TRAVELERS[i].name;
          input.value = t.name;
          input.setAttribute('aria-label', `Traveler ${i + 1} name`);
          input.addEventListener('input', () => (t.name = cleanName(input.value)));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') (inputs[i + 1] ?? startBtn).focus();
          });
          inputs.push(input);

          const kind = el('div', 'setup-kind');
          for (const [label, bot] of [['🙂 Person', false], ['🤖 Computer', true]] as const) {
            const b = el('button', `seg${Boolean(t.bot) === bot ? ' on' : ''}`, label);
            b.type = 'button';
            b.addEventListener('click', () => {
              t.bot = bot;
              draw();
            });
            kind.append(b);
          }
          top.append(input, kind);
          if (trip.travelers.length > 2) {
            const remove = el('button', 'setup-remove', '×');
            remove.type = 'button';
            remove.title = 'Remove this traveler';
            remove.setAttribute('aria-label', `Remove traveler ${i + 1}`);
            remove.addEventListener('click', () => {
              trip.travelers.splice(i, 1);
              draw();
            });
            top.append(remove);
          }

          const looks = el('div', 'setup-looks');
          looks.append(
            colorPicker(
              t.color,
              trip.travelers.filter((o) => o !== t).map((o) => o.color),
              (color) => {
                // Colours are unique: taking someone's colour swaps with them.
                const other = trip.travelers.find((o) => o !== t && o.color === color);
                if (other) other.color = t.color;
                t.color = color;
                draw();
              },
            ),
            hatPicker(t.hat ?? 'sunhat', t.color, (hat) => {
              t.hat = hat;
              draw();
            }),
          );
          main.append(top, looks);
          row.append(badge, main);
          list.append(row);
        });
        panel.append(list);

        if (trip.travelers.length < MAX_TRAVELERS) {
          const add = el('button', 'ghost setup-add', '+ Add a traveler');
          add.type = 'button';
          add.addEventListener('click', () => {
            const i = trip.travelers.length;
            const used = trip.travelers.map((t) => t.color);
            const color = TRAVELER_COLORS.find((c) => !used.includes(c)) ?? TRAVELERS[i].color;
            trip.travelers.push({ name: '', color, hat: TRAVELERS[i].hat, bot: false });
            draw(i);
          });
          panel.append(add);
        }

        const opts = el('label', 'setup-option');
        const shuffle = el('input');
        shuffle.type = 'checkbox';
        shuffle.setAttribute('aria-label', 'Draw lots for who goes first');
        shuffle.checked = trip.shuffle;
        shuffle.addEventListener('change', () => (trip.shuffle = shuffle.checked));
        opts.append(shuffle, el('span', '', 'Draw lots for who goes first'));
        panel.append(opts);

        const foot = el('div', 'lobby-foot');
        const back = el('button', 'ghost', '← Back');
        back.type = 'button';
        back.addEventListener('click', () => {
          saveSetup(trip);
          start();
        });
        const startBtn = el('button', 'setup-go', 'Start the journey');
        startBtn.type = 'button';
        startBtn.addEventListener('click', () => {
          const travelers = trip.travelers.map((t, i) => ({
            ...t,
            name: cleanName(t.name) || (t.bot ? `Computer ${i + 1}` : TRAVELERS[i].name),
          }));
          // Two travelers with the same name would be hard to tell apart.
          const seen = new Map<string, number>();
          for (const t of travelers) {
            const n = (seen.get(t.name.toLowerCase()) ?? 0) + 1;
            seen.set(t.name.toLowerCase(), n);
            if (n > 1) t.name = `${t.name.slice(0, 13)} ${n}`;
          }
          saveSetup(trip);
          const firstHuman = travelers.find((t) => !t.bot);
          if (firstHuman) rememberName(firstHuman.name);
          finish({ kind: 'local', travelers: trip.shuffle ? shuffled(travelers) : travelers });
        });
        foot.append(back, startBtn);
        panel.append(foot);
        root.append(panel);
        if (focusIndex >= 0) inputs[focusIndex]?.focus();
      };

      draw(trip.travelers[0].name ? -1 : 0);
    };

    // --- the room lobby ---
    const room = (net: NetClient): void => {
      let players: LobbyPlayer[] = [];
      let error = '';
      let drawn = false;

      const draw = (): void => {
        root.replaceChildren();
        const panel = el('div', `lobby-panel${drawn ? ' steady' : ''}`);
        drawn = true;
        panel.append(el('div', 'lobby-kicker', 'Room code'));
        panel.append(el('div', 'lobby-bigcode', net.code));

        const link = `${location.origin}${location.pathname}?room=${net.code}`; // a clean link for friends
        const share = el('div', 'lobby-share');
        const linkBox = el('input', 'lobby-input');
        linkBox.readOnly = true;
        linkBox.value = link;
        const copy = el('button', 'ghost', 'Copy invite link');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(link);
            copy.textContent = 'Copied!';
          } catch {
            linkBox.select();
          }
        });
        share.append(linkBox, copy);
        panel.append(share);

        const list = el('div', 'lobby-players');
        for (let i = 0; i < MAX_TRAVELERS; i++) {
          const p = players[i];
          const row = el('div', `lobby-player${p ? '' : ' empty'}`);
          if (p) row.append(avatar(p.color, p.hat, 34));
          else row.append(el('span', 'swatch'));
          row.append(el('span', 'lobby-pname', p ? p.name : 'Waiting for a traveler…'));
          if (p?.host) row.append(el('span', 'lobby-tag', 'host'));
          if (p && p.seat === net.seat) row.append(el('span', 'lobby-tag you', 'you'));
          if (p && !p.connected) row.append(el('span', 'lobby-tag away', 'reconnecting'));
          list.append(row);
        }
        panel.append(list);

        // My look: colour and hat, chosen here and carried into the game.
        const mine = players.find((p) => p.seat === net.seat);
        if (mine) {
          const look = el('div', 'room-look');
          look.append(el('span', 'room-look-label', 'Your look'));
          look.append(
            colorPicker(
              mine.color,
              players.filter((p) => p.seat !== net.seat).map((p) => p.color),
              (color) => {
                if (players.some((p) => p.seat !== net.seat && p.color === color)) {
                  error = 'Someone else is wearing that colour.';
                  draw();
                  return;
                }
                net.send({ t: 'look', color, hat: mine.hat });
              },
            ),
            hatPicker(mine.hat, mine.color, (hat) => net.send({ t: 'look', color: mine.color, hat })),
          );
          panel.append(look);
        }

        const foot = el('div', 'lobby-foot');
        const leave = el('button', 'ghost', 'Leave');
        leave.addEventListener('click', () => {
          net.close();
          setRoomParam(null);
          start();
        });
        foot.append(leave);
        if (net.host) {
          const go = el('button', '', players.length < 2 ? 'Waiting for players…' : `Start with ${players.length} travelers`);
          go.disabled = players.length < 2;
          go.addEventListener('click', () => net.send({ t: 'start' }));
          foot.append(go);
        } else {
          foot.append(el('span', 'lobby-wait', 'Waiting for the host to start…'));
        }
        panel.append(foot);
        if (error) panel.append(el('div', 'lobby-error', error));
        root.append(panel);
      };

      const off = net.on((msg: ServerMessage) => {
        if (msg.t === 'lobby') {
          players = msg.players;
          error = '';
          draw();
        } else if (msg.t === 'joined') {
          draw();
        } else if (msg.t === 'error') {
          error = msg.message;
          draw();
        } else if (msg.t === 'snapshot') {
          off();
          finish({ kind: 'online', net, state: msg.state, seq: msg.seq });
        }
      });
      setRoomParam(net.code);
      draw();
    };

    // A refresh mid-game: take our seat back.
    const saved = savedSeat();
    if (saved && (!invited || invited === saved.code)) {
      root.replaceChildren(el('div', 'lobby-panel lobby-connecting', `Rejoining room ${saved.code}…`));
      connect({ t: 'rejoin', code: saved.code, token: saved.token })
        .then((net) => room(net))
        .catch(() => {
          forgetSeat();
          start();
        });
    } else {
      start();
    }
  });
}
