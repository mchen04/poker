# Testing Guide

## Local Commands

```bash
npm run typecheck
npm test
npm run stress
npm run build
```

## Unit and Golden Coverage

Vitest covers:

- Hold'em ranking and kickers.
- Omaha exactly-two-hole-card rule.
- Side-pot construction.
- Private-card isolation in snapshots.
- Stale duplicate action rejection.
- Custom mode queue and chip audit logging.
- Straddle first-action regression.

## Bot Stress

`npm run stress` runs 1,000 hands unless `HANDS` is set. The bot runner includes random legal actions, stale duplicate actions, low-stack top-ups, all-ins, straddles, queued custom modes, and current public-board privacy checks.

Useful variants:

```bash
HANDS=20 npm run stress
HANDS=10 PROGRESS_EVERY=1 npm run stress
```

## Browser Verification

Use isolated `agent-browser` sessions. Required flows:

- Landing screen with Create Lobby and Join Lobby.
- Host creates room, players join with names, players seat, host starts hand.
- Multiple sessions play through actions using each player's own private cards.
- Verify private cards differ by session and are not visible in other players' snapshots.
- Verify settings, chip requests, custom queue, audit, host controls, export, and reconnect.
- Verify responsive layouts at desktop, laptop, tablet, and mobile sizes.

## Criticality Loop

After full browser verification, run:

```text
/criticality-loop --converge 2 --aggressiveness aggressive
```

Fix all important findings, rerun relevant automated and browser verification, and repeat until two consecutive approvals.
