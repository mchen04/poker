"use client";

import { useEffect, useState } from "react";
import type { Card, ClientCommand, HandPublic, PlayerAction, PrivateState, RoomPublicState, Variant } from "@/modes/holdem/shared/types";
import { rankHighHand } from "@/modes/holdem/engine/evaluator";
import { chips, parseCard } from "@/lib/utils";
import { D } from "@/lib/theme";
import { shadows } from "@/lib/tokens";
import { PokerCard } from "./Card";
import { BettingControl } from "./BettingControl";

/** A move queued while it isn't your turn — auto-fired by RoomView when it is. */
export type PreActionKey = "fold" | "check" | "check_fold" | "call" | "call_any";
export type PreAction = { key: PreActionKey; amt?: number } | null;

/** Fixed height of the controls sub-region so the info tabs below never move. */
const CONTROLS_H = 196;

/** Re-render on an interval while `active`, to animate the turn timer. */
function useTick(active: boolean, ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

/** Short, friendly read of the player's current best hand. */
function describeHand(holeCards: Card[], board: Card[], variant: Variant): string | null {
  if (holeCards.length < 2) return null;
  if (board.length >= 3) {
    try {
      return rankHighHand(variant, holeCards, board).name;
    } catch {
      return null;
    }
  }
  // Pre-flop read only makes sense for the 2-card Hold'em hand.
  if (variant !== "holdem") return null;
  const a = parseCard(holeCards[0]);
  const b = parseCard(holeCards[1]);
  if (holeCards[0][0] === holeCards[1][0]) return `Pocket ${a.label}s`;
  const suited = holeCards[0][1] === holeCards[1][1];
  return `${a.label}-${b.label} ${suited ? "suited" : "offsuit"}`;
}

function TimerRing({ remaining, total, urgent, size = 42 }: { remaining: number; total: number; urgent: boolean; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const col = urgent ? D.danger : D.gold;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: col }}>{Math.ceil(remaining)}</div>
    </div>
  );
}

/** Pre-action toggles + a live table read, shown when it isn't your turn. */
function PreActionControls({
  publicState,
  hand,
  toCall,
  preAction,
  setPreAction,
}: {
  publicState: RoomPublicState;
  hand: HandPublic;
  toCall: number;
  preAction: PreAction;
  setPreAction: (p: PreAction) => void;
}) {
  const pot = hand.pots.reduce((sum, p) => sum + p.amount, 0);
  const inHand = publicState.players.filter((p) => p.seat !== null && hand.eligibleSeatNumbers.includes(p.seat) && !p.folded).length;

  const opts: Array<{ key: PreActionKey; label: string; amt?: number }> = [{ key: "fold", label: "Fold" }];
  if (toCall <= 0) opts.push({ key: "check", label: "Check" });
  opts.push({ key: "check_fold", label: "Check / Fold" });
  if (toCall > 0) opts.push({ key: "call", label: `Call ${chips(toCall)}`, amt: toCall });
  opts.push({ key: "call_any", label: "Call Any" });

  const sel = preAction?.key ?? null;
  const Stat = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
    <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: D.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: accent ?? "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: D.sub }}>Pre-action</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: D.muted }}>auto-fires on your turn</span>
      </div>
      <div role="group" aria-label="Pre-action" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {opts.map((o) => {
          const on = sel === o.key;
          const danger = o.key === "fold";
          return (
            <button
              key={o.key}
              aria-pressed={on}
              onClick={() => setPreAction(on ? null : { key: o.key, amt: o.amt })}
              style={{
                flex: "1 1 44%",
                minWidth: 0,
                padding: "11px 8px",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                background: on ? (danger ? "rgba(168,80,80,0.28)" : "rgba(201,165,74,0.22)") : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${on ? (danger ? "#a85050" : D.gold) : D.panelBorder}`,
                color: on ? (danger ? "#f0b0b0" : D.goldBright) : D.text,
                boxShadow: on ? "0 0 0 3px rgba(201,165,74,0.10)" : "none",
              }}
            >
              {on && <span style={{ marginRight: 5 }}>✓</span>}
              {o.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", display: "flex", padding: "10px 6px", borderRadius: 10, background: "rgba(0,0,0,0.3)", border: `1px solid ${D.panelBorder}` }}>
        <Stat label="Pot" value={chips(pot)} accent={D.goldBright} />
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <Stat label="To call" value={toCall > 0 ? chips(toCall) : "Check"} accent={toCall > 0 ? D.warning : D.sub} />
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <Stat label="In hand" value={inHand} />
      </div>
      <div style={{ fontSize: 10.5, color: D.muted, fontWeight: 700, textAlign: "center" }}>
        {sel ? "Queued — change or tap again to cancel" : "Queue a move so you never hold up the table"}
      </div>
    </div>
  );
}

/** Between-hands result + next-deal countdown (host can deal early). */
function BetweenHands({ publicState, isHost, onDeal }: { publicState: RoomPublicState; isHost: boolean; onDeal: () => void }) {
  const hand = publicState.hand;
  const ended = publicState.lifecycle === "ended";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", justifyContent: "center", textAlign: "center" }}>
      {hand?.summary && <div style={{ fontSize: 15, fontWeight: 800, color: D.goldBright, lineHeight: 1.35 }}>{hand.summary}</div>}
      {ended ? (
        <div style={{ color: D.sub, fontWeight: 800 }}>Session ended.</div>
      ) : (
        <>
          <div className="next-bar">
            <span />
          </div>
          <div style={{ fontSize: 11, color: D.muted, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Next hand dealing…</div>
          {isHost && (
            <button
              onClick={onDeal}
              style={{ alignSelf: "center", padding: "12px 28px", borderRadius: 12, fontWeight: 900, fontSize: 14, background: D.goldButton, color: D.ink, border: "none", boxShadow: shadows.goldButton, cursor: "pointer" }}
            >
              Deal now
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The right rail's command center. A height-locked region that adapts to context
 * — your turn (hole cards + hand read + bet sizer + actions), waiting (pre-action
 * toggles + table read), or between hands (result + deal) — while never changing
 * height, so the info tabs below it never shift.
 */
export function ActionZone({
  publicState,
  privateState,
  myId,
  send,
  preAction,
  setPreAction,
}: {
  publicState: RoomPublicState;
  privateState: PrivateState | null;
  myId: string | null;
  send: (cmd: ClientCommand) => void;
  preAction: PreAction;
  setPreAction: (p: PreAction) => void;
}) {
  const me = publicState.players.find((p) => p.id === myId);
  const hand = publicState.hand;
  const isHost = me?.isHost ?? false;

  const myTurn = Boolean(hand && me && me.seat !== null && hand.currentTurnSeat === me.seat && hand.phase !== "complete");
  const active = Boolean(hand && hand.currentTurnSeat !== null && hand.phase !== "complete");
  useTick(active);

  const timer = publicState.settings.actionTimerSeconds;
  const remaining = hand?.turnStartedAt && timer > 0 ? Math.max(0, timer - (Date.now() - hand.turnStartedAt) / 1000) : timer;
  const urgent = timer > 0 && remaining < timer * 0.25;
  const showRing = timer > 0 && active;

  const actor = hand ? publicState.players.find((p) => p.seat === hand.currentTurnSeat) : undefined;
  const inThisHand = Boolean(hand && me && me.seat !== null && hand.eligibleSeatNumbers.includes(me.seat) && !me.folded);
  const myCards = (me?.id === myId ? privateState?.holeCards : undefined) ?? [];
  const handRead = hand && inThisHand && myCards.length ? describeHand(myCards, hand.board, hand.variant) : null;
  const toCall = hand && me ? hand.currentBet - me.currentBet : 0;

  // Header copy. The timer ring always occupies a fixed-size slot (rendered empty
  // when there's no live actor) so the header height never changes between states.
  let title: string;
  let sub = "";
  if (!hand || hand.phase === "complete") {
    title = "Hand complete";
    sub = "settling up";
  } else if (myTurn) {
    title = "YOUR TURN";
    sub = "the table is on you";
  } else if (actor) {
    title = `${actor.name} to act`;
    sub = me?.folded ? "you folded this hand" : "deciding…";
  } else {
    title = "Dealing…";
  }
  const ring = showRing ? <TimerRing remaining={remaining} total={timer} urgent={urgent} /> : null;

  function onAct(action: PlayerAction, amount?: number) {
    if (!hand) return;
    send({ type: "act", action, amount, nonce: hand.actionNonce });
    setPreAction(null);
  }

  return (
    <div
      style={{
        padding: "12px 13px 13px",
        borderBottom: `1px solid ${D.panelBorder}`,
        flexShrink: 0,
        background: myTurn ? "linear-gradient(180deg, rgba(201,165,74,0.12), rgba(8,26,16,0))" : "transparent",
        transition: "background 0.3s",
      }}
    >
      {/* Turn header — fixed height so the ring (or its absence) never shifts the rail. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, height: 42 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: myTurn ? "0.12em" : "0.02em", color: myTurn ? D.goldBright : D.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {sub && <div style={{ fontSize: 10.5, fontWeight: 700, color: D.muted, letterSpacing: "0.04em", textTransform: "uppercase" }}>{sub}</div>}
        </div>
        <div style={{ width: 42, height: 42, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{ring}</div>
      </div>

      {/* Your hand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11, minHeight: 56 }}>
        {inThisHand && myCards.length ? (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              {myCards.map((c, i) => (
                <PokerCard key={i} card={c} size="md" />
              ))}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: D.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Your hand</div>
              {handRead && <div style={{ fontSize: 14, fontWeight: 800, color: D.goldBright, lineHeight: 1.15 }}>{handRead}</div>}
              {me && <div style={{ fontSize: 11, fontWeight: 700, color: D.sub }}>Stack {chips(me.stack)}</div>}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.muted, fontSize: 12, fontWeight: 700 }}>
            <PokerCard faceDown size="md" dim />
            <PokerCard faceDown size="md" dim />
            <span>{me?.folded ? "You folded — sitting out this hand" : "Waiting for the next deal"}</span>
          </div>
        )}
      </div>

      {/* Controls — height locked so the tabs below never move */}
      <div style={{ height: CONTROLS_H }}>
        {!hand || hand.phase === "complete" ? (
          <BetweenHands publicState={publicState} isHost={isHost} onDeal={() => send({ type: "startGame" })} />
        ) : myTurn && me && privateState?.legalActions ? (
          <BettingControl legal={privateState.legalActions} hand={hand} me={me} largeBetThresholdPct={publicState.settings.largeBetThresholdPct} onAct={onAct} />
        ) : inThisHand && hand ? (
          <PreActionControls publicState={publicState} hand={hand} toCall={toCall} preAction={preAction} setPreAction={setPreAction} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: D.muted, fontSize: 13, fontWeight: 700, textAlign: "center", padding: "0 14px" }}>
            {me?.folded ? "You're out this hand — watching it play out." : "Sit tight for the next hand."}
          </div>
        )}
      </div>
    </div>
  );
}
