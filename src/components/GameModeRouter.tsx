"use client";

/**
 * Routes the room shell to a loading/error screen or the live poker room.
 * Poker has a single mode, so this is a thin guard over <RoomView/>.
 */

import { useGameSession } from "@/contexts/GameSession";
import { RoomView } from "@/components/poker/RoomView";
import LoadingScreen from "@/components/LoadingScreen";
import ConnectionErrorScreen from "@/components/ConnectionErrorScreen";

export function GameModeRouter() {
  const { code, publicState, myId, connectionError } = useGameSession();

  if (connectionError) return <ConnectionErrorScreen message={connectionError} />;
  if (!publicState || !myId) return <LoadingScreen code={code} />;
  return <RoomView />;
}
