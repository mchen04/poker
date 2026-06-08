# Poker-on-Ding Port — Architecture & Wave Plan

> Working notes for the graft. This file is internal scaffolding; it will be
> rewritten/removed at the unification phase. Source of truth: the goal file at
> `~/Downloads/poker-from-ding-port-goal.txt`.

## What this repo is

A Ding clone (Next.js 14 + PartyKit + Tailwind) with the **verified Feltline
NL Hold'em engine** grafted in. Ding = the body (real-time shell, masked
broadcasts, reconnect, lobby, chat, bots, responsive UI). Feltline = the brain
(server-authoritative betting/blinds/side-pots/showdown/7-2 bounty/one-hand modes).

- Feltline donor preserved: git branch `feltline-donor` + `/Users/michaelchen/feltline-donor/`.
- Ding original untouched at `/Users/michaelchen/ding/`.

## Core architecture decision

Port Feltline's engine **wholesale** (it passed 20 criticality cycles + 1000-hand
stress) rather than re-deriving the poker math onto Ding's ranking-shaped state.
The engine is framework-agnostic synchronous logic over a `RoomInternal` object;
only socket.io transport (`index.ts`) needs re-homing onto PartyKit.

- One `RoomInternal` per PartyKit room (drop Feltline's global `rooms` Map).
- `PlayerInternal.socketIds: Set<string>` holds PartyKit connection ids; `connected = size>0`.
- Identity/reconnect key = **pid** (Ding's sessionStorage UUID), used as engine `player.id`.
- Wire = Feltline's `ServerSnapshot {publicState, privateState}`, sent **per-connection**
  (privateState carries only that player's hole cards) — the privacy guarantee.
- `node:crypto` → Web Crypto (`crypto.getRandomValues`) + a pure-JS sha256 (`hash.ts`),
  keeping the commit/reveal bytes identical.
- `nanoid` added as a dep (pure JS, works in workerd).

## Layout

```
src/modes/holdem/
  shared/   types.ts cards.ts modes.ts sanitize.ts protocol.ts   (client+server)
  engine/   room.ts deck.ts evaluator.ts projection.ts settings.ts access.ts
            chipLedger.ts hostControls.ts sessionExport.ts roomCode.ts hash.ts
            pokersolver.d.ts                                       (pure server logic)
  bot.ts    adversarial poker decideAction (strength + pot-odds + position)
  view.ts   client mode registration
party/
  index.ts          PokerServer transport (onConnect/onMessage/onClose, Zod, snapshot bcast)
  server/           connectionManager (keep), roomStorage (RoomInternal persist), alarmScheduler (turn clock)
  bots.ts           harness kept; brain swapped to holdem/bot.ts
src/components/...   reuse shells (PokerTable, TableFelt, Seat, CardFace, Lobby, ChatPanel,
                     NameModal, NotificationToasts, responsive boards) + NEW betting UI
```

Card representation: engine/wire keep Feltline string `Card = ${Rank}${Suit}`
(lowercase suit, e.g. `"Th"`). UI parses to `{rank, suit}` for CardFace.

## Waves (each ends typecheck-green + commit)

1. Port pure engine + shared types (cp + crypto/Map/nanoid edits) + vitest tests + stress harness.
2. PartyKit server transport (party/index.ts) + roomStorage + alarmScheduler + protocol.
3. Bot poker brain + harness adaptation.
4. Client core: GameSession, GameModeRouter, landing/room/NameModal.
5. Client table UI: PokerTable/TableFelt/Seat reuse + NEW betting control (typed+slider+presets+hotkeys),
   action bar, pot/side-pot display, showdown, usePokerBoard, Lobby (settings/seats/audit/chips/host).
6. STRIP all Ding-only subsystems (ai, gameMode catalogue/codegen, sound, reveal, trading,
   dealChoice, effects, infoFeatures, tarot art, modes:gen gate). Zero orphans.
7. UNIFY: tsc + next build + partykit build green; remove husks; README.

Then hardening: Phase 1 agent-browser → Phase 3 criticality-loop --converge 2 → Phase 4 replay.

## Engine command surface (from Feltline room.ts, all `(room, player, ...) => SocketResult`)
createRoom join(joinRoom) updateSettings sit setReady startGame act requestChips
approveChips queueMode hostAction addChat endSession + projection publicState/privateState/snapshot.

## One-hand modes: holdem | omaha4(PLO) | bomb_pot | show_one | seven_two.
## 7-2 bounty: GLOBAL setting (settings.sevenTwo) applied every hand; also queueable for one hand.
