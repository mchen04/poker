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
export type CustomPermission = 'creator_only' | 'button' | 'everyone_once_per_orbit';
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

export interface ClientToServerEvents {
  createRoom: (
    payload: { name: string; roomName?: string },
    ack: (result: SocketResult<{ code: string; playerId: string; sessionToken: string }>) => void
  ) => void;
  joinRoom: (
    payload: { code: string; name: string; sessionToken?: string; spectator?: boolean },
    ack: (result: SocketResult<{ code: string; playerId: string; sessionToken: string }>) => void
  ) => void;
  updateSettings: (payload: RoomSettingsPatch, ack: (result: SocketResult) => void) => void;
  sit: (payload: { seat: number }, ack: (result: SocketResult) => void) => void;
  ready: (payload: { ready: boolean }, ack: (result: SocketResult) => void) => void;
  startGame: (payload: Record<string, never>, ack: (result: SocketResult) => void) => void;
  act: (
    payload: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'; amount?: number; nonce: number },
    ack: (result: SocketResult) => void
  ) => void;
  requestChips: (payload: { amount: number; reason?: string }, ack: (result: SocketResult) => void) => void;
  approveChips: (payload: { playerId: string; amount: number; reason?: string }, ack: (result: SocketResult) => void) => void;
  queueMode: (payload: { mode: CustomModeName }, ack: (result: SocketResult) => void) => void;
  hostAction: (
    payload: { action: 'kick' | 'ban' | 'mute' | 'forceSitOut' | 'transferHost' | 'lock' | 'spectators'; playerId?: string; value?: boolean },
    ack: (result: SocketResult) => void
  ) => void;
  chat: (payload: { message: string }, ack: (result: SocketResult) => void) => void;
  endSession: (payload: Record<string, never>, ack: (result: SocketResult<{ exportText: string; exportJson: string }>) => void) => void;
}

export interface ServerToClientEvents {
  snapshot: (snapshot: ServerSnapshot) => void;
  errorNotice: (message: string) => void;
}

export type SocketResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
