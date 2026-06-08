import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { act, addChat, approveChips, attachSocket, createRoom, detachSocket, endSession, getRoom, hostAction, joinRoom, playerInRoom, queueMode, requestChips, setReady, sit, snapshot, startGame, updateSettings } from '../src/server/room';

function setupThreePlayers() {
  const created = createRoom('Host', 'Test Room');
  if (!created.ok) throw new Error(created.error);
  const room = getRoom(created.code)!;
  const host = playerInRoom(room, created.playerId)!;
  host.socketIds.add('host-socket');
  sit(room, host, 0);
  const joined = ['Ari', 'Bo'].map((name, index) => {
    const result = joinRoom(created.code, name);
    if (!result.ok) throw new Error(result.error);
    const player = playerInRoom(room, result.playerId)!;
    player.socketIds.add(`${name}-socket`);
    sit(room, player, index + 1);
    setReady(room, player, true);
    return player;
  });
  return { room, host, players: [host, ...joined] };
}

describe('room command model', () => {
  it('deals private cards only to the matching session snapshot', () => {
    const { room, host, players } = setupThreePlayers();
    const started = startGame(room, host);
    expect(started.ok).toBe(true);
    const hostPrivate = snapshot(room, host.id).privateState!;
    const otherPrivate = snapshot(room, players[1].id).privateState!;
    const publicHand = snapshot(room, host.id).publicState.hand!;
    expect(hostPrivate.holeCards).toHaveLength(2);
    expect(otherPrivate.holeCards).toHaveLength(2);
    expect(hostPrivate.holeCards).not.toEqual(otherPrivate.holeCards);
    expect([...publicHand.board, ...publicHand.board2]).not.toContain(hostPrivate.holeCards[0]);
  });

  it('does not expose server-only deck fields in active public hand snapshots', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const publicJson = JSON.stringify(snapshot(room, host.id).publicState.hand);
    expect(publicJson).not.toContain('deck');
    expect(publicJson).not.toContain('initialDeck');
    expect(publicJson).not.toContain('shuffleSeed');
    expect(publicJson).not.toContain('participants');
    snapshot(room, host.id).privateState?.holeCards.forEach((card) => {
      expect(snapshot(room, host.id).publicState.hand?.board).not.toContain(card);
      expect(snapshot(room, host.id).publicState.hand?.board2).not.toContain(card);
    });
  });

  it('rejects stale duplicate actions by nonce', () => {
    const { room, host } = setupThreePlayers();
    startGame(room, host);
    const hand = room.hand!;
    const actingPlayer = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    const legal = snapshot(room, actingPlayer.id).privateState!.legalActions;
    const result = act(room, actingPlayer, { action: legal.canCall ? 'call' : 'check', nonce: hand.actionNonce });
    expect(result.ok).toBe(true);
    const stale = act(room, actingPlayer, { action: legal.canCall ? 'call' : 'check', nonce: hand.actionNonce - 1 });
    expect(stale.ok).toBe(false);
  });

  it('updates min raise after a full all-in raise', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const actor = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    const previousBet = hand.currentBet;
    const previousMinRaise = hand.minRaise;
    actor.stack = previousMinRaise * 3;
    expect(act(room, actor, { action: 'all_in', nonce: hand.actionNonce }).ok).toBe(true);
    const raiseSize = room.hand!.currentBet - previousBet;
    expect(raiseSize).toBeGreaterThanOrEqual(previousMinRaise);
    expect(room.hand!.minRaise).toBe(raiseSize);
  });

  it('does not reopen raises after a short all-in under-raise', () => {
    const { room, host, players } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const caller = hand.participants.get(players[0].seat!)!;
    const shortAllIn = hand.participants.get(players[1].seat!)!;
    const blindCaller = hand.participants.get(players[2].seat!)!;
    caller.currentBet = 10;
    caller.committedThisHand = 10;
    caller.acted = true;
    shortAllIn.currentBet = 13;
    shortAllIn.committedThisHand = 13;
    shortAllIn.allIn = true;
    shortAllIn.acted = true;
    blindCaller.currentBet = 13;
    blindCaller.committedThisHand = 13;
    blindCaller.acted = true;
    hand.currentBet = 13;
    hand.minRaise = 10;
    hand.currentTurnSeat = caller.seat;
    const legal = snapshot(room, players[0].id).privateState!.legalActions;
    expect(legal.canCall).toBe(true);
    expect(legal.canRaise).toBe(false);
  });

  it('times out and advances when the current actor disconnects mid-hand', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const actor = [...room.players.values()].find((player) => player.seat === room.hand!.currentTurnSeat)!;
    const socketId = [...actor.socketIds][0];
    detachSocket(socketId);
    expect(room.audit.some((entry) => entry.type === 'timeout.fold' || entry.type === 'timeout.check')).toBe(true);
    expect(room.hand?.currentTurnSeat).not.toBe(actor.seat);
  });

  it('does not advance the turn when a non-current player disconnects mid-hand', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const currentTurn = room.hand!.currentTurnSeat;
    const nonCurrent = [...room.players.values()].find((player) => player.seat !== null && player.seat !== currentTurn)!;
    const socketId = [...nonCurrent.socketIds][0];
    detachSocket(socketId);
    expect(room.hand?.currentTurnSeat).toBe(currentTurn);
  });

  it('times out a disconnected player when turn rotation reaches them', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const firstActor = [...room.players.values()].find((player) => player.seat === room.hand!.currentTurnSeat)!;
    const occupiedSeats = [...room.hand!.participants.keys()].sort((a, b) => a - b);
    const nextSeat = occupiedSeats.find((seat) => seat > firstActor.seat!) ?? occupiedSeats[0];
    const nextActor = [...room.players.values()].find((player) => player.seat === nextSeat)!;
    const nextSocket = [...nextActor.socketIds][0];
    detachSocket(nextSocket);
    expect(room.hand?.currentTurnSeat).toBe(firstActor.seat);
    const legal = snapshot(room, firstActor.id).privateState!.legalActions;
    expect(act(room, firstActor, { action: legal.canCall ? 'call' : 'check', nonce: room.hand!.actionNonce }).ok).toBe(true);
    expect(room.audit.some((entry) => entry.actor === nextActor.id && (entry.type === 'timeout.fold' || entry.type === 'timeout.check'))).toBe(true);
    expect(room.hand?.currentTurnSeat).not.toBe(nextActor.seat);
  });

  it('queues an MVP custom mode and audit logs chip requests', () => {
    const { room, host } = setupThreePlayers();
    const queued = queueMode(room, host, 'omaha4');
    expect(queued.ok).toBe(true);
    expect(room.queuedMode?.label).toContain('PLO');
    const chips = requestChips(room, host, 500, 'rebuy');
    expect(chips.ok).toBe(true);
    expect(room.audit.some((entry) => entry.type.startsWith('chips.'))).toBe(true);
  });

  it('starts bomb pots without blind residue or preflop calls', () => {
    const { room, host } = setupThreePlayers();
    expect(queueMode(room, host, 'bomb_pot').ok).toBe(true);
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    expect(hand.phase).toBe('flop');
    expect(hand.smallBlindSeat).toBeNull();
    expect(hand.bigBlindSeat).toBeNull();
    expect(hand.straddleSeat).toBeNull();
    expect(hand.currentBet).toBe(0);
    expect([...hand.participants.values()].every((participant) => participant.currentBet === 0)).toBe(true);
    const actor = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    expect(snapshot(room, actor.id).privateState?.legalActions.canCheck).toBe(true);
  });

  it('reveals the committed shuffle preimage after hand completion', () => {
    const { room, host, players } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const commitment = hand.shuffleCommitment;
    const actor = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    expect(act(room, actor, { action: 'fold', nonce: hand.actionNonce }).ok).toBe(true);
    const nextActor = [...room.players.values()].find((player) => player.seat === room.hand?.currentTurnSeat)!;
    expect(act(room, nextActor, { action: 'fold', nonce: room.hand!.actionNonce }).ok).toBe(true);
    expect(room.hand?.phase).toBe('complete');
    const reveal = room.hand!.shuffleReveal!;
    expect(createHash('sha256').update(reveal).digest('hex')).toBe(commitment);
    expect(reveal.split(':')[1].split(',')).toHaveLength(52);
    expect(players.length).toBeGreaterThan(0);
  });

  it('rejects PLO raises above the pot-limit maximum', () => {
    const { room, host } = setupThreePlayers();
    expect(queueMode(room, host, 'omaha4').ok).toBe(true);
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const actor = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    const legal = snapshot(room, actor.id).privateState!.legalActions;
    expect(legal.maxBet).toBeLessThan(actor.stack);
    const result = act(room, actor, { action: 'raise', amount: actor.stack, nonce: hand.actionNonce });
    expect(result.ok).toBe(false);
  });

  it('starts preflop action left of the straddle without skipping the first caller', () => {
    const { room, host } = setupThreePlayers();
    const started = startGame(room, host);
    expect(started.ok).toBe(true);
    const hand = room.hand!;
    expect(hand.straddleSeat).not.toBeNull();
    const expectedFirst = (hand.straddleSeat! + 1) % room.seats.length;
    expect(hand.currentTurnSeat).toBe(expectedFirst);
    const firstPlayer = [...room.players.values()].find((player) => player.seat === expectedFirst)!;
    expect(snapshot(room, firstPlayer.id).privateState?.legalActions.canCall).toBe(true);
  });

  it('treats raise amounts as target totals, not extra chips', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const actor = [...room.players.values()].find((player) => player.seat === hand.currentTurnSeat)!;
    const participant = hand.participants.get(actor.seat!)!;
    const legal = snapshot(room, actor.id).privateState!.legalActions;
    expect(participant.currentBet).toBeGreaterThan(0);
    expect(legal.minRaiseTo).toBe(hand.currentBet + hand.minRaise);
    expect(act(room, actor, { action: 'raise', amount: legal.minRaiseTo, nonce: hand.actionNonce }).ok).toBe(true);
    expect(participant.currentBet).toBe(legal.minRaiseTo);
  });

  it('rejects starting a new hand while another hand is active', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const secondStart = startGame(room, host);
    expect(secondStart.ok).toBe(false);
  });

  it('does not deal disconnected seated players into a new hand', () => {
    const created = createRoom('Host', 'Heads Up');
    if (!created.ok) throw new Error(created.error);
    const room = getRoom(created.code)!;
    const host = playerInRoom(room, created.playerId)!;
    host.socketIds.add('host-socket');
    sit(room, host, 0);
    const joined = joinRoom(room.code, 'Ari');
    if (!joined.ok) throw new Error(joined.error);
    const ari = playerInRoom(room, joined.playerId)!;
    ari.socketIds.add('ari-socket');
    sit(room, ari, 1);
    ari.socketIds.clear();
    ari.status = 'disconnected';
    const started = startGame(room, host);
    expect(started.ok).toBe(false);
    expect(room.hand).toBeNull();
  });

  it('requires ready connected seated players before starting a hand', () => {
    const { room, host, players } = setupThreePlayers();
    expect(setReady(room, players[1], false).ok).toBe(true);
    const spectatorJoin = joinRoom(room.code, 'Ready Rail', undefined, true);
    expect(spectatorJoin.ok).toBe(true);
    if (!spectatorJoin.ok) throw new Error('spectator join failed');
    const spectator = playerInRoom(room, spectatorJoin.playerId)!;
    spectator.socketIds.add('ready-rail');
    expect(setReady(room, spectator, true).ok).toBe(false);
    const started = startGame(room, host);
    expect(started.ok).toBe(true);
    expect(room.hand?.participants.has(players[1].seat!)).toBe(false);
  });

  it('rejects destructive host moderation while a hand is active', () => {
    const { room, host, players } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const kicked = hostAction(room, host, { action: 'kick', playerId: players[1].id });
    expect(kicked.ok).toBe(false);
    expect(room.hand?.participants.has(players[1].seat!)).toBe(true);
  });

  it('clamps nested settings patches and finalized ledger math', () => {
    const { room, host } = setupThreePlayers();
    const settings = updateSettings(room, host, {
      straddle: { amount: -500 },
      custom: { cooldownHands: -9, allowedModes: ['omaha4'] },
      sevenTwo: { bounty: -20, suitedBonus: -10 }
    });
    expect(settings.ok).toBe(true);
    expect(room.settings.straddle.amount).toBe(0);
    expect(room.settings.custom.cooldownHands).toBe(0);
    expect(room.settings.sevenTwo.bounty).toBe(0);
    const ended = endSession(room, host);
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.exportText).toContain('Host: buy-ins 1000, stack 1000, cash-out 1000, up/down 0');
  });

  it('makes ended sessions read-only and keeps the export idempotent', () => {
    const { room, host, players } = setupThreePlayers();
    host.socketIds.clear();
    host.socketIds.add(`ended-${room.code}`);
    const ended = endSession(room, host);
    expect(ended.ok).toBe(true);
    if (!ended.ok) throw new Error('end session failed');
    const exportJson = ended.exportJson;
    const stack = players[1].stack;
    const auditCount = room.audit.length;
    expect(joinRoom(room.code, 'Late')).toEqual({ ok: false, error: 'Session already ended.' });
    expect(updateSettings(room, host, { bigBlind: 40 }).ok).toBe(false);
    expect(sit(room, players[1], 4).ok).toBe(false);
    expect(setReady(room, players[1], false).ok).toBe(false);
    expect(requestChips(room, players[1], 200, 'late rebuy').ok).toBe(false);
    expect(approveChips(room, host, players[1].id, 200, 'late edit').ok).toBe(false);
    expect(queueMode(room, players[1], 'omaha4').ok).toBe(false);
    expect(hostAction(room, host, { action: 'lock', value: true }).ok).toBe(false);
    expect(addChat(room, players[1], 'after end').ok).toBe(false);
    expect(players[1].stack).toBe(stack);
    expect(room.audit).toHaveLength(auditCount);
    const hostStatus = host.status;
    const hostSocket = [...host.socketIds][0];
    const publicBeforeSocketChange = JSON.stringify(snapshot(room, host.id).publicState);
    attachSocket(room, host.id, 'ended-reattach');
    expect([...host.socketIds]).toEqual([hostSocket]);
    expect(detachSocket(hostSocket)).toEqual([]);
    expect([...host.socketIds]).toEqual([hostSocket]);
    expect(host.status).toBe(hostStatus);
    expect(room.emptySince).toBeNull();
    expect(room.audit).toHaveLength(auditCount);
    expect(JSON.stringify(snapshot(room, host.id).publicState)).toBe(publicBeforeSocketChange);
    const again = endSession(room, host);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.exportJson).toBe(exportJson);
  });

  it('requires a valid session token to join a locked room', () => {
    const { room, host } = setupThreePlayers();
    const locked = hostAction(room, host, { action: 'lock', value: true });
    expect(locked.ok).toBe(true);
    const joined = joinRoom(room.code, 'Intruder', 'fake-token');
    expect(joined.ok).toBe(false);
  });

  it('rejects active-hand seat changes and strict host chip edits', () => {
    const { room, host, players } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    expect(sit(room, players[1], 4).ok).toBe(false);
    const edit = requestChips(room, players[1], 200, 'mid-hand top-up');
    expect(edit.ok).toBe(true);
    expect(players[1].stack).toBeLessThanOrEqual(1000);
    const approved = approveChips(room, host, players[1].id, 200, 'host mid-hand edit');
    expect(approved.ok).toBe(true);
    expect(players[1].stack).toBeLessThanOrEqual(1000);
  });

  it('prevents banned players from issuing room commands and cashes out unseated players', () => {
    const { room, host, players } = setupThreePlayers();
    const banned = hostAction(room, host, { action: 'ban', playerId: players[1].id });
    expect(banned.ok).toBe(true);
    expect(sit(room, players[1], 4).ok).toBe(false);
    const ended = endSession(room, host);
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.exportText).toContain(`${players[1].name}: buy-ins 1000, stack 1000, cash-out 1000, up/down 0`);
  });

  it('invalidates kicked players and protects host ownership', () => {
    const { room, host, players } = setupThreePlayers();
    expect(hostAction(room, host, { action: 'kick', playerId: players[1].id }).ok).toBe(true);
    expect(sit(room, players[1], 4).ok).toBe(false);
    expect(hostAction(room, host, { action: 'ban', playerId: host.id }).ok).toBe(false);
    const spectatorJoin = joinRoom(room.code, 'Watcher', undefined, true);
    expect(spectatorJoin.ok).toBe(true);
    if (spectatorJoin.ok) {
      const spectator = playerInRoom(room, spectatorJoin.playerId)!;
      expect(hostAction(room, host, { action: 'transferHost', playerId: spectator.id }).ok).toBe(false);
      expect(approveChips(room, host, spectator.id, 100, 'spectator edit').ok).toBe(false);
    }
    players[2].socketIds.clear();
    players[2].status = 'disconnected';
    expect(hostAction(room, host, { action: 'transferHost', playerId: players[2].id }).ok).toBe(false);
  });

  it('marks zero-stack chip edit targets busted and blocks host transfer to them', () => {
    const { room, host, players } = setupThreePlayers();
    expect(approveChips(room, host, players[1].id, -1000, 'felted').ok).toBe(true);
    expect(players[1].stack).toBe(0);
    expect(players[1].status).toBe('busted');
    expect(hostAction(room, host, { action: 'transferHost', playerId: players[1].id }).ok).toBe(false);
  });

  it('requires the acting host to be an active table player before transfer', () => {
    const created = createRoom('Host', 'Transfer Actor');
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('create failed');
    const room = getRoom(created.code)!;
    const host = playerInRoom(room, created.playerId)!;
    host.socketIds.add('transfer-host');
    const joined = joinRoom(room.code, 'Ari');
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error('join failed');
    const ari = playerInRoom(room, joined.playerId)!;
    ari.socketIds.add('transfer-ari');
    expect(sit(room, ari, 1).ok).toBe(true);
    expect(setReady(room, ari, true).ok).toBe(true);
    expect(hostAction(room, host, { action: 'transferHost', playerId: ari.id }).ok).toBe(false);
    expect(sit(room, host, 0).ok).toBe(true);
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: host.id }).ok).toBe(true);
    expect(hostAction(room, host, { action: 'transferHost', playerId: ari.id }).ok).toBe(false);
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: host.id, value: false }).ok).toBe(true);
    expect(approveChips(room, host, host.id, -1000, 'felted host').ok).toBe(true);
    expect(hostAction(room, host, { action: 'transferHost', playerId: ari.id }).ok).toBe(false);
    expect(approveChips(room, host, host.id, 1000, 'restore host').ok).toBe(true);
    host.socketIds.clear();
    host.status = 'disconnected';
    expect(hostAction(room, host, { action: 'transferHost', playerId: ari.id }).ok).toBe(false);
  });

  it('rejects custom queues from spectators and forced sit-out players', () => {
    const { room, host, players } = setupThreePlayers();
    const spectatorJoin = joinRoom(room.code, 'Rail', undefined, true);
    expect(spectatorJoin.ok).toBe(true);
    if (!spectatorJoin.ok) throw new Error('spectator join failed');
    const spectator = playerInRoom(room, spectatorJoin.playerId)!;
    spectator.socketIds.add('rail-socket');
    expect(queueMode(room, spectator, 'omaha4').ok).toBe(false);
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: players[1].id }).ok).toBe(true);
    expect(queueMode(room, players[1], 'omaha4').ok).toBe(false);
    expect(room.queuedMode).toBeNull();
  });

  it('requires even creator-only custom queues to come from an active table player', () => {
    const created = createRoom('Host', 'Creator Queue');
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('create failed');
    const room = getRoom(created.code)!;
    const host = playerInRoom(room, created.playerId)!;
    host.socketIds.add('creator-queue-host');
    expect(updateSettings(room, host, { custom: { permission: 'creator_only', cooldownHands: 0 } }).ok).toBe(true);
    expect(queueMode(room, host, 'omaha4').ok).toBe(false);
    expect(sit(room, host, 0).ok).toBe(true);
    const joined = joinRoom(room.code, 'Ari');
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error('join failed');
    const ari = playerInRoom(room, joined.playerId)!;
    ari.socketIds.add('creator-queue-ari');
    expect(sit(room, ari, 1).ok).toBe(true);
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: host.id }).ok).toBe(true);
    expect(queueMode(room, host, 'omaha4').ok).toBe(false);
    expect(room.queuedMode).toBeNull();
  });

  it('preserves forced sit-out across sit attempts and reconnects until host restores it', () => {
    const { room, host, players } = setupThreePlayers();
    const target = players[1];
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: target.id }).ok).toBe(true);
    expect(snapshot(room, host.id).publicState.players.find((player) => player.id === target.id)?.forcedSitOut).toBe(true);
    expect(sit(room, target, 4).ok).toBe(false);
    const socket = [...target.socketIds][0];
    detachSocket(socket);
    expect(target.status).toBe('sitting_out');
    const rejoin = joinRoom(room.code, target.name, target.sessionToken);
    expect(rejoin.ok).toBe(true);
    expect(target.status).toBe('sitting_out');
    expect(sit(room, target, 4).ok).toBe(false);
    expect(hostAction(room, host, { action: 'forceSitOut', playerId: target.id, value: false }).ok).toBe(true);
    expect(snapshot(room, host.id).publicState.players.find((player) => player.id === target.id)?.forcedSitOut).toBe(false);
    expect(sit(room, target, 4).ok).toBe(true);
  });

  it('generates high-entropy room codes for invite-bearing rooms', () => {
    const created = createRoom('Host', 'Code Check');
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('charges 7-2 bounty only to players dealt into the hand', () => {
    const { room, host, players } = setupThreePlayers();
    const observerJoin = joinRoom(room.code, 'Observer');
    expect(observerJoin.ok).toBe(true);
    if (!observerJoin.ok) throw new Error('observer join failed');
    const observer = playerInRoom(room, observerJoin.playerId)!;
    observer.stack = 777;
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const participants = [...hand.participants.values()];
    participants[0].holeCards = ['7s', '2s'];
    participants[1].holeCards = ['As', '3c'];
    participants[2].holeCards = ['Qd', '4c'];
    participants.forEach((participant) => {
      participant.folded = false;
      participant.currentBet = 0;
      participant.committedThisHand = 10;
      participant.acted = participant.seat !== participants[0].seat;
    });
    hand.board = ['7h', '2h', '7d', '2d', 'Ks'];
    hand.phase = 'river';
    hand.currentTurnSeat = participants[0].seat;
    hand.currentBet = 0;
    host.stack = 1000;
    players[1].stack = 1000;
    players[2].stack = 1000;
    observer.stack = 777;
    const actor = [...room.players.values()].find((player) => player.seat === participants[0].seat)!;
    expect(act(room, actor, { action: 'check', nonce: hand.actionNonce }).ok).toBe(true);
    expect(observer.stack).toBe(777);
  });

  it('applies 7-2 bounty when the hand is won without showdown', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const hand = room.hand!;
    const [winner, folder, alreadyFolded] = [...hand.participants.values()];
    winner.holeCards = ['7s', '2d'];
    folder.folded = false;
    folder.currentBet = 0;
    alreadyFolded.folded = true;
    hand.currentBet = 10;
    hand.currentTurnSeat = folder.seat;
    const folderPlayer = playerInRoom(room, folder.playerId)!;
    expect(act(room, folderPlayer, { action: 'fold', nonce: hand.actionNonce }).ok).toBe(true);
    expect(room.hand?.phase).toBe('complete');
    expect(room.audit.some((entry) => entry.type === 'bounty.seven_two' && entry.actor === winner.playerId)).toBe(true);
  });
});
