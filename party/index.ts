import type * as Party from "partykit/server";
import type { ClientCommand, ServerEvent } from "../src/modes/holdem/shared/types";
import { parseCommand } from "../src/modes/holdem/shared/validation";
import {
  type RoomInternal,
  createEmptyRoom,
  joinRoom,
  attachSocket,
  detachSocket,
  updateSettings,
  sit,
  setReady,
  startGame,
  act,
  requestChips,
  approveChips,
  queueMode,
  hostAction,
  addChat,
  endSession,
  snapshot,
  timeoutCurrentActor,
} from "../src/modes/holdem/engine/room";
import { ConnectionManager } from "./server/connectionManager";
import { RoomStorage } from "./server/roomStorage";
import { AlarmScheduler, EMPTY_ROOM_GRACE_MS } from "./server/alarmScheduler";
import { BotController } from "./bots";

/** Delay after a hand completes before the next hand auto-deals (shows the result). */
const AUTO_NEXT_HAND_MS = 4500;

/**
 * PartyKit poker server — one Durable Object per room code. Owns a single
 * server-authoritative `RoomInternal`, validates inbound commands, routes them
 * to the pure engine, and pushes a per-connection masked snapshot after every
 * mutation (each player only ever receives their own hole cards).
 */
export default class PokerServer implements Party.Server {
  private poker: RoomInternal;
  private conns = new ConnectionManager();
  /** connection id -> playerId binding (rebuilt on join; not persisted). */
  private connPlayer = new Map<string, string>();
  private storageHelper: RoomStorage;
  private alarmScheduler: AlarmScheduler;
  private botController: BotController;
  /** When set, the next hand auto-deals at this time (continuous play). */
  private autoStartAt: number | null = null;

  constructor(readonly room: Party.Room) {
    this.poker = createEmptyRoom(room.id);
    this.storageHelper = new RoomStorage(room);
    this.alarmScheduler = new AlarmScheduler(room);
    this.botController = this.makeBotController();
  }

  private makeBotController(): BotController {
    return new BotController({
      getRoom: () => this.poker,
      onChanged: () => this.broadcast(),
      persistBotMeta: (meta) => {
        void this.storageHelper.saveBotMeta(meta);
      },
    });
  }

  async onStart(): Promise<void> {
    try {
      const stored = await this.storageHelper.loadRoom();
      if (stored) {
        this.poker = stored;
        // Everyone comes back disconnected; reconnect (join) re-binds them.
        for (const player of this.poker.players.values()) {
          player.socketIds.clear();
          player.ready = false;
          if (player.seat !== null && player.status === "seated") player.status = "disconnected";
        }
      }
      const meta = await this.storageHelper.loadBotMeta();
      this.botController.rehydrate(this.poker, meta);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poker] failed to load persisted room, starting fresh", err);
      this.poker = createEmptyRoom(this.room.id);
    }
    await this.alarmScheduler.schedule(this.poker);
  }

  onConnect(conn: Party.Connection): void {
    this.conns.add(conn);
  }

  onClose(conn: Party.Connection): void {
    this.conns.remove(conn.id);
    const playerId = this.connPlayer.get(conn.id);
    this.connPlayer.delete(conn.id);
    if (playerId) {
      detachSocket(this.poker, conn.id);
      this.maybeReassignHost(playerId);
      this.broadcast();
    }
    // With no humans connected, pause progression: stop bots and auto-deal.
    if (this.conns.size() === 0) {
      this.botController.dispose();
      this.autoStartAt = null;
      void this.alarmScheduler.schedule(this.poker, null);
    }
  }

  onMessage(message: string, sender: Party.Connection): void {
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      return;
    }
    const command = parseCommand(raw);
    if (!command) {
      this.sendError(sender, "Malformed command.");
      return;
    }
    this.handleCommand(command, sender);
  }

  async onAlarm(): Promise<void> {
    // Idle room with no humans: free storage so it doesn't linger, then hibernate.
    if (this.conns.size() === 0) {
      if (this.poker.emptySince !== null && Date.now() - this.poker.emptySince > EMPTY_ROOM_GRACE_MS) {
        try {
          await this.room.storage.deleteAll();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    let changed = false;
    const hand = this.poker.hand;
    if (
      this.poker.lifecycle === "playing" &&
      hand &&
      hand.phase !== "complete" &&
      hand.currentTurnSeat !== null &&
      hand.turnStartedAt !== null &&
      this.poker.settings.actionTimerSeconds > 0 &&
      Date.now() >= hand.turnStartedAt + this.poker.settings.actionTimerSeconds * 1000
    ) {
      changed = timeoutCurrentActor(this.poker);
    }
    if (this.autoStartAt !== null && Date.now() >= this.autoStartAt) {
      this.autoStartAt = null;
      changed = this.tryAutoStartNextHand() || changed;
    }
    if (changed) this.broadcast();
    else await this.alarmScheduler.schedule(this.poker, this.autoStartAt);
  }

  /** Auto-deal the next hand on behalf of the host once a hand has completed. */
  private tryAutoStartNextHand(): boolean {
    const host = this.poker.players.get(this.poker.hostId);
    if (!host) return false;
    return startGame(this.poker, host).ok;
  }

  /** Arm/disarm the auto-deal timer based on whether a completed hand is showing. */
  private refreshAutoStart(): void {
    const hand = this.poker.hand;
    if (this.conns.size() > 0 && this.poker.lifecycle === "playing" && hand && hand.phase === "complete") {
      if (this.autoStartAt === null) this.autoStartAt = Date.now() + AUTO_NEXT_HAND_MS;
    } else {
      this.autoStartAt = null;
    }
  }

  // ---- command routing -------------------------------------------------

  private handleCommand(command: ClientCommand, conn: Party.Connection): void {
    if (command.type === "join") {
      this.handleJoin(command, conn);
      return;
    }
    if (command.type === "leave") {
      conn.close();
      return;
    }
    if (command.type === "addBot") {
      const result = this.botController.addBot(this.poker);
      if (!result.ok) this.sendError(conn, result.error, command.reqId);
      else this.broadcast();
      return;
    }
    if (command.type === "removeBot") {
      this.botController.removeBot(this.poker, command.playerId);
      this.broadcast();
      return;
    }

    const playerId = this.connPlayer.get(conn.id);
    const player = playerId ? this.poker.players.get(playerId) : undefined;
    if (!player) {
      this.sendError(conn, "Join the room first.", command.reqId);
      return;
    }

    switch (command.type) {
      case "updateSettings":
        this.reply(conn, command, updateSettings(this.poker, player, command.patch));
        break;
      case "sit":
        this.reply(conn, command, sit(this.poker, player, command.seat));
        break;
      case "ready":
        this.reply(conn, command, setReady(this.poker, player, command.ready));
        break;
      case "startGame":
        this.reply(conn, command, startGame(this.poker, player));
        break;
      case "act":
        this.reply(conn, command, act(this.poker, player, { action: command.action, amount: command.amount, nonce: command.nonce }));
        break;
      case "requestChips":
        this.reply(conn, command, requestChips(this.poker, player, command.amount, command.reason));
        break;
      case "approveChips":
        this.reply(conn, command, approveChips(this.poker, player, command.playerId, command.amount, command.reason));
        break;
      case "queueMode":
        this.reply(conn, command, queueMode(this.poker, player, command.mode));
        break;
      case "hostAction": {
        const result = hostAction(this.poker, player, { action: command.action, playerId: command.playerId, value: command.value });
        if (result.ok && "invalidatedSocketIds" in result && Array.isArray(result.invalidatedSocketIds)) {
          this.disconnectKicked(result.invalidatedSocketIds);
        }
        this.reply(conn, command, result);
        break;
      }
      case "chat":
        this.reply(conn, command, addChat(this.poker, player, command.message));
        break;
      case "endSession": {
        const result = endSession(this.poker, player);
        if (result.ok) {
          this.send(conn, { type: "export", exportText: result.exportText, exportJson: result.exportJson, reqId: command.reqId });
          this.broadcast();
        } else {
          this.sendError(conn, result.error, command.reqId);
        }
        break;
      }
    }
  }

  private handleJoin(command: Extract<ClientCommand, { type: "join" }>, conn: Party.Connection): void {
    const result = joinRoom(this.poker, command.name, command.sessionToken, command.spectator);
    if (!result.ok) {
      this.sendError(conn, result.error, command.reqId);
      return;
    }
    this.connPlayer.set(conn.id, result.playerId);
    attachSocket(this.poker, result.playerId, conn.id);
    this.send(conn, { type: "welcome", playerId: result.playerId, sessionToken: result.sessionToken });
    this.broadcast();
  }

  // ---- result + broadcast plumbing ------------------------------------

  private reply(conn: Party.Connection, command: ClientCommand, result: { ok: true } | { ok: false; error: string }): void {
    if (result.ok) {
      this.broadcast();
    } else {
      this.sendError(conn, result.error, "reqId" in command ? command.reqId : undefined);
    }
  }

  private broadcast(): void {
    this.refreshAutoStart();
    for (const conn of this.conns.values()) {
      const playerId = this.connPlayer.get(conn.id);
      const snap = snapshot(this.poker, playerId);
      this.send(conn, { type: "snapshot", publicState: snap.publicState, privateState: snap.privateState });
    }
    if (this.conns.size() > 0) this.botController.notifyStateChanged();
    void this.persist();
    void this.alarmScheduler.schedule(this.poker, this.autoStartAt);
  }

  private async persist(): Promise<void> {
    try {
      await this.storageHelper.saveRoom(this.poker);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poker] persist failed", err);
    }
  }

  private disconnectKicked(connIds: string[]): void {
    for (const connId of connIds) {
      const conn = [...this.conns.values()].find((c) => c.id === connId);
      this.connPlayer.delete(connId);
      if (conn) {
        this.send(conn, { type: "kicked", message: "You were removed from this private room by the host." });
        conn.close();
      }
    }
  }

  /** When the host leaves the lobby, hand the badge to another connected seated player. */
  private maybeReassignHost(leavingPlayerId: string): void {
    const room = this.poker;
    if (room.hostId !== leavingPlayerId) return;
    if (room.lifecycle === "ended") return;
    // Only hand the host badge to another connected human — never a bot, and
    // never a disconnected player (the leaving host reclaims it on reconnect).
    const candidate = [...room.players.values()].find(
      (p) => p.id !== leavingPlayerId && !p.isBot && p.socketIds.size > 0 && !p.spectator && !p.banned
    );
    if (!candidate) return;
    const previous = room.players.get(leavingPlayerId);
    if (previous) previous.isHost = false;
    candidate.isHost = true;
    room.hostId = candidate.id;
  }

  private send(conn: Party.Connection, event: ServerEvent): void {
    conn.send(JSON.stringify(event));
  }

  private sendError(conn: Party.Connection, message: string, reqId?: string): void {
    this.send(conn, { type: "error", message, reqId });
  }
}
