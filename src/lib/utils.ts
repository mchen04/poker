import { ROOM_CODE_LENGTH } from "./constants";
import type { Card, Rank, RoomPublicState, Suit } from "@/modes/holdem/shared/types";

/** Seated players who are ready and funded — the pool a hand can be dealt from. */
export function seatedReadyCount(state: RoomPublicState): number {
  return state.players.filter((p) => p.seat !== null && p.ready && p.stack > 0).length;
}

/** Whether the host may deal a hand right now. */
export function canStartGame(state: RoomPublicState, isHost: boolean): boolean {
  return isHost && state.lifecycle !== "ended" && seatedReadyCount(state) >= state.settings.minSeats;
}

/** Generate a fresh room code (the PartyKit room id) for "Host a game". */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** Parse an engine card string (e.g. "Th") into display parts. */
export function parseCard(card: Card): { symbol: string; red: boolean; label: string } {
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;
  return {
    symbol: SUIT_SYMBOL[suit],
    red: suit === "h" || suit === "d",
    label: rank === "T" ? "10" : rank,
  };
}

/** Format a chip count with thousands separators. */
export function chips(amount: number): string {
  return amount.toLocaleString("en-US");
}
