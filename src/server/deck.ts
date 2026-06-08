import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { freshDeck } from '../shared/cards';
import type { Card } from '../shared/types';

export function shuffleDeck(): { deck: Card[]; seed: string; commitment: string } {
  const deck = freshDeck();
  const seed = randomBytes(32).toString('hex');
  const randoms = new Uint32Array(deck.length * 2);
  webcrypto.getRandomValues(randoms);
  let cursor = 0;
  for (let i = deck.length - 1; i > 0; i -= 1) {
    if (cursor >= randoms.length) {
      webcrypto.getRandomValues(randoms);
      cursor = 0;
    }
    const j = randoms[cursor] % (i + 1);
    cursor += 1;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const commitment = createHash('sha256').update(`${seed}:${deck.join(',')}`).digest('hex');
  return { deck, seed, commitment };
}
