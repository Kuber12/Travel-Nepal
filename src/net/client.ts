/**
 * The browser end of the multiplayer connection: one WebSocket to /ws on the
 * same host that served the page, with automatic reconnect. After a drop it
 * rejoins the room with the seat token it was given, and the server replies
 * with a fresh snapshot of the game.
 */

import type { ClientMessage, ServerMessage } from './protocol.ts';

export type NetClient = {
  readonly seat: number;
  readonly code: string;
  readonly host: boolean;
  readonly connected: boolean;
  send(msg: ClientMessage): void;
  /** Subscribe to server messages. Returns an unsubscribe function. */
  on(fn: (msg: ServerMessage) => void): () => void;
  /** Subscribe to connection up/down changes. */
  onStatus(fn: (connected: boolean) => void): () => void;
  close(): void;
};

const SESSION_KEY = 'travel-nepal-room';

export type SavedSeat = { code: string; token: string };

export function savedSeat(): SavedSeat | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSeat) : null;
  } catch {
    return null;
  }
}

export function forgetSeat(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — nothing to forget */
  }
}

function saveSeat(seat: SavedSeat): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(seat));
  } catch {
    /* storage unavailable — reconnects within this page still work */
  }
}

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Open a connection. `first` is sent once the socket is up (create / join / rejoin). */
export function connect(first: ClientMessage): Promise<NetClient> {
  return new Promise((resolve, reject) => {
    const listeners = new Set<(msg: ServerMessage) => void>();
    const statusListeners = new Set<(up: boolean) => void>();
    let socket: WebSocket | null = null;
    let seat = -1;
    let code = '';
    let isHost = false;
    let token = '';
    let closed = false;
    let up = false;
    let settled = false;
    let retry = 0;
    const outbox: ClientMessage[] = [];

    const client: NetClient = {
      get seat() {
        return seat;
      },
      get code() {
        return code;
      },
      get host() {
        return isHost;
      },
      get connected() {
        return up;
      },
      send(msg) {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
        else outbox.push(msg);
      },
      on(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      onStatus(fn) {
        statusListeners.add(fn);
        return () => statusListeners.delete(fn);
      },
      close() {
        closed = true;
        forgetSeat();
        socket?.close();
      },
    };

    const setUp = (value: boolean): void => {
      if (up === value) return;
      up = value;
      for (const fn of statusListeners) fn(value);
    };

    const open = (hello: ClientMessage): void => {
      const ws = new WebSocket(socketUrl());
      socket = ws;
      ws.onopen = () => {
        retry = 0;
        setUp(true);
        ws.send(JSON.stringify(hello));
        while (outbox.length) ws.send(JSON.stringify(outbox.shift()));
      };
      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.t === 'joined') {
          seat = msg.seat;
          code = msg.code;
          isHost = msg.host;
          token = msg.token;
          saveSeat({ code, token });
          if (!settled) {
            settled = true;
            resolve(client);
          }
        }
        if (msg.t === 'error' && !settled) {
          settled = true;
          closed = true;
          ws.close();
          reject(new Error(msg.message));
          return;
        }
        for (const fn of listeners) fn(msg);
      };
      ws.onclose = () => {
        setUp(false);
        if (closed) return;
        if (!settled) {
          settled = true;
          reject(new Error('Could not reach the game server.'));
          return;
        }
        // Reconnect with back-off, then rejoin our seat.
        retry++;
        setTimeout(() => open({ t: 'rejoin', code, token }), Math.min(500 * 2 ** retry, 8000));
      };
    };

    open(first);
  });
}
