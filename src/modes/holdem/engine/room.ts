import { nanoid } from 'nanoid';
import { cardLabel, isSevenTwo } from '../shared/cards';
import { buildQueuedMode, mergeMode, modeLabel, validateMode, variantLabel } from '../shared/modes';
import { cleanChat, cleanName, clampInt } from '../shared/sanitize';
import type { AuditEntry, Card, ChatEntry, CustomModeName, HandPhase, HandPublic, LegalActions, PlayerPublic, PrivateState, QueuedCustomMode, RoomPublicState, RoomSettings, RoomSettingsPatch, ServerSnapshot, SocketResult } from '../shared/types';
import { approveChipsWithSupport, requestChipsWithSupport } from './chipLedger';
import { hostActionWithSupport, type HostActionPayload, type HostActionResult } from './hostControls';
import { handToPublic } from './projection';
import { eligiblePlayers, hasActiveHand, rateLimited, readyEligiblePlayers, reconcileHandParticipants, reconcileStackStatus, requireActivePlayer, requireHost, requireMutableRoom, requireQueueParticipant, requireReadyParticipant } from './access';
import { shuffleDeck } from './deck';
import { buildSidePots, rankHighHand, rankPlayers, winnerSeats } from './evaluator';
import { buildSessionExport, finalizeStacks } from './sessionExport';
import { defaultSettings, sanitizeSettings } from './settings';
type PlayerStatus = PlayerPublic['status'];

export interface PlayerInternal {
  id: string;
  sessionToken: string;
  socketIds: Set<string>;
  name: string;
  isHost: boolean;
  isBot: boolean;
  muted: boolean;
  banned: boolean;
  forcedSitOut: boolean;
  spectator: boolean;
  seat: number | null;
  stack: number;
  buyInTotal: number;
  cashOut: number;
  ready: boolean;
  status: PlayerStatus;
  pendingChipRequest?: { amount: number; reason: string; at: number };
  chatTimestamps: number[];
  actionTimestamps: number[];
  lastCustomHand: number;
}

export interface ParticipantInternal {
  playerId: string;
  seat: number;
  holeCards: Card[];
  currentBet: number;
  committedThisHand: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
}

export interface HandInternal extends HandPublic {
  deck: Card[];
  fullRaiseBase: number;
  participants: Map<number, ParticipantInternal>;
}

export interface RoomInternal {
  code: string;
  createdAt: number;
  hostId: string;
  lifecycle: RoomPublicState['lifecycle'];
  settings: RoomSettings;
  players: Map<string, PlayerInternal>;
  seats: Array<string | null>;
  audit: AuditEntry[];
  chat: ChatEntry[];
  hand: HandInternal | null;
  queuedMode: QueuedCustomMode | null;
  nextHandNumber: number;
  lastButtonSeat: number | null;
  bannedTokens: Set<string>;
  emptySince: number | null;
  endedExport?: { exportText: string; exportJson: string };
}

function audit(room: RoomInternal, type: string, message: string, actor?: string, data?: Record<string, unknown>): void {
  room.audit.push({ id: nanoid(8), at: Date.now(), type, actor, message, data });
  if (room.audit.length > 1200) room.audit.splice(0, room.audit.length - 1200);
}

function systemChat(room: RoomInternal, message: string, playerId = 'system'): void {
  room.chat.push({ id: nanoid(8), at: Date.now(), playerId, playerName: 'Table', message, system: true });
  if (room.chat.length > 250) room.chat.splice(0, room.chat.length - 250);
}

function publicPlayer(room: RoomInternal, player: PlayerInternal): PlayerPublic {
  const participant = room.hand && player.seat !== null ? room.hand.participants.get(player.seat) : null;
  const badges: string[] = [];
  if (player.isHost) badges.push('Host');
  if (room.hand?.buttonSeat === player.seat) badges.push('D');
  if (room.hand?.smallBlindSeat === player.seat) badges.push('SB');
  if (room.hand?.bigBlindSeat === player.seat) badges.push('BB');
  if (room.hand?.straddleSeat === player.seat) badges.push('Straddle');
  if (player.pendingChipRequest) badges.push('Chip request');

  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    isBot: player.isBot,
    connected: player.socketIds.size > 0,
    muted: player.muted,
    banned: player.banned,
    forcedSitOut: player.forcedSitOut,
    seat: player.seat,
    stack: player.stack,
    buyInTotal: player.buyInTotal,
    cashOut: player.cashOut,
    upDown: (room.lifecycle === 'ended' ? player.cashOut : player.stack) - player.buyInTotal,
    ready: player.ready,
    status: player.status,
    currentBet: participant?.currentBet ?? 0,
    committedThisHand: participant?.committedThisHand ?? 0,
    folded: participant?.folded ?? false,
    allIn: participant?.allIn ?? false,
    badges,
    chipRequest: player.pendingChipRequest?.amount ?? null
  };
}

export function publicState(room: RoomInternal): RoomPublicState {
  return {
    code: room.code,
    createdAt: room.createdAt,
    hostId: room.hostId,
    lifecycle: room.lifecycle,
    settings: room.settings,
    players: [...room.players.values()].map((player) => publicPlayer(room, player)),
    seats: room.seats,
    audit: room.audit.slice(-250),
    chat: room.chat.slice(-120),
    hand: handToPublic(room.hand),
    queuedMode: room.queuedMode
  };
}

export function privateState(room: RoomInternal, player: PlayerInternal | null): PrivateState | null {
  if (!player) return null;
  const participant = room.hand && player.seat !== null ? room.hand.participants.get(player.seat) : null;
  const legalActions = participant ? legalActionsFor(room, player) : emptyLegalActions();
  return {
    playerId: player.id,
    roomCode: room.code,
    sessionToken: player.sessionToken,
    holeCards: participant?.holeCards ?? [],
    legalActions
  };
}

export function snapshot(room: RoomInternal, playerId?: string): ServerSnapshot {
  return {
    publicState: publicState(room),
    privateState: privateState(room, playerId ? room.players.get(playerId) ?? null : null)
  };
}

function emptyLegalActions(): LegalActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    minBet: 0,
    minRaiseTo: 0,
    maxBet: 0,
    allInAmount: 0,
    potSize: 0
  };
}

function findByToken(room: RoomInternal, sessionToken?: string): PlayerInternal | null {
  if (!sessionToken) return null;
  return [...room.players.values()].find((player) => player.sessionToken === sessionToken) ?? null;
}

/**
 * Build a fresh empty room for a PartyKit party. The party id is the room code;
 * the host is added by the first `joinRoom` call. No global room registry —
 * each PartyKit Durable Object owns exactly one `RoomInternal`.
 */
export function createEmptyRoom(code: string, roomNameInput?: string): RoomInternal {
  const settings = defaultSettings(cleanName(roomNameInput ?? '') || 'Private Felt');
  return {
    code,
    createdAt: Date.now(),
    hostId: '',
    lifecycle: 'lobby',
    settings,
    players: new Map(),
    seats: Array.from({ length: settings.maxSeats }, () => null),
    audit: [],
    chat: [],
    hand: null,
    queuedMode: null,
    nextHandNumber: 1,
    lastButtonSeat: null,
    bannedTokens: new Set(),
    emptySince: null
  };
}

/**
 * Join (or, for the first joiner, create-as-host) a room. Reconnect is matched
 * by `sessionToken`; a new player gets a fresh server-issued id + token.
 */
export function joinRoom(
  room: RoomInternal,
  nameInput: string,
  sessionToken?: string,
  spectator = false
): SocketResult<{ code: string; playerId: string; sessionToken: string }> {
  if (room.lifecycle === 'ended') return { ok: false, error: 'Session already ended.' };
  if (sessionToken && room.bannedTokens.has(sessionToken)) return { ok: false, error: 'This browser is banned from the room.' };

  const existing = findByToken(room, sessionToken);
  if (existing) {
    if (existing.banned) return { ok: false, error: 'This player is banned from the room.' };
    existing.status = existing.forcedSitOut || existing.spectator ? 'sitting_out' : existing.seat === null ? 'seated' : existing.status === 'disconnected' ? 'seated' : existing.status;
    room.emptySince = null;
    audit(room, 'player.reconnected', `${existing.name} reconnected`, existing.id);
    return { ok: true, code: room.code, playerId: existing.id, sessionToken: existing.sessionToken };
  }

  const name = cleanName(nameInput);
  if (!name) return { ok: false, error: 'Enter a display name.' };

  // First joiner becomes the host and creates the room contents.
  if (room.players.size === 0) {
    const host: PlayerInternal = {
      id: nanoid(10),
      sessionToken: nanoid(24),
      socketIds: new Set(),
      name,
      isHost: true,
      isBot: false,
      muted: false,
      banned: false,
      forcedSitOut: false,
      spectator: false,
      seat: null,
      stack: room.settings.startingStack,
      buyInTotal: room.settings.buyIn,
      cashOut: 0,
      ready: true,
      status: 'seated',
      chatTimestamps: [],
      actionTimestamps: [],
      lastCustomHand: -999
    };
    room.players.set(host.id, host);
    room.hostId = host.id;
    room.emptySince = null;
    audit(room, 'room.created', `${name} created room ${room.code}`, host.id, { playMoneyOnly: true, noDatabase: true });
    systemChat(room, 'Private play-money room created. No deposits, withdrawals, rake, or real-money settlement.');
    return { ok: true, code: room.code, playerId: host.id, sessionToken: host.sessionToken };
  }

  if (spectator && !room.settings.spectatorsAllowed) return { ok: false, error: 'Spectators are off.' };
  if (room.settings.locked) return { ok: false, error: 'Room is locked.' };
  if ([...room.players.values()].filter((player) => !player.banned).length >= 16) return { ok: false, error: 'Room is full.' };

  const player: PlayerInternal = {
    id: nanoid(10),
    sessionToken: nanoid(24),
    socketIds: new Set(),
    name,
    isHost: false,
    isBot: false,
    muted: false,
    banned: false,
    forcedSitOut: false,
    spectator,
    seat: null,
    stack: spectator ? 0 : room.settings.startingStack,
    buyInTotal: spectator ? 0 : room.settings.buyIn,
    cashOut: 0,
    ready: false,
    status: spectator ? 'sitting_out' : 'seated',
    chatTimestamps: [],
    actionTimestamps: [],
    lastCustomHand: -999
  };
  room.players.set(player.id, player);
  room.emptySince = null;
  audit(room, spectator ? 'spectator.joined' : 'player.joined', `${name} joined ${spectator ? 'as spectator' : 'the lobby'}`, player.id);
  return { ok: true, code: room.code, playerId: player.id, sessionToken: player.sessionToken };
}

export function attachSocket(room: RoomInternal, playerId: string, socketId: string): void {
  if (room.lifecycle === 'ended') return;
  const player = room.players.get(playerId);
  if (player && !player.banned) {
    player.socketIds.add(socketId);
    room.emptySince = null;
  }
}

export function detachSocket(room: RoomInternal, socketId: string): boolean {
  if (room.lifecycle === 'ended') return false;
  let changed = false;
  room.players.forEach((player) => {
    if (player.socketIds.delete(socketId)) {
      if (player.socketIds.size === 0) {
        player.ready = false;
        player.status = player.forcedSitOut ? 'sitting_out' : player.seat === null ? player.status : 'disconnected';
        audit(room, 'player.disconnected', `${player.name} disconnected`, player.id);
        timeoutDisconnectedParticipant(room, player);
      }
      changed = true;
    }
  });
  if ([...room.players.values()].every((player) => player.socketIds.size === 0)) {
    room.emptySince ??= Date.now();
    audit(room, 'room.empty', 'All browsers disconnected. Room remains only while the server process is alive.');
  }
  return changed;
}

function timeoutDisconnectedParticipant(room: RoomInternal, player: PlayerInternal): void {
  const hand = room.hand;
  if (!hand || hand.phase === 'complete' || player.seat === null) return;
  const participant = hand.participants.get(player.seat);
  if (!participant || participant.folded || participant.allIn) return;
  if (hand.currentTurnSeat !== player.seat) return;

  if (legalActionsFor(room, player).canCheck) {
    participant.acted = true;
    audit(room, 'timeout.check', `${player.name} disconnected and timed out to check`, player.id);
  } else {
    participant.folded = true;
    participant.acted = true;
    audit(room, 'timeout.fold', `${player.name} disconnected and timed out to fold`, player.id);
  }
  hand.actionNonce += 1;
  updatePots(hand);
  maybeAutoAdvanceOrAward(room);
}

function resolveDisconnectedTurns(room: RoomInternal): void {
  const hand = room.hand;
  if (!hand || hand.phase === 'complete') return;
  for (let guard = 0; guard < hand.participants.size; guard += 1) {
    const current = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat);
    if (!current || current.socketIds.size > 0 || current.status !== 'disconnected') return;
    timeoutDisconnectedParticipant(room, current);
    if (room.hand !== hand || room.hand?.phase === 'complete') return;
  }
}

export function playerInRoom(room: RoomInternal, playerId: string): PlayerInternal | undefined {
  return room.players.get(playerId);
}

export function updateSettings(room: RoomInternal, player: PlayerInternal, patch: RoomSettingsPatch): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const hostError = requireHost(room, player);
  if (hostError) return hostError;
  if (room.lifecycle === 'playing' && room.hand && room.hand.phase !== 'complete') {
    audit(room, 'settings.deferred_rejected', 'Rejected mid-hand setting change; it applies after the current hand.', player.id);
    return { ok: false, error: 'Setting changes apply between hands — finish the current hand first.' };
  }

  const next = sanitizeSettings(room.settings, patch);
  if (next.minSeats > next.maxSeats) return { ok: false, error: 'Minimum seats cannot exceed maximum seats.' };
  const occupiedPastLimit = room.seats.slice(next.maxSeats).some(Boolean);
  if (occupiedPastLimit) return { ok: false, error: 'Remove players from high-numbered seats before reducing max seats.' };
  room.settings = next;
  if (room.seats.length !== next.maxSeats) {
    const existing = room.seats.slice(0, next.maxSeats);
    while (existing.length < next.maxSeats) existing.push(null);
    room.seats = existing;
  }
  audit(room, 'settings.changed', `${player.name} changed table settings`, player.id, { patch });
  return { ok: true };
}

export function sit(room: RoomInternal, player: PlayerInternal, seat: number): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  if (player.spectator) return { ok: false, error: 'Spectators cannot sit.' };
  if (player.forcedSitOut) return { ok: false, error: 'Host has forced this player to sit out.' };
  if (hasActiveHand(room)) return { ok: false, error: 'Seat changes are locked during an active hand.' };
  if (seat < 0 || seat >= room.seats.length) return { ok: false, error: 'Seat does not exist.' };
  if (room.seats[seat] && room.seats[seat] !== player.id) return { ok: false, error: 'Seat is occupied.' };
  if (player.seat !== null) room.seats[player.seat] = null;
  room.seats[seat] = player.id;
  player.seat = seat;
  player.status = player.stack > 0 ? 'seated' : 'busted';
  audit(room, 'seat.changed', `${player.name} sat in seat ${seat + 1}`, player.id, { seat });
  return { ok: true };
}

export function setReady(room: RoomInternal, player: PlayerInternal, ready: boolean): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const readyError = requireReadyParticipant(player);
  if (readyError) return readyError;
  player.ready = ready;
  audit(room, ready ? 'player.ready' : 'player.unready', `${player.name} is ${ready ? 'ready' : 'not ready'}`, player.id);
  return { ok: true };
}

function nextOccupiedSeat(room: RoomInternal, after: number | null, players = eligiblePlayers(room)): number | null {
  if (players.length === 0) return null;
  const occupied = new Set(players.map((player) => player.seat).filter((seat): seat is number => seat !== null));
  const start = after === null ? -1 : after;
  for (let offset = 1; offset <= room.seats.length; offset += 1) {
    const seat = (start + offset + room.seats.length) % room.seats.length;
    if (occupied.has(seat)) return seat;
  }
  return null;
}

function postBlind(room: RoomInternal, hand: HandInternal, seat: number | null, amount: number, label: string): void {
  if (seat === null) return;
  const participant = hand.participants.get(seat);
  if (!participant) return;
  const player = room.players.get(participant.playerId);
  if (!player) return;
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  reconcileStackStatus(player);
  participant.currentBet += paid;
  participant.committedThisHand += paid;
  if (player.stack === 0) participant.allIn = true;
  applyWagerState(hand, participant, paid >= amount && amount >= room.settings.bigBlind ? paid : 0, false);
  audit(room, 'blind.posted', `${player.name} posted ${label} ${paid}`, player.id, { seat, amount: paid, label });
}

function buildHand(room: RoomInternal): SocketResult {
  const players = readyEligiblePlayers(room);
  if (players.length < room.settings.minSeats) return { ok: false, error: `Need at least ${room.settings.minSeats} ready seated players with chips.` };

  const buttonSeat = nextOccupiedSeat(room, room.lastButtonSeat, players);
  if (buttonSeat === null) return { ok: false, error: 'No eligible button seat.' };
  const headsUp = players.length === 2;
  const smallBlindSeat = headsUp ? buttonSeat : nextOccupiedSeat(room, buttonSeat, players);
  const bigBlindSeat = headsUp ? nextOccupiedSeat(room, buttonSeat, players) : nextOccupiedSeat(room, smallBlindSeat, players);
  const queued = room.queuedMode;
  const mode = mergeMode('holdem', queued);
  // The mandatory-straddle one-hand modifier forces a straddle even when the
  // table setting is off. Heads-up has no UTG seat between BB and button, so a
  // straddle there would wrap onto the button — never straddle heads-up.
  const wantStraddle =
    !headsUp &&
    (Boolean(mode.modifiers.mandatoryStraddle) || (room.settings.straddle.enabled && room.settings.straddle.mode !== 'off'));
  const straddleSeat = wantStraddle
    ? room.settings.straddle.mode === 'button'
      ? buttonSeat
      : nextOccupiedSeat(room, bigBlindSeat, players)
    : null;
  const deck = shuffleDeck();
  const participants = new Map<number, ParticipantInternal>();
  const holeCount = mode.variant === 'holdem' ? 2 : 4;

  players.forEach((player) => {
    if (player.seat === null) return;
    const holeCards = deck.splice(0, holeCount);
    participants.set(player.seat, {
      playerId: player.id,
      seat: player.seat,
      holeCards,
      currentBet: 0,
      committedThisHand: 0,
      folded: false,
      allIn: false,
      acted: false
    });
  });

  const hand: HandInternal = {
    id: nanoid(10),
    number: room.nextHandNumber,
    phase: mode.modifiers.bombPot ? 'flop' : 'preflop',
    variant: mode.variant,
    modifiers: mode.modifiers,
    buttonSeat,
    smallBlindSeat: mode.modifiers.bombPot ? null : smallBlindSeat,
    bigBlindSeat: mode.modifiers.bombPot ? null : bigBlindSeat,
    straddleSeat: mode.modifiers.bombPot ? null : straddleSeat,
    currentTurnSeat: null,
    turnStartedAt: null,
    currentBet: 0,
    minRaise: room.settings.bigBlind,
    fullRaiseBase: 0,
    board: [],
    pots: [],
    eligibleSeatNumbers: [...participants.keys()],
    actionNonce: 1,
    summary: '',
    winningSeats: [],
    revealedHands: [],
    deck,
    participants
  };

  room.hand = hand;
  room.lifecycle = 'playing';
  room.lastButtonSeat = buttonSeat;
  room.nextHandNumber += 1;
  room.queuedMode = null;
  audit(room, 'hand.started', `Hand ${hand.number} started: ${variantLabel(hand.variant)}${queued ? `, queued ${queued.label}` : ''}`, undefined, {
    buttonSeat,
    smallBlindSeat: hand.smallBlindSeat,
    bigBlindSeat: hand.bigBlindSeat,
    straddleSeat: hand.straddleSeat
  });
  if (!mode.modifiers.bombPot) {
    if (room.settings.ante > 0) {
      hand.participants.forEach((participant) => {
        const player = room.players.get(participant.playerId);
        if (!player || player.stack <= 0) return;
        const ante = Math.min(player.stack, room.settings.ante);
        player.stack -= ante;
        reconcileStackStatus(player);
        participant.committedThisHand += ante;
        if (player.stack === 0) participant.allIn = true;
        audit(room, 'blind.posted', `${player.name} posted ante ${ante}`, player.id, { seat: participant.seat, amount: ante, label: 'ante' });
      });
    }
    postBlind(room, hand, smallBlindSeat, room.settings.smallBlind, 'small blind');
    postBlind(room, hand, bigBlindSeat, room.settings.bigBlind, 'big blind');
    if (straddleSeat !== null) postBlind(room, hand, straddleSeat, Math.max(room.settings.straddle.amount, room.settings.bigBlind * 2), 'straddle');
  } else {
    // Bomb pot: seats/bets are already null/zero from the hand initializer; just
    // collect the ante from everyone and deal straight to the flop.
    hand.participants.forEach((participant) => {
      const player = room.players.get(participant.playerId);
      if (!player) return;
      const ante = Math.min(player.stack, Math.max(room.settings.bigBlind, room.settings.ante));
      player.stack -= ante;
      reconcileStackStatus(player);
      participant.committedThisHand += ante;
      if (player.stack === 0) participant.allIn = true;
    });
    dealStreet(hand, 'flop');
    audit(room, 'modifier.applied', `Bomb pot posted ${Math.max(room.settings.bigBlind, room.settings.ante)} from each player and skipped preflop betting.`);
  }

  assignTurn(hand, firstActionSeat(room, hand));
  updatePots(hand);
  if (hand.currentTurnSeat === null) maybeAutoAdvanceOrAward(room);
  return { ok: true };
}


export function startGame(room: RoomInternal, player: PlayerInternal): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const hostError = requireHost(room, player);
  if (hostError) return hostError;
  if (room.hand && room.hand.phase !== 'complete') return { ok: false, error: 'Finish the active hand before starting another.' };
  return buildHand(room);
}

/** Assign the acting seat and stamp the turn-clock start (null when no actor). */
function assignTurn(hand: HandInternal, seat: number | null): void {
  hand.currentTurnSeat = seat;
  hand.turnStartedAt = seat === null ? null : Date.now();
}

/**
 * Auto-act the seat currently on the clock (connected or not) — used by the
 * action-timer alarm. Checks if free, otherwise folds. Mirrors the
 * disconnect timeout but applies to whoever is to act when the clock expires.
 */
export function timeoutCurrentActor(room: RoomInternal): boolean {
  const hand = room.hand;
  if (!hand || hand.phase === 'complete' || hand.currentTurnSeat === null) return false;
  const seat = hand.currentTurnSeat;
  const player = [...room.players.values()].find((entry) => entry.seat === seat);
  if (!player) return false;
  const participant = hand.participants.get(seat);
  if (!participant || participant.folded || participant.allIn) return false;
  if (legalActionsFor(room, player).canCheck) {
    participant.acted = true;
    audit(room, 'timeout.check', `${player.name} timed out and checked`, player.id);
  } else {
    participant.folded = true;
    participant.acted = true;
    audit(room, 'timeout.fold', `${player.name} timed out and folded`, player.id);
  }
  hand.actionNonce += 1;
  updatePots(hand);
  maybeAutoAdvanceOrAward(room);
  return true;
}

function firstActionSeat(room: RoomInternal, hand: HandInternal): number | null {
  if (hand.phase === 'preflop') {
    return nextActiveSeat(room, hand, hand.straddleSeat ?? hand.bigBlindSeat);
  }
  return nextActiveSeat(room, hand, hand.buttonSeat);
}

function nextActiveSeat(room: RoomInternal, hand: HandInternal, after: number | null): number | null {
  const activeSeats = [...hand.participants.values()]
    .filter((participant) => !participant.folded && !participant.allIn)
    .map((participant) => participant.seat);
  if (activeSeats.length === 0) return null;
  const active = new Set(activeSeats);
  const start = after === null ? -1 : after;
  for (let offset = 1; offset <= room.seats.length; offset += 1) {
    const seat = (start + offset + room.seats.length) % room.seats.length;
    if (active.has(seat)) return seat;
  }
  return null;
}

function legalActionsFor(room: RoomInternal, player: PlayerInternal): LegalActions {
  const hand = room.hand;
  if (!hand || player.seat === null || hand.currentTurnSeat !== player.seat) return emptyLegalActions();
  const participant = hand.participants.get(player.seat);
  if (!participant || participant.folded || participant.allIn) return emptyLegalActions();
  const toCall = Math.max(0, hand.currentBet - participant.currentBet);
  const potSize = [...hand.participants.values()].reduce((sum, entry) => sum + entry.committedThisHand, 0);
  const maxBet = participant.currentBet + player.stack;
  const minRaiseTo = hand.fullRaiseBase + hand.minRaise;
  const ploMax = hand.variant === 'holdem' ? maxBet : participant.currentBet + Math.min(player.stack, potSize + toCall * 2);
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0 && player.stack > 0,
    callAmount: Math.min(toCall, player.stack),
    canBet: toCall === 0 && player.stack > 0,
    canRaise: !participant.acted && toCall > 0 && player.stack > toCall && minRaiseTo <= ploMax,
    minBet: Math.min(room.settings.bigBlind, player.stack),
    minRaiseTo,
    maxBet: Math.max(0, ploMax),
    allInAmount: hand.variant === 'holdem' || participant.currentBet + player.stack <= ploMax ? player.stack : 0,
    potSize
  };
}

export function act(
  room: RoomInternal,
  player: PlayerInternal,
  payload: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'; amount?: number; nonce: number }
): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  const hand = room.hand;
  if (!hand || room.lifecycle !== 'playing') return { ok: false, error: 'No active hand.' };
  if (player.seat === null || hand.currentTurnSeat !== player.seat) return { ok: false, error: 'It is not your turn.' };
  if (payload.nonce !== hand.actionNonce) {
    audit(room, 'command.rejected', `Rejected stale ${payload.action} from ${player.name}`, player.id, { expected: hand.actionNonce, got: payload.nonce });
    return { ok: false, error: 'That action is stale.' };
  }
  if (rateLimited(player.actionTimestamps, 8, 1500)) {
    audit(room, 'command.rejected', `Rate-limited action flood from ${player.name}`, player.id);
    return { ok: false, error: 'Slow down.' };
  }
  const participant = hand.participants.get(player.seat);
  if (!participant) return { ok: false, error: 'You are not in this hand.' };
  const legal = legalActionsFor(room, player);
  const toCall = legal.callAmount;

  if (payload.action === 'fold') {
    if (!legal.canFold) return { ok: false, error: 'Fold is not legal when checking is free.' };
    participant.folded = true;
    participant.acted = true;
    audit(room, 'action.fold', `${player.name} folded`, player.id);
  } else if (payload.action === 'check') {
    if (!legal.canCheck) return { ok: false, error: 'Check is not legal.' };
    participant.acted = true;
    audit(room, 'action.check', `${player.name} checked`, player.id);
  } else if (payload.action === 'call') {
    if (!legal.canCall) return { ok: false, error: 'Call is not legal.' };
    moveChips(player, participant, toCall);
    participant.acted = true;
    audit(room, 'action.call', `${player.name} called ${toCall}`, player.id, { amount: toCall });
  } else if (payload.action === 'bet' || payload.action === 'raise') {
    const rawAmount = clampInt(payload.amount, 1, Number.MAX_SAFE_INTEGER, 0);
    if (rawAmount > legal.maxBet) return { ok: false, error: 'Bet is larger than the legal maximum.' };
    const amount = payload.action === 'raise' ? rawAmount - participant.currentBet : rawAmount;
    const targetBet = participant.currentBet + amount;
    if (payload.action === 'bet' && !legal.canBet) return { ok: false, error: 'Bet is not legal.' };
    if (payload.action === 'raise' && !legal.canRaise) return { ok: false, error: 'Raise is not legal.' };
    if (payload.action === 'bet' && amount < legal.minBet && amount < player.stack) return { ok: false, error: `Minimum bet is ${legal.minBet}.` };
    if (payload.action === 'raise' && targetBet < legal.minRaiseTo && amount < player.stack) return { ok: false, error: `Minimum raise is to ${legal.minRaiseTo}.` };
    if (amount > player.stack) return { ok: false, error: 'Bet is larger than your stack.' };
    moveChips(player, participant, amount);
    applyWagerState(hand, participant, fullRaiseSize(hand, participant.currentBet), true);
    participant.acted = true;
    audit(room, payload.action === 'bet' ? 'action.bet' : 'action.raise', `${player.name} ${payload.action === 'bet' ? 'bet' : 'raised'} ${amount}`, player.id, {
      amount,
      currentBet: participant.currentBet
    });
  } else if (payload.action === 'all_in') {
    const amount = player.stack;
    if (amount <= 0) return { ok: false, error: 'No chips to move all-in.' };
    const allInTarget = participant.currentBet + amount;
    if (hand.variant !== 'holdem' && allInTarget > legal.maxBet && amount > legal.callAmount) {
      return { ok: false, error: 'Pot-limit maximum is lower than all-in.' };
    }
    moveChips(player, participant, amount);
    applyWagerState(hand, participant, fullRaiseSize(hand, participant.currentBet), true);
    participant.acted = true;
    audit(room, 'action.all_in', `${player.name} moved all-in for ${amount}`, player.id, { amount, currentBet: participant.currentBet });
  }

  hand.actionNonce += 1;
  updatePots(hand);
  maybeAutoAdvanceOrAward(room);
  return { ok: true };
}

function moveChips(player: PlayerInternal, participant: ParticipantInternal, amount: number): void {
  const paid = Math.min(player.stack, Math.max(0, amount));
  player.stack -= paid;
  reconcileStackStatus(player);
  participant.currentBet += paid;
  participant.committedThisHand += paid;
  if (player.stack === 0) participant.allIn = true;
}

function fullRaiseSize(hand: HandInternal, targetBet: number): number {
  return targetBet >= hand.fullRaiseBase + hand.minRaise ? targetBet - hand.fullRaiseBase : 0;
}

function applyWagerState(hand: HandInternal, participant: ParticipantInternal, fullRaise: number, resetActors: boolean): void {
  if (participant.currentBet <= hand.currentBet) return;
  hand.currentBet = participant.currentBet;
  if (fullRaise <= 0) return;
  hand.fullRaiseBase = participant.currentBet;
  hand.minRaise = fullRaise;
  if (resetActors) {
    hand.participants.forEach((entry) => {
      if (entry.seat !== participant.seat && !entry.folded && !entry.allIn) entry.acted = false;
    });
  }
}

function updatePots(hand: HandInternal): void {
  hand.pots = buildSidePots(
    [...hand.participants.values()].map((entry) => ({
      seat: entry.seat,
      amount: entry.committedThisHand,
      folded: entry.folded
    }))
  );
}

function maybeAutoAdvanceOrAward(room: RoomInternal): void {
  const hand = room.hand;
  if (!hand) return;
  const live = [...hand.participants.values()].filter((entry) => !entry.folded);
  if (live.length === 1) {
    awardWithoutShowdown(room, live[0]);
    return;
  }
  const active = live.filter((entry) => !entry.allIn);
  const bettingComplete =
    active.length === 0 ||
    active.every((entry) => entry.acted && entry.currentBet === hand.currentBet);
  if (!bettingComplete) {
    assignTurn(hand, nextActiveSeat(room, hand, hand.currentTurnSeat));
    resolveDisconnectedTurns(room);
    return;
  }

  if (hand.phase === 'river' || active.length === 0) {
    while (hand.board.length < 5) {
      const phase = nextPhase(hand.phase);
      hand.phase = phase;
      dealStreet(hand, phase);
    }
    showdown(room);
    return;
  }

  advanceStreet(room, hand);
}

function nextPhase(phase: HandPhase): HandPhase {
  if (phase === 'preflop') return 'flop';
  if (phase === 'flop') return 'turn';
  if (phase === 'turn') return 'river';
  return 'showdown';
}

function advanceStreet(room: RoomInternal, hand: HandInternal): void {
  const phase = nextPhase(hand.phase);
  hand.phase = phase;
  hand.currentBet = 0;
  hand.minRaise = room.settings.bigBlind;
  hand.fullRaiseBase = 0;
  hand.participants.forEach((entry) => {
    entry.currentBet = 0;
    entry.acted = entry.folded || entry.allIn;
  });
  dealStreet(hand, phase);
  assignTurn(hand, firstActionSeat(room, hand));
  resolveDisconnectedTurns(room);
  audit(room, `street.${phase}`, `${phase[0].toUpperCase()}${phase.slice(1)} dealt`, undefined, { board: hand.board });
}

function dealStreet(hand: HandInternal, phase: HandPhase): void {
  if (phase === 'flop' && hand.board.length === 0) {
    hand.board.push(...hand.deck.splice(0, 3));
  } else if (phase === 'turn' && hand.board.length === 3) {
    hand.board.push(hand.deck.shift() as Card);
  } else if (phase === 'river' && hand.board.length === 4) {
    hand.board.push(hand.deck.shift() as Card);
  }
}

function awardWithoutShowdown(room: RoomInternal, winner: ParticipantInternal): void {
  const hand = room.hand;
  const player = room.players.get(winner.playerId);
  if (!hand || !player) return;
  const total = [...hand.participants.values()].reduce((sum, entry) => sum + entry.committedThisHand, 0);
  player.stack += total;
  const awards = [`${player.name} won ${total} without showdown.`];
  // Skip the 7-2 bounty on uncontested wins when the host requires showdown.
  if (room.settings.sevenTwo.enabled && !room.settings.sevenTwo.requireShowdown) applySevenTwoBounty(room, [winner], awards);
  hand.phase = 'complete';
  assignTurn(hand, null);
  hand.winningSeats = [winner.seat];
  hand.summary = awards.join(' · ');
  reconcileHandParticipants(room, hand);
  audit(room, 'pot.awarded', hand.summary, player.id, { amount: total });
  audit(room, 'hand.ended', `Hand ${hand.number} ended`);
}

function showdown(room: RoomInternal): void {
  const hand = room.hand;
  if (!hand) return;
  hand.phase = 'showdown';
  updatePots(hand);
  const live = [...hand.participants.values()].filter((entry) => !entry.folded);
  const awards: string[] = [];
  const winningSeats = new Set<number>();

  hand.pots.forEach((pot) => {
    const contenders = live.filter((entry) => pot.eligibleSeatNumbers.includes(entry.seat));
    const boardWinners = winnerSeats(rankPlayers(hand.variant, contenders, hand.board));
    boardWinners.forEach((seat) => winningSeats.add(seat));
    awardPotShares(room, pot.amount, boardWinners, pot.label, awards);
  });

  if (room.settings.sevenTwo.enabled) {
    applySevenTwoBounty(room, live.filter((entry) => winningSeats.has(entry.seat)), awards);
  }

  if (hand.modifiers.showOne) {
    // Winner-shows-one: each winner reveals exactly their first hole card;
    // losers muck (not revealed). The audit records the shown card.
    live
      .filter((entry) => winningSeats.has(entry.seat))
      .forEach((entry) => {
        const player = room.players.get(entry.playerId);
        if (player) audit(room, 'show.one_card', `${player.name} showed ${cardLabel(entry.holeCards[0])}`, player.id);
      });
    hand.revealedHands = live
      .filter((entry) => winningSeats.has(entry.seat))
      .map((entry) => ({ seat: entry.seat, playerId: entry.playerId, cards: entry.holeCards.slice(0, 1), handName: '' }));
  } else {
    hand.revealedHands = live.map((entry) => ({
      seat: entry.seat,
      playerId: entry.playerId,
      cards: entry.holeCards,
      handName: rankHighHand(hand.variant, entry.holeCards, hand.board).name
    }));
  }
  hand.phase = 'complete';
  assignTurn(hand, null);
  hand.winningSeats = [...winningSeats];
  hand.summary = awards.join(' · ') || 'Hand ended with no award.';
  reconcileHandParticipants(room, hand);
  audit(room, 'showdown', hand.summary, undefined, { board: hand.board });
  audit(room, 'hand.ended', `Hand ${hand.number} ended`);
}

function awardPotShares(
  room: RoomInternal,
  amount: number,
  winnerSeatNumbers: number[],
  label: string,
  awards: string[]
): void {
  const payable = amount;
  if (winnerSeatNumbers.length === 0 || payable <= 0) return;
  const share = Math.floor(payable / winnerSeatNumbers.length);
  let odd = payable % winnerSeatNumbers.length;
  // Odd chips go to the winning seat(s) first to the left of the button (TDA
  // rule), not the lowest absolute seat index.
  const seatCount = room.seats.length;
  const button = room.hand?.buttonSeat ?? 0;
  const fromButton = (seat: number) => (seat - button - 1 + seatCount) % seatCount;
  winnerSeatNumbers
    .slice()
    .sort((a, b) => fromButton(a) - fromButton(b))
    .forEach((seat) => {
      const participant = room.hand?.participants.get(seat);
      const player = participant ? room.players.get(participant.playerId) : null;
      if (!player) return;
      const paid = share + (odd > 0 ? 1 : 0);
      odd -= 1;
      player.stack += paid;
      awards.push(`${player.name} won ${paid} from ${label}`);
      audit(room, 'pot.awarded', `${player.name} won ${paid} from ${label}`, player.id, { amount: paid, seat });
    });
}

function applySevenTwoBounty(room: RoomInternal, live: ParticipantInternal[], awards: string[]): void {
  const hand = room.hand;
  if (!hand) return;
  live.forEach((participant) => {
    const player = room.players.get(participant.playerId);
    if (!player) return;
    const { qualifies, suited } = isSevenTwo(participant.holeCards);
    if (!qualifies) return;
    const bounty = room.settings.sevenTwo.bounty + (suited ? room.settings.sevenTwo.suitedBonus : 0);
    let paidTotal = 0;
    hand.participants.forEach((payer) => {
      if (payer.playerId === player.id) return;
      const other = room.players.get(payer.playerId);
      if (!other) return;
      const paid = Math.min(other.stack, bounty);
      other.stack -= paid;
      player.stack += paid;
      paidTotal += paid;
    });
    if (paidTotal > 0) {
      const message = `${player.name} triggered 7-2 bounty for ${paidTotal}`;
      awards.push(message);
      // Reveal ONLY the qualifying 7 and 2 (the bounty proof) — never the full
      // holding, so a mucked fold-out win (and PLO's extra cards) stays private.
      const sevenCard = participant.holeCards.find((c) => c[0] === '7');
      const twoCard = participant.holeCards.find((c) => c[0] === '2');
      const proof = [sevenCard, twoCard].filter((c): c is Card => Boolean(c));
      audit(room, 'bounty.seven_two', message, player.id, {
        bounty,
        suited,
        cards: proof.map(cardLabel)
      });
    }
  });
}

const chipSupport = { activeHand: hasActiveHand, audit, requireHost, requirePlayer: requireActivePlayer };

export function requestChips(room: RoomInternal, player: PlayerInternal, amountInput: number, reasonInput = ''): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  return requestChipsWithSupport(chipSupport, room, player, amountInput, reasonInput);
}

export function approveChips(room: RoomInternal, host: PlayerInternal, targetId: string, amountInput: number, reasonInput = ''): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  return approveChipsWithSupport(chipSupport, room, host, targetId, amountInput, reasonInput);
}

const hostSupport = { activeHand: hasActiveHand, audit, requireHost };

export function queueMode(room: RoomInternal, player: PlayerInternal, mode: CustomModeName): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const queueError = requireQueueParticipant(player);
  if (queueError) return queueError;
  const error = validateMode(room.settings, mode);
  if (error) return { ok: false, error };
  if (room.queuedMode) return { ok: false, error: `${room.queuedMode.label} is already queued.` };
  if (room.settings.custom.permission === 'creator_only' && !player.isHost) return { ok: false, error: 'Only host can queue modes.' };
  if (room.settings.custom.permission === 'button' && room.hand?.buttonSeat !== player.seat) return { ok: false, error: 'Only the button can queue this hand.' };
  if (room.nextHandNumber - player.lastCustomHand < room.settings.custom.cooldownHands) return { ok: false, error: 'Custom mode cooldown is still active.' };
  room.queuedMode = buildQueuedMode(mode, player.id, player.name, room.nextHandNumber);
  player.lastCustomHand = room.nextHandNumber;
  audit(room, 'custom.queued', `${player.name} queued ${modeLabel(mode)} for hand ${room.nextHandNumber}`, player.id, { mode });
  return { ok: true };
}

export function hostAction(room: RoomInternal, host: PlayerInternal, payload: HostActionPayload): HostActionResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  return hostActionWithSupport(hostSupport, room, host, payload);
}

export function addChat(room: RoomInternal, player: PlayerInternal, input: string): SocketResult {
  const lifecycleError = requireMutableRoom(room);
  if (lifecycleError) return lifecycleError;
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  if (player.muted) return { ok: false, error: 'You are muted.' };
  if (rateLimited(player.chatTimestamps, 6, 6000)) {
    player.muted = true;
    audit(room, 'chat.rate_limited', `${player.name} was auto-muted for chat spam`, player.id);
    return { ok: false, error: 'Chat spam detected; you were muted.' };
  }
  const message = cleanChat(input);
  if (!message) return { ok: false, error: 'Message is empty.' };
  room.chat.push({ id: nanoid(8), at: Date.now(), playerId: player.id, playerName: player.name, message });
  audit(room, 'chat.message', `${player.name}: ${message}`, player.id);
  if (room.chat.length > 250) room.chat.splice(0, room.chat.length - 250);
  return { ok: true };
}

export function endSession(room: RoomInternal, host: PlayerInternal): SocketResult<{ exportText: string; exportJson: string }> {
  const hostError = requireHost(room, host);
  if (hostError) return hostError;
  if (room.endedExport) return { ok: true, ...room.endedExport };
  if (room.hand && room.hand.phase !== 'complete') return { ok: false, error: 'Finish the current hand before ending the session.' };
  room.lifecycle = 'ended';
  finalizeStacks(room);
  audit(room, 'session.ended', `${host.name} ended the session and generated export`, host.id);
  // The JSON export carries the FULL audit + chat (publicState slices them for
  // the wire), so the saved file can reconstruct the entire session.
  const exportJson = JSON.stringify({ ...publicState(room), audit: room.audit, chat: room.chat }, null, 2);
  const { exportText } = buildSessionExport(room, exportJson);
  room.endedExport = { exportText, exportJson };
  return { ok: true, exportText, exportJson };
}
