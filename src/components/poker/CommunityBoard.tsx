"use client";

import type { HandPublic, RoomSettings } from "@/modes/holdem/shared/types";
import { chips } from "@/lib/utils";
import { D } from "@/lib/theme";
import { PokerCard } from "./Card";

const VARIANT_LABEL: Record<string, string> = { holdem: "NL HOLD'EM", omaha4: "PLO 4-CARD" };

export function CommunityBoard({ hand, bounty, compact = false }: { hand: HandPublic; bounty?: RoomSettings["sevenTwo"]; compact?: boolean }) {
  const total = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const size = compact ? "xs" : "md";
  const modifierTags: string[] = [];
  if (hand.modifiers.bombPot) modifierTags.push("BOMB");
  if (hand.modifiers.showOne) modifierTags.push("SHOW-1");
  if (hand.modifiers.mandatoryStraddle) modifierTags.push("STRADDLE");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 6 : 10 }}>
      {/* Pot readout */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", color: D.sub }}>
          {VARIANT_LABEL[hand.variant] ?? hand.variant}
          {modifierTags.length > 0 ? ` · ${modifierTags.join(" · ")}` : ""}
        </div>
        <div style={{ fontSize: compact ? 18 : 26, fontWeight: 900, color: D.goldBright, lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
          {chips(total)}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: D.muted, textTransform: "uppercase" }}>
          {hand.phase === "complete" ? "final pot" : "pot"} · hand #{hand.number}
        </div>
        {bounty?.enabled && bounty.bounty > 0 && (
          <div style={{ fontSize: 9, fontWeight: 800, color: D.warning, marginTop: 2 }}>
            7-2 bounty {chips(bounty.bounty)}{bounty.suitedBonus > 0 ? ` (+${chips(bounty.suitedBonus)} suited)` : ""}
          </div>
        )}
      </div>

      {/* Board */}
      <div style={{ display: "flex", gap: compact ? 3 : 6 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <PokerCard key={i} card={hand.board[i] ?? null} size={size} />
        ))}
      </div>

      {/* Side pots */}
      {hand.pots.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {hand.pots.map((pot, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: D.text,
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(201,165,74,0.3)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {pot.label}: {chips(pot.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
