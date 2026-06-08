/**
 * Adversarial poker decision brain for bot players. Reads only the bot's own
 * masked snapshot (hole cards + legal actions + public board) — no peeking at
 * opponents — and chooses a legal action from hand strength, pot odds,
 * position-agnostic aggression, and a personality. Mirrors how a human seat
 * decides, so bots never cheat.
 */
import type { Card, PlayerAction, Variant } from './shared/types';
import { snapshot, type RoomInternal } from './engine/room';
import { rankHighHand } from './engine/evaluator';

export interface BotMeta {
  name: string;
  /** 0 = passive/tight, 1 = hyper-aggressive. */
  aggression: number;
  /** 0 = loose, 1 = nitty (folds more). */
  tightness: number;
}

const BOT_NAMES = [
  'Maverick', 'Ivy', 'Slick', 'Nova', 'Tex', 'Echo', 'Bishop', 'Roxy',
  'Datto', 'Quinn', 'Ace', 'Vega', 'Goldie', 'Rook', 'Sable', 'Cane',
];

export function pickBotName(room: RoomInternal): string {
  const taken = new Set([...room.players.values()].map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomBotMeta(name: string): BotMeta {
  return {
    name,
    aggression: 0.25 + Math.random() * 0.55,
    tightness: 0.2 + Math.random() * 0.5,
  };
}

const RANK_ORDER = '23456789TJQKA';
const rankValue = (card: Card): number => RANK_ORDER.indexOf(card[0]) + 2;

const CATEGORY_STRENGTH: Record<string, number> = {
  'High Card': 0.14,
  Pair: 0.36,
  'Two Pair': 0.56,
  'Three of a Kind': 0.69,
  Straight: 0.79,
  Flush: 0.86,
  'Full House': 0.93,
  'Four of a Kind': 0.985,
  'Straight Flush': 1,
  'Royal Flush': 1,
};

function preflopStrength(hole: Card[]): number {
  if (hole.length < 2) return 0.3;
  // Use the best two cards (covers Hold'em 2 and PLO 4).
  const ranked = [...hole].sort((a, b) => rankValue(b) - rankValue(a));
  const a = ranked[0];
  const b = ranked[1];
  const high = rankValue(a);
  const low = rankValue(b);
  const pair = a[0] === b[0];
  const suited = a[1] === b[1];
  let strength: number;
  if (pair) {
    strength = 0.5 + ((high - 2) / 12) * 0.5;
  } else {
    strength = ((high - 2) / 12) * 0.34 + ((low - 2) / 12) * 0.16;
    if (suited) strength += 0.07;
    const gap = high - low;
    if (gap === 1) strength += 0.06;
    else if (gap === 2) strength += 0.03;
  }
  // PLO's four cards add a little playability.
  if (hole.length >= 4) strength = Math.min(1, strength + 0.05);
  return Math.max(0, Math.min(1, strength));
}

function madeStrength(variant: Variant, hole: Card[], board: Card[]): number {
  try {
    const solved = rankHighHand(variant, hole, board);
    return CATEGORY_STRENGTH[solved.name] ?? 0.14;
  } catch {
    return 0.2;
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(value)));

export interface BotActionPayload {
  action: PlayerAction;
  amount?: number;
  nonce: number;
}

export function decideBotAction(room: RoomInternal, botId: string, meta: BotMeta): BotActionPayload | null {
  const hand = room.hand;
  const bot = room.players.get(botId);
  if (!hand || hand.phase === 'complete' || !bot || bot.seat === null || hand.currentTurnSeat !== bot.seat) return null;

  const snap = snapshot(room, botId);
  const legal = snap.privateState?.legalActions;
  if (!legal) return null;
  const hole = snap.privateState?.holeCards ?? [];
  const board = snap.publicState.hand?.board ?? [];
  const nonce = hand.actionNonce;

  const aggression = meta.aggression;
  const strength = board.length >= 3 ? madeStrength(hand.variant, hole, board) : preflopStrength(hole);

  // No bet to face — check, or bet for value / occasional bluff.
  // For a bet, the engine reads `amount` as the increment (chips added), so it
  // is capped by the bot's stack, not by legal.maxBet (a target-total cap).
  if (legal.canCheck) {
    const wantBet = legal.canBet && (strength > 0.55 - aggression * 0.1 || Math.random() < aggression * 0.18);
    if (wantBet && bot.stack >= legal.minBet) {
      const target = legal.potSize > 0 ? legal.potSize * (0.45 + aggression * 0.35) : legal.minBet * 2;
      return { action: 'bet', amount: clamp(target, legal.minBet, bot.stack), nonce };
    }
    return { action: 'check', nonce };
  }

  // Facing a bet.
  const potOdds = legal.callAmount / (legal.potSize + legal.callAmount || 1);

  if (legal.canRaise && strength > 0.7 && Math.random() < 0.35 + aggression * 0.45) {
    const target = legal.minRaiseTo + legal.potSize * aggression * 0.6;
    return { action: 'raise', amount: clamp(target, legal.minRaiseTo, legal.maxBet), nonce };
  }

  if (legal.allInAmount > 0 && (strength > 0.9 || (bot.stack <= legal.callAmount * 2.2 && strength > 0.5))) {
    return { action: 'all_in', nonce };
  }

  if (legal.canCall && strength >= potOdds - aggression * 0.06) {
    return { action: 'call', nonce };
  }

  // Occasional loose call / bluff-catch.
  if (legal.canCall && Math.random() < 0.08 + (1 - meta.tightness) * 0.08) {
    return { action: 'call', nonce };
  }

  return { action: legal.canFold ? 'fold' : 'check', nonce };
}
