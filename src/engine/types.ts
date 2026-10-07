/**
 * Core game types for Travel Nepal.
 *
 * NOTHING in src/engine may import three.js. This module is the shared
 * vocabulary between the pure rules layer and the renderer.
 */

export type SectionId =
  | 'airport'
  | 'nepalmandal'
  | 'chitwan'
  | 'lumbini'
  | 'pokhara'
  | 'himalayan'
  | 'eastern'
  | 'westernterai'
  | 'westernhillside'
  | 'mountain';

export type DeckId = SectionId | 'wild';

export type NodeKind =
  | 'path'
  | 'start'
  | 'checkpoint'
  | 'junction'
  | 'ticket-counter'
  | 'terminus';

export type BoardNode = {
  id: string;
  section: SectionId;
  kind: NodeKind;
  /** Outgoing edges. More than one means the player must choose a branch. */
  next: string[];
  /** Entering this node requires an entry ticket for the named section. */
  requiresTicket?: SectionId;
  /** Checkpoint: the entry ticket won by beating its mini-game. Ticket counter: the trip printed on that red square. */
  ticketReward?: SectionId;
  /** World-space position used by the renderer. [x, y, z] */
  pos: [number, number, number];
  /** Optional human label drawn on the board (e.g. "Kathmandu Durbar Square"). */
  label?: string;
};

export type Board = {
  id: string;
  startNode: string;
  nodes: Record<string, BoardNode>;
};

export type CardCategory =
  | 'photograph'
  | 'souvenir'
  | 'travel-tour'
  | 'get-together'
  | 'duel-1v1'
  | 'duel-2v2'
  | 'wild';

export type MinigameSpec = {
  type: 'dice-off' | 'guide-choice' | 'feast';
  /** Roll this or higher to succeed (dice-off vs. the house). */
  target?: number;
  /** Who you play against. Absent means solo vs. target. */
  opponents?: 'one' | 'all';
  /** Points awarded on success, when different from card.points. */
  rewardPoints?: number;
};

export type WildEffect = 'hire-a-bike' | 'homesick' | 'extend-vacation';

export type Card = {
  id: string;
  deck: DeckId;
  category: CardCategory;
  title: string;
  blurb: string;
  points: number;
  /** Wild cards are the only cards that do not go into the passport. */
  toPassport: boolean;
  minigame?: MinigameSpec;
  effect?: WildEffect;
};

export type Deck = {
  id: DeckId;
  /** Ids of cards still face-down, top of deck last. */
  draw: string[];
  discard: string[];
};

/** What a traveler's pawn wears on its head — cosmetic only. */
export type HatStyle = 'sunhat' | 'topi' | 'cap' | 'beanie';

export type Player = {
  id: number;
  name: string;
  /** Hex colour, matched to the printed traveler standees. */
  color: string;
  /** Cosmetic: the pawn's hat. */
  hat?: HatStyle;
  /** On one device, a traveler the computer plays. The rules never look at this. */
  bot?: boolean;
  /**
   * Medals won in friendly games at the Chautari. Just for fun: they never
   * count toward the score or decide the winner.
   */
  medals?: number;
  nodeId: string;
  /** Entry tickets held, one per sub-section. */
  tickets: SectionId[];
  /** Card ids in the passport (everything except wild cards). */
  passport: string[];
  /** Spins remaining on the Hire a Bike effect; > 0 means each spin is halved. */
  singleDieTurns: number;
  finished: boolean;
};

export type Phase =
  | 'await-roll'
  | 'rolling'
  | 'moving'
  | 'await-branch'
  | 'ticket-counter'
  | 'checkpoint-minigame'
  | 'await-draw'
  | 'resolve-card'
  | 'card-minigame'
  | 'end-turn'
  | 'game-over';

/** Everything the UI needs to know about the roll that is being animated. */
export type RollResult = {
  /** Faces shown: the prayer wheel's number for movement, dice for a fallback mini-game. Empty for a played mini-game. */
  dice: number[];
  total: number;
  /** Movement only: a hired bike halved this spin. */
  bike?: boolean;
};

/**
 * The outcome of a mini-game a person actually played. The UI runs the game
 * and reports it in the action, so the reducer stays pure and replays stay
 * exact. Without one, the reducer settles the mini-game with a die roll
 * (autoplay, the headless sim).
 */
export type MinigameResult = {
  /** Which game was played, for the log. */
  game: string;
  /** The active traveler's score. */
  score: number;
  /** Solo games: did the score clear the bar. Ignored in a duel. */
  passed: boolean;
  /** Solo games: the score that was needed. */
  target?: number;
  /** Duels: each rival's score. */
  rivals?: Array<{ playerId: number; score: number }>;
};

export type PendingMinigame = {
  source: 'checkpoint' | 'card';
  spec: MinigameSpec;
  cardId?: string;
  /** Section ticket awarded on success, for checkpoint mini-games. */
  ticketReward?: SectionId;
};

export type LogEntry = {
  turn: number;
  playerId: number;
  text: string;
};

export type GameState = {
  seed: number;
  /** RNG cursor — bumped on every random draw so replays are deterministic. */
  rngCursor: number;
  board: Board;
  decks: Record<string, Deck>;
  cards: Record<string, Card>;
  players: Player[];
  currentPlayerIndex: number;
  turn: number;
  phase: Phase;
  /** The last roll, kept so the renderer can animate to a known result. */
  lastRoll: RollResult | null;
  /** Nodes the pawn must visit this move, in order. Consumed by the renderer. */
  pendingPath: string[];
  /** Branch options when phase is 'await-branch'. */
  branchOptions: string[];
  /** Steps left to spend after a junction, consumed by CHOOSE_BRANCH. */
  pendingSteps: number;
  /** Card drawn and awaiting resolution. */
  drawnCardId: string | null;
  pendingMinigame: PendingMinigame | null;
  /** Outcome of the mini-game just played; null when none has been played. */
  minigameWon: boolean | null;
  /** Dice shown for a mini-game roll, kept separate from movement dice. */
  minigameRoll: RollResult | null;
  /** Opponents' rolls in a duel, in turn order. Empty for a solo mini-game. */
  minigameRivals: Array<{ playerId: number; total: number }>;
  /** The mini-game that was played, when a person played one. */
  minigamePlayed?: { game: string; target?: number } | null;
  log: LogEntry[];
  winnerId: number | null;
};

export type Action =
  | { type: 'ROLL' }
  | { type: 'MOVE_COMPLETE' }
  | { type: 'CHOOSE_BRANCH'; nodeId: string }
  | { type: 'CLAIM_COUNTER_TICKET'; section: SectionId }
  | { type: 'SKIP_COUNTER' }
  | { type: 'PLAY_MINIGAME'; result?: MinigameResult }
  | { type: 'DRAW_CARD' }
  | { type: 'RESOLVE_CARD' }
  | { type: 'END_TURN' }
  /**
   * A friendly game at the Chautari finished. Hands out medals and logs it;
   * touches nothing else — not the score, the turn, or the dice.
   */
  | { type: 'CHAUTARI_RESULT'; game: string; winners: number[] };
