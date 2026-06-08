import { describe, expect, it } from 'vitest';
import { buildSidePots, rankHighHand, rankPlayers, winnerSeats } from '../src/modes/holdem/engine/evaluator';

describe('hand evaluator wrapper', () => {
  it('ranks Hold’em kickers through the shared interface', () => {
    const ranked = rankPlayers(
      'holdem',
      [
        { seat: 0, holeCards: ['As', 'Kd'] },
        { seat: 1, holeCards: ['Ah', 'Qd'] }
      ],
      ['Ac', '7s', '4d', '2c', '9h']
    );
    expect(winnerSeats(ranked)).toEqual([0]);
  });

  it('enforces Omaha exactly two hole cards and three board cards', () => {
    const holdemLikeFlush = rankHighHand('holdem', ['As', 'Ad'], ['Ks', 'Qs', 'Js', 'Ts', '2c']);
    const omahaBlockedFlush = rankHighHand('omaha4', ['As', 'Ad', '7h', '8c'], ['Ks', 'Qs', 'Js', 'Ts', '2c']);
    expect(holdemLikeFlush.descr.toLowerCase()).toContain('royal flush');
    expect(omahaBlockedFlush.descr.toLowerCase()).not.toContain('flush');
  });
});

describe('side pots', () => {
  it('builds main and side pots with folded players contributing but not eligible', () => {
    expect(
      buildSidePots([
        { seat: 0, amount: 100, folded: false },
        { seat: 1, amount: 250, folded: false },
        { seat: 2, amount: 250, folded: true },
        { seat: 3, amount: 500, folded: false }
      ])
    ).toEqual([
      { amount: 400, eligibleSeatNumbers: [0, 1, 3], label: 'Main pot' },
      { amount: 450, eligibleSeatNumbers: [1, 3], label: 'Side pot 1' },
      { amount: 250, eligibleSeatNumbers: [3], label: 'Side pot 2' }
    ]);
  });
});
