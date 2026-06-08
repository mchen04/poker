import type { CustomModeName, CustomPermission, RoomSettings, RoomSettingsPatch } from '../shared/types';
import { cleanName, clampInt } from '../shared/sanitize';

const customModes: CustomModeName[] = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'straddle'];
const customPermissions: CustomPermission[] = ['creator_only', 'button', 'everyone_with_cooldown'];

export function defaultSettings(roomName = 'Private Felt'): RoomSettings {
  return {
    roomName,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    buyIn: 1000,
    startingStack: 1000,
    minSeats: 2,
    maxSeats: 9,
    autoApproveChips: false,
    selfServiceChips: true,
    chipMode: 'strict',
    locked: false,
    spectatorsAllowed: true,
    straddle: {
      enabled: true,
      amount: 20,
      mode: 'utg'
    },
    custom: {
      enabled: true,
      permission: 'everyone_with_cooldown',
      cooldownHands: 4,
      allowedModes: ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'straddle']
    },
    sevenTwo: {
      enabled: true,
      bounty: 25,
      suitedBonus: 25
    },
    largeBetThresholdPct: 75,
    actionTimerSeconds: 30
  };
}

export function sanitizeSettings(current: RoomSettings, patch: RoomSettingsPatch): RoomSettings {
  const straddleMode = patch.straddle?.mode && ['off', 'utg', 'button'].includes(patch.straddle.mode) ? patch.straddle.mode : current.straddle.mode;
  const permission = patch.custom?.permission && customPermissions.includes(patch.custom.permission) ? patch.custom.permission : current.custom.permission;
  const allowedModes = Array.isArray(patch.custom?.allowedModes)
    ? patch.custom.allowedModes.filter((mode): mode is CustomModeName => customModes.includes(mode as CustomModeName))
    : current.custom.allowedModes;

  const next: RoomSettings = {
    ...current,
    ...patch,
    roomName: cleanName(patch.roomName ?? current.roomName) || current.roomName,
    smallBlind: clampInt(patch.smallBlind, 1, 100000, current.smallBlind),
    bigBlind: clampInt(patch.bigBlind, 2, 200000, current.bigBlind),
    ante: clampInt(patch.ante, 0, 100000, current.ante),
    buyIn: clampInt(patch.buyIn, 1, 10000000, current.buyIn),
    startingStack: clampInt(patch.startingStack, 1, 10000000, current.startingStack),
    minSeats: clampInt(patch.minSeats, 2, 10, current.minSeats),
    maxSeats: clampInt(patch.maxSeats, 2, 10, current.maxSeats),
    chipMode: patch.chipMode === 'casual' || patch.chipMode === 'strict' ? patch.chipMode : current.chipMode,
    straddle: {
      enabled: Boolean(patch.straddle?.enabled ?? current.straddle.enabled),
      amount: clampInt(patch.straddle?.amount, 0, 1000000, current.straddle.amount),
      mode: straddleMode
    },
    custom: {
      enabled: Boolean(patch.custom?.enabled ?? current.custom.enabled),
      permission,
      cooldownHands: clampInt(patch.custom?.cooldownHands, 0, 1000, current.custom.cooldownHands),
      allowedModes: allowedModes.length > 0 ? allowedModes : current.custom.allowedModes
    },
    sevenTwo: {
      enabled: Boolean(patch.sevenTwo?.enabled ?? current.sevenTwo.enabled),
      bounty: clampInt(patch.sevenTwo?.bounty, 0, 1000000, current.sevenTwo.bounty),
      suitedBonus: clampInt(patch.sevenTwo?.suitedBonus, 0, 1000000, current.sevenTwo.suitedBonus)
    },
    largeBetThresholdPct: clampInt(patch.largeBetThresholdPct, 1, 100, current.largeBetThresholdPct),
    actionTimerSeconds: clampInt(patch.actionTimerSeconds, 0, 600, current.actionTimerSeconds)
  };
  next.bigBlind = Math.max(next.bigBlind, next.smallBlind);
  return next;
}
