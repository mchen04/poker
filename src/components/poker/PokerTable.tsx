"use client";

import { useEffect, useRef, useState } from "react";
import type { PrivateState, RoomPublicState } from "@/modes/holdem/shared/types";
import { getSeatPosition, computeTableLayout } from "@/lib/seatLayout";
import { D } from "@/lib/theme";
import { Seat } from "./Seat";
import { CommunityBoard } from "./CommunityBoard";

/** The felt: elliptical seat ring (self pinned to bottom) + center board/pot. */
export function PokerTable({
  publicState,
  privateState,
  myId,
}: {
  publicState: RoomPublicState;
  privateState: PrivateState | null;
  myId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setDims({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isMobile = Math.min(dims.w, dims.h) < 500;
  const isLandscape = dims.w > dims.h;
  const hand = publicState.hand;

  const seated = publicState.players
    .filter((p) => p.seat !== null)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const selfIndex = Math.max(0, seated.findIndex((p) => p.id === myId));
  const { xRadius, yRadius, opponentScale } = computeTableLayout({
    playerCount: Math.max(seated.length, 1),
    isMobile,
    isLandscape,
  });
  const holeCount = hand?.variant === "omaha4" ? 4 : 2;
  const revealBySeat = new Map((hand?.revealedHands ?? []).map((r) => [r.seat, r]));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      {/* Felt oval */}
      <div
        style={{
          position: "absolute",
          inset: isMobile ? "5% 3%" : "9% 7%",
          borderRadius: "50% / 46%",
          background: "radial-gradient(ellipse at 50% 38%, #166b3e 0%, #0a3a20 68%, #062716 100%)",
          border: "7px solid #5a3d18",
          boxShadow: "inset 0 0 70px rgba(0,0,0,0.6), 0 10px 44px rgba(0,0,0,0.55)",
        }}
      />

      {/* Center board + pot */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: isMobile ? "40%" : "42%",
          transform: "translate(-50%, -50%)",
          width: "84%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {hand ? (
          <CommunityBoard hand={hand} bounty={publicState.settings.sevenTwo} compact={isMobile} />
        ) : (
          <div style={{ color: D.sub, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12 }}>
            Waiting to deal…
          </div>
        )}
      </div>

      {/* Seats */}
      {seated.map((player, i) => {
        const pos = getSeatPosition(i, seated.length, selfIndex, xRadius, yRadius);
        const isMe = player.id === myId;
        const reveal = player.seat !== null ? revealBySeat.get(player.seat) : undefined;
        const inHand = hand !== null && player.seat !== null && hand.eligibleSeatNumbers.includes(player.seat);
        const holeCards = isMe ? privateState?.holeCards ?? [] : reveal?.cards ?? [];
        const faceDownCount = !isMe && inHand && !reveal ? holeCount : 0;
        const isWinner = hand?.phase === "complete" && player.seat !== null && hand.winningSeats.includes(player.seat);
        return (
          <div
            key={player.id}
            style={{
              position: "absolute",
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) scale(${isMe ? 1 : opponentScale})`,
              zIndex: isMe ? 5 : 2,
            }}
          >
            <Seat
              player={player}
              hand={hand}
              isMe={isMe}
              holeCards={holeCards}
              faceDownCount={faceDownCount}
              isWinner={Boolean(isWinner)}
              handName={hand?.phase === "complete" ? reveal?.handName : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
