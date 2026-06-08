"use client";

import { useEffect, useState } from "react";
import { useGameSession } from "@/contexts/GameSession";
import { D } from "@/lib/theme";
import { PokerTable } from "./PokerTable";
import { ActionBar } from "./ActionBar";
import { LobbyControls } from "./LobbyControls";
import { SidePanel } from "./SidePanel";
import { RoomHeader } from "./RoomHeader";

export function RoomView() {
  const { code, myId, publicState, privateState, send, leave, notice } = useGameSession();
  const [panelOpen, setPanelOpen] = useState(false);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!publicState) return null;
  const me = publicState.players.find((p) => p.id === myId);
  const isHost = me?.isHost ?? false;
  const inLobby = publicState.lifecycle === "lobby";

  const panel = <SidePanel publicState={publicState} myId={myId} send={send} />;

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        backgroundImage: "url('/felt.png')",
        backgroundColor: D.feltLight,
        backgroundSize: "256px 256px",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <RoomHeader
        publicState={publicState}
        code={code}
        isHost={isHost}
        onLeave={leave}
        onEnd={() => send({ type: "endSession" })}
        onTogglePanel={() => setPanelOpen((o) => !o)}
      />

      {publicState.queuedMode && (
        <div style={{ padding: "5px 12px", background: "rgba(201,165,74,0.16)", borderBottom: `1px solid ${D.gold}`, color: D.goldBright, fontWeight: 800, fontSize: 12, textAlign: "center" }}>
          Next hand: {publicState.queuedMode.label} — queued by {publicState.queuedMode.queuedByName}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Main column: felt + bottom controls */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <PokerTable publicState={publicState} privateState={privateState} myId={myId} />
          </div>
          <div style={{ padding: 10, flexShrink: 0 }}>
            {inLobby ? (
              <LobbyControls publicState={publicState} myId={myId} send={send} />
            ) : (
              <ActionBar publicState={publicState} privateState={privateState} myId={myId} send={send} />
            )}
          </div>
        </div>

        {/* Side panel: fixed column on wide screens, drawer on narrow */}
        {wide ? (
          <div style={{ width: 320, flexShrink: 0 }}>{panel}</div>
        ) : (
          panelOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} onClick={() => setPanelOpen(false)} />
              <div style={{ width: "min(340px, 85vw)" }}>{panel}</div>
            </div>
          )
        )}
      </div>

      {notice && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            padding: "10px 18px",
            borderRadius: 10,
            background: "rgba(20,20,16,0.95)",
            border: `1px solid ${D.gold}`,
            color: D.goldBright,
            fontWeight: 700,
            fontSize: 13,
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
