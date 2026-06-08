import { freshDeck } from '../shared/cards';
import type { Card } from '../shared/types';

/** Cryptographically shuffle a fresh 52-card deck (Fisher-Yates via Web Crypto). */
export function shuffleDeck(): Card[] {
  const deck = freshDeck();
  const randoms = new Uint32Array(deck.length * 2);
  crypto.getRandomValues(randoms);
  let cursor = 0;
  for (let i = deck.length - 1; i > 0; i -= 1) {
    if (cursor >= randoms.length) {
      crypto.getRandomValues(randoms);
      cursor = 0;
    }
    const j = randoms[cursor] % (i + 1);
    cursor += 1;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
