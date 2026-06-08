import type { HandInternal, PlayerInternal, RoomInternal } from './room';

type AccessError = { ok: false; error: string };

export function hasActiveHand(room: RoomInternal): boolean {
  return Boolean(room.hand && room.hand.phase !== 'complete');
}

export function requireMutableRoom(room: RoomInternal): AccessError | null {
  if (room.lifecycle === 'ended') return { ok: false, error: 'Session already ended.' };
  return null;
}

export function requireActivePlayer(player: PlayerInternal): AccessError | null {
  if (player.banned) return { ok: false, error: 'This player is banned from the room.' };
  return null;
}

export function requireHost(room: RoomInternal, player: PlayerInternal): AccessError | null {
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  if (room.hostId !== player.id || !player.isHost) return { ok: false, error: 'Only the host can do that.' };
  return null;
}

export function isConnectedSeatedPlayerWithChips(player: PlayerInternal): boolean {
  return !player.banned && !player.spectator && player.seat !== null && player.socketIds.size > 0 && player.status === 'seated' && player.stack > 0 && !player.forcedSitOut;
}

export function eligiblePlayers(room: RoomInternal): PlayerInternal[] {
  return room.seats
    .map((id) => (id ? room.players.get(id) : null))
    .filter((player): player is PlayerInternal => Boolean(player && isConnectedSeatedPlayerWithChips(player)));
}

export function requireConnectedSeatedPlayerWithChips(player: PlayerInternal, error: string): AccessError | null {
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  if (!isConnectedSeatedPlayerWithChips(player)) return { ok: false, error };
  return null;
}

export function requireQueueParticipant(player: PlayerInternal): AccessError | null {
  return requireConnectedSeatedPlayerWithChips(player, 'Only connected seated players with chips can queue a custom hand.');
}

export function requireHostTransferTarget(player: PlayerInternal): AccessError | null {
  return requireConnectedSeatedPlayerWithChips(player, 'Host can only transfer to a connected seated player with chips.');
}

export function reconcileStackStatus(player: PlayerInternal): void {
  if (player.spectator) return;
  if (player.stack <= 0) {
    player.stack = 0;
    player.ready = false;
    player.status = 'busted';
  } else if (player.status === 'busted' && !player.forcedSitOut) {
    player.status = player.seat === null ? 'sitting_out' : 'seated';
  }
}

export function reconcileHandParticipants(room: RoomInternal, hand: HandInternal): void {
  hand.participants.forEach((participant) => {
    const player = room.players.get(participant.playerId);
    if (player) reconcileStackStatus(player);
  });
}

export function rateLimited(timestamps: number[], limit: number, windowMs: number): boolean {
  const now = Date.now();
  timestamps.push(now);
  while (timestamps.length && timestamps[0] < now - windowMs) timestamps.shift();
  return timestamps.length > limit;
}
