"use client";

import { useEffect, useRef, useState } from "react";
import type { PrivateState, RoomPublicState } from "@/modes/holdem/shared/types";
import { getSeatPosition, computeTableLayout } from "@/lib/seatLayout";
import { D } from "@/lib/theme";
import { Seat, EmptySeat } from "./Seat";
import { CommunityBoard } from "./CommunityBoard";

/**
 * The felt: a fixed ring of `maxSeats` chairs (your own pinned to bottom-center)
 * around the central board/pot. Occupied chairs show the player; open chairs are
 * click-to-sit when seat changes are allowed (lobby or between hands), so seating
 * happens right on the table instead of in a menu.
 */
export function PokerTable({
  publicState,
  privateState,
  myId,
  onSit,
}: {
  publicState: RoomPublicState;
  privateState: PrivateState | null;
  myId: string | null;
  onSit: (seat: number) => void;
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
  const maxSeats = publicState.settings.maxSeats;

  const me = publicState.players.find((p) => p.id === myId);
  const mySeat = me?.seat ?? null;
  // The viewer's own seat anchors the bottom; default to seat 0 before they sit.
  const anchorSeat = mySeat ?? 0;

  // Seat changes follow the same rule the server enforces: allowed unless the
  // room has ended or a hand is in progress, and never for spectators / sat-out.
  const activeHand = hand !== null && hand.phase !== "complete";
  const canChooseSeat =
    publicState.lifecycle !== "ended" && !activeHand && Boolean(me) && !me!.spectator && !me!.forcedSitOut && !me!.banned;

  const { xRadius, yRadius, opponentScale } = computeTableLayout({
    seatCount: maxSeats,
    isMobile,
    isLandscape,
    width: dims.w,
  });
  const holeCount = hand?.variant === "omaha4" ? 4 : 2;
  const playerBySeat = new Map(
    publicState.players.filter((p) => p.seat !== null).map((p) => [p.seat as number, p])
  );
  const revealBySeat = new Map((hand?.revealedHands ?? []).map((r) => [r.seat, r]));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      {/* Felt oval */}
      <div
        style={{
          position: "absolute",
          inset: isMobile ? "5% 3%" : "8% 6%",
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

      {/* Fixed ring — one slot per table seat */}
      {Array.from({ length: maxSeats }, (_, seat) => {
        const pos = getSeatPosition(seat, maxSeats, anchorSeat, xRadius, yRadius);
        const player = playerBySeat.get(seat);
        const isMe = player?.id === myId;
        const reveal = revealBySeat.get(seat);
        const inHand = hand !== null && player !== undefined && hand.eligibleSeatNumbers.includes(seat);
        const holeCards = isMe ? privateState?.holeCards ?? [] : reveal?.cards ?? [];
        const faceDownCount = player && !isMe && inHand && !reveal ? holeCount : 0;
        const isWinner = hand?.phase === "complete" && player !== undefined && hand.winningSeats.includes(seat);
        return (
          <div
            key={seat}
            style={{
              position: "absolute",
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) scale(${isMe ? 1 : opponentScale})`,
              zIndex: isMe ? 5 : player ? 2 : 1,
            }}
          >
            {player ? (
              <Seat
                player={player}
                hand={hand}
                isMe={isMe}
                holeCards={holeCards}
                faceDownCount={faceDownCount}
                isWinner={Boolean(isWinner)}
                handName={hand?.phase === "complete" ? reveal?.handName : undefined}
              />
            ) : (
              <EmptySeat seat={seat} canSit={canChooseSeat} isMove={mySeat !== null} onSit={() => onSit(seat)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
