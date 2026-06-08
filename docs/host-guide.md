# Host Guide

## Create and Start

1. Choose `Create Lobby`.
2. Enter a display name and room name.
3. Share the room code or invite link.
4. Seat players in the lobby.
5. Adjust settings before a hand starts.
6. Start the hand once enough seated players have chips.

## Settings

The host can set blinds, buy-in, starting stack, min/max seats, action timer, self-service chips, straddle, custom queue, and 7-2 bounty. Active-hand setting changes are rejected and audit logged; change rules between hands.

## Chips and Ledger

Chips are play money. Each player tracks stack, buy-in total, cash-out, and up/down. Host chip edits and player chip requests are visible in the audit log.

Strict mode defers active-hand chip changes. Casual/self-service chip mode can let players add play-money chips with audit visibility.

## Moderation

The host can:

- Lock or unlock the room.
- Toggle spectators.
- Mute a player.
- Force a player to sit out.
- Kick a player.
- Transfer host ownership.

All host actions append audit entries.

## Export and End Session

Use `End` to generate TXT and JSON exports. Room state is memory-only, so export before closing the server or ending the session.
