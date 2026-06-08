# Rules Guide

## Supported Now

### No-Limit Texas Hold'em

The server deals two private cards to each seated eligible player and owns the deck, board, betting order, pot accounting, and showdown resolution. Clients only request actions.

### Omaha Queue Mode

The custom queue can set the next hand to PLO 4-card. The evaluator enforces exactly two hole cards and exactly three board cards at showdown. The betting UI currently uses the same action surface as Hold'em with server-side max-bet validation.

### Straddles

The default table enables a UTG straddle equal to the configured straddle amount. The straddle is posted before action, shown as a seat badge, and audit logged.

### Bomb Pots

Bomb pot can be queued for the next hand. Every participant posts the configured ante or big blind amount, preflop betting is skipped, and the flop is dealt immediately.

### 7-2 Bounty

7-2 bounty can be enabled by settings or queued for one hand. A winning player holding 7-2 receives the configured play-money bounty from other players, with an optional suited bonus. The movement is audit logged.

### Winner Shows One

When queued, winning players reveal one card in the audit log after showdown.

### Side Pots and Splits

The engine builds main and side pots from committed chips, excludes folded players from eligibility, and distributes odd chips deterministically by seat order.

## Not Yet Supported

Phase 2 variants are documented but not implemented: Omaha Hi-Lo, Big O, Short Deck, 5-card draw, 2-7 single/triple draw, Badugi, Razz, Stud, Stud Hi-Lo, HORSE, and full dealer's-choice mixed rotations.

2-7 lowball ranking helper coverage exists, but there is no complete draw-game table flow yet.
