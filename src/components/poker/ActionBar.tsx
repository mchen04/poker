"use client";

import { useEffect, useState } from "react";
import type { ClientCommand, PlayerAction, PrivateState, RoomPublicState } from "@/modes/holdem/shared/types";
import { D } from "@/lib/theme";
import { PokerCard } from "./Card";
import { BettingControl } from "./BettingControl";

export function ActionBar({
  publicState,
  privateState,
  myId,
  send,
}: {
  publicState: RoomPublicState;
  privateState: PrivateState | null;
  myId: string | null;
  send: (cmd: ClientCommand) => void;
}) {
  const me = publicState.players.find((p) => p.id === myId);
  const hand = publicState.hand;
  const isHost = me?.isHost ?? false;
  const seatedReady = publicState.players.filter((p) => p.seat !== null && p.ready && p.stack > 0).length;
  const ended = publicState.lifecycle === "ended";

  const onAct = (action: PlayerAction, amount?: number) => {
    if (!hand) return;
    send({ type: "act", action, amount, nonce: hand.actionNonce });
  };

  // Between hands (lobby with no active hand, or a completed hand showing).
  const betweenHands = !hand || hand.phase === "complete";
  if (betweenHands) {
    const canStart = !ended && isHost && seatedReady >= publicState.settings.minSeats && publicState.lifecycle !== "ended";
    return (
      <div style={panelStyle}>
        {hand?.summary && (
          <div style={{ fontSize: 13, fontWeight: 800, color: D.goldBright, textAlign: "center", lineHeight: 1.35 }}>
            {hand.summary}
          </div>
        )}
        {ended ? (
          <div style={{ textAlign: "center", color: D.sub, fontWeight: 800 }}>Session ended.</div>
        ) : publicState.lifecycle === "playing" && hand?.phase === "complete" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: D.muted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Next hand dealing…</div>
            {isHost && <PrimaryButton label="Deal now" onClick={() => send({ type: "startGame" })} />}
          </div>
        ) : canStart ? (
          <PrimaryButton label="Deal first hand" onClick={() => send({ type: "startGame" })} />
        ) : (
          <div style={{ textAlign: "center", color: D.sub, fontWeight: 700, fontSize: 12 }}>
            {isHost ? `Need ${publicState.settings.minSeats} ready players (${seatedReady} ready)` : "Waiting for the host to deal…"}
          </div>
        )}
      </div>
    );
  }

  // Active hand.
  const myTurn = me?.seat !== null && me?.seat !== undefined && hand.currentTurnSeat === me.seat && privateState?.legalActions;
  const actor = publicState.players.find((p) => p.seat === hand.currentTurnSeat);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(privateState?.holeCards ?? []).map((card, i) => (
            <PokerCard key={i} card={card} size="sm" />
          ))}
        </div>
        <ActionClock hand={hand} seconds={publicState.settings.actionTimerSeconds} active={hand.currentTurnSeat !== null} />
      </div>

      {myTurn && me && privateState ? (
        <BettingControl
          legal={privateState.legalActions}
          hand={hand}
          me={me}
          bigBlind={publicState.settings.bigBlind}
          largeBetThresholdPct={publicState.settings.largeBetThresholdPct}
          onAct={onAct}
        />
      ) : (
        <div style={{ textAlign: "center", color: D.sub, fontWeight: 800, fontSize: 13, padding: "8px 0" }}>
          {actor ? `Waiting on ${actor.name}…` : "Waiting…"}
        </div>
      )}
    </div>
  );
}

function ActionClock({ hand, seconds, active }: { hand: { turnStartedAt: number | null }; seconds: number; active: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active || seconds <= 0 || hand.turnStartedAt === null) return;
    const id = setInterval(() => tick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [active, seconds, hand.turnStartedAt]);
  if (!active || seconds <= 0 || hand.turnStartedAt === null) return null;
  const remaining = Math.max(0, seconds - (Date.now() - hand.turnStartedAt) / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100));
  const urgent = remaining < seconds * 0.25;
  return (
    <div style={{ width: 70 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: urgent ? D.danger : D.sub, textAlign: "right" }}>{Math.ceil(remaining)}s</div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: urgent ? D.danger : D.gold, transition: "width 0.3s linear" }} />
      </div>
    </div>
  );
}

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 24px",
        borderRadius: 12,
        fontWeight: 900,
        fontSize: 14,
        background: D.goldButton,
        color: "#2a1a08",
        border: "none",
        boxShadow: "0 3px 0 #78350f, 0 6px 16px rgba(0,0,0,0.35)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(20,60,36,0.95), rgba(10,40,22,0.98))",
  border: "1px solid rgba(201,165,74,0.28)",
  boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
};
