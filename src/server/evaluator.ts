import pokerSolver from 'pokersolver';
import type { Card, Variant } from '../shared/types';

const { Hand } = pokerSolver;
type SolverHand = ReturnType<typeof Hand.solve>;

export interface RankedHand {
  seat: number;
  hand: SolverHand;
  description: string;
}

function toSolver(card: Card): string {
  return `${card[0]}${card[1]}`;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...tail] = items;
  return [...combinations(tail, size - 1).map((combo) => [head, ...combo]), ...combinations(tail, size)];
}

function bestOf(candidates: Card[][]): SolverHand {
  const hands = candidates.map((cards) => Hand.solve(cards.map(toSolver)));
  return Hand.winners(hands)[0];
}

export function rankHighHand(variant: Variant, holeCards: Card[], board: Card[]): SolverHand {
  if (variant === 'holdem') {
    return Hand.solve([...holeCards, ...board].map(toSolver));
  }

  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(board, 3);
  const candidates = holeCombos.flatMap((holes) => boardCombos.map((publicCards) => [...holes, ...publicCards]));
  return bestOf(candidates);
}

export function rankPlayers(
  variant: Variant,
  contenders: Array<{ seat: number; holeCards: Card[] }>,
  board: Card[]
): RankedHand[] {
  return contenders.map((player) => {
    const hand = rankHighHand(variant, player.holeCards, board);
    return { seat: player.seat, hand, description: hand.descr };
  });
}

export function winnerSeats(ranked: RankedHand[]): number[] {
  const winners = Hand.winners(ranked.map((entry) => entry.hand));
  return ranked.filter((entry) => winners.includes(entry.hand)).map((entry) => entry.seat);
}

export interface SidePot {
  amount: number;
  eligibleSeatNumbers: number[];
  label: string;
}

export function buildSidePots(
  committed: Array<{ seat: number; amount: number; folded: boolean }>
): SidePot[] {
  const positive = committed.filter((entry) => entry.amount > 0);
  const levels = [...new Set(positive.map((entry) => entry.amount))].sort((a, b) => a - b);
  let previous = 0;
  const pots: SidePot[] = [];

  levels.forEach((level) => {
    const contributors = positive.filter((entry) => entry.amount >= level);
    const eligible = contributors.filter((entry) => !entry.folded).map((entry) => entry.seat);
    const amount = (level - previous) * contributors.length;
    if (amount > 0 && eligible.length > 0) {
      pots.push({
        amount,
        eligibleSeatNumbers: eligible,
        label: pots.length === 0 ? 'Main pot' : `Side pot ${pots.length}`
      });
    }
    previous = level;
  });

  return pots;
}

export function rankDeuceToSeven(cards: Card[]): number[] {
  const rankValue: Record<string, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  };
  const values = [...new Set(cards.map((card) => rankValue[card[0]]))].sort((a, b) => b - a);
  const five = values.slice(0, 5);
  const flush = cards.slice(0, 5).every((card) => card[1] === cards[0][1]);
  const straight = five.length === 5 && five[0] - five[4] === 4;
  return [straight ? 1 : 0, flush ? 1 : 0, ...five];
}
