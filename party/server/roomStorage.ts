/**
 * RoomStorage — versioned persistence for the poker RoomInternal. The engine's
 * room holds Maps/Sets (players, participants, bannedTokens), so we serialize
 * to plain JSON-friendly shapes and reconstruct on load. Live socket ids are
 * transient and never persisted — players come back disconnected and re-bind
 * on reconnect.
 */

import type * as Party from "partykit/server";
import type { HandInternal, ParticipantInternal, PlayerInternal, RoomInternal } from "../../src/modes/holdem/engine/room";

const STORAGE_KEY_ROOM = "pokerRoom";
const STORAGE_KEY_BOT_META = "botMeta";
const SCHEMA_VERSION = 1;

interface StoredRoom {
  v: number;
  room: Omit<RoomInternal, "players" | "bannedTokens" | "hand"> & {
    players: Array<[string, Omit<PlayerInternal, "socketIds">]>;
    bannedTokens: string[];
    hand: (Omit<HandInternal, "participants"> & { participants: Array<[number, ParticipantInternal]> }) | null;
  };
}

export class RoomStorage {
  constructor(private room: Party.Room) {}

  async loadRoom(): Promise<RoomInternal | null> {
    const raw = await this.room.storage.get<StoredRoom>(STORAGE_KEY_ROOM);
    if (!raw || raw.v !== SCHEMA_VERSION) return null;
    const stored = raw.room;
    const players = new Map<string, PlayerInternal>(
      stored.players.map(([id, player]) => [id, { ...player, socketIds: new Set<string>() }])
    );
    const hand: HandInternal | null = stored.hand
      ? { ...stored.hand, participants: new Map<number, ParticipantInternal>(stored.hand.participants.map(([seat, part]) => [Number(seat), part])) }
      : null;
    return { ...stored, players, bannedTokens: new Set(stored.bannedTokens), hand };
  }

  async saveRoom(room: RoomInternal): Promise<void> {
    const stored: StoredRoom = {
      v: SCHEMA_VERSION,
      room: {
        ...room,
        players: [...room.players.entries()].map(([id, player]) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { socketIds, ...rest } = player;
          return [id, rest];
        }),
        bannedTokens: [...room.bannedTokens],
        hand: room.hand ? { ...room.hand, participants: [...room.hand.participants.entries()] } : null
      }
    };
    await this.room.storage.put(STORAGE_KEY_ROOM, stored);
  }

  async loadBotMeta(): Promise<Record<string, unknown>> {
    return (await this.room.storage.get<Record<string, unknown>>(STORAGE_KEY_BOT_META)) ?? {};
  }

  async saveBotMeta(meta: Record<string, unknown>): Promise<void> {
    await this.room.storage.put(STORAGE_KEY_BOT_META, meta);
  }
}
