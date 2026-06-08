import type { CustomModeName, QueuedCustomMode, RoomSettings, Variant } from './types';

export function modeLabel(mode: CustomModeName): string {
  switch (mode) {
    case 'holdem':
      return "No-Limit Hold'em";
    case 'omaha4':
      return 'PLO 4-card';
    case 'omaha5':
      return '5-card Omaha';
    case 'bomb_pot':
      return 'Bomb pot';
    case 'double_board':
      return 'Double board';
    case 'show_one':
      return 'Winner shows one';
    case 'seven_two':
      return '7-2 bounty';
  }
}

export function buildQueuedMode(
  mode: CustomModeName,
  queuedBy: string,
  queuedByName: string,
  nextHandNumber: number
): QueuedCustomMode {
  const variant: Variant | undefined = mode === 'holdem' || mode === 'omaha4' || mode === 'omaha5' ? mode : undefined;
  return {
    id: `${nextHandNumber}-${mode}-${queuedBy}`,
    queuedBy,
    queuedByName,
    appliesHandNumber: nextHandNumber,
    variant,
    modifiers: {
      bombPot: mode === 'bomb_pot',
      doubleBoard: mode === 'double_board',
      showOne: mode === 'show_one',
      sevenTwo: mode === 'seven_two'
    },
    label: modeLabel(mode)
  };
}

export function validateMode(settings: RoomSettings, mode: CustomModeName): string | null {
  if (!settings.custom.enabled) return 'Custom queue is off.';
  if (!settings.custom.allowedModes.includes(mode)) return `${modeLabel(mode)} is not allowed by host settings.`;
  if (mode === 'double_board' && !settings.custom.allowedModes.some((allowed) => allowed === 'holdem' || allowed === 'omaha4')) {
    return 'Double board requires Hold’em or Omaha to be allowed.';
  }
  return null;
}

export function mergeMode(baseVariant: Variant, queued: QueuedCustomMode | null): Pick<QueuedCustomMode, 'modifiers'> & { variant: Variant } {
  return {
    variant: queued?.variant ?? baseVariant,
    modifiers: {
      bombPot: queued?.modifiers.bombPot,
      doubleBoard: queued?.modifiers.doubleBoard,
      showOne: queued?.modifiers.showOne,
      sevenTwo: queued?.modifiers.sevenTwo,
      mandatoryStraddle: queued?.modifiers.mandatoryStraddle
    }
  };
}
