/**
 * Server transport smoke test — connects to a running `partykit dev` over a
 * real WebSocket, creates a room as host, seats 3 bots, and plays hands end to
 * end through the PartyKit message protocol. Asserts: welcome/snapshot flow,
 * bots act and hands complete + auto-advance, and no hole-card leaks in the
 * public state. Requires `npm run party:dev` running. Run via tsx.
 */
import { PartySocket } from 'partysocket';
import WS from 'ws';
import type { ServerEvent, RoomPublicState, PrivateState } from '../src/modes/holdem/shared/types';

const HOST = process.env.PK_HOST ?? '127.0.0.1:1999';
const ROOM = `smoke${Math.floor(Date.now() % 100000)}`;
const TARGET_HANDS = 3;

const socket = new PartySocket({ host: HOST, room: ROOM, party: 'main', WebSocket: WS as unknown as typeof WebSocket });
let myId = '';
let sentStart = false;
let addedBots = false;
const completedHands = new Set<number>();
let lastSeenHand = -1;
let done = false;

const timeout = setTimeout(() => fail('timed out before reaching target hands'), 90_000);

function send(cmd: unknown): void {
  socket.send(JSON.stringify(cmd));
}

function fail(message: string): void {
  if (done) return;
  done = true;
  clearTimeout(timeout);
  console.error('SMOKE FAIL:', message);
  socket.close();
  process.exit(1);
}

function pass(summary: object): void {
  if (done) return;
  done = true;
  clearTimeout(timeout);
  console.log('SMOKE PASS:', JSON.stringify(summary, null, 2));
  socket.close();
  process.exit(0);
}

socket.addEventListener('open', () => {
  send({ type: 'join', name: 'SmokeHost' });
});

socket.addEventListener('message', (event: MessageEvent) => {
  let msg: ServerEvent;
  try {
    msg = JSON.parse(event.data as string) as ServerEvent;
  } catch {
    return;
  }
  if (msg.type === 'welcome') {
    myId = msg.playerId;
    send({ type: 'sit', seat: 0 });
    send({ type: 'ready', ready: true });
    return;
  }
  if (msg.type === 'error') {
    // Errors on stale actions are fine; a join/seat error is fatal.
    if (!myId) fail(`error before welcome: ${msg.message}`);
    return;
  }
  if (msg.type !== 'snapshot') return;
  handleSnapshot(msg.publicState, msg.privateState);
});

function handleSnapshot(pub: RoomPublicState, priv: PrivateState | null): void {
  // Leak checks: public state must never carry hole cards.
  if (JSON.stringify(pub).includes('holeCards')) fail('publicState leaked a holeCards field');
  const me = pub.players.find((p) => p.id === myId);
  if (!me) return;

  // Seat bots once.
  if (!addedBots && me.seat !== null) {
    addedBots = true;
    send({ type: 'addBot' });
    send({ type: 'addBot' });
    send({ type: 'addBot' });
    return;
  }

  const seatedReady = pub.players.filter((p) => p.seat !== null && p.ready && p.stack > 0).length;

  // Start the first hand once enough seats are ready.
  if (!sentStart && pub.lifecycle === 'lobby' && seatedReady >= pub.settings.minSeats) {
    sentStart = true;
    send({ type: 'startGame' });
    return;
  }

  const hand = pub.hand;
  if (!hand) return;

  // Track completed hands (auto-advance produces new hand numbers).
  if (hand.phase === 'complete') completedHands.add(hand.number);
  if (hand.number !== lastSeenHand) lastSeenHand = hand.number;

  // No leak: my hole cards must never appear on the public board.
  if (priv && priv.holeCards.length > 0) {
    for (const card of priv.holeCards) {
      if (hand.board.includes(card)) fail(`hole card ${card} appeared on the public board`);
    }
  }

  // Act when it is my turn (simple call-station to keep the hand moving).
  if (hand.phase !== 'complete' && me.seat !== null && hand.currentTurnSeat === me.seat && priv) {
    const legal = priv.legalActions;
    const action = legal.canCheck ? 'check' : legal.canCall ? 'call' : 'fold';
    send({ type: 'act', action, nonce: hand.actionNonce });
  }

  if (completedHands.size >= TARGET_HANDS) {
    pass({
      room: ROOM,
      completedHands: [...completedHands],
      players: pub.players.map((p) => ({ name: p.name, seat: p.seat, stack: p.stack, isHost: p.isHost })),
      lastSummary: hand.summary,
      auditTail: pub.audit.slice(-4).map((a) => `${a.type}: ${a.message}`),
    });
  }
}
