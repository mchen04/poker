/**
 * BotController — drives AI poker players. Bots are ordinary engine players
 * (added via `joinRoom`) marked with a synthetic connection id so they read as
 * connected. On every state change the controller schedules a "think" delay for
 * whichever bot is to act, then plays a legal action chosen by the adversarial
 * brain. Between hands it keeps bots seated, ready, and topped-up so continuous
 * play does not stall. Bots act through the same `act()` path as humans.
 */
import { type RoomInternal, joinRoom, sit, setReady, requestChips, act } from "../src/modes/holdem/engine/room";
import type { SocketResult } from "../src/modes/holdem/shared/types";
import { decideBotAction, pickBotName, randomBotMeta, type BotMeta } from "../src/modes/holdem/bot";

interface BotControllerOptions {
  getRoom: () => RoomInternal;
  onChanged: () => void;
  persistBotMeta: (meta: Record<string, BotMeta>) => void;
}

const THINK_MIN_MS = 650;
const THINK_MAX_MS = 1700;
const MAINTAIN_DEBOUNCE_MS = 40;

export class BotController {
  private meta: Record<string, BotMeta> = {};
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private maintainScheduled = false;

  constructor(private opts: BotControllerOptions) {}

  /** Re-attach bot connection markers + restore personalities after hibernation. */
  rehydrate(room: RoomInternal, meta: Record<string, unknown>): void {
    this.meta = (meta as Record<string, BotMeta>) ?? {};
    for (const id of Object.keys(this.meta)) {
      const bot = room.players.get(id);
      if (bot) bot.socketIds.add(`bot:${id}`);
      else delete this.meta[id];
    }
  }

  isBot(playerId: string): boolean {
    return playerId in this.meta;
  }

  addBot(room: RoomInternal): SocketResult {
    if (room.lifecycle === "ended") return { ok: false, error: "Session has ended." };
    if (Object.keys(this.meta).length >= room.settings.maxSeats) return { ok: false, error: "No seats left for another bot." };
    const name = pickBotName(room);
    const joined = joinRoom(room, name);
    if (!joined.ok) return joined;
    const bot = room.players.get(joined.playerId);
    if (!bot) return { ok: false, error: "Bot join failed." };
    bot.isBot = true;
    bot.socketIds.add(`bot:${bot.id}`);
    const seat = room.seats.findIndex((s) => s === null);
    if (seat >= 0) sit(room, bot, seat);
    setReady(room, bot, true);
    this.meta[bot.id] = randomBotMeta(name);
    this.opts.persistBotMeta(this.meta);
    return { ok: true };
  }

  removeBot(room: RoomInternal, playerId: string): void {
    if (!this.isBot(playerId)) return;
    const bot = room.players.get(playerId);
    if (bot && bot.seat !== null) room.seats[bot.seat] = null;
    room.players.delete(playerId);
    delete this.meta[playerId];
    const timer = this.timers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(playerId);
    }
    this.opts.persistBotMeta(this.meta);
  }

  /** Called after every broadcast: housekeeping + schedule the acting bot. */
  notifyStateChanged(): void {
    const room = this.opts.getRoom();
    if (this.maintainBots(room) && !this.maintainScheduled) {
      this.maintainScheduled = true;
      setTimeout(() => {
        this.maintainScheduled = false;
        this.opts.onChanged();
      }, MAINTAIN_DEBOUNCE_MS);
    }
    const hand = room.hand;
    if (!hand || hand.phase === "complete" || hand.currentTurnSeat === null) return;
    for (const id of Object.keys(this.meta)) {
      if (this.timers.has(id)) continue;
      const bot = room.players.get(id);
      if (!bot || bot.seat === null || hand.currentTurnSeat !== bot.seat) continue;
      const delay = THINK_MIN_MS + Math.floor(Math.random() * (THINK_MAX_MS - THINK_MIN_MS));
      const timer = setTimeout(() => {
        this.timers.delete(id);
        this.tick(id);
      }, delay);
      this.timers.set(id, timer);
    }
  }

  private tick(id: string): void {
    const room = this.opts.getRoom();
    const bot = room.players.get(id);
    if (!bot) return;
    const payload = decideBotAction(room, id, this.meta[id]);
    if (!payload) return;
    act(room, bot, payload);
    this.opts.onChanged();
  }

  /** Keep bots seated/ready/funded between hands. Returns true if it mutated state. */
  private maintainBots(room: RoomInternal): boolean {
    if (room.lifecycle === "ended") return false;
    const activeHand = Boolean(room.hand && room.hand.phase !== "complete");
    let changed = false;
    for (const id of Object.keys(this.meta)) {
      const bot = room.players.get(id);
      if (!bot) continue;
      if (bot.socketIds.size === 0) {
        bot.socketIds.add(`bot:${id}`);
        changed = true;
      }
      if (activeHand || bot.banned || bot.spectator || bot.forcedSitOut) continue;
      if (bot.seat === null) {
        const seat = room.seats.findIndex((s) => s === null);
        if (seat >= 0 && sit(room, bot, seat).ok) changed = true;
      }
      if (bot.seat !== null && bot.stack < room.settings.bigBlind) {
        if (requestChips(room, bot, room.settings.buyIn, "bot rebuy").ok) changed = true;
      }
      if (bot.seat !== null && bot.stack > 0 && !bot.ready) {
        if (setReady(room, bot, true).ok) changed = true;
      }
    }
    return changed;
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
