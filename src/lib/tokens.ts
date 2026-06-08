/**
 * Visual design tokens — colors, gradients, shadows, and typography for the
 * felt/gold chrome. Consumed by src/lib/theme.ts (the flat `D` alias) and
 * ad-hoc inline styles across the poker UI.
 */

export const colors = {
  // Brand gold scale (rim, top-rail, accents).
  gold: "#c9a54a",
  goldBright: "#f5e6b8",
  goldTop: "#f0d278",
  // Dark ink for text on gold surfaces.
  ink: "#2a1a08",
  // Mid-tone felt under the felt.png texture (play-area background).
  feltLight: "#0a3820",
  // Body / secondary text on dark felt.
  text: "#f5e6b8",
  sub: "#9fc5a8",
  muted: "#6a8a72",
  // Status accents.
  accent: "#2fb873",
  danger: "#c06060",
  // Warning / secondary emphasis (all-in badge, urgent action clock).
  warning: "#f08a6c",
} as const;

export const gradients = {
  panel: "linear-gradient(180deg, rgba(20,60,36,0.92) 0%, rgba(10,40,22,0.96) 100%)",
  /** Panel fill for the action bar and lobby controls. */
  panelBold: "linear-gradient(180deg, rgba(20,60,36,0.95) 0%, rgba(10,40,22,0.98) 100%)",
  /** Gold press-affordance fill for primary CTAs (Start, Deal). */
  goldButton: `linear-gradient(180deg, ${colors.goldTop}, ${colors.gold})`,
} as const;

/** The signature raised gold-button shadow (3px rail underline + soft drop). */
export const shadows = {
  goldButton: `0 3px 0 #78350f, 0 6px 16px rgba(0,0,0,0.35)`,
} as const;

export const overlays = {
  panelBorder: "rgba(201,165,74,0.28)",
} as const;

/** Translucent neutral fills. */
export const surfaces = {
  /** Hairline divider between sections. */
  dividerLine: "rgba(255,255,255,0.1)",
  /** Translucent fill for neutral tag/pill backgrounds. */
  tagBg: "rgba(255,255,255,0.07)",
} as const;

export const typography = {
  serif: "var(--font-playfair), Georgia, serif",
} as const;
