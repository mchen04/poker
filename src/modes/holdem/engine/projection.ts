import type { HandPublic } from '../shared/types';
import type { HandInternal } from './room';

export function handToPublic(hand: HandInternal | null): HandPublic | null {
  if (!hand) return null;
  return {
    id: hand.id,
    number: hand.number,
    phase: hand.phase,
    variant: hand.variant,
    modifiers: hand.modifiers,
    buttonSeat: hand.buttonSeat,
    smallBlindSeat: hand.smallBlindSeat,
    bigBlindSeat: hand.bigBlindSeat,
    straddleSeat: hand.straddleSeat,
    currentTurnSeat: hand.currentTurnSeat,
    turnStartedAt: hand.turnStartedAt,
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    board: hand.board,
    board2: hand.board2,
    pots: hand.pots,
    eligibleSeatNumbers: hand.eligibleSeatNumbers,
    lastAggressorSeat: hand.lastAggressorSeat,
    actionNonce: hand.actionNonce,
    shuffleCommitment: hand.shuffleCommitment,
    shuffleReveal: hand.shuffleReveal,
    winners: hand.winners,
    summary: hand.summary,
    winningSeats: hand.winningSeats,
    revealedHands: hand.revealedHands
  };
}
