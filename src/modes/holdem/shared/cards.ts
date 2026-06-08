import type { Card, Rank, Suit } from './types';

const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const suits: Suit[] = ['s', 'h', 'd', 'c'];

export function freshDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}` as Card));
}

export function cardLabel(card: Card): string {
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const symbol = suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣';
  return `${rank}${symbol}`;
}

export function isSevenTwo(cards: Card[]): { qualifies: boolean; suited: boolean } {
  if (cards.length < 2) return { qualifies: false, suited: false };
  const hasSeven = cards.some((card) => card[0] === '7');
  const hasTwo = cards.some((card) => card[0] === '2');
  const suited =
    hasSeven &&
    hasTwo &&
    cards.some((seven) => seven[0] === '7' && cards.some((two) => two[0] === '2' && two[1] === seven[1]));
  return { qualifies: hasSeven && hasTwo, suited };
}
