"use client";

import type { ClientCommand, RoomPublicState } from "@/modes/holdem/shared/types";
import { canStartGame, chips, seatedReadyCount } from "@/lib/utils";
import { D } from "@/lib/theme";
import { shadows } from "@/lib/tokens";

/** Pre-game controls: ready toggle and host start. Seating happens on the felt. */
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
  const seated = me?.seat !== null && me?.seat !== undefined;
  const seatedReady = seatedReadyCount(publicState);
  const canStart = canStartGame(publicState, isHost);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, background: D.panelBold, border: `1px solid ${D.panelBorder}` }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: D.gold }}>
        Lobby · {publicState.settings.smallBlind}/{publicState.settings.bigBlind} blinds · {chips(publicState.settings.startingStack)} stack
      </div>
      <div style={{ fontSize: 12, color: seated ? D.sub : D.goldBright, fontWeight: seated ? 600 : 800, lineHeight: 1.4 }}>
        {seated ? "You're seated. Mark ready when you want to play — you can change seats until the first hand deals." : "👉 Click an open seat at the table to sit down."}
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
              color: canStart ? D.ink : "rgba(255,255,255,0.3)",
              border: "none",
              boxShadow: canStart ? shadows.goldButton : "none",
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
