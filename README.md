# Feltline Poker

A premium, browser-based **private play-money** Texas Hold'em home game for friends.
No accounts, no database, no payments, no rake. A room lives only while the
PartyKit server is alive; the host can export a full session summary/audit log
before closing.

Built on **Next.js 14 (App Router) + PartyKit + Tailwind**, with a
server-authoritative NL Hold'em engine.

## Features

- **Landing → lobby → table** flow with 6-character room codes / invite links.
- **Lobby**: seat selection, ready status, stacks, buy-ins, up/down, host badge,
  and an append-only audit log. Host configures blinds, ante, buy-in, starting
  stack, min/max seats, straddle, the per-turn action timer, the global 7-2
  bounty, and custom-mode rules.
- **Table**: fold / check / call / bet / raise / all-in, a community board
  (flop/turn/river), and a pot display with **main pot + side pots**. Seat
  panels show name, stack, current bet, dealer/blind/straddle badges, and
  up/down since buy-in.
- **Betting control** (net-new): type an exact amount, drag a slider, or tap
  presets (⅓, ½, ⅔, pot, ×BB, min, max, all-in). The server validates min-raise,
  all-in, and insufficient-stack; an illegal amount can never be committed.
  Hotkeys: `F` fold · `C` check/call · `B`/`R` bet/raise · `A` all-in.
- **Continuous play**: a brief winner/pot-award at showdown (contesting hands
  revealed), then the next hand auto-deals. The table persists across hands; the
  button/blinds advance.
- **One-hand custom modes** (host-gated, queued before a hand): PLO 4-card, bomb
  pot, winner-shows-one, and mandatory straddle. The 7-2 bounty is a global host
  setting (below), not a queued one-hand mode.
- **7-2 bounty** (global host setting): any player who wins a pot holding a 7 and
  a 2 collects the configured bounty from every other player, automatically,
  every hand while enabled (with an optional suited bonus).
- **Server-authoritative, no database**: the server owns the deck, turn order,
  stacks, pots, eligibility, and hand resolution; each client receives only the
  cards it may see; reconnect restores seat + private cards on the matching
  session token; stale/duplicate commands are rejected by nonce.
- **Bots**: adversarial AI players (hand strength + pot odds + position) fill
  seats for testing and casual play; they act only on their own masked view.
- **Export**: host ends the session and downloads a readable TXT ledger + a JSON
  snapshot of the full public state and audit log.

## Run

```bash
npm install
npm run dev      # next dev (:3000) + partykit dev (:1999)
```

Open http://localhost:3000 — "Host a game" to create a room, or enter a code to
join.

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: engine unit tests (betting, side pots, showdown, bounty, modes)
npm run stress      # 1000 scripted hands: chip conservation + no private-card leaks
npm run brain       # all-bot games: every bot action is legal + chips conserved
npm run build       # next build
npm run smoke       # WebSocket transport smoke test (needs `npm run party:dev` running)
```

## Architecture

- `party/index.ts` — PartyKit server (one room per Durable Object): validates
  commands, routes them to the engine, and broadcasts a **per-connection masked
  snapshot** so hole cards reach only their owner. Reconnect, action timer,
  auto-next-hand, and host moderation live here. `party/server/*` provides the
  connection map, persistence, and the alarm scheduler; `party/bots.ts` is the
  bot harness.
- `src/modes/holdem/engine/*` — the pure, framework-agnostic poker engine
  (`room.ts` betting/blinds/side-pots/showdown, plus deck, evaluator, settings,
  access, chip ledger, host controls, session export).
- `src/modes/holdem/shared/*` — wire types, card helpers, mode definitions,
  command validation (Zod).
- `src/modes/holdem/bot.ts` — the adversarial bot decision brain.
- `src/contexts/GameSession.tsx` + `src/components/poker/*` — the client: socket
  lifecycle, the felt table, betting control, seats, board, side panel
  (players/modes/log/chat/settings), and the lobby.

## Boundary

This is a private social play-money game. It intentionally has no persistence,
payments, rake, accounts, deposits, withdrawals, or real-money settlement.
