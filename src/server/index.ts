import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { z } from 'zod';
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
  rooms,
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
  res.json({
    ok: true,
    rooms: [...rooms.values()].map((room) => ({
      code: room.code,
      lifecycle: room.lifecycle,
      players: room.players.size,
      createdAt: room.createdAt
    }))
  });
});
app.use(express.static(clientDist));
app.use((_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

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

const customModes = ['holdem', 'omaha4', 'omaha5', 'bomb_pot', 'double_board', 'show_one', 'seven_two'] as const;
const settingsSchema = z
  .object({
    roomName: z.string().max(64).optional(),
    smallBlind: z.number().finite().optional(),
    bigBlind: z.number().finite().optional(),
    ante: z.number().finite().optional(),
    buyIn: z.number().finite().optional(),
    startingStack: z.number().finite().optional(),
    minSeats: z.number().finite().optional(),
    maxSeats: z.number().finite().optional(),
    actionTimerSeconds: z.number().finite().optional(),
    autoApproveChips: z.boolean().optional(),
    selfServiceChips: z.boolean().optional(),
    chipMode: z.enum(['strict', 'casual']).optional(),
    locked: z.boolean().optional(),
    spectatorsAllowed: z.boolean().optional(),
    straddle: z
      .object({
        enabled: z.boolean().optional(),
        amount: z.number().finite().optional(),
        mode: z.enum(['off', 'utg', 'button']).optional()
      })
      .optional(),
    custom: z
      .object({
        enabled: z.boolean().optional(),
        permission: z.enum(['creator_only', 'button', 'everyone_once_per_orbit']).optional(),
        cooldownHands: z.number().finite().optional(),
        allowedModes: z.array(z.enum(customModes)).max(customModes.length).optional()
      })
      .optional(),
    sevenTwo: z
      .object({
        enabled: z.boolean().optional(),
        bounty: z.number().finite().optional(),
        showdownOnly: z.boolean().optional(),
        suitedBonus: z.number().finite().optional()
      })
      .optional(),
    largeBetThresholdPct: z.number().finite().optional()
  })
  .strict();

const schemas = {
  createRoom: z.object({ name: z.string().max(64), roomName: z.string().max(64).optional() }).strict(),
  joinRoom: z.object({ code: z.string().max(80), name: z.string().max(64), sessionToken: z.string().max(80).optional(), spectator: z.boolean().optional() }).strict(),
  updateSettings: settingsSchema,
  sit: z.object({ seat: z.number().int().min(0).max(9) }).strict(),
  ready: z.object({ ready: z.boolean() }).strict(),
  act: z
    .object({
      action: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'all_in']),
      amount: z.number().finite().optional(),
      nonce: z.number().int().nonnegative()
    })
    .strict(),
  requestChips: z.object({ amount: z.number().finite(), reason: z.string().max(280).optional() }).strict(),
  approveChips: z.object({ playerId: z.string().max(80), amount: z.number().finite(), reason: z.string().max(280).optional() }).strict(),
  queueMode: z.object({ mode: z.enum(customModes) }).strict(),
  hostAction: z
    .object({
      action: z.enum(['kick', 'ban', 'mute', 'forceSitOut', 'transferHost', 'lock', 'spectators']),
      playerId: z.string().max(80).optional(),
      value: z.boolean().optional()
    })
    .strict(),
  chat: z.object({ message: z.string().max(1000) }).strict(),
  empty: z.object({}).strict().optional().default({})
};

function safeHandler<T>(
  schema: z.ZodType<T>,
  run: (payload: T, ack: (result: SocketResult<any>) => void) => void
): (payload: unknown, ack?: (result: SocketResult<any>) => void) => void {
  return (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => undefined;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      reply(fail('Malformed command payload.'));
      return;
    }
    try {
      run(parsed.data, reply);
    } catch (error) {
      reply(fail(error instanceof Error ? error.message : 'Command failed.'));
    }
  };
}

io.on('connection', (socket) => {
  socket.on('createRoom', safeHandler(schemas.createRoom, (payload, ack) => {
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
  }));

  socket.on('joinRoom', safeHandler(schemas.joinRoom, (payload, ack) => {
    const result = joinRoom(payload.code, payload.name, payload.sessionToken, payload.spectator);
    if (!result.ok) return ack(result);
    const room = getRoom(result.code);
    if (!room) return ack(fail('Room not found.'));
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    attachSocket(room, result.playerId, socket.id);
    ack(result);
    emitRoom(result.code);
  }));

  socket.on('updateSettings', safeHandler(schemas.updateSettings, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => updateSettings(room, player, payload));
  }));

  socket.on('sit', safeHandler(schemas.sit, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => sit(room, player, payload.seat));
  }));

  socket.on('ready', safeHandler(schemas.ready, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => setReady(room, player, Boolean(payload.ready)));
  }));

  socket.on('startGame', safeHandler(schemas.empty, (_payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => startGame(room, player));
  }));

  socket.on('act', safeHandler(schemas.act, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => act(room, player, payload));
  }));

  socket.on('requestChips', safeHandler(schemas.requestChips, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => requestChips(room, player, payload.amount, payload.reason));
  }));

  socket.on('approveChips', safeHandler(schemas.approveChips, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => approveChips(room, player, payload.playerId, payload.amount, payload.reason));
  }));

  socket.on('queueMode', safeHandler(schemas.queueMode, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => queueMode(room, player, payload.mode));
  }));

  socket.on('hostAction', safeHandler(schemas.hostAction, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => hostAction(room, player, payload));
  }));

  socket.on('chat', safeHandler(schemas.chat, (payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => addChat(room, player, payload.message));
  }));

  socket.on('endSession', safeHandler(schemas.empty, (_payload, ack) => {
    withPlayer(socket.data.roomCode, socket.data.playerId, ack, (room, player) => endSession(room, player), false);
  }));

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
