import type { SocketResult } from '../shared/types';
import type { PlayerInternal, RoomInternal } from './room';

export type HostActionPayload = {
  action: 'kick' | 'ban' | 'mute' | 'forceSitOut' | 'transferHost' | 'lock' | 'spectators';
  playerId?: string;
  value?: boolean;
};

interface HostSupport {
  activeHand: (room: RoomInternal) => boolean;
  audit: (room: RoomInternal, type: string, message: string, actor?: string, data?: Record<string, unknown>) => void;
  requireHost: (room: RoomInternal, player: PlayerInternal) => { ok: false; error: string } | null;
}

export function hostActionWithSupport(support: HostSupport, room: RoomInternal, host: PlayerInternal, payload: HostActionPayload): SocketResult {
  const hostError = support.requireHost(room, host);
  if (hostError) return hostError;
  if (payload.action === 'lock') {
    room.settings.locked = Boolean(payload.value);
    support.audit(room, 'host.lock', `${host.name} ${room.settings.locked ? 'locked' : 'unlocked'} the room`, host.id);
    return { ok: true };
  }
  if (payload.action === 'spectators') {
    room.settings.spectatorsAllowed = Boolean(payload.value);
    support.audit(room, 'host.spectators', `${host.name} turned spectators ${room.settings.spectatorsAllowed ? 'on' : 'off'}`, host.id);
    return { ok: true };
  }
  const target = payload.playerId ? room.players.get(payload.playerId) : null;
  if (!target) return { ok: false, error: 'Player not found.' };
  if ((payload.action === 'kick' || payload.action === 'ban') && target.id === host.id) return { ok: false, error: 'Host cannot kick or ban themselves.' };
  if ((payload.action === 'kick' || payload.action === 'ban' || payload.action === 'forceSitOut' || payload.action === 'transferHost') && support.activeHand(room)) {
    support.audit(room, 'host.action_rejected', `Rejected ${payload.action} during active hand`, host.id, { targetId: target.id });
    return { ok: false, error: 'Finish the active hand before changing seats, sit-out state, or host ownership.' };
  }
  if (payload.action === 'transferHost') {
    if (target.banned || target.spectator || target.seat === null) return { ok: false, error: 'Host can only transfer to a seated active player.' };
    host.isHost = false;
    target.isHost = true;
    room.hostId = target.id;
    support.audit(room, 'host.transferred', `${host.name} transferred host to ${target.name}`, host.id, { targetId: target.id });
    return { ok: true };
  }
  if (payload.action === 'mute') {
    target.muted = Boolean(payload.value);
    support.audit(room, 'host.mute', `${target.name} was ${target.muted ? 'muted' : 'unmuted'}`, host.id, { targetId: target.id });
    return { ok: true };
  }
  if (payload.action === 'forceSitOut') {
    target.status = 'sitting_out';
    support.audit(room, 'host.force_sit_out', `${target.name} was forced to sit out`, host.id, { targetId: target.id });
    return { ok: true };
  }
  if (payload.action === 'kick' || payload.action === 'ban') {
    if (target.seat !== null) room.seats[target.seat] = null;
    target.seat = null;
    target.status = 'sitting_out';
    target.banned = true;
    room.bannedTokens.add(target.sessionToken);
    target.socketIds.clear();
    support.audit(room, payload.action === 'ban' ? 'host.ban' : 'host.kick', `${target.name} was ${payload.action === 'ban' ? 'banned' : 'kicked'}`, host.id, {
      targetId: target.id
    });
    return { ok: true };
  }
  return { ok: false, error: 'Unknown host action.' };
}
