"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomPublicState } from "@/modes/holdem/shared/types";
import { END_GAME_CONFIRM_MS } from "@/lib/constants";
import { D } from "@/lib/theme";
import { ChromeButton } from "./ChromeButton";

/** How long the "Copied!" invite confirmation shows before reverting. */
const COPIED_RESET_MS = 1500;

/**
 * Slim, single-row title bar. Kept intentionally minimal — room identity on the
 * left, the few room-level actions on the right — so the play area below gets the
 * maximum vertical real estate and nothing here ever wraps or shifts.
 */
export function RoomHeader({
  publicState,
  code,
  isHost,
  onLeave,
  onEnd,
}: {
  publicState: RoomPublicState;
  code: string;
  isHost: boolean;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seated = publicState.players.filter((p) => p.seat !== null).length;

  // Clear pending confirm/copied timers on unmount (avoids setState-after-unmount).
  useEffect(
    () => () => {
      if (endTimer.current) clearTimeout(endTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

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
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
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
        padding: "7px 14px",
        background: D.panelDark,
        borderBottom: "1px solid rgba(201,165,74,0.2)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 11, minWidth: 0 }}>
        <span style={{ fontFamily: D.serif, fontWeight: 900, fontSize: 18, color: D.goldBright, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{publicState.settings.roomName}</span>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.15em", color: D.gold, flexShrink: 0 }}>{code}</span>
        <span style={{ fontSize: 11, color: D.sub, whiteSpace: "nowrap", flexShrink: 0 }}>
          {seated} seated · {publicState.lifecycle}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <ChromeButton label={copied ? "Copied!" : "Invite"} onClick={copyInvite} size="md" />
        {isHost && <ChromeButton label={endArmed ? "Confirm end?" : "End & export"} tone={endArmed ? "danger" : undefined} onClick={handleEnd} size="md" />}
        <ChromeButton label="Leave" tone="danger" onClick={onLeave} size="md" />
      </div>
    </header>
  );
}
