/**
 * bot-lobby — spin up a live lobby with socket bot players so a human can join
 * and test the UI. One bot hosts (auto-deals hands); the rest are calling-station
 * bots that auto-act on their turn. Bots keep the game flowing; you just play.
 *
 *   tsx scripts/bot-lobby.ts [botCount] [port]
 *
 * Prints a join URL — open it in your browser, sit, mark ready, and play.
 */
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerSnapshot, ServerToClientEvents, SocketResult } from '../src/shared/types';

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const BOT_COUNT = Math.max(1, Math.min(6, Number(process.argv[2] ?? 2)));
const PORT = Number(process.argv[3] ?? process.env.PORT ?? 3001);
const URL = `http://localhost:${PORT}`;

const DEAL_DELAY_MS = 3500; // pause between hands so you can read the result
const ACT_DELAY_MS = 1100; // bots "think" before acting

function emit<E extends keyof ClientToServerEvents>(
  socket: BotSocket,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0]
): Promise<SocketResult<any>> {
  return new Promise((resolve) => {
    (socket.emit as any)(event, payload, (result: SocketResult<any>) => resolve(result));
  });
}

interface Bot {
  name: string;
  socket: BotSocket;
  playerId: string;
  isHost: boolean;
  seat: number | null;
  lastActedNonce: number;
  pendingAct: boolean;
  pendingDeal: boolean;
}

function connect(): BotSocket {
  return io(URL, { transports: ['websocket', 'polling'], forceNew: true });
}

function chooseAction(legal: NonNullable<ServerSnapshot['privateState']>['legalActions']): { action: 'check' | 'call' | 'fold'; } {
  // Calling station: check when free, call when facing a bet, fold only if it can't call.
  if (legal.canCheck) return { action: 'check' };
  if (legal.canCall) return { action: 'call' };
  return { action: 'fold' };
}

function seatedReadyCount(snap: ServerSnapshot): number {
  return snap.publicState.players.filter((p) => p.seat !== null && p.ready && p.stack > 0).length;
}

async function main() {
  console.log(`bot-lobby: connecting ${BOT_COUNT} bot(s) to ${URL}`);
  const bots: Bot[] = [];
  let roomCode = '';

  // 1) Host bot creates the room and sits.
  const hostSocket = connect();
  await new Promise<void>((r) => hostSocket.on('connect', () => r()));
  const created = await emit(hostSocket, 'createRoom', { name: 'Riverboat Ruby', roomName: 'Bot Test Table' });
  if (!created.ok) throw new Error(`createRoom failed: ${created.error}`);
  roomCode = created.code;
  const host: Bot = { name: 'Riverboat Ruby', socket: hostSocket, playerId: created.playerId, isHost: true, seat: null, lastActedNonce: -1, pendingAct: false, pendingDeal: false };
  bots.push(host);
  await emit(hostSocket, 'sit', { seat: 0 });

  // 2) The remaining bots join, sit, and ready up.
  const names = ['Bluff Betty', 'Calling Carl', 'Nit Nigel', 'Donkey Dan', 'Shove Sheila'];
  for (let i = 0; i < BOT_COUNT - 1; i += 1) {
    const socket = connect();
    await new Promise<void>((r) => socket.on('connect', () => r()));
    const joined = await emit(socket, 'joinRoom', { code: roomCode, name: names[i % names.length] });
    if (!joined.ok) {
      console.error(`bot join failed: ${joined.error}`);
      continue;
    }
    const bot: Bot = { name: names[i % names.length], socket, playerId: joined.playerId, isHost: false, seat: null, lastActedNonce: -1, pendingAct: false, pendingDeal: false };
    bots.push(bot);
    await emit(socket, 'sit', { seat: i + 1 });
    await emit(socket, 'ready', { ready: true });
  }

  // 3) Wire each bot's snapshot handler: auto-act + (host) auto-deal.
  for (const bot of bots) {
    bot.socket.on('snapshot', (snap: ServerSnapshot) => {
      const me = snap.publicState.players.find((p) => p.id === bot.playerId);
      if (!me) return;
      bot.seat = me.seat;

      // Stay seated / ready (in case of any reset).
      if (me.seat === null && snap.publicState.lifecycle !== 'ended' && !snap.publicState.hand) {
        const open = snap.publicState.seats.findIndex((s) => s === null);
        if (open >= 0) void emit(bot.socket, 'sit', { seat: open });
      }
      if (!bot.isHost && me.seat !== null && !me.ready && !snap.publicState.hand) {
        void emit(bot.socket, 'ready', { ready: true });
      }

      const hand = snap.publicState.hand;

      // Host: deal the next hand when idle and enough players are ready.
      if (bot.isHost) {
        const idle = !hand || hand.phase === 'complete';
        const enough = seatedReadyCount(snap) >= snap.publicState.settings.minSeats;
        if (idle && enough && snap.publicState.lifecycle !== 'ended' && !bot.pendingDeal) {
          bot.pendingDeal = true;
          setTimeout(() => {
            bot.pendingDeal = false;
            void emit(bot.socket, 'startGame', {} as Record<string, never>);
          }, DEAL_DELAY_MS);
        }
      }

      // Anyone: act on your turn.
      const legal = snap.privateState?.legalActions;
      if (hand && hand.phase !== 'complete' && me.seat !== null && hand.currentTurnSeat === me.seat && legal) {
        if (bot.lastActedNonce !== hand.actionNonce && !bot.pendingAct) {
          bot.pendingAct = true;
          const nonce = hand.actionNonce;
          const choice = chooseAction(legal);
          setTimeout(() => {
            bot.pendingAct = false;
            bot.lastActedNonce = nonce;
            void emit(bot.socket, 'act', { action: choice.action, nonce });
          }, ACT_DELAY_MS);
        }
      }
    });
  }

  console.log('\n========================================================');
  console.log(`  LOBBY READY — ${bots.length} bots seated and playing`);
  console.log(`  Room code:  ${roomCode}`);
  console.log(`  JOIN HERE:  ${URL}/?room=${roomCode}`);
  console.log('  → Open the link, click Join, pick a seat, hit "Mark ready".');
  console.log('  → You\'ll be dealt into the next hand. Ctrl+C here to stop the bots.');
  console.log('========================================================\n');
}

main().catch((error) => {
  console.error('bot-lobby error:', error);
  process.exit(1);
});
