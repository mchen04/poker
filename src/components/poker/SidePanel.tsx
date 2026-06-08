"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientCommand, CustomModeName, HostActionName, RoomPublicState } from "@/modes/holdem/shared/types";
import { modeLabel } from "@/modes/holdem/shared/modes";
import { chips } from "@/lib/utils";
import { D } from "@/lib/theme";
import { HostSettings } from "./HostSettings";

type Tab = "players" | "modes" | "log" | "chat" | "settings";
const TABS: Tab[] = ["players", "modes", "log", "chat", "settings"];

export function SidePanel({
  publicState,
  myId,
  send,
}: {
  publicState: RoomPublicState;
  myId: string | null;
  send: (cmd: ClientCommand) => void;
}) {
  const [tab, setTab] = useState<Tab>("players");
  const me = publicState.players.find((p) => p.id === myId);
  const isHost = me?.isHost ?? false;
  const canEditSettings = !(publicState.hand && publicState.hand.phase !== "complete") && publicState.lifecycle !== "ended";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "rgba(8,26,16,0.92)", borderLeft: "1px solid rgba(201,165,74,0.2)" }}>
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 2px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: tab === t ? "rgba(201,165,74,0.14)" : "transparent",
              color: tab === t ? D.goldBright : D.sub,
              border: "none",
              borderBottom: tab === t ? `2px solid ${D.gold}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
        {tab === "players" && <PlayersTab publicState={publicState} myId={myId} isHost={isHost} send={send} />}
        {tab === "modes" && <ModesTab publicState={publicState} send={send} />}
        {tab === "log" && <LogTab publicState={publicState} />}
        {tab === "chat" && <ChatTab publicState={publicState} myId={myId} send={send} />}
        {tab === "settings" && <HostSettings settings={publicState.settings} isHost={isHost} canEdit={canEditSettings} send={send} />}
      </div>
    </div>
  );
}

function PlayersTab({ publicState, myId, isHost, send }: { publicState: RoomPublicState; myId: string | null; isHost: boolean; send: (cmd: ClientCommand) => void }) {
  const [amount, setAmount] = useState(publicState.settings.buyIn);
  const me = publicState.players.find((p) => p.id === myId);
  const hostAction = (action: HostActionName, playerId?: string, value?: boolean) => send({ type: "hostAction", action, playerId, value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      {publicState.players.map((p) => (
        <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 7, borderRadius: 9, background: "rgba(0,0,0,0.3)", border: `1px solid ${p.id === myId ? "rgba(201,165,74,0.5)" : "rgba(255,255,255,0.07)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, color: D.goldBright }}>
              {p.isHost ? "👑 " : ""}{p.name}{p.id === myId ? " (you)" : ""}
            </span>
            <span style={{ fontWeight: 900 }}>{chips(p.stack)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: D.sub, fontSize: 10 }}>
            <span>{p.seat !== null ? `Seat ${p.seat + 1}` : "Unseated"} · {p.status}{p.ready ? " · ready" : ""}</span>
            <span style={{ color: p.upDown > 0 ? D.accent : p.upDown < 0 ? D.danger : D.muted }}>{p.upDown >= 0 ? "+" : ""}{chips(p.upDown)}</span>
          </div>
          {isHost && p.chipRequest !== null && (
            <button onClick={() => send({ type: "approveChips", playerId: p.id, amount: p.chipRequest ?? 0, reason: "host approved" })} style={btn(D.goldButton, "#2a1a08")}>
              Approve {chips(p.chipRequest)} chips
            </button>
          )}
          {isHost && p.id !== myId && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <MiniBtn label={p.muted ? "Unmute" : "Mute"} onClick={() => hostAction("mute", p.id, !p.muted)} />
              <MiniBtn label={p.forcedSitOut ? "Sit in" : "Sit out"} onClick={() => hostAction("forceSitOut", p.id, !p.forcedSitOut)} />
              <MiniBtn label="Transfer host" onClick={() => hostAction("transferHost", p.id)} />
              <MiniBtn label="Kick" tone="danger" onClick={() => hostAction("kick", p.id)} />
              <MiniBtn label="Ban" tone="danger" onClick={() => hostAction("ban", p.id)} />
            </div>
          )}
        </div>
      ))}

      {/* Self chip request / rebuy */}
      {me && me.seat !== null && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.4)", border: `1px solid ${D.panelBorder}`, borderRadius: 7, color: D.goldBright, fontWeight: 800, textAlign: "center", padding: "5px" }}
          />
          <button onClick={() => send({ type: "requestChips", amount, reason: "rebuy" })} style={btn("rgba(255,255,255,0.08)", D.goldBright)}>
            {publicState.settings.selfServiceChips ? "Add chips" : "Request chips"}
          </button>
        </div>
      )}

      {isHost && (
        <button onClick={() => send({ type: "addBot" })} style={btn("rgba(47,184,115,0.2)", "#fff")}>+ Add bot</button>
      )}
    </div>
  );
}

function ModesTab({ publicState, send }: { publicState: RoomPublicState; send: (cmd: ClientCommand) => void }) {
  const allowed = publicState.settings.custom.allowedModes;
  const queued = publicState.queuedMode;
  const enabled = publicState.settings.custom.enabled;
  const ALL: CustomModeName[] = ["holdem", "omaha4", "bomb_pot", "show_one", "seven_two"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      <div style={{ color: D.sub }}>Queue a one-hand variant for the next hand.</div>
      {queued && (
        <div style={{ padding: 8, borderRadius: 8, background: "rgba(201,165,74,0.16)", border: `1px solid ${D.gold}`, color: D.goldBright, fontWeight: 800 }}>
          Next hand: {queued.label} (by {queued.queuedByName})
        </div>
      )}
      {!enabled && <div style={{ color: D.muted }}>Custom queue is disabled.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {ALL.map((mode) => {
          const ok = enabled && allowed.includes(mode);
          return (
            <button
              key={mode}
              disabled={!ok || Boolean(queued)}
              onClick={() => send({ type: "queueMode", mode })}
              style={{
                padding: "8px",
                borderRadius: 8,
                fontWeight: 800,
                textAlign: "left",
                background: queued?.id ? "rgba(255,255,255,0.05)" : ok ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${D.panelBorder}`,
                color: ok && !queued ? D.goldBright : D.muted,
                cursor: ok && !queued ? "pointer" : "not-allowed",
              }}
            >
              {modeLabel(mode)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LogTab({ publicState }: { publicState: RoomPublicState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [publicState.audit.length]);
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }}>
      {publicState.audit.slice(-120).map((entry) => (
        <div key={entry.id} style={{ color: D.sub, lineHeight: 1.3 }}>
          <span style={{ color: D.muted, fontWeight: 700 }}>[{entry.type}]</span> {entry.message}
        </div>
      ))}
    </div>
  );
}

function ChatTab({ publicState, myId, send }: { publicState: RoomPublicState; myId: string | null; send: (cmd: ClientCommand) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [publicState.chat.length]);
  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ type: "chat", message: trimmed });
    setText("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 6 }}>
      <div ref={ref} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
        {publicState.chat.map((entry) => (
          <div key={entry.id} style={{ lineHeight: 1.3 }}>
            <span style={{ fontWeight: 800, color: entry.system ? D.muted : entry.playerId === myId ? D.goldBright : D.sub }}>{entry.playerName}: </span>
            <span style={{ color: entry.system ? D.muted : "#e8eee9", fontStyle: entry.system ? "italic" : "normal" }}>{entry.message}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={240}
          placeholder="Message…"
          style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.4)", border: `1px solid ${D.panelBorder}`, borderRadius: 8, color: "#fff", padding: "6px 8px", outline: "none" }}
        />
        <button onClick={submit} style={btn("rgba(255,255,255,0.08)", D.goldBright)}>Send</button>
      </div>
    </div>
  );
}

function MiniBtn({ label, onClick, tone }: { label: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        fontWeight: 800,
        padding: "3px 7px",
        borderRadius: 6,
        background: tone === "danger" ? "rgba(192,96,96,0.2)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${tone === "danger" ? "rgba(192,96,96,0.5)" : D.panelBorder}`,
        color: tone === "danger" ? "#f0b0b0" : D.text,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function btn(bg: string, color: string): React.CSSProperties {
  return { padding: "6px 10px", borderRadius: 7, fontWeight: 800, fontSize: 12, background: bg, color, border: "none", cursor: "pointer", whiteSpace: "nowrap" };
}
