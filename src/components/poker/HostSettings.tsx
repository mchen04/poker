"use client";

import { useEffect, useState } from "react";
import type { ClientCommand, RoomSettings } from "@/modes/holdem/shared/types";
import { ALL_CUSTOM_MODES, modeLabel } from "@/modes/holdem/shared/modes";
import { D, fieldStyle } from "@/lib/theme";

export function HostSettings({
  settings,
  isHost,
  canEdit,
  send,
}: {
  settings: RoomSettings;
  isHost: boolean;
  canEdit: boolean;
  send: (cmd: ClientCommand) => void;
}) {
  const [draft, setDraft] = useState<RoomSettings>(settings);

  // Re-sync the draft only when the authoritative settings CONTENT changes, not
  // on every snapshot (each broadcast is a fresh object reference, which would
  // otherwise clobber the host's in-progress edits).
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  const set = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const disabled = !isHost;

  function apply() {
    send({ type: "updateSettings", patch: draft });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
      <Section title="Stakes & stacks">
        <Num label="Small blind" value={draft.smallBlind} disabled={disabled} onChange={(v) => set("smallBlind", v)} />
        <Num label="Big blind" value={draft.bigBlind} disabled={disabled} onChange={(v) => set("bigBlind", v)} />
        <Num label="Ante" value={draft.ante} disabled={disabled} onChange={(v) => set("ante", v)} />
        <Num label="Buy-in" value={draft.buyIn} disabled={disabled} onChange={(v) => set("buyIn", v)} />
        <Num label="Starting stack" value={draft.startingStack} disabled={disabled} onChange={(v) => set("startingStack", v)} />
        <Num label="Min seats" value={draft.minSeats} disabled={disabled} onChange={(v) => set("minSeats", v)} />
        <Num label="Max seats" value={draft.maxSeats} disabled={disabled} onChange={(v) => set("maxSeats", v)} />
        <Num label="Action timer (s)" value={draft.actionTimerSeconds} disabled={disabled} onChange={(v) => set("actionTimerSeconds", v)} />
        <Num label="Large-bet confirm %" value={draft.largeBetThresholdPct} disabled={disabled} onChange={(v) => set("largeBetThresholdPct", v)} />
      </Section>

      <Section title="Straddle">
        <Toggle label="Enabled" value={draft.straddle.enabled} disabled={disabled} onChange={(v) => set("straddle", { ...draft.straddle, enabled: v })} />
        <Num label="Amount" value={draft.straddle.amount} disabled={disabled} onChange={(v) => set("straddle", { ...draft.straddle, amount: v })} />
        <Pick
          label="Position"
          value={draft.straddle.mode}
          options={["off", "utg", "button"]}
          disabled={disabled}
          onChange={(v) => set("straddle", { ...draft.straddle, mode: v as RoomSettings["straddle"]["mode"] })}
        />
      </Section>

      <Section title="7-2 bounty (every hand)">
        <Toggle label="Enabled" value={draft.sevenTwo.enabled} disabled={disabled} onChange={(v) => set("sevenTwo", { ...draft.sevenTwo, enabled: v })} />
        <Num label="Bounty" value={draft.sevenTwo.bounty} disabled={disabled} onChange={(v) => set("sevenTwo", { ...draft.sevenTwo, bounty: v })} />
        <Num label="Suited bonus" value={draft.sevenTwo.suitedBonus} disabled={disabled} onChange={(v) => set("sevenTwo", { ...draft.sevenTwo, suitedBonus: v })} />
        <Toggle label="Pay only at showdown" value={draft.sevenTwo.requireShowdown} disabled={disabled} onChange={(v) => set("sevenTwo", { ...draft.sevenTwo, requireShowdown: v })} />
      </Section>

      <Section title="Custom one-hand modes">
        <Toggle label="Queue enabled" value={draft.custom.enabled} disabled={disabled} onChange={(v) => set("custom", { ...draft.custom, enabled: v })} />
        <Pick
          label="Who can queue"
          value={draft.custom.permission}
          options={["creator_only", "button", "everyone_with_cooldown"]}
          disabled={disabled}
          onChange={(v) => set("custom", { ...draft.custom, permission: v as RoomSettings["custom"]["permission"] })}
        />
        <Num label="Cooldown (hands)" value={draft.custom.cooldownHands} disabled={disabled} onChange={(v) => set("custom", { ...draft.custom, cooldownHands: v })} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ALL_CUSTOM_MODES.map((mode) => {
            const on = draft.custom.allowedModes.includes(mode);
            return (
              <button
                key={mode}
                disabled={disabled}
                onClick={() =>
                  set("custom", {
                    ...draft.custom,
                    allowedModes: on ? draft.custom.allowedModes.filter((m) => m !== mode) : [...draft.custom.allowedModes, mode],
                  })
                }
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "3px 7px",
                  borderRadius: 999,
                  border: `1px solid ${on ? D.gold : D.panelBorder}`,
                  background: on ? "rgba(201,165,74,0.2)" : "transparent",
                  color: on ? D.goldBright : D.sub,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                {on ? "✓ " : ""}
                {modeLabel(mode)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Table rules">
        <Pick
          label="Chip changes"
          value={draft.chipMode}
          options={["strict", "casual"]}
          disabled={disabled}
          onChange={(v) => set("chipMode", v as RoomSettings["chipMode"])}
        />
        <Toggle label="Self-service chips" value={draft.selfServiceChips} disabled={disabled} onChange={(v) => set("selfServiceChips", v)} />
        <Toggle label="Auto-approve chips" value={draft.autoApproveChips} disabled={disabled} onChange={(v) => set("autoApproveChips", v)} />
        <Toggle label="Spectators allowed" value={draft.spectatorsAllowed} disabled={disabled} onChange={(v) => set("spectatorsAllowed", v)} />
        <Toggle label="Room locked" value={draft.locked} disabled={disabled} onChange={(v) => set("locked", v)} />
      </Section>

      {isHost && (
        <button
          onClick={apply}
          disabled={!canEdit}
          style={{
            padding: "9px",
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 13,
            background: canEdit ? D.goldButton : "rgba(255,255,255,0.06)",
            color: canEdit ? D.ink : "rgba(255,255,255,0.3)",
            border: "none",
            cursor: canEdit ? "pointer" : "not-allowed",
          }}
        >
          {canEdit ? "Apply settings" : "Settings apply between hands"}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: D.gold }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: D.sub }}>{label}</span>
      {children}
    </div>
  );
}

function Num({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={{ ...fieldStyle, width: 80, borderRadius: 6, textAlign: "right", padding: "3px 6px" }}
      />
    </Row>
  );
}

function Toggle({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label}>
      <button
        disabled={disabled}
        onClick={() => onChange(!value)}
        style={{
          width: 44,
          height: 22,
          borderRadius: 999,
          background: value ? D.gold : "rgba(255,255,255,0.15)",
          border: "none",
          position: "relative",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span style={{ position: "absolute", top: 2, left: value ? 24 : 2, width: 18, height: 18, borderRadius: 999, background: "#fff", transition: "left 0.15s" }} />
      </button>
    </Row>
  );
}

function Pick({ label, value, options, disabled, onChange }: { label: string; value: string; options: string[]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...fieldStyle, borderRadius: 6, fontWeight: 700, padding: "3px 6px" }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </Row>
  );
}
