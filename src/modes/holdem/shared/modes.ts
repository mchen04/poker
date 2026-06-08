import type { CustomModeName, QueuedCustomMode, RoomSettings, Variant } from './types';

/** Every queueable one-hand modifier. Single source for UI + validation. */
export const ALL_CUSTOM_MODES: CustomModeName[] = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'straddle'];

export function modeLabel(mode: CustomModeName): string {
  switch (mode) {
    case 'holdem':
      return "No-Limit Hold'em";
    case 'omaha4':
      return 'PLO 4-card';
    case 'bomb_pot':
      return 'Bomb pot';
    case 'show_one':
      return 'Winner shows one';
    case 'straddle':
      return 'Mandatory straddle';
  }
}

/** Canonical display label for a dealt hand's variant (single source of truth). */
export function variantLabel(variant: Variant): string {
  return variant === 'holdem' ? "No-Limit Hold'em" : 'PLO 4-card';
}

export function buildQueuedMode(
  mode: CustomModeName,
  queuedBy: string,
  queuedByName: string,
  nextHandNumber: number
): QueuedCustomMode {
  const variant: Variant | undefined = mode === 'holdem' || mode === 'omaha4' ? mode : undefined;
  return {
    id: `${nextHandNumber}-${mode}-${queuedBy}`,
    queuedBy,
    queuedByName,
    appliesHandNumber: nextHandNumber,
    variant,
    modifiers: {
      bombPot: mode === 'bomb_pot',
      showOne: mode === 'show_one',
      mandatoryStraddle: mode === 'straddle'
    },
    label: modeLabel(mode)
  };
}

export function validateMode(settings: RoomSettings, mode: CustomModeName): string | null {
  if (!settings.custom.enabled) return 'Custom queue is off.';
  if (!settings.custom.allowedModes.includes(mode)) return `${modeLabel(mode)} is not allowed by host settings.`;
  return null;
}

export function mergeMode(baseVariant: Variant, queued: QueuedCustomMode | null): Pick<QueuedCustomMode, 'modifiers'> & { variant: Variant } {
  return {
    variant: queued?.variant ?? baseVariant,
    modifiers: {
      bombPot: queued?.modifiers.bombPot,
      showOne: queued?.modifiers.showOne,
      mandatoryStraddle: queued?.modifiers.mandatoryStraddle
    }
  };
}
