import { describe, expect, it } from 'vitest';
import { act, approveChips, createRoom, endSession, getRoom, hostAction, joinRoom, playerInRoom, queueMode, requestChips, sit, snapshot, startGame, updateSettings } from '../src/server/room';

function setupThreePlayers() {
  const created = createRoom('Host', 'Test Room');
  if (!created.ok) throw new Error(created.error);
  const room = getRoom(created.code)!;
  const host = playerInRoom(room, created.playerId)!;
  sit(room, host, 0);
  const joined = ['Ari', 'Bo'].map((name, index) => {
    const result = joinRoom(created.code, name);
    if (!result.ok) throw new Error(result.error);
    const player = playerInRoom(room, result.playerId)!;
    sit(room, player, index + 1);
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
    const publicCards = snapshot(room, host.id).publicState.players.map((player) => JSON.stringify(player));
    expect(hostPrivate.holeCards).toHaveLength(2);
    expect(otherPrivate.holeCards).toHaveLength(2);
    expect(hostPrivate.holeCards).not.toEqual(otherPrivate.holeCards);
    expect(publicCards.join(' ')).not.toContain(hostPrivate.holeCards[0]);
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

  it('queues an MVP custom mode and audit logs chip requests', () => {
    const { room, host } = setupThreePlayers();
    const queued = queueMode(room, host, 'omaha4');
    expect(queued.ok).toBe(true);
    expect(room.queuedMode?.label).toContain('PLO');
    const chips = requestChips(room, host, 500, 'rebuy');
    expect(chips.ok).toBe(true);
    expect(room.audit.some((entry) => entry.type.startsWith('chips.'))).toBe(true);
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

  it('rejects starting a new hand while another hand is active', () => {
    const { room, host } = setupThreePlayers();
    expect(startGame(room, host).ok).toBe(true);
    const secondStart = startGame(room, host);
    expect(secondStart.ok).toBe(false);
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
});
