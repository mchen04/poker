"use client";

import type { ClientCommand, RoomPublicState } from "@/modes/holdem/shared/types";
import { chips } from "@/lib/utils";
import { D } from "@/lib/theme";

/** Pre-game controls: seat selection, ready toggle, and host start. */
export function LobbyControls({
  publicState,
  myId,
  send,
}: {
  publicState: RoomPublicState;
  myId: string | null;
  send: (cmd: ClientCommand) => void;
}) {
  const me = publicState.players.find((p) => p.id === myId);
  const isHost = me?.isHost ?? false;
  const seatedReady = publicState.players.filter((p) => p.seat !== null && p.ready && p.stack > 0).length;
  const canStart = isHost && seatedReady >= publicState.settings.minSeats;
  const playerBySeat = new Map(publicState.players.filter((p) => p.seat !== null).map((p) => [p.seat as number, p]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, background: "linear-gradient(180deg, rgba(20,60,36,0.95), rgba(10,40,22,0.98))", border: "1px solid rgba(201,165,74,0.28)" }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: D.gold }}>
        Take a seat · {publicState.settings.smallBlind}/{publicState.settings.bigBlind} blinds · {chips(publicState.settings.startingStack)} stack
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6 }}>
        {Array.from({ length: publicState.settings.maxSeats }, (_, seat) => {
          const occupant = playerBySeat.get(seat);
          const mine = occupant?.id === myId;
          return (
            <button
              key={seat}
              disabled={Boolean(occupant) && !mine}
              onClick={() => !occupant && send({ type: "sit", seat })}
              style={{
                padding: "8px 6px",
                borderRadius: 9,
                fontSize: 11,
                fontWeight: 800,
                textAlign: "center",
                background: mine ? "rgba(201,165,74,0.22)" : occupant ? "rgba(0,0,0,0.35)" : "rgba(47,184,115,0.14)",
                border: `1px solid ${mine ? D.gold : occupant ? "rgba(255,255,255,0.1)" : "rgba(47,184,115,0.4)"}`,
                color: occupant ? D.goldBright : D.accent,
                cursor: occupant && !mine ? "default" : "pointer",
              }}
            >
              <div style={{ fontSize: 9, color: D.muted }}>Seat {seat + 1}</div>
              {occupant ? (
                <>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{occupant.name}{mine ? " (you)" : ""}</div>
                  <div style={{ fontSize: 10, color: "#fff" }}>{chips(occupant.stack)}</div>
                </>
              ) : (
                <div>Sit here</div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {me && me.seat !== null && (
          <button
            onClick={() => send({ type: "ready", ready: !me.ready })}
            style={{
              flex: "1 1 120px",
              padding: "11px",
              borderRadius: 11,
              fontWeight: 900,
              fontSize: 14,
              background: me.ready ? "rgba(47,184,115,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${me.ready ? "rgba(47,184,115,0.6)" : D.panelBorder}`,
              color: me.ready ? "#9af0c0" : D.text,
              cursor: "pointer",
            }}
          >
            {me.ready ? "Ready ✓" : "Mark ready"}
          </button>
        )}
        {isHost && (
          <button
            onClick={() => send({ type: "startGame" })}
            disabled={!canStart}
            style={{
              flex: "1 1 120px",
              padding: "11px",
              borderRadius: 11,
              fontWeight: 900,
              fontSize: 14,
              background: canStart ? D.goldButton : "rgba(255,255,255,0.06)",
              color: canStart ? "#2a1a08" : "rgba(255,255,255,0.3)",
              border: "none",
              boxShadow: canStart ? "0 3px 0 #78350f" : "none",
              cursor: canStart ? "pointer" : "not-allowed",
            }}
          >
            Start game
          </button>
        )}
      </div>
      {isHost && !canStart && (
        <div style={{ fontSize: 11, color: D.sub, textAlign: "center" }}>
          Need {publicState.settings.minSeats} ready seated players ({seatedReady} ready).
        </div>
      )}
    </div>
  );
}
