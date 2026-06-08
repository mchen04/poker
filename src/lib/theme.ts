import { colors, gradients, overlays, typography } from "./tokens";

/**
 * Flat alias over tokens for terse component imports. Prefer this over
 * importing colors/gradients/overlays separately at component sites.
 */
export const D = {
  gold: colors.gold,
  goldBright: colors.goldBright,
  goldTop: colors.goldTop,
  ink: colors.ink,
  text: colors.text,
  sub: colors.sub,
  muted: colors.muted,
  accent: colors.accent,
  danger: colors.danger,
  warning: colors.warning,
  panel: gradients.panel,
  panelBold: gradients.panelBold,
  goldButton: gradients.goldButton,
  panelBorder: overlays.panelBorder,
  feltLight: colors.feltLight,
  serif: typography.serif,
} as const;

/** Shared felt-texture surface (tiled felt.png over the felt color) for full-screen views. */
export const feltSurface = {
  backgroundImage: "url('/felt.png')",
  backgroundColor: colors.feltLight,
  backgroundRepeat: "repeat" as const,
  backgroundSize: "256px 256px",
};
