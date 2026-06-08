/**
 * AlarmScheduler — computes when the DO alarm should next fire for a poker
 * room. Two candidates:
 *
 *   1. action-clock expiry (turnStartedAt + actionTimerSeconds) for the seat
 *      currently to act, and
 *   2. the next-hand auto-deal time (autoStartAt) during continuous play.
 *
 * If neither applies, the alarm is deleted so the DO can hibernate. (Empty-room
 * cleanup is handled separately in the server's onClose/onAlarm using the
 * persisted room.emptySince + EMPTY_ROOM_GRACE_MS, so it survives hibernation.)
 */

import type * as Party from "partykit/server";
import type { RoomInternal } from "../../src/modes/holdem/engine/room";

export const EMPTY_ROOM_GRACE_MS = 60 * 60 * 1000;

export class AlarmScheduler {
  private lastTarget: number | null = null;

  constructor(private room: Party.Room) {}

  async schedule(room: RoomInternal, autoStartAt: number | null = null): Promise<void> {
    const candidates: number[] = [];
    const hand = room.hand;
    if (
      room.lifecycle === "playing" &&
      hand &&
      hand.phase !== "complete" &&
      hand.currentTurnSeat !== null &&
      hand.turnStartedAt !== null &&
      room.settings.actionTimerSeconds > 0
    ) {
      candidates.push(hand.turnStartedAt + room.settings.actionTimerSeconds * 1000);
    }
    if (autoStartAt !== null) {
      candidates.push(autoStartAt);
    }
    try {
      if (candidates.length === 0) {
        if (this.lastTarget !== null) {
          await this.room.storage.deleteAlarm();
          this.lastTarget = null;
        }
        return;
      }
      const next = Math.max(Date.now() + 100, Math.min(...candidates));
      if (this.lastTarget === next) return;
      await this.room.storage.setAlarm(next);
      this.lastTarget = next;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poker] AlarmScheduler.schedule failed", err);
    }
  }

  /** Force-refresh on next call; use when state was replaced. */
  invalidate(): void {
    this.lastTarget = null;
  }
}
