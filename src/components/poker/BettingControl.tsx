"use client";

import { useEffect, useRef, useState } from "react";
import type { HandPublic, LegalActions, PlayerAction, PlayerPublic } from "@/modes/holdem/shared/types";
import { chips, clamp } from "@/lib/utils";
import { D } from "@/lib/theme";

/** How long a large-bet/all-in confirm stays armed before resetting (ms). */
const ARM_CONFIRM_MS = 4000;

/**
 * The poker action rail (net-new vs Ding). Fold / Check / Call / All-in quick
 * buttons plus a bet/raise sizer with a typed exact-amount input, a slider, and
 * preset sizes (⅓, ½, ⅔, pot, 3×BB, min, max). The slider/input track the
 * TARGET total committed this street; bet sends the increment, raise sends the
 * target (matching the engine). Illegal amounts can never be submitted — the
 * value is clamped and buttons are disabled by the server-computed LegalActions.
 * Hotkeys: F fold · C check/call · B/R bet/raise · A all-in. Large commitments
 * (≥ threshold of stack, or all-in) require a confirm click.
 */
export function BettingControl({
  legal,
  hand,
  me,
  bigBlind,
  largeBetThresholdPct,
  onAct,
}: {
  legal: LegalActions;
  hand: HandPublic;
  me: PlayerPublic;
  bigBlind: number;
  largeBetThresholdPct: number;
  onAct: (action: PlayerAction, amount?: number) => void;
}) {
  const canSize = legal.canBet || legal.canRaise;
  const minTarget = legal.canRaise ? legal.minRaiseTo : me.currentBet + legal.minBet;
  const maxTarget = legal.maxBet;
  const [target, setTarget] = useState(minTarget);
  const [armed, setArmed] = useState<null | "size" | "allin">(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the sizer to a legal default whenever the action context changes.
  useEffect(() => {
    setTarget(clamp(minTarget, minTarget, maxTarget));
    setArmed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand.actionNonce, hand.phase, minTarget, maxTarget]);

  // Clear any pending confirm timer on unmount (the turn can end while armed).
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  const commitChips = target - me.currentBet;
  const isLargeSize = canSize && commitChips >= (me.stack * largeBetThresholdPct) / 100;

  function arm(kind: "size" | "allin", fn: () => void, needsConfirm: boolean) {
    if (!needsConfirm || armed === kind) {
      setArmed(null);
      fn();
      return;
    }
    setArmed(kind);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(null), ARM_CONFIRM_MS);
  }

  function submitSize() {
    const value = clamp(Math.round(target), minTarget, maxTarget);
    if (legal.canRaise) onAct("raise", value);
    else if (legal.canBet) onAct("bet", value - me.currentBet);
  }

  function submitAllIn() {
    onAct("all_in");
  }

  // Hotkeys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "f" && legal.canFold) onAct("fold");
      else if (k === "c" && legal.canCheck) onAct("check");
      else if (k === "c" && legal.canCall) onAct("call");
      else if ((k === "b" || k === "r") && canSize) arm("size", submitSize, isLargeSize);
      else if (k === "a" && legal.allInAmount > 0) arm("allin", submitAllIn, true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal, canSize, isLargeSize, target]);

  const presets: Array<{ label: string; value: number }> = canSize
    ? [
        { label: "Min", value: minTarget },
        { label: "⅓", value: hand.currentBet + (legal.potSize + legal.callAmount) / 3 },
        { label: "½", value: hand.currentBet + (legal.potSize + legal.callAmount) / 2 },
        { label: "⅔", value: hand.currentBet + ((legal.potSize + legal.callAmount) * 2) / 3 },
        { label: "Pot", value: hand.currentBet + legal.potSize + legal.callAmount },
        { label: "3×BB", value: 3 * bigBlind },
        { label: "Max", value: maxTarget },
      ]
    : [];

  const sizeLabel = legal.canRaise ? "Raise to" : "Bet";
  const fillPct = maxTarget > minTarget ? ((target - minTarget) / (maxTarget - minTarget)) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Quick action row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        <ActionButton label="Fold" hint="F" disabled={!legal.canFold} tone="danger" onClick={() => onAct("fold")} />
        {legal.canCheck ? (
          <ActionButton label="Check" hint="C" disabled={false} tone="neutral" onClick={() => onAct("check")} />
        ) : (
          <ActionButton label={`Call ${chips(legal.callAmount)}`} hint="C" disabled={!legal.canCall} tone="call" onClick={() => onAct("call")} />
        )}
        <ActionButton
          label={armed === "allin" ? "Confirm all-in" : `All-in ${chips(legal.allInAmount)}`}
          hint="A"
          disabled={legal.allInAmount <= 0}
          tone={armed === "allin" ? "confirm" : "neutral"}
          onClick={() => arm("allin", submitAllIn, true)}
        />
        <ActionButton
          label={armed === "size" ? "Confirm" : sizeLabel}
          hint="B"
          disabled={!canSize}
          tone={armed === "size" ? "confirm" : "gold"}
          onClick={() => arm("size", submitSize, isLargeSize)}
        />
      </div>

      {/* Sizer */}
      {canSize && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: D.sub, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{sizeLabel}</span>
            <input
              type="number"
              value={Math.round(target)}
              min={minTarget}
              max={maxTarget}
              onChange={(e) => setTarget(clamp(Number(e.target.value) || 0, minTarget, maxTarget))}
              aria-label="Bet amount"
              style={{
                flex: 1,
                minWidth: 0,
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${D.panelBorder}`,
                borderRadius: 8,
                color: D.goldBright,
                fontWeight: 900,
                fontSize: 18,
                textAlign: "center",
                padding: "4px 6px",
                outline: "none",
              }}
            />
          </div>
          <input
            type="range"
            min={minTarget}
            max={maxTarget}
            value={clamp(target, minTarget, maxTarget)}
            onChange={(e) => setTarget(Number(e.target.value))}
            aria-label="Bet slider"
            style={{ width: "100%", accentColor: D.gold, background: `linear-gradient(to right, ${D.gold} ${fillPct}%, rgba(255,255,255,0.15) ${fillPct}%)` }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setTarget(clamp(Math.round(preset.value), minTarget, maxTarget))}
                style={{
                  flex: "1 1 0",
                  minWidth: 38,
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "4px 0",
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.07)",
                  border: `1px solid ${D.panelBorder}`,
                  color: D.text,
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  hint,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  tone: "danger" | "neutral" | "call" | "gold" | "confirm";
  onClick: () => void;
}) {
  const bg =
    tone === "danger"
      ? "linear-gradient(180deg,#a85050,#8a3e3e)"
      : tone === "call"
      ? "linear-gradient(180deg,#2fb873,#1f8a55)"
      : tone === "gold"
      ? D.goldButton
      : tone === "confirm"
      ? "linear-gradient(180deg,#f0a23c,#d97f1c)"
      : "rgba(255,255,255,0.09)";
  const color = tone === "gold" || tone === "confirm" ? "#2a1a08" : "#fff";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-action={hint}
      style={{
        position: "relative",
        padding: "12px 6px",
        borderRadius: 10,
        fontWeight: 900,
        fontSize: 13,
        background: disabled ? "rgba(255,255,255,0.05)" : bg,
        color: disabled ? "rgba(255,255,255,0.3)" : color,
        border: tone === "neutral" || disabled ? `1px solid ${D.panelBorder}` : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.06s",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </button>
  );
}
