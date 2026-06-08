# Feltline Private Poker

Feltline is a browser-based private home-game poker app for friends. It is play-money only: no accounts, database, deposits, withdrawals, rake, marketplace chips, cash-out flow, or real-money settlement.

Rooms are ephemeral and live only in server memory. If the server restarts, the room is gone unless the host exported the session summary first.

## Current MVP

- Create lobby and join lobby with short room code.
- Display-name prompt before entering a room.
- Host-controlled lobby settings for blinds, buy-in, starting stack, minimum seats, self-service chips, straddle, custom queue, and 7-2 bounty.
- Seat selection, ready state, scoreboard, buy-in/up-down tracking, chip requests, and host chip approval.
- Server-authoritative NL Hold'em hands with blinds, UTG straddle, betting, all-in, side pots, split pots, showdown, and audit log entries.
- Queued one-hand custom modes: Hold'em, PLO 4-card, bomb pot, winner shows one card, and 7-2 bounty.
- Host moderation: lock room, spectator toggle, mute, force sit-out, kick, and host transfer.
- Chat with spam auto-mute.
- End-session TXT and JSON export.
- Server-only shuffle/deck/private-card state with per-player private snapshots and post-hand shuffle commitment/reveal data.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

For a production-style client build:

```bash
npm run build
npm start
```

The server listens on `http://localhost:3001/` and serves the built client from `dist/`.

## Verification

```bash
npm run typecheck
npm test
npm run stress
npm run build
```

`npm run stress` runs 1,000 scripted bot hands by default, including stale duplicate action submissions and privacy checks for current public board state.

## Important Boundary

This app is for private social play-money games. It intentionally has no persistence, payments, rake, user accounts, deposits, withdrawals, marketplace, or real-money settlement features.
