# Architecture Guide

## Stack

- Frontend: TypeScript, React, Vite, custom CSS.
- Realtime backend: Node.js, Express, Socket.IO.
- State: in-memory room map keyed by room code.
- Rules: pure TypeScript command handlers and state transitions.
- Randomness: server-side Node WebCrypto/random bytes.
- Tests: Vitest rules tests plus scripted bot stress tests.

## Server Authority

The server owns deck order, shuffling, private cards, board cards, burns/draw state, turn order, legal actions, chip movement, pots, bounties, and showdown. Clients never submit card or pot results.

Every meaningful change flows through a command handler and appends an audit entry. Stale action nonces and duplicate submissions are rejected.

## Public and Private State

Each socket receives:

- Public room state: seats, stacks, board, pot, audit, chat, settings, current turn.
- Private player state: session token, own hole cards, and legal actions.

Public state does not include hidden cards or deck order. Post-hand shuffle reveal information is only exposed after hand completion.

## Reconnect Model

Rooms have no accounts. A browser session token restores a player's room identity, seat, and private hand state if it reconnects to the same in-memory room.

If the server restarts, room state is lost.

## Validation and Rate Limits

Names and chat are sanitized. Socket payloads are bounded by Socket.IO buffer limits and command handlers reject unauthorized, stale, out-of-phase, and rate-limited actions. Chat spam auto-mutes the sender.
