/**
 * ConnectionManager — owns the live WebSocket map. The poker server keeps a
 * separate connection-id -> playerId binding, so this stays a thin Map wrapper.
 */

import type * as Party from "partykit/server";

export class ConnectionManager {
  private connections: Map<string, Party.Connection> = new Map();

  add(conn: Party.Connection): void {
    this.connections.set(conn.id, conn);
  }

  remove(connId: string): void {
    this.connections.delete(connId);
  }

  /** Number of currently-live connections. */
  size(): number {
    return this.connections.size;
  }

  /** Iterate the live connections. */
  values(): IterableIterator<Party.Connection> {
    return this.connections.values();
  }
}
