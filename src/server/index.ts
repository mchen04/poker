import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketResult } from '../shared/types';
import {
  act,
  addChat,
  approveChips,
  attachSocket,
  createRoom,
  detachSocket,
  endSession,
  getRoom,
  hostAction,
  joinRoom,
  playerInRoom,
  publicState,
  queueMode,
  requestChips,
  setReady,
  sit,
  snapshot,
  startGame,
  updateSettings
} from './room';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: true,
    credentials: true
  },
  maxHttpBufferSize: 16_384
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../dist');
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: [...getActiveRoomCodes()] });
});
app.use(express.static(clientDist));
app.use((_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

function getActiveRoomCodes(): string[] {
  const state: string[] = [];
  // Kept intentionally indirect so room internals stay in room.ts.
  return state;
}

function emitRoom(code: string): void {
  const room = getRoom(code);
  if (!room) return;
  room.players.forEach((player) => {
    player.socketIds.forEach((socketId) => {
      io.to(socketId).emit('snapshot', snapshot(room, player.id));
    });
  });
}

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

io.on('connection', (socket) => {
  socket.on('createRoom', (payload, ack) => {
    const result = createRoom(payload?.name ?? '', payload?.roomName);
    if (!result.ok) return ack(result);
    const room = getRoom(result.code);
    if (!room) return ack(fail('Room creation failed.'));
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    attachSocket(room, result.playerId, socket.id);
    ack(result);
    emitRoom(result.code);
  });

  socket.on('joinRoom', (payload, ack) => {
    const result = joinRoom(payload?.code ?? '', payload?.name ?? '', payload?.password, payload?.sessionToken, payload?.spectator);
    if (!result.ok) return ack(result);
    const room = getRoom(result.code);
    if (!room) return ack(fail('Room not found.'));
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    attachSocket(room, result.playerId, socket.id);
    ack(result);
    emitRoom(result.code);
  });

  socket.on('updateSettings', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => updateSettings(room, player, payload));
  });

  socket.on('sit', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => sit(room, player, payload.seat));
  });

  socket.on('ready', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => setReady(room, player, Boolean(payload.ready)));
  });

  socket.on('startGame', (_payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => startGame(room, player));
  });

  socket.on('act', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => act(room, player, payload));
  });

  socket.on('requestChips', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => requestChips(room, player, payload.amount, payload.reason));
  });

  socket.on('approveChips', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => approveChips(room, player, payload.playerId, payload.amount, payload.reason));
  });

  socket.on('queueMode', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => queueMode(room, player, payload.mode));
  });

  socket.on('hostAction', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => hostAction(room, player, payload));
  });

  socket.on('chat', (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => addChat(room, player, payload.message));
  });

  socket.on('endSession', (_payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => endSession(room, player), false);
  });

  socket.on('disconnect', () => {
    const changed = detachSocket(socket.id);
    changed.forEach((room) => emitRoom(room.code));
  });
});

function withPlayer<T extends SocketResult>(
  code: string | undefined,
  playerId: string | undefined,
  ack: (result: SocketResult<any>) => void,
  run: (room: NonNullable<ReturnType<typeof getRoom>>, player: NonNullable<ReturnType<typeof playerInRoom>>) => T,
  shouldEmit = true
): void {
  if (!code || !playerId) {
    ack(fail('Join a room first.'));
    return;
  }
  const room = getRoom(code);
  if (!room) {
    ack(fail('Room not found.'));
    return;
  }
  const player = playerInRoom(room, playerId);
  if (!player) {
    ack(fail('Player not found.'));
    return;
  }
  const result = run(room, player);
  ack(result);
  if (shouldEmit || result.ok) emitRoom(code);
}

const port = Number(process.env.PORT ?? 3001);
server.listen(port, () => {
  console.log(`Poker server listening on http://localhost:${port}`);
});
