"use client";

import { useEffect, useRef, useState } from "react";
import { useGameSession } from "@/contexts/GameSession";
import { D, feltSurface } from "@/lib/theme";
import { PokerTable } from "./PokerTable";
import { ActionZone, type PreAction } from "./ActionZone";
import { FeltTicker } from "./FeltTicker";
import { LobbyControls } from "./LobbyControls";
import { SidePanel } from "./SidePanel";
import { RoomHeader } from "./RoomHeader";

/** Width of the right command rail on desktop. */
const RAIL_W = 380;
/** Breakpoint below which the rail stacks under the felt. */
const WIDE_MIN_PX = 900;
/** Delay before a queued pre-action auto-fires, so the player sees it land (ms). */
const PRE_ACTION_FIRE_MS = 450;

/**
 * The redesigned play area. A slim header, then a row of [ felt | command rail ].
 * Everything the player DOES lives in the rail — a height-locked Action Zone on
 * top and the info tabs below — so the felt never resizes and content never
 * shifts up/down. A slim ticker fills the space freed at the bottom of the felt.
 */
export function RoomView() {
  const { code, myId, publicState, privateState, send, leave, notice } = useGameSession();
  const [wide, setWide] = useState(true);
  const [preAction, setPreAction] = useState<PreAction>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const firedRef = useRef<number>(-1);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= WIDE_MIN_PX);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2600);
  };

  const me = publicState?.players.find((p) => p.id === myId);
  const hand = publicState?.hand ?? null;
  const mySeat = me?.seat ?? null;
  const myTurn = Boolean(hand && mySeat !== null && hand.currentTurnSeat === mySeat && hand.phase !== "complete");
  const legal = privateState?.legalActions ?? null;
  const actionNonce = hand?.actionNonce ?? -1;
  const handNo = hand?.number ?? 0;

  // Auto-fire a queued pre-action the moment it becomes your turn, so you never
  // hold up the table. Guarded by the action nonce so it fires exactly once.
  useEffect(() => {
    if (!myTurn || !preAction || !legal || !hand || mySeat === null) return;
    if (firedRef.current === actionNonce) return;
    firedRef.current = actionNonce;
    const { key, amt } = preAction;
    const nonce = hand.actionNonce;
    const fire = (action: "fold" | "check" | "call") => {
      send({ type: "act", action, nonce });
      return true;
    };
    const timer = setTimeout(() => {
      let acted = false;
      if (key === "fold") {
        acted = legal.canFold && fire("fold");
      } else if (key === "check") {
        acted = legal.canCheck && fire("check");
      } else if (key === "check_fold") {
        acted = fire(legal.canCheck ? "check" : "fold");
      } else if (key === "call") {
        // Honor the price you agreed to: call if it's the same or cheaper; a genuine
        // raise above it is left for you to decide manually.
        if (legal.canCall && (amt === undefined || legal.callAmount <= amt)) acted = fire("call");
        else if (legal.canCheck) acted = fire("check");
      } else if (key === "call_any") {
        if (legal.canCall) acted = fire("call");
        else if (legal.canCheck) acted = fire("check");
      }
      if (!acted) showFlash("The action changed before your turn — your queued move was cleared.");
      setPreAction(null);
    }, PRE_ACTION_FIRE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, actionNonce, hand?.phase, preAction, Boolean(legal)]);

  // A fresh hand clears any stale queued pre-action and re-arms the auto-fire.
  useEffect(() => {
    setPreAction(null);
    firedRef.current = -1;
  }, [handNo]);

  if (!publicState) return null;
  const isHost = me?.isHost ?? false;
  const inLobby = publicState.lifecycle === "lobby";

  return (
    <div style={{ ...feltSurface, height: "100dvh", display: "flex", flexDirection: "column", color: "#fff", overflow: "hidden" }}>
      <RoomHeader publicState={publicState} code={code} isHost={isHost} onLeave={leave} onEnd={() => send({ type: "endSession" })} />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: wide ? "row" : "column" }}>
        {/* Felt column — isolated board + slim ticker, never resizes. */}
        <div style={wide ? { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } : { flex: "0 0 46vh", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <PokerTable publicState={publicState} privateState={privateState} myId={myId} />
            {(notice ?? flash) && (
              <div
                role="status"
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 20,
                  maxWidth: "90%",
                  padding: "8px 16px",
                  borderRadius: 10,
                  background: "rgba(20,20,16,0.95)",
                  border: `1px solid ${D.gold}`,
                  color: D.goldBright,
                  fontWeight: 700,
                  fontSize: 13,
                  textAlign: "center",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}
              >
                {notice ?? flash}
              </div>
            )}
          </div>
          <FeltTicker publicState={publicState} />
        </div>

        {/* Command rail — all interaction lives here. */}
        <div
          style={
            wide
              ? { width: RAIL_W, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: D.panelDark, borderLeft: "1px solid rgba(201,165,74,0.2)" }
              : { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: D.panelDark, borderTop: "1px solid rgba(201,165,74,0.2)" }
          }
        >
          {inLobby ? (
            <div style={{ padding: 10, flexShrink: 0 }}>
              <LobbyControls publicState={publicState} myId={myId} send={send} />
            </div>
          ) : (
            <ActionZone publicState={publicState} privateState={privateState} myId={myId} send={send} preAction={preAction} setPreAction={setPreAction} />
          )}
          <SidePanel publicState={publicState} myId={myId} send={send} />
        </div>
      </div>
    </div>
  );
}
