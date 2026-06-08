import type { PlayerInternal, RoomInternal } from './room';

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

export function requireQueueParticipant(player: PlayerInternal): AccessError | null {
  const accessError = requireActivePlayer(player);
  if (accessError) return accessError;
  if (player.spectator || player.seat === null || player.socketIds.size === 0 || player.status !== 'seated' || player.stack <= 0 || player.forcedSitOut) {
    return { ok: false, error: 'Only connected seated players with chips can queue a custom hand.' };
  }
  return null;
}

export function rateLimited(timestamps: number[], limit: number, windowMs: number): boolean {
  const now = Date.now();
  timestamps.push(now);
  while (timestamps.length && timestamps[0] < now - windowMs) timestamps.shift();
  return timestamps.length > limit;
}
