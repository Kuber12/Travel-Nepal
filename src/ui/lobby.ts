/**
 * The start screen and the online room lobby.
 *
 *  - Play on this device: 2–4 travelers share one screen (hot-seat).
 *  - Host an online room: get a 4-letter code and an invite link to share.
 *  - Join a room: enter the code (or open the invite link).
 *
 * Resolves once a game is ready to start — locally, or when the room's host
 * presses Start and the server sends the first snapshot.
 */

import type { GameState } from '../engine/types.ts';
import { connect, forgetSeat, savedSeat, type NetClient } from '../net/client.ts';
import type { LobbyPlayer, ServerMessage } from '../net/protocol.ts';

export type LobbyChoice =
  | { kind: 'local'; players: number }
  | { kind: 'online'; net: NetClient; state: GameState; seq: number };

const NAME_KEY = 'travel-nepal-name';

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
      local.append(el('div', 'lobby-icon', '🎲'), el('h3', '', 'Play on this device'), el('p', '', 'Pass the screen around — 2 to 4 travelers.'));
      const counts = el('div', 'lobby-counts');
      for (const n of [2, 3, 4]) {
        const b = el('button', 'ghost', `${n} players`);
        b.addEventListener('click', () => finish({ kind: 'local', players: n }));
        counts.append(b);
      }
      local.append(counts);

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
        const who = name.value.trim();
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

    // --- the room lobby ---
    const room = (net: NetClient): void => {
      let players: LobbyPlayer[] = [];
      let error = '';

      const draw = (): void => {
        root.replaceChildren();
        const panel = el('div', 'lobby-panel');
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
        for (let i = 0; i < 4; i++) {
          const p = players[i];
          const row = el('div', `lobby-player${p ? '' : ' empty'}`);
          const dot = el('span', 'swatch');
          if (p) dot.style.background = p.color;
          row.append(dot, el('span', 'lobby-pname', p ? p.name : 'Waiting for a traveler…'));
          if (p?.host) row.append(el('span', 'lobby-tag', 'host'));
          if (p && p.seat === net.seat) row.append(el('span', 'lobby-tag you', 'you'));
          if (p && !p.connected) row.append(el('span', 'lobby-tag away', 'reconnecting'));
          list.append(row);
        }
        panel.append(list);

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
