"use client";

import type { Card as CardT } from "@/modes/holdem/shared/types";
import { parseCard } from "@/lib/utils";
import { D } from "@/lib/theme";

type Size = "xs" | "sm" | "md" | "lg";

const DIMS: Record<Size, { w: number; h: number; rank: number; pip: number }> = {
  xs: { w: 26, h: 38, rank: 13, pip: 12 },
  sm: { w: 38, h: 54, rank: 18, pip: 16 },
  md: { w: 52, h: 74, rank: 24, pip: 22 },
  lg: { w: 68, h: 96, rank: 32, pip: 30 },
};

/** A single playing card. Pass `card` for a face-up card, omit it for a back. */
export function PokerCard({
  card,
  faceDown = false,
  size = "md",
  highlight = false,
  dim = false,
}: {
  card?: CardT | null;
  faceDown?: boolean;
  size?: Size;
  highlight?: boolean;
  dim?: boolean;
}) {
  const dim_ = DIMS[size];

  if (!card || faceDown) {
    const empty = !card && !faceDown;
    return (
      <div
        style={{
          width: dim_.w,
          height: dim_.h,
          borderRadius: Math.round(dim_.w * 0.16),
          background: empty
            ? "rgba(0,0,0,0.28)"
            : "repeating-linear-gradient(45deg, #7a1322 0 6px, #5e0e1a 6px 12px)",
          border: empty ? "1px dashed rgba(201,165,74,0.35)" : "1px solid rgba(0,0,0,0.5)",
          boxShadow: empty ? "none" : "0 2px 6px rgba(0,0,0,0.45)",
          opacity: dim ? 0.5 : 1,
        }}
      />
    );
  }

  const { red, symbol, label } = parseCard(card);
  return (
    <div
      style={{
        width: dim_.w,
        height: dim_.h,
        borderRadius: Math.round(dim_.w * 0.16),
        background: "#fbf7ec",
        border: highlight ? `2px solid ${D.goldBright}` : "1px solid rgba(0,0,0,0.35)",
        boxShadow: highlight ? `0 0 12px ${D.gold}` : "0 2px 6px rgba(0,0,0,0.45)",
        color: red ? "#c02434" : "#10100f",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Georgia, serif",
        fontWeight: 800,
        opacity: dim ? 0.55 : 1,
        flex: "0 0 auto",
      }}
    >
      <span style={{ position: "absolute", top: 2, left: 4, fontSize: dim_.rank, lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: dim_.pip, lineHeight: 1 }}>{symbol}</span>
      <span style={{ position: "absolute", bottom: 2, right: 4, fontSize: dim_.rank, lineHeight: 1, transform: "rotate(180deg)" }}>{label}</span>
    </div>
  );
}
