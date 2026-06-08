declare module 'pokersolver' {
  class SolverHand {
    descr: string;
    rank: number;
    cards: unknown[];
    static solve(cards: string[], game?: string): SolverHand;
    static winners(hands: SolverHand[]): SolverHand[];
  }

  const pokerSolver: {
    Hand: typeof SolverHand;
  }

  export default pokerSolver;
}
