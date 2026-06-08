/**
 * Bot-brain check — every seat is driven by the real adversarial brain
 * (decideBotAction) for N hands, asserting it NEVER returns an illegal action,
 * chips are conserved, and hands always resolve. This validates the brain
 * the BotController plays through. Run: `npx tsx scripts/bot-brain-check.ts`.
 */
import { act, createEmptyRoom, joinRoom, playerInRoom, requestChips, setReady, sit, startGame } from '../src/modes/holdem/engine/room';
import { decideBotAction, randomBotMeta, type BotMeta } from '../src/modes/holdem/bot';

const targetHands = Number(process.env.HANDS ?? 500);
const room = createEmptyRoom('BRAINCHK', 'Brain Check');
const meta: Record<string, BotMeta> = {};

const created = joinRoom(room, 'Host');
if (!created.ok) throw new Error(created.error);
const host = playerInRoom(room, created.playerId)!;
host.socketIds.add('bot:host');
sit(room, host, 0);
meta[host.id] = randomBotMeta('Host');

for (let index = 1; index < 6; index += 1) {
  const joined = joinRoom(room, `Bot ${index}`);
  if (!joined.ok) throw new Error(joined.error);
  const bot = playerInRoom(room, joined.playerId)!;
  bot.socketIds.add(`bot:${index}`);
  sit(room, bot, index);
  meta[bot.id] = randomBotMeta(`Bot ${index}`);
}

let completed = 0;
let actions = 0;
const startTotal = totalChips();
let rebuys = 0;

while (completed < targetHands) {
  room.players.forEach((player) => {
    if (player.seat !== null && player.stack < room.settings.bigBlind) {
      requestChips(room, player, room.settings.buyIn, 'rebuy');
      rebuys += 1;
    }
    if (player.seat !== null && player.stack > 0) setReady(room, player, true);
  });
  const started = startGame(room, host);
  if (!started.ok) throw new Error(`startGame failed: ${started.error}`);

  let guard = 0;
  while (room.hand && room.hand.phase !== 'complete') {
    if (++guard > 600) throw new Error(`hand ${room.hand.number} exceeded guard`);
    const seat = room.hand.currentTurnSeat;
    const actor = [...room.players.values()].find((p) => p.seat === seat);
    if (!actor) throw new Error('no actor for current turn');
    actor.actionTimestamps = [];
    const payload = decideBotAction(room, actor.id, meta[actor.id]);
    if (!payload) throw new Error(`brain returned null on actor ${actor.name}'s turn`);
    const result = act(room, actor, payload);
    if (!result.ok) throw new Error(`ILLEGAL bot action: ${result.error} :: ${JSON.stringify(payload)}`);
    actions += 1;
  }
  completed += 1;
}

const endTotal = totalChips();
const expected = startTotal + rebuys * room.settings.buyIn;
if (endTotal !== expected) throw new Error(`chip mismatch: expected ${expected}, got ${endTotal}`);

console.log(JSON.stringify({ completed, actions, rebuys, startTotal, endTotal, chipsConserved: endTotal === expected }, null, 2));
process.exit(0);

function totalChips(): number {
  return [...room.players.values()].reduce((sum, p) => sum + p.stack + p.cashOut, 0);
}
