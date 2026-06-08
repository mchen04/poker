import { describe, expect, it } from 'vitest';
import { act, createRoom, getRoom, joinRoom, playerInRoom, queueMode, requestChips, sit, snapshot, startGame } from '../src/server/room';

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
});
