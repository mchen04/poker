"use client";

/**
 * GameSession — per-room PartyKit socket lifecycle for poker. Owns identity
 * (server-issued sessionToken, persisted per room for reconnect), the latest
 * masked snapshot (public + private state), command sending, and the
 * end-session export download. Components reach for `useGameSession()` rather
 * than threading socket props.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import PartySocket from "partysocket";
import type { ClientCommand, PrivateState, RoomPublicState, ServerEvent } from "@/modes/holdem/shared/types";
import { TOAST_DURATION_MS } from "@/lib/constants";

export interface GameSessionValue {
  code: string;
  myId: string | null;
  publicState: RoomPublicState | null;
  privateState: PrivateState | null;
  connectionError: string | null;
  /** Transient error/notice toast text (auto-clears). */
  notice: string | null;
  send(cmd: ClientCommand): void;
  leave(): void;
}

const Ctx = createContext<GameSessionValue | null>(null);

export function useGameSession(): GameSessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useGameSession must be used inside <GameSessionProvider>");
  return value;
}

const nameKey = "poker-player-name";
const tokenKey = (code: string) => `poker-session:${code}`;

function downloadFile(filename: string, content: string, type: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GameSessionProvider({
  code,
  playerName,
  children,
}: {
  code: string;
  playerName: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [publicState, setPublicState] = useState<RoomPublicState | null>(null);
  const [privateState, setPrivateState] = useState<PrivateState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<PartySocket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!playerName) return;
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
    const socket = new PartySocket({ host, room: code });
    socketRef.current = socket;

    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const w = window as unknown as Record<string, unknown>;
      w.__pokerSend = (cmd: ClientCommand) => socket.send(JSON.stringify(cmd));
      w.__pokerPublic = () => publicStateRef.current;
      w.__pokerPrivate = () => privateStateRef.current;
      w.__pokerMyId = () => myIdRef.current;
    }

    socket.addEventListener("open", () => {
      // A successful (re)connect clears any prior transient connection error;
      // PartySocket auto-reconnects, so the error screen must not stick.
      setConnectionError(null);
      const sessionToken = typeof window !== "undefined" ? sessionStorage.getItem(tokenKey(code)) ?? undefined : undefined;
      socket.send(JSON.stringify({ type: "join", name: playerName, sessionToken } satisfies ClientCommand));
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      let msg: ServerEvent;
      try {
        msg = JSON.parse(event.data as string) as ServerEvent;
      } catch {
        return;
      }
      switch (msg.type) {
        case "welcome":
          setMyId(msg.playerId);
          if (typeof window !== "undefined") sessionStorage.setItem(tokenKey(code), msg.sessionToken);
          break;
        case "snapshot":
          setPublicState(msg.publicState);
          setPrivateState(msg.privateState);
          break;
        case "export":
          downloadFile(`poker-session-${code}.txt`, msg.exportText, "text/plain");
          downloadFile(`poker-session-${code}.json`, msg.exportJson, "application/json");
          showNotice("Session exported (TXT + JSON downloaded).");
          break;
        case "kicked":
          socketRef.current?.close();
          if (typeof window !== "undefined") sessionStorage.removeItem(tokenKey(code));
          router.push("/");
          break;
        case "error":
          // Errors before we have an id are fatal join failures; after, they
          // are gameplay rejections shown as a transient toast.
          if (!myIdRef.current) setConnectionError(msg.message);
          else showNotice(msg.message);
          break;
      }
    });

    socket.addEventListener("error", () => {
      setConnectionError("Connection error. Please try again.");
    });

    return () => {
      socket.close();
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        const w = window as unknown as Record<string, unknown>;
        delete w.__pokerSend;
        delete w.__pokerPublic;
        delete w.__pokerPrivate;
        delete w.__pokerMyId;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName, code, router, showNotice]);

  // Refs mirror state for the dev hooks + closures.
  const publicStateRef = useRef<RoomPublicState | null>(null);
  const privateStateRef = useRef<PrivateState | null>(null);
  useEffect(() => { publicStateRef.current = publicState; }, [publicState]);
  useEffect(() => { privateStateRef.current = privateState; }, [privateState]);

  const send = useCallback((cmd: ClientCommand): void => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const leave = useCallback((): void => {
    send({ type: "leave" });
    socketRef.current?.close();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(tokenKey(code));
      sessionStorage.removeItem(nameKey);
    }
    router.push("/");
  }, [send, router, code]);

  const value: GameSessionValue = {
    code,
    myId,
    publicState,
    privateState,
    connectionError,
    notice,
    send,
    leave,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
