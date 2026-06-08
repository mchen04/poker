"use client";

import type { Card, HandPublic, PlayerPublic } from "@/modes/holdem/shared/types";
import { chips, upDownColor, upDownLabel } from "@/lib/utils";
import { D } from "@/lib/theme";
import { PokerCard } from "./Card";

function RoleBadge({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 900,
        padding: "1px 4px",
        borderRadius: 4,
        background: bg,
        color: "#1a1208",
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}

export function Seat({
  player,
  hand,
  isMe,
  holeCards,
  faceDownCount,
  isWinner,
  handName,
}: {
  player: PlayerPublic;
  hand: HandPublic | null;
  isMe: boolean;
  holeCards: Card[];
  faceDownCount: number;
  isWinner: boolean;
  handName?: string;
}) {
  const seat = player.seat;
  const isActor = hand !== null && hand.currentTurnSeat === seat && !player.folded;
  const showCards = holeCards.length > 0 || faceDownCount > 0;

  const statusLabel = player.folded
    ? "Folded"
    : player.allIn
    ? "All-in"
    : !player.connected
    ? "Away"
    : player.status === "sitting_out"
    ? "Sitting out"
    : player.status === "busted"
    ? "Busted"
    : null;

  const borderColor = isWinner
    ? D.goldBright
    : isActor
    ? D.gold
    : isMe
    ? "rgba(201,165,74,0.6)"
    : "rgba(255,255,255,0.12)";

  return (
    <div
      className={isActor ? "animate-pulse" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        opacity: player.folded ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Hole cards */}
      {showCards && (
        <div style={{ display: "flex", gap: 2 }}>
          {holeCards.map((card, i) => (
            <PokerCard key={`up-${i}`} card={card} size="sm" highlight={isWinner} />
          ))}
          {Array.from({ length: faceDownCount }, (_, i) => (
            <PokerCard key={`down-${i}`} faceDown size="sm" dim={player.folded} />
          ))}
        </div>
      )}

      {/* Name plate */}
      <div
        style={{
          minWidth: 92,
          maxWidth: 132,
          borderRadius: 10,
          padding: "4px 8px",
          background: isMe ? "linear-gradient(180deg, rgba(201,165,74,0.22), rgba(201,165,74,0.08))" : "rgba(8,26,16,0.92)",
          border: `1.5px solid ${borderColor}`,
          boxShadow: isWinner ? `0 0 16px ${D.gold}` : isActor ? `0 0 10px ${D.gold}88` : "0 2px 8px rgba(0,0,0,0.4)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, lineHeight: 1.1 }}>
          {player.isHost && <span title="Host" style={{ fontSize: 10 }}>👑</span>}
          <span style={{ fontSize: 12, fontWeight: 800, color: D.goldBright, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 96 }}>
            {player.name}{isMe ? " (you)" : ""}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 900, color: statusLabel === "Busted" ? D.danger : "#fff", marginTop: 1 }}>
          {chips(player.stack)}
        </div>
        {statusLabel ? (
          <div style={{ fontSize: 9, fontWeight: 800, color: player.allIn ? D.warning : D.sub, letterSpacing: "0.06em", textTransform: "uppercase" }}>{statusLabel}</div>
        ) : handName ? (
          <div style={{ fontSize: 9, fontWeight: 800, color: D.gold, letterSpacing: "0.04em" }}>{handName}</div>
        ) : (
          <div style={{ fontSize: 9, fontWeight: 700, color: upDownColor(player.upDown) }}>
            {upDownLabel(player.upDown)}
          </div>
        )}

        {/* Role badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3, minHeight: 12 }}>
          {hand?.buttonSeat === seat && <RoleBadge label="D" bg="#f5e6b8" />}
          {hand?.smallBlindSeat === seat && <RoleBadge label="SB" bg="#9fc5e8" />}
          {hand?.bigBlindSeat === seat && <RoleBadge label="BB" bg="#e8b89f" />}
          {hand?.straddleSeat === seat && <RoleBadge label="STR" bg="#c9a5e8" />}
        </div>
      </div>

      {/* Current-street bet chip */}
      {player.currentBet > 0 && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: "#1a1208",
            background: D.goldTop,
            borderRadius: 999,
            padding: "1px 8px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
          }}
        >
          {chips(player.currentBet)}
        </div>
      )}
    </div>
  );
}
