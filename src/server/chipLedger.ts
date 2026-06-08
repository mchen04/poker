import { cleanChat, clampInt } from '../shared/sanitize';
import type { SocketResult } from '../shared/types';
import type { PlayerInternal, RoomInternal } from './room';

interface ChipSupport {
  activeHand: (room: RoomInternal) => boolean;
  audit: (room: RoomInternal, type: string, message: string, actor?: string, data?: Record<string, unknown>) => void;
  requireHost: (room: RoomInternal, player: PlayerInternal) => { ok: false; error: string } | null;
  requirePlayer: (player: PlayerInternal) => { ok: false; error: string } | null;
}

export function requestChipsWithSupport(
  support: ChipSupport,
  room: RoomInternal,
  player: PlayerInternal,
  amountInput: number,
  reasonInput = ''
): SocketResult {
  const accessError = support.requirePlayer(player);
  if (accessError) return accessError;
  if (player.spectator) return { ok: false, error: 'Spectators do not have stacks.' };
  const amount = clampInt(amountInput, 1, 1000000, 0);
  const reason = cleanChat(reasonInput) || 'play-money chip request';
  if (!amount) return { ok: false, error: 'Enter a valid chip amount.' };
  if (room.settings.chipMode === 'strict' && support.activeHand(room)) {
    support.audit(room, 'chips.deferred', `${player.name} requested ${amount}; strict mode defers active-hand chip changes`, player.id);
    player.pendingChipRequest = { amount, reason, at: Date.now() };
    return { ok: true };
  }
  if (room.settings.selfServiceChips || room.settings.autoApproveChips) {
    addChips(support, room, player, amount, reason, player.id);
    return { ok: true };
  }
  player.pendingChipRequest = { amount, reason, at: Date.now() };
  support.audit(room, 'chips.requested', `${player.name} requested ${amount} chips`, player.id, { amount, reason });
  return { ok: true };
}

export function approveChipsWithSupport(
  support: ChipSupport,
  room: RoomInternal,
  host: PlayerInternal,
  targetId: string,
  amountInput: number,
  reasonInput = ''
): SocketResult {
  const hostError = support.requireHost(room, host);
  if (hostError) return hostError;
  const target = room.players.get(targetId);
  if (!target) return { ok: false, error: 'Player not found.' };
  if (target.spectator || target.banned) return { ok: false, error: 'Chip edits require an active player stack.' };
  const amount = clampInt(amountInput || target.pendingChipRequest?.amount, -1000000, 1000000, 0);
  const reason = cleanChat(reasonInput || target.pendingChipRequest?.reason || 'host chip edit');
  if (!amount) return { ok: false, error: 'Enter a valid chip amount.' };
  if (room.settings.chipMode === 'strict' && support.activeHand(room)) {
    support.audit(room, 'chips.deferred', `${target.name} chip edit deferred until the current hand ends`, host.id, { targetId: target.id, amount, reason });
    target.pendingChipRequest = { amount, reason, at: Date.now() };
    return { ok: true };
  }
  addChips(support, room, target, amount, reason, host.id);
  target.pendingChipRequest = undefined;
  return { ok: true };
}

function addChips(support: ChipSupport, room: RoomInternal, target: PlayerInternal, amount: number, reason: string, actorId: string): void {
  const applied = amount < 0 ? -Math.min(target.stack, Math.abs(amount)) : amount;
  target.stack += applied;
  if (applied > 0) target.buyInTotal += applied;
  if (target.stack > 0 && target.status === 'busted' && !target.forcedSitOut) target.status = 'seated';
  support.audit(room, applied >= 0 ? 'chips.added' : 'chips.removed', `${target.name} ${applied >= 0 ? 'received' : 'lost'} ${Math.abs(applied)} chips: ${reason}`, actorId, {
    targetId: target.id,
    amount: applied,
    reason
  });
}
