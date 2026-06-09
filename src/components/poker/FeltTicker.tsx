"use client";

import type { RoomPublicState } from "@/modes/holdem/shared/types";
import { variantLabel } from "@/modes/holdem/shared/modes";
import { D } from "@/lib/theme";

/**
 * Slim status bar pinned to the bottom of the felt column — it fills the space
 * freed by moving the action controls into the rail. Left: blinds · hand # ·
 * variant. Right: the most recent table actions (newest first, fading out), read
 * straight off the public audit log so nothing here can shift the felt above it.
 */
export function FeltTicker({ publicState }: { publicState: RoomPublicState }) {
  const s = publicState.settings;
  const hand = publicState.hand;
  const variant = hand ? variantLabel(hand.variant) : "—";

  const recent = publicState.audit
    .filter((e) => e.type.startsWith("action.") || e.type === "blind.posted")
    .slice(-4)
    .reverse();

  return (
    <div
      style={{
        flexShrink: 0,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "0 16px",
        background: "rgba(6,20,12,0.72)",
        borderTop: "1px solid rgba(201,165,74,0.18)",
        fontSize: 11.5,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", color: D.sub, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
        <span style={{ color: D.gold, fontWeight: 800 }}>
          Blinds {s.smallBlind}/{s.bigBlind}
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{hand ? `Hand #${hand.number}` : "Pre-game"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{variant}</span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", overflow: "hidden", minWidth: 0, justifyContent: "flex-end" }}>
        {recent.length === 0 ? (
          <span style={{ color: D.muted, fontWeight: 700 }}>action will appear here</span>
        ) : (
          recent.map((e, i) => (
            <span
              key={e.id}
              style={{
                color: i === 0 ? D.goldBright : D.muted,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: i === 0 ? 1 : Math.max(0.3, 0.72 - i * 0.14),
              }}
            >
              {e.message}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
