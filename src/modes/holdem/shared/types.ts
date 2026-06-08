export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type Card = `${Rank}${Suit}`;

export type ChipMode = 'strict' | 'casual';
export type SeatStatus = 'empty' | 'seated' | 'sitting_out' | 'disconnected' | 'busted';
export type HandPhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type Variant = 'holdem' | 'omaha4';
export type CustomPermission = 'creator_only' | 'button' | 'everyone_with_cooldown';
export type CustomModeName = 'holdem' | 'omaha4' | 'bomb_pot' | 'show_one' | 'seven_two';

export interface RoomSettings {
  roomName: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  buyIn: number;
  startingStack: number;
  minSeats: number;
  maxSeats: number;
  autoApproveChips: boolean;
  selfServiceChips: boolean;
  chipMode: ChipMode;
  locked: boolean;
  spectatorsAllowed: boolean;
  straddle: {
    enabled: boolean;
    amount: number;
    mode: 'off' | 'utg' | 'button';
  };
  custom: {
    enabled: boolean;
    permission: CustomPermission;
    cooldownHands: number;
    allowedModes: CustomModeName[];
  };
  sevenTwo: {
    enabled: boolean;
    bounty: number;
    suitedBonus: number;
  };
  largeBetThresholdPct: number;
  /** Per-turn action clock in seconds for connected players. 0 disables it. */
  actionTimerSeconds: number;
}

export type RoomSettingsPatch = Partial<Omit<RoomSettings, 'straddle' | 'custom' | 'sevenTwo'>> & {
  straddle?: Partial<RoomSettings['straddle']>;
  custom?: Partial<RoomSettings['custom']>;
  sevenTwo?: Partial<RoomSettings['sevenTwo']>;
};

export interface PlayerPublic {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  muted: boolean;
  banned: boolean;
  forcedSitOut: boolean;
  seat: number | null;
  stack: number;
  buyInTotal: number;
  cashOut: number;
  upDown: number;
  ready: boolean;
  status: SeatStatus;
  currentBet: number;
  committedThisHand: number;
  folded: boolean;
  allIn: boolean;
  badges: string[];
  /** Pending chip-request amount awaiting host approval, or null. */
  chipRequest: number | null;
}

export interface AuditEntry {
  id: string;
  at: number;
  type: string;
  actor?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ChatEntry {
  id: string;
  at: number;
  playerId: string;
  playerName: string;
  message: string;
  system?: boolean;
}

export interface PotPublic {
  amount: number;
  eligibleSeatNumbers: number[];
  label: string;
}

export interface QueuedCustomMode {
  id: string;
  queuedBy: string;
  queuedByName: string;
  appliesHandNumber: number;
  variant?: Variant;
  modifiers: {
    bombPot?: boolean;
    showOne?: boolean;
    sevenTwo?: boolean;
  };
  label: string;
}

export interface HandPublic {
  id: string;
  number: number;
  phase: HandPhase;
  variant: Variant;
  modifiers: QueuedCustomMode['modifiers'];
  buttonSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  straddleSeat: number | null;
  currentTurnSeat: number | null;
  /** Server clock (ms) when the current actor's turn began; null when no actor. Drives the action-timer countdown. */
  turnStartedAt: number | null;
  currentBet: number;
  minRaise: number;
  board: Card[];
  board2: Card[];
  pots: PotPublic[];
  eligibleSeatNumbers: number[];
  lastAggressorSeat: number | null;
  actionNonce: number;
  shuffleCommitment: string;
  shuffleReveal?: string;
  winners: string[];
  summary: string;
  /** Seats that won any pot this hand (for UI highlight). */
  winningSeats: number[];
  /** Non-folded contenders' hole cards, populated only at showdown (phase complete). */
  revealedHands: Array<{ seat: number; playerId: string; cards: Card[]; handName: string }>;
}

export interface RoomPublicState {
  code: string;
  createdAt: number;
  hostId: string;
  lifecycle: 'lobby' | 'playing' | 'ended';
  settings: RoomSettings;
  players: PlayerPublic[];
  seats: Array<string | null>;
  audit: AuditEntry[];
  chat: ChatEntry[];
  hand: HandPublic | null;
  queuedMode: QueuedCustomMode | null;
  rateLimitNotice?: string;
  exportWarning: string;
}

export interface PrivateState {
  playerId: string;
  roomCode: string;
  sessionToken: string;
  holeCards: Card[];
  legalActions: LegalActions;
  reconnectTokenValid: boolean;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  minBet: number;
  minRaiseTo: number;
  maxBet: number;
  allInAmount: number;
  potSize: number;
}

export type ServerSnapshot = {
  publicState: RoomPublicState;
  privateState: PrivateState | null;
};

export type PlayerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
export type HostActionName = 'kick' | 'ban' | 'mute' | 'forceSitOut' | 'transferHost' | 'lock' | 'spectators';

/**
 * Client -> server messages over the PartyKit WebSocket. Each is JSON with a
 * `type` discriminator; an optional `reqId` is echoed back on the matching
 * `error`/`export` reply so the client can correlate a command's outcome.
 */
export type ClientCommand =
  | { type: 'join'; name: string; sessionToken?: string; spectator?: boolean; reqId?: string }
  | { type: 'updateSettings'; patch: RoomSettingsPatch; reqId?: string }
  | { type: 'sit'; seat: number; reqId?: string }
  | { type: 'ready'; ready: boolean; reqId?: string }
  | { type: 'startGame'; reqId?: string }
  | { type: 'act'; action: PlayerAction; amount?: number; nonce: number; reqId?: string }
  | { type: 'requestChips'; amount: number; reason?: string; reqId?: string }
  | { type: 'approveChips'; playerId: string; amount: number; reason?: string; reqId?: string }
  | { type: 'queueMode'; mode: CustomModeName; reqId?: string }
  | { type: 'hostAction'; action: HostActionName; playerId?: string; value?: boolean; reqId?: string }
  | { type: 'chat'; message: string; reqId?: string }
  | { type: 'addBot'; reqId?: string }
  | { type: 'removeBot'; playerId: string; reqId?: string }
  | { type: 'endSession'; reqId?: string }
  | { type: 'leave'; reqId?: string };

/** Server -> client messages over the PartyKit WebSocket. */
export type ServerEvent =
  | { type: 'snapshot'; publicState: RoomPublicState; privateState: PrivateState | null }
  | { type: 'welcome'; playerId: string; sessionToken: string }
  | { type: 'export'; exportText: string; exportJson: string; reqId?: string }
  | { type: 'error'; message: string; reqId?: string }
  | { type: 'kicked'; message: string };

export type SocketResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
