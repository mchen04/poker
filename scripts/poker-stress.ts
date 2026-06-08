/**
 * Engine stress harness — drives the ported Hold'em engine directly (no
 * transport) for N full hands, asserting chip conservation, legal-action
 * acceptance, stale-nonce rejection, and zero private-card leaks onto the
 * public board. Run with: `npm run stress` (HANDS=1000 by default).
 */
import { act, createEmptyRoom, joinRoom, playerInRoom, queueMode, requestChips, setReady, sit, snapshot, startGame } from '../src/modes/holdem/engine/room';
import type { LegalActions, PlayerPublic } from '../src/modes/holdem/shared/types';

const targetHands = Number(process.env.HANDS ?? 1000);
const progressEvery = Number(process.env.PROGRESS_EVERY ?? 50);

const room = createEmptyRoom('STRESS01', 'Stress Table');
const created = joinRoom(room, 'Bot Host');
if (!created.ok) throw new Error(created.error);
const host = playerInRoom(room, created.playerId)!;
host.socketIds.add('bot-host-socket');
sit(room, host, 0);

for (let index = 1; index < 6; index += 1) {
  const joined = joinRoom(room, `Bot ${index}`);
  if (!joined.ok) throw new Error(joined.error);
  const player = playerInRoom(room, joined.playerId)!;
  player.socketIds.add(`bot-${index}-socket`);
  sit(room, player, index);
}

let completed = 0;
let illegalRejected = 0;
let actions = 0;
let lastTotal = totalChips();

while (completed < targetHands) {
  topUpBustedPlayers();
  readyBots();
  maybeQueueMode();
  const started = startGame(room, host);
  if (!started.ok) throw new Error(started.error);

  let guard = 0;
  while (room.hand && room.hand.phase !== 'complete') {
    guard += 1;
    if (guard > 500) throw new Error(`Hand ${room.hand.number} exceeded action guard`);
    const publicHand = snapshot(room, host.id).publicState.hand!;
    const staleSeat = publicHand.currentTurnSeat;
    const actor = [...room.players.values()].find((player) => player.seat === staleSeat);
    if (!actor) throw new Error('No actor for current turn');
    actor.actionTimestamps = [];
    const privateState = snapshot(room, actor.id).privateState!;
    const legal = privateState.legalActions;
    const chosen = chooseAction(actor.stack, legal);
    const result = act(room, actor, chosen);
    if (!result.ok) throw new Error(`Legal bot action rejected: ${result.error}`);
    actions += 1;
    const stale = act(room, actor, chosen);
    if (!stale.ok) illegalRejected += 1;
    assertNoLeak();
  }

  completed += 1;
  if (progressEvery > 0 && completed % progressEvery === 0) {
    console.log(`stress progress: ${completed}/${targetHands} hands, ${actions} actions`);
  }
  const currentTotal = totalChips();
  if (currentTotal <= 0) throw new Error('All chips vanished');
  if (Math.abs(currentTotal - lastTotal) > 1000000) throw new Error(`Unexpected chip drift: ${lastTotal} -> ${currentTotal}`);
  lastTotal = currentTotal;
}

console.log(
  JSON.stringify(
    {
      room: room.code,
      completed,
      actions,
      illegalRejected,
      auditEntries: room.audit.length,
      totalChips: totalChips()
    },
    null,
    2
  )
);
process.exit(0);

function chooseAction(stack: number, legal: LegalActions) {
  const nonce = room.hand!.actionNonce;
  if (legal.canCheck) {
    if (legal.canBet && stack > 80 && Math.random() < 0.24) return { action: 'bet' as const, amount: Math.min(legal.maxBet, Math.max(legal.minBet, Math.round(legal.potSize / 2))) || legal.minBet, nonce };
    return { action: 'check' as const, nonce };
  }
  if (legal.canRaise && stack > legal.callAmount * 2 && Math.random() < 0.18) {
    return { action: 'raise' as const, amount: Math.min(legal.maxBet, Math.max(legal.minRaiseTo, room.hand!.currentBet + room.settings.bigBlind)), nonce };
  }
  if (legal.canCall && Math.random() < 0.72) return { action: 'call' as const, nonce };
  if (legal.allInAmount > 0 && Math.random() < 0.04) return { action: 'all_in' as const, nonce };
  return { action: 'fold' as const, nonce };
}

function topUpBustedPlayers() {
  room.players.forEach((player) => {
    if (!player.spectator && player.stack < room.settings.bigBlind * 2) {
      requestChips(room, player, room.settings.buyIn, 'bot top-up');
    }
  });
}

function readyBots() {
  room.players.forEach((player) => {
    if (!player.spectator && player.seat !== null && player.socketIds.size > 0 && player.stack > 0 && player.status === 'seated') {
      setReady(room, player, true);
    }
  });
}

function maybeQueueMode() {
  if (room.queuedMode || Math.random() > 0.2) return;
  const modes = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'seven_two'] as const;
  queueMode(room, host, modes[Math.floor(Math.random() * modes.length)]);
}

function totalChips() {
  return [...room.players.values()].reduce((sum, player) => sum + player.stack + player.cashOut, 0);
}

function assertNoLeak() {
  const publicState = snapshot(room, host.id).publicState;
  const visibleCards = new Set([...(publicState.hand?.board ?? []), ...(publicState.hand?.board2 ?? [])]);
  room.players.forEach((player) => {
    const privateCards = snapshot(room, player.id).privateState?.holeCards ?? [];
    const publicPlayer = publicState.players.find((entry: PlayerPublic) => entry.id === player.id);
    if (!publicPlayer) throw new Error('Missing public player');
    privateCards.forEach((card) => {
      if (visibleCards.has(card)) throw new Error(`Private card duplicated on a public board: ${card}`);
    });
  });
}
