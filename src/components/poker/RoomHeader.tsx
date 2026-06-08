"use client";

import { useRef, useState } from "react";
import type { RoomPublicState } from "@/modes/holdem/shared/types";
import { END_GAME_CONFIRM_MS } from "@/lib/constants";
import { D } from "@/lib/theme";

/** How long the "Copied!" invite confirmation shows before reverting. */
const COPIED_RESET_MS = 1500;

export function RoomHeader({
  publicState,
  code,
  isHost,
  onLeave,
  onEnd,
  onTogglePanel,
}: {
  publicState: RoomPublicState;
  code: string;
  isHost: boolean;
  onLeave: () => void;
  onEnd: () => void;
  onTogglePanel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seated = publicState.players.filter((p) => p.seat !== null).length;

  function handleEnd() {
    if (endArmed) {
      if (endTimer.current) clearTimeout(endTimer.current);
      setEndArmed(false);
      onEnd();
      return;
    }
    setEndArmed(true);
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => setEndArmed(false), END_GAME_CONFIRM_MS);
  }

  function copyInvite() {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_RESET_MS);
      },
      () => undefined
    );
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 12px",
        background: "rgba(8,26,16,0.9)",
        borderBottom: "1px solid rgba(201,165,74,0.2)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: D.serif, fontWeight: 900, fontSize: 18, color: D.goldBright }}>{publicState.settings.roomName}</span>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.15em", color: D.gold }}>{code}</span>
        <span style={{ fontSize: 11, color: D.sub }}>{seated} seated · {publicState.lifecycle}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <HeaderBtn label={copied ? "Copied!" : "Invite"} onClick={copyInvite} />
        {isHost && <HeaderBtn label={endArmed ? "Confirm end?" : "End & export"} tone={endArmed ? "danger" : undefined} onClick={handleEnd} />}
        <HeaderBtn label="Leave" tone="danger" onClick={onLeave} />
        <HeaderBtn label="☰" onClick={onTogglePanel} mobileOnly />
      </div>
    </header>
  );
}

function HeaderBtn({ label, onClick, tone, mobileOnly }: { label: string; onClick: () => void; tone?: "danger"; mobileOnly?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={mobileOnly ? "panel-toggle" : undefined}
      style={{
        fontSize: 11,
        fontWeight: 800,
        padding: "6px 10px",
        borderRadius: 8,
        background: tone === "danger" ? "rgba(192,96,96,0.18)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${tone === "danger" ? "rgba(192,96,96,0.45)" : D.panelBorder}`,
        color: tone === "danger" ? "#f0b0b0" : D.text,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
